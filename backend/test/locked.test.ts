import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app.js';
import { type TestUser, createNote, createTestApp, prisma, registerUser, resetDb, share } from './helpers.js';

let app: App;
let owner: TestUser;
let editor: TestUser;

/** A well-formed envelope (the server cannot tell real ciphertext from random bytes, by design). */
function envelope(seed = 1, size = 48): string {
  return JSON.stringify({
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iter: 600_000,
    salt: Buffer.alloc(16, seed).toString('base64'),
    iv: Buffer.alloc(12, seed).toString('base64'),
    data: Buffer.alloc(size, seed).toString('base64'),
  });
}

beforeAll(async () => {
  app = await createTestApp();
});
beforeEach(async () => {
  await resetDb();
  owner = await registerUser(app, 'owner');
  editor = await registerUser(app, 'editor');
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const patch = (user: TestUser, id: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'PATCH', url: `/api/v1/notes/${id}`, headers: user.auth, payload });

describe('NOTE-17: notes locked with a password', () => {
  it('stores only the encrypted envelope; the grid shows the title only, and search ignores the content', async () => {
    const note = await createNote(app, owner, { title: 'Codes', type: 'list', locked: true, content: envelope() });
    expect(note).toMatchObject({ title: 'Codes', locked: true, content: envelope() });

    const list = await app.inject({ method: 'GET', url: '/api/v1/notes', headers: owner.auth });
    expect(list.json().items[0]).toMatchObject({ title: 'Codes', locked: true, preview: '', items: null });
    const search = (q: string) => app.inject({ method: 'GET', url: `/api/v1/notes?q=${q}`, headers: owner.auth });
    expect((await search('PBKDF2')).json().items).toHaveLength(0);
    expect((await search('codes')).json().items).toHaveLength(1);
  });

  it('refuses plain or malformed content in a locked note', async () => {
    const bad = (content: string) =>
      app.inject({ method: 'POST', url: '/api/v1/notes', headers: owner.auth, payload: { type: 'text', locked: true, content } });
    for (const content of ['my secret', '', JSON.stringify({ v: 1 }), envelope().replace('"iter":600000', '"iter":10')]) {
      const res = await bad(content);
      expect(res.statusCode, content).toBe(400);
      expect(res.json().error.code).toBe('INVALID_ENCRYPTED_CONTENT');
    }
  });

  it('only the owner locks and unlocks; locking needs the encrypted content', async () => {
    const note = await createNote(app, owner, { title: 'Diary', content: 'Dear diary' });
    await share(app, owner, note.id, editor, 'editor');

    expect((await patch(editor, note.id, { version: 1, locked: true, content: envelope() })).statusCode).toBe(403);
    const noContent = await patch(owner, note.id, { version: 1, locked: true });
    expect(noContent.statusCode).toBe(400);

    const locked = await patch(owner, note.id, { version: 1, locked: true, content: envelope() });
    expect(locked.statusCode).toBe(200);
    expect(locked.json()).toMatchObject({ locked: true, version: 2 });

    // The editor knows the password: they save new encrypted content, never plain text.
    expect((await patch(editor, note.id, { version: 2, content: envelope(2) })).statusCode).toBe(200);
    const plain = await patch(editor, note.id, { version: 3, content: 'oops, plain text' });
    expect(plain.statusCode).toBe(400);
    expect(plain.json().error.code).toBe('INVALID_ENCRYPTED_CONTENT');
    expect((await patch(editor, note.id, { version: 3, locked: false, content: 'Dear diary' })).statusCode).toBe(403);

    const unlocked = await patch(owner, note.id, { version: 3, locked: false, content: 'Dear diary' });
    expect(unlocked.json()).toMatchObject({ locked: false, content: 'Dear diary', version: 4 });
  });

  it('the server never converts or toggles encrypted content', async () => {
    const note = await createNote(app, owner, { type: 'text', locked: true, content: envelope() });
    const convert = await patch(owner, note.id, { version: 1, type: 'list' });
    expect(convert.statusCode).toBe(400);
    expect((await patch(owner, note.id, { version: 1, type: 'list', content: envelope(3) })).json()).toMatchObject({
      type: 'list',
      locked: true,
    });

    const toggle = await app.inject({
      method: 'POST',
      url: `/api/v1/notes/${note.id}/items/toggle`,
      headers: owner.auth,
      payload: { index: 0, text: 'x', checked: true },
    });
    expect(toggle.statusCode).toBe(409);
    expect(toggle.json().error.code).toBe('NOTE_LOCKED');
  });

  it('share links carry the envelope; an editor link edits it but never changes the lock', async () => {
    const note = await createNote(app, owner, { title: 'Wifi', locked: true, content: envelope() });
    const link = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/notes/${note.id}/links`,
        headers: owner.auth,
        payload: { role: 'editor' },
      })
    ).json();
    const viaLink = (method: 'GET' | 'PATCH', payload?: Record<string, unknown>) =>
      app.inject({ method, url: `/api/v1/shared/${link.token}`, ...(payload ? { payload } : {}) });

    expect((await viaLink('GET')).json().note).toMatchObject({ title: 'Wifi', locked: true, content: envelope() });
    expect((await viaLink('PATCH', { version: 1, content: envelope(4) })).statusCode).toBe(200);
    expect((await viaLink('PATCH', { version: 2, locked: false, content: 'pwd' })).statusCode).toBe(403);
  });
});
