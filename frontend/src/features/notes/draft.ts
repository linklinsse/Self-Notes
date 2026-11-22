/**
 * Draft controller: autosave (NOTE-8), version conflicts (NOTE-13), conflict-free item toggles and
 * cancelling the edits (NOTE-14).
 * Framework-free so it can be unit-tested; React binds to it with useSyncExternalStore.
 */
import { ApiError, errorMessage, isApiError } from '../../api/errors';
import type { NoteBase, NoteType } from '../../api/types';
import { textToList, toggleTaskItem } from '../../markdown/tasklist';

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'offline' | 'conflict' | 'error';

export interface DraftState {
  title: string;
  content: string;
  type: NoteType;
  status: SaveStatus;
  /** Server version that conflicted with the local draft. */
  conflict: NoteBase | null;
  error: string | null;
}

export interface SaveInput {
  version: number;
  title?: string;
  type?: NoteType;
  content?: string;
}

export interface NoteSaver {
  save(input: SaveInput): Promise<NoteBase>;
  /** Server-side checkbox toggle, conflict-free (POST …/items/toggle). Absent: toggles are edits. */
  toggle?(input: { index: number; text: string; checked: boolean }): Promise<NoteBase>;
  /** NOTE-17: the server cannot convert the content (encrypted note), so type changes send it. */
  readonly convertsTypeLocally?: boolean;
}

export const AUTOSAVE_DELAY_MS = 1000;
const OFFLINE_RETRY_MS = 5000;

function conflictOf(err: unknown): NoteBase | null {
  if (!isApiError(err, 'NOTE_VERSION_CONFLICT')) return null;
  const current = (err.details as { current?: NoteBase & { note?: NoteBase } } | undefined)?.current;
  if (!current) return null;
  return current.note ?? current; // share-link conflicts nest the note
}

export class DraftController {
  private base: NoteBase;
  /** The note when the editor opened, or the latest server version adopted before any change here (NOTE-14). */
  private original: NoteBase;
  /** Set once this editor has saved something: from then on, `original` stays fixed. */
  private touched = false;
  private state: DraftState;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inflight: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();
  private disposed = false;

  constructor(
    initial: NoteBase,
    private readonly saver: NoteSaver,
    private readonly delayMs = AUTOSAVE_DELAY_MS,
  ) {
    this.base = initial;
    this.original = initial;
    this.state = {
      title: initial.title,
      content: initial.content,
      type: initial.type,
      status: 'saved',
      conflict: null,
      error: null,
    };
  }

  getState = (): DraftState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get version(): number {
    return this.base.version;
  }

  private set(patch: Partial<DraftState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  isDirty(): boolean {
    return this.state.title !== this.base.title || this.state.content !== this.base.content;
  }

  /** NOTE-14: the note differs from how it was when the editor opened (saved or not). */
  hasChanges(): boolean {
    const { title, content, type } = this.state;
    return title !== this.original.title || content !== this.original.content || type !== this.original.type;
  }

  /** A save or toggle from this editor reached the server. */
  private accept(result: NoteBase): void {
    this.base = result;
    this.touched = true;
  }

  private schedule(delay = this.delayMs): void {
    clearTimeout(this.timer);
    if (this.disposed || this.state.status === 'conflict') return;
    this.timer = setTimeout(() => void this.save(), delay);
  }

  /** Local edit: saved automatically after `delayMs` without typing. */
  edit(patch: { title?: string; content?: string }): void {
    const inConflict = this.state.status === 'conflict';
    this.set({ ...patch, ...(inConflict ? {} : { status: 'pending' as const, error: null }) });
    this.schedule();
  }

  /** Save now (also used when leaving the editor). */
  async save(): Promise<void> {
    clearTimeout(this.timer);
    if (this.inflight) {
      await this.inflight;
      if (this.isDirty() && this.state.status !== 'conflict') return this.save();
      return;
    }
    if (this.state.status === 'conflict') return;
    if (!this.isDirty()) {
      if (this.state.status !== 'saved') this.set({ status: 'saved', error: null });
      return;
    }
    const sent = { title: this.state.title, content: this.state.content };
    const input: SaveInput = {
      version: this.base.version,
      ...(sent.title !== this.base.title ? { title: sent.title } : {}),
      ...(sent.content !== this.base.content ? { content: sent.content } : {}),
    };
    this.set({ status: 'saving' });
    this.inflight = (async () => {
      try {
        const result = await this.saver.save(input);
        this.accept(result);
        const unchanged = this.state.title === sent.title && this.state.content === sent.content;
        if (unchanged) {
          this.set({ title: result.title, content: result.content, type: result.type, status: 'saved', error: null });
        } else {
          this.set({ status: 'pending' });
          this.schedule();
        }
      } catch (err) {
        this.handleError(err);
      } finally {
        this.inflight = null;
      }
    })();
    await this.inflight;
  }

  private handleError(err: unknown): void {
    const current = conflictOf(err);
    if (current) {
      this.set({ status: 'conflict', conflict: current });
    } else if (err instanceof ApiError && err.isOffline) {
      this.set({ status: 'offline', error: null });
      this.schedule(OFFLINE_RETRY_MS);
    } else {
      this.set({ status: 'error', error: errorMessage(err) });
    }
  }

  /** A newer server version arrived (refetch): adopt it unless there are local changes. */
  receiveServer(note: NoteBase): void {
    if (note.version <= this.base.version) return;
    if (this.isDirty() || this.inflight || this.state.status === 'conflict') return;
    this.base = note;
    if (!this.touched) this.original = note;
    this.set({ title: note.title, content: note.content, type: note.type, status: 'saved', error: null });
  }

  /** NOTE-13: keep my version (overwrite) or take theirs. */
  resolveConflict(choice: 'mine' | 'theirs'): void {
    const current = this.state.conflict;
    if (!current) return;
    this.base = current;
    if (choice === 'theirs') {
      this.set({ title: current.title, content: current.content, type: current.type, status: 'saved', conflict: null });
      return;
    }
    this.set({ type: current.type, status: 'pending', conflict: null });
    void this.save();
  }

  /** NOTE-7: switch type. Text -> list is converted by the server. */
  async changeType(type: NoteType): Promise<void> {
    if (type === this.state.type) return;
    await this.save();
    if (this.state.status === 'conflict' || this.isDirty()) return;
    this.set({ status: 'saving' });
    try {
      const local = this.saver.convertsTypeLocally
        ? { content: type === 'list' ? textToList(this.state.content) : this.state.content }
        : {};
      const result = await this.saver.save({ version: this.base.version, type, ...local });
      this.accept(result);
      this.set({ title: result.title, content: result.content, type: result.type, status: 'saved', error: null });
    } catch (err) {
      this.handleError(err);
    }
  }

  /** Check/uncheck an item: server-side toggle when nothing else is pending, else a normal edit. */
  async toggleItem(index: number, text: string, checked: boolean): Promise<void> {
    const next = toggleTaskItem(this.state.content, { index, text, checked });
    if (next === null) return;
    const toggle = this.saver.toggle?.bind(this.saver);
    if (!toggle || this.isDirty() || this.inflight || this.state.status !== 'saved') {
      this.edit({ content: next });
      return;
    }
    this.set({ content: next });
    this.inflight = (async () => {
      try {
        const result = await toggle({ index, text, checked });
        this.accept(result);
        if (this.state.content === next) {
          this.set({ title: result.title, content: result.content, type: result.type, status: 'saved' });
        } else {
          this.schedule();
        }
      } catch (err) {
        if (isApiError(err, 'ITEM_NOT_FOUND')) {
          this.set({ content: this.base.content, status: 'error', error: 'This item was changed elsewhere.' });
        } else {
          this.handleError(err);
        }
      } finally {
        this.inflight = null;
      }
    })();
    await this.inflight;
  }

  /**
   * NOTE-14: cancel the edits. The note goes back to how it was when the editor opened, including
   * changes that autosave already sent. Autosave stops; it restarts only if the revert fails
   * (offline, conflict…). Resolves true when the note is back to its original state.
   */
  async revert(): Promise<boolean> {
    clearTimeout(this.timer);
    this.disposed = true;
    if (this.inflight) await this.inflight;
    const { title, content, type } = this.original;
    const reset = { title, content, type, status: 'saved' as const, conflict: null, error: null };
    const savedAsOriginal = this.base.title === title && this.base.content === content && this.base.type === type;
    if (savedAsOriginal) {
      this.set(reset);
      return true;
    }
    this.set({ status: 'saving' });
    try {
      // Content is always sent, so the server does not convert it when the type changes back.
      this.base = await this.saver.save({ version: this.base.version, title, type, content });
      this.set({ ...reset, title: this.base.title, content: this.base.content, type: this.base.type });
      return true;
    } catch (err) {
      this.disposed = false;
      this.handleError(err);
      return false;
    }
  }

  /** Stop autosave and drop unsaved edits: the note is about to be deleted. */
  discard(): void {
    clearTimeout(this.timer);
    this.disposed = true;
    const { title, content, type } = this.base;
    this.set({ title, content, type, status: 'saved', conflict: null, error: null });
  }

  /** (Re)start autosave: React StrictMode unmounts and remounts effects once in development. */
  activate(): void {
    this.disposed = false;
  }

  /** Leaving the editor: save what is pending, then stop. */
  dispose(): void {
    clearTimeout(this.timer);
    if (this.isDirty() && this.state.status !== 'conflict') void this.save();
    this.disposed = true;
  }
}
