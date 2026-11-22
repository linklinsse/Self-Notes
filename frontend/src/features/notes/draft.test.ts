import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import type { NoteBase } from '../../api/types';
import { toggleTaskItem } from '../../markdown/tasklist';
import { DraftController, type NoteSaver, type SaveInput } from './draft';

/** Fake server holding one note, with the API's version semantics. */
function fakeServer(initial: NoteBase) {
  let note = { ...initial };
  const calls: SaveInput[] = [];
  let offline = false;
  const saver: NoteSaver = {
    async save(input) {
      calls.push(input);
      if (offline) throw new ApiError(0, 'NETWORK_ERROR', 'offline');
      if (input.version !== note.version) {
        throw new ApiError(409, 'NOTE_VERSION_CONFLICT', 'conflict', { current: { ...note } });
      }
      note = {
        title: input.title ?? note.title,
        type: input.type ?? note.type,
        content: input.type === 'list' && input.content === undefined ? `- [ ] ${note.content}` : (input.content ?? note.content),
        version: note.version + 1,
      };
      return { ...note };
    },
    async toggle(input) {
      const next = toggleTaskItem(note.content, input);
      if (next === null) throw new ApiError(409, 'ITEM_NOT_FOUND', 'gone');
      note = { ...note, content: next, version: note.version + 1 };
      return { ...note };
    },
  };
  return {
    saver,
    calls,
    get note() {
      return note;
    },
    editElsewhere(patch: Partial<NoteBase>) {
      note = { ...note, ...patch, version: note.version + 1 };
    },
    setOffline(value: boolean) {
      offline = value;
    },
  };
}

const base: NoteBase = { title: 'T', type: 'text', content: 'Hello', version: 1 };

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('DraftController', () => {
  it('NOTE-8: saves once, 1 s after the last edit, sending only changed fields', async () => {
    const server = fakeServer(base);
    const draft = new DraftController(base, server.saver);
    draft.edit({ content: 'Hello w' });
    draft.edit({ content: 'Hello world' });
    expect(draft.getState().status).toBe('pending');
    await vi.advanceTimersByTimeAsync(999);
    expect(server.calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(server.calls).toEqual([{ version: 1, content: 'Hello world' }]);
    expect(draft.getState()).toMatchObject({ status: 'saved', content: 'Hello world' });
    expect(draft.version).toBe(2);
  });

  it('NOTE-13: a stale save becomes a conflict; "theirs" adopts the server version', async () => {
    const server = fakeServer(base);
    const draft = new DraftController(base, server.saver);
    server.editElsewhere({ content: 'Changed elsewhere' });
    draft.edit({ content: 'Mine' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(draft.getState()).toMatchObject({ status: 'conflict', conflict: { content: 'Changed elsewhere', version: 2 } });
    draft.resolveConflict('theirs');
    expect(draft.getState()).toMatchObject({ status: 'saved', content: 'Changed elsewhere', conflict: null });
  });

  it('NOTE-13: "mine" re-applies the local draft on top of the latest version', async () => {
    const server = fakeServer(base);
    const draft = new DraftController(base, server.saver);
    server.editElsewhere({ content: 'Changed elsewhere' });
    draft.edit({ content: 'Mine' });
    await vi.advanceTimersByTimeAsync(1000);
    draft.resolveConflict('mine');
    await vi.runAllTimersAsync();
    expect(server.note).toMatchObject({ content: 'Mine', version: 3 });
    expect(draft.getState().status).toBe('saved');
  });

  it('keeps edits made while a save is in flight, and saves them next', async () => {
    const server = fakeServer(base);
    const draft = new DraftController(base, server.saver);
    draft.edit({ content: 'A' });
    const saving = draft.save();
    draft.edit({ content: 'AB' });
    await saving;
    await vi.runAllTimersAsync();
    expect(server.note.content).toBe('AB');
    expect(draft.getState()).toMatchObject({ content: 'AB', status: 'saved' });
  });

  it('retries when offline, without losing the draft', async () => {
    const server = fakeServer(base);
    const draft = new DraftController(base, server.saver);
    server.setOffline(true);
    draft.edit({ title: 'New' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(draft.getState().status).toBe('offline');
    server.setOffline(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(draft.getState()).toMatchObject({ status: 'saved', title: 'New' });
  });

  it('adopts newer server versions only when there are no local changes', async () => {
    const draft = new DraftController(base, fakeServer(base).saver);
    draft.receiveServer({ ...base, content: 'Remote', version: 2 });
    expect(draft.getState().content).toBe('Remote');
    draft.edit({ content: 'Local' });
    draft.receiveServer({ ...base, content: 'Remote 2', version: 3 });
    expect(draft.getState().content).toBe('Local');
  });

  it('NOTE-7: changes the type through the server', async () => {
    const server = fakeServer(base);
    const draft = new DraftController(base, server.saver);
    await draft.changeType('list');
    expect(draft.getState()).toMatchObject({ type: 'list', content: '- [ ] Hello', status: 'saved' });
  });

  it('toggles items through the conflict-free endpoint when nothing is pending', async () => {
    const list: NoteBase = { title: 'L', type: 'list', content: '- [ ] Milk\n- [ ] Bread', version: 1 };
    const server = fakeServer(list);
    const draft = new DraftController(list, server.saver);
    server.editElsewhere({ title: 'Renamed elsewhere' }); // would make a normal save conflict
    await draft.toggleItem(1, 'Bread', true);
    expect(server.calls).toHaveLength(0);
    expect(draft.getState()).toMatchObject({ content: '- [ ] Milk\n- [x] Bread', title: 'Renamed elsewhere', status: 'saved' });
    expect(draft.version).toBe(3);
  });

  it('saves pending edits when disposed', async () => {
    const server = fakeServer(base);
    const draft = new DraftController(base, server.saver);
    draft.edit({ content: 'Leaving' });
    draft.dispose();
    await vi.runAllTimersAsync();
    expect(server.note.content).toBe('Leaving');
  });
});

describe('NOTE-14: cancelling the edits', () => {
  it('undoes changes that autosave already saved, then stops autosaving', async () => {
    const server = fakeServer(base);
    const draft = new DraftController(base, server.saver);
    draft.edit({ title: 'New title', content: 'Hello world' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(server.note).toMatchObject({ title: 'New title', content: 'Hello world' });
    draft.edit({ content: 'Hello world, again' });
    expect(draft.hasChanges()).toBe(true);

    expect(await draft.revert()).toBe(true);
    expect(server.note).toMatchObject({ title: 'T', content: 'Hello', type: 'text' });
    expect(draft.getState()).toMatchObject({ title: 'T', content: 'Hello', status: 'saved' });
    expect(draft.hasChanges()).toBe(false);
    const calls = server.calls.length;
    await vi.runAllTimersAsync();
    expect(server.calls).toHaveLength(calls);
  });

  it('only drops local edits when nothing was saved yet', async () => {
    const server = fakeServer(base);
    const draft = new DraftController(base, server.saver);
    draft.edit({ content: 'Not saved' });
    expect(await draft.revert()).toBe(true);
    await vi.runAllTimersAsync();
    expect(server.calls).toHaveLength(0);
    expect(draft.getState()).toMatchObject({ content: 'Hello', status: 'saved' });
  });

  it('undoes toggles and type changes', async () => {
    const list: NoteBase = { title: 'L', type: 'list', content: '- [ ] Milk', version: 1 };
    const server = fakeServer(list);
    const draft = new DraftController(list, server.saver);
    await draft.toggleItem(0, 'Milk', true);
    await draft.changeType('text');
    expect(server.note).toMatchObject({ type: 'text', content: '- [x] Milk' });

    expect(await draft.revert()).toBe(true);
    expect(server.note).toMatchObject({ type: 'list', content: '- [ ] Milk', title: 'L' });
  });

  it('keeps what others saved before this editor changed anything', async () => {
    const server = fakeServer(base);
    const draft = new DraftController(base, server.saver);
    server.editElsewhere({ content: 'From someone else' });
    draft.receiveServer({ ...server.note });
    draft.edit({ content: 'Mine' });
    await vi.advanceTimersByTimeAsync(1000);

    expect(await draft.revert()).toBe(true);
    expect(server.note.content).toBe('From someone else');
  });

  it('fails without losing the draft when the server cannot be reached', async () => {
    const server = fakeServer(base);
    const draft = new DraftController(base, server.saver);
    draft.edit({ content: 'Saved once' });
    await vi.advanceTimersByTimeAsync(1000);
    server.setOffline(true);

    expect(await draft.revert()).toBe(false);
    expect(draft.getState().status).toBe('offline');
    expect(draft.hasChanges()).toBe(true);
  });
});

describe('NOTE-17: savers that cannot rely on the server', () => {
  it('converts the type locally and sends the content', async () => {
    const server = fakeServer({ title: 'T', type: 'text', content: 'Milk\n\nBread', version: 1 });
    const draft = new DraftController({ title: 'T', type: 'text', content: 'Milk\n\nBread', version: 1 }, {
      save: (input) => server.saver.save(input),
      convertsTypeLocally: true,
    });
    await draft.changeType('list');
    expect(server.calls.at(-1)).toEqual({ version: 1, type: 'list', content: '- [ ] Milk\n- [ ] Bread' });
    expect(draft.getState()).toMatchObject({ type: 'list', content: '- [ ] Milk\n- [ ] Bread', status: 'saved' });
  });

  it('turns checkbox toggles into normal edits when the saver has no toggle', async () => {
    const list: NoteBase = { title: 'L', type: 'list', content: '- [ ] Milk', version: 1 };
    const server = fakeServer(list);
    const draft = new DraftController(list, { save: (input) => server.saver.save(input) });
    await draft.toggleItem(0, 'Milk', true);
    expect(draft.getState().status).toBe('pending');
    await vi.advanceTimersByTimeAsync(1000);
    expect(server.calls).toEqual([{ version: 1, content: '- [x] Milk' }]);
  });
});
