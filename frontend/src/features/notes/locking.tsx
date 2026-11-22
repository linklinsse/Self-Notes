/**
 * NOTE-17: notes locked with a password, on top of the draft controller.
 * The derived key lives in memory while the note is open: leaving the note, reloading the app or
 * "Lock now" forgets it. Every save is encrypted before it leaves the device.
 */
import { type FormEvent, type MutableRefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ApiError, isApiError } from '../../api/errors';
import type { NoteBase } from '../../api/types';
import { Dialog } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { Button, ErrorNote, Field } from '../../components/ui';
import type { NoteSaver } from './draft';
import { type NoteKey, WrongPasswordError, decryptWithKey, encryptContent, unlockContent } from './noteCrypto';

interface ServerNote extends NoteBase {
  locked: boolean;
}

export type LockState =
  | { status: 'plain'; content: string }
  | { status: 'locked'; reason: 'closed' | 'password-changed' }
  | { status: 'decrypting' }
  | { status: 'unlocked'; content: string };

export interface NoteLock {
  state: LockState;
  /** Read by the saver at each save. */
  keyRef: MutableRefObject<NoteKey | null>;
  unlock(password: string): Promise<void>;
  /** The note was just locked or re-keyed here: use this key and plain text for `version`. */
  adopt(key: NoteKey, version: number, plain: string): void;
  forget(): void;
}

export function useNoteLock(note: ServerNote): NoteLock {
  const [key, setKey] = useState<NoteKey | null>(null);
  const [plain, setPlain] = useState<{ version: number; content: string } | null>(null);
  const [reason, setReason] = useState<'closed' | 'password-changed'>('closed');
  const keyRef = useRef<NoteKey | null>(null);
  useLayoutEffect(() => {
    keyRef.current = note.locked ? key : null;
  }, [note.locked, key]);

  // A newer encrypted version arrived (refetch, someone else's save): decrypt it.
  useEffect(() => {
    if (!note.locked || !key || (plain && plain.version >= note.version)) return;
    let cancelled = false;
    decryptWithKey(note.content, key).then(
      (content) => !cancelled && setPlain({ version: note.version, content }),
      (err: unknown) => {
        if (cancelled || !(err instanceof WrongPasswordError)) return;
        // Someone changed the password: ask for the new one.
        setKey(null);
        setPlain(null);
        setReason('password-changed');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [note.locked, note.content, note.version, key, plain]);

  let state: LockState;
  if (!note.locked) state = { status: 'plain', content: note.content };
  else if (!key) state = { status: 'locked', reason };
  // While a newer version is decrypted, keep showing the last one: the editor stays mounted.
  else if (plain) state = { status: 'unlocked', content: plain.content };
  else state = { status: 'decrypting' };

  return {
    state,
    keyRef,
    async unlock(password) {
      const result = await unlockContent(note.content, password);
      setPlain({ version: note.version, content: result.plain });
      setKey(result.key);
    },
    adopt(newKey, version, content) {
      keyRef.current = newKey;
      setKey(newKey);
      setPlain({ version, content });
    },
    forget() {
      keyRef.current = null;
      setKey(null);
      setPlain(null);
      setReason('closed');
    },
  };
}

/** Conflict details carry the server's note: decrypt it so the conflict banner shows text. */
async function readableConflict(err: unknown, key: NoteKey): Promise<unknown> {
  if (!isApiError(err, 'NOTE_VERSION_CONFLICT')) return err;
  const details = err.details as { current?: ServerNote & { note?: ServerNote } } | undefined;
  const current = details?.current?.note ?? details?.current;
  if (!current?.locked) return err;
  try {
    const content = await decryptWithKey(current.content, key);
    const readable = details!.current!.note ? { ...details!.current, note: { ...current, content } } : { ...current, content };
    return new ApiError(err.status, err.code, err.message, { ...details, current: readable });
  } catch {
    return err;
  }
}

/**
 * Wraps the plain saver: while the note is locked (a key is set), content is encrypted on the way
 * out and decrypted on the way back; checkbox toggles and type conversions happen locally,
 * because the server cannot read the content.
 */
export function lockingSaver(base: NoteSaver, keyRef: MutableRefObject<NoteKey | null>): NoteSaver {
  return {
    async save(input) {
      const key = keyRef.current;
      if (!key) return base.save(input);
      const sealed = input.content === undefined ? undefined : await encryptContent(input.content, key);
      try {
        const saved = await base.save({ ...input, ...(sealed !== undefined ? { content: sealed } : {}) });
        return { ...saved, content: input.content ?? (await decryptWithKey(saved.content, key)) };
      } catch (err) {
        throw await readableConflict(err, key);
      }
    },
    get toggle() {
      return keyRef.current ? undefined : base.toggle?.bind(base);
    },
    get convertsTypeLocally() {
      return keyRef.current !== null;
    },
  };
}

/** Shown instead of the content while a locked note is closed. */
export function UnlockScreen({
  title,
  reason,
  onUnlock,
}: {
  title: string;
  reason: 'closed' | 'password-changed';
  onUnlock: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onUnlock(password);
    } catch (err) {
      setError(err instanceof WrongPasswordError ? 'Wrong password.' : 'This note could not be decrypted.');
      setBusy(false);
    }
  }

  return (
    <div className="unlock">
      <span className="unlock-icon" aria-hidden>
        <Icon name="lock" size={32} />
      </span>
      <h1 className="unlock-title">{title || 'Untitled'}</h1>
      <p className="muted">
        {reason === 'password-changed'
          ? 'The password of this note was changed. Enter the new one.'
          : 'This note is locked. Enter its password to read it.'}
      </p>
      <form className="unlock-form" onSubmit={submit}>
        <Field
          label="Password"
          type="password"
          autoComplete="off"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" variant="primary" icon="unlock" busy={busy} className="btn-block">
          Unlock
        </Button>
      </form>
    </div>
  );
}

/** Choose a password: to lock a note, or to change the password of a locked note. */
export function PasswordDialog({
  open,
  mode,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: 'lock' | 'change';
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setPassword('');
    setConfirm('');
    setError(null);
    onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError('The two passwords are different.');
    setBusy(true);
    setError(null);
    try {
      await onSubmit(password);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not lock the note.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={close} title={mode === 'lock' ? 'Lock with a password' : 'Change the password'}>
      <form className="form" onSubmit={submit}>
        <p className="muted small">
          The content is encrypted on this device: only the title stays visible. Everyone you share the note with
          needs this password. <strong>If it is forgotten, the content cannot be recovered.</strong>
        </p>
        <Field
          label={mode === 'lock' ? 'Password' : 'New password'}
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          hint="At least 8 characters. A long password is much harder to guess."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Field
          label="Confirm the password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" variant="primary" icon="lock" busy={busy} className="btn-block">
          {mode === 'lock' ? 'Lock the note' : 'Change the password'}
        </Button>
      </form>
    </Dialog>
  );
}
