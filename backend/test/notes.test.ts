import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app.js';
import {
  type TestUser,
  createCategory,
  createNote,
  createTestApp,
  prisma,
  registerUser,
  resetDb,
} from './helpers.js';

let app: App;
let alice: TestUser;

beforeAll(async () => {
  app = await createTestApp();
});
beforeEach(async () => {
  await resetDb();
  alice = await registerUser(app, 'alice');
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const list = (user: TestUser, query = '') =>
  app.inject({ method: 'GET', url: `/api/v1/notes${query}`, headers: user.auth });

const patch = (user: TestUser, id: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'PATCH', url: `/api/v1/notes/${id}`, headers: user.auth, payload });

describe('notes', () => {
  it('NOTE-1: creates text and list notes; the creator is the owner', async () => {
    const note = await createNote(app, alice, { title: 'Hello', content: '# Hi' });
    expect(note).toMatchObject({
      title: 'Hello',
      type: 'text',
      content: '# Hi',
      version: 1,
      role: 'owner',
      pinned: false,
      categories: [],
      shared: false,
      owner: { id: alice.id, username: 'alice' },
      updatedBy: { id: alice.id, username: 'alice' },
    });
    const listNote = await createNote(app, alice, { type: 'list', content: '- [ ] Milk' });
    expect(listNote.type).toBe('list');
  });

  it('NOTE-9: lists summaries (preview, progress, no content), pinned first then recent', async () => {
    const a = await createNote(app, alice, { title: 'A', content: 'First **note**' });
    const b = await createNote(app, alice, { title: 'B', type: 'list', content: '- [x] Milk\n- [ ] Bread' });
    const c = await createNote(app, alice, { title: 'C', pinned: true });
    await patch(alice, a.id, { version: 1, content: 'First **note** edited' }); // a is now the most recent
    const res = await list(alice);
    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    expect(items.map((n: { title: string }) => n.title)).toEqual(['C', 'A', 'B']);
    expect(items[1]).not.toHaveProperty('content');
    expect(items[1]).toMatchObject({ preview: 'First note edited', items: null });
    expect(items[2]).toMatchObject({ preview: 'Milk · Bread', items: { checked: 1, total: 2 } });
    expect(c.pinned).toBe(true);
    expect(b.version).toBe(1);
  });

  it('NOTE-9: sorts by favorites (default), last update, or title (A to Z, accents and case ignored, untitled last)', async () => {
    for (const [title, pinned] of [['banane', false], ['Zèbre', true], ['', false], ['À faire', false], ['apple', false]] as const) {
      await createNote(app, alice, { title, pinned });
    }
    const order = async (query: string) =>
      (await list(alice, query)).json().items.map((n: { title: string }) => n.title);
    expect(await order('')).toEqual(['Zèbre', 'apple', 'À faire', '', 'banane']);
    expect(await order('?sort=favorites')).toEqual(await order(''));
    expect(await order('?sort=updated')).toEqual(['apple', 'À faire', '', 'Zèbre', 'banane']);
    expect(await order('?sort=title')).toEqual(['À faire', 'apple', 'banane', 'Zèbre', '']);
    expect(await order('?sort=title&limit=2')).toEqual(['À faire', 'apple']);
    expect((await list(alice, '?sort=random')).statusCode).toBe(400);
  });

  it('NOTE-10: searches titles and content, filters by type and category', async () => {
    const cat = await createCategory(app, alice, 'Home');
    await createNote(app, alice, { title: 'Groceries', type: 'list', content: '- [ ] Milk', categoryIds: [cat.id] });
    await createNote(app, alice, { title: 'Ideas', content: 'Buy more MILK' });
    await createNote(app, alice, { title: 'Other', content: 'nothing' });
    const titles = async (q: string) =>
      (await list(alice, q)).json().items.map((n: { title: string }) => n.title).sort();
    expect(await titles('?q=milk')).toEqual(['Groceries', 'Ideas']);
    expect(await titles('?q=GROCER')).toEqual(['Groceries']);
    expect(await titles('?type=text')).toEqual(['Ideas', 'Other']);
    expect(await titles(`?category=${cat.id}`)).toEqual(['Groceries']);
  });

  it('paginates with a cursor', async () => {
    for (const title of ['1', '2', '3']) await createNote(app, alice, { title });
    const first = (await list(alice, '?limit=2')).json();
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = (await list(alice, `?limit=2&cursor=${first.nextCursor}`)).json();
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
  });

  it('NOTE-13: updates bump the version; outdated updates get 409 with the current note', async () => {
    const note = await createNote(app, alice);
    const ok = await patch(alice, note.id, { version: 1, title: 'New title' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ title: 'New title', version: 2 });
    const stale = await patch(alice, note.id, { version: 1, content: 'stale' });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('NOTE_VERSION_CONFLICT');
    expect(stale.json().error.details.current).toMatchObject({ version: 2, title: 'New title', content: 'Hello' });
  });

  it('NOTE-7: switching text -> list converts the content on the server', async () => {
    const note = await createNote(app, alice, { content: 'Milk\n\nBread' });
    const res = await patch(alice, note.id, { version: 1, type: 'list' });
    expect(res.json()).toMatchObject({ type: 'list', content: '- [ ] Milk\n- [ ] Bread' });
    const back = await patch(alice, note.id, { version: 2, type: 'text' });
    expect(back.json()).toMatchObject({ type: 'text', content: '- [ ] Milk\n- [ ] Bread' });
  });

  it('NOTE-4: toggles a list item without needing the version', async () => {
    const note = await createNote(app, alice, { type: 'list', content: '- [ ] Milk\n- [ ] Bread' });
    await patch(alice, note.id, { version: 1, content: '- [ ] Eggs\n- [ ] Milk\n- [ ] Bread' }); // index moved
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/notes/${note.id}/items/toggle`,
      headers: alice.auth,
      payload: { index: 0, text: 'Milk', checked: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ content: '- [ ] Eggs\n- [x] Milk\n- [ ] Bread', version: 3 });
    const gone = await app.inject({
      method: 'POST',
      url: `/api/v1/notes/${note.id}/items/toggle`,
      headers: alice.auth,
      payload: { index: 0, text: 'Butter', checked: true },
    });
    expect(gone.statusCode).toBe(409);
    expect(gone.json().error.code).toBe('ITEM_NOT_FOUND');
  });

  it('NOTE-16: toggles a checkbox inside a text (Markdown) note', async () => {
    const note = await createNote(app, alice, { type: 'text', content: '# Trip\n\n- [ ] Tent\n- [x] Map\n\nSee you' });
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/notes/${note.id}/items/toggle`,
      headers: alice.auth,
      payload: { index: 0, text: 'Tent', checked: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ type: 'text', content: '# Trip\n\n- [x] Tent\n- [x] Map\n\nSee you', version: 2 });
  });

  it('NOTE-2: content is limited to 1 MB', async () => {
    const note = await createNote(app, alice);
    const res = await patch(alice, note.id, { version: 1, content: 'é'.repeat(600_000) });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('CONTENT_TOO_LARGE');
  });

  it('NOTE-12: the owner deletes a note', async () => {
    const note = await createNote(app, alice);
    const del = await app.inject({ method: 'DELETE', url: `/api/v1/notes/${note.id}`, headers: alice.auth });
    expect(del.statusCode).toBe(204);
    const get = await app.inject({ method: 'GET', url: `/api/v1/notes/${note.id}`, headers: alice.auth });
    expect(get.statusCode).toBe(404);
  });

  it('notes of other users are not found (never 403)', async () => {
    const bob = await registerUser(app, 'bob');
    const note = await createNote(app, alice);
    const res = await app.inject({ method: 'GET', url: `/api/v1/notes/${note.id}`, headers: bob.auth });
    expect(res.statusCode).toBe(404);
    expect((await list(bob, '?scope=all')).json().items).toHaveLength(0);
  });

  it('validates ids and bodies', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/notes/not-a-uuid', headers: alice.auth })).statusCode).toBe(400);
    const bad = await app.inject({ method: 'POST', url: '/api/v1/notes', headers: alice.auth, payload: { type: 'image' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toMatchObject({ code: 'VALIDATION_ERROR', details: { issues: expect.any(Array) } });
  });
});

describe('categories', () => {
  it('CAT-1: creates, lists with note counts, renames, recolors', async () => {
    const home = await createCategory(app, alice, 'Home', '#b8c9f4');
    await createNote(app, alice, { categoryIds: [home.id] });
    const res = await app.inject({ method: 'GET', url: '/api/v1/categories', headers: alice.auth });
    expect(res.json()).toEqual([{ id: home.id, name: 'Home', color: '#b8c9f4', position: 0, noteCount: 1 }]);
    const upd = await app.inject({
      method: 'PATCH',
      url: `/api/v1/categories/${home.id}`,
      headers: alice.auth,
      payload: { name: 'House', color: '#B8F4D4' },
    });
    expect(upd.json()).toMatchObject({ name: 'House', color: '#B8F4D4' });
  });

  it('CAT-1: names are unique per user, case-insensitively; colors must be #RRGGBB', async () => {
    await createCategory(app, alice, 'Work');
    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      headers: alice.auth,
      payload: { name: 'WORK', color: '#000000' },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('CATEGORY_NAME_TAKEN');
    const bob = await registerUser(app, 'bob');
    await createCategory(app, bob, 'Work'); // another user may use the same name
    const badColor = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      headers: alice.auth,
      payload: { name: 'Red', color: 'red' },
    });
    expect(badColor.statusCode).toBe(400);
  });

  it('CAT-3 / CAT-5: tags notes; deleting a category keeps the notes', async () => {
    const a = await createCategory(app, alice, 'A');
    const b = await createCategory(app, alice, 'B');
    const note = await createNote(app, alice);
    const put = await app.inject({
      method: 'PUT',
      url: `/api/v1/notes/${note.id}/categories`,
      headers: alice.auth,
      payload: { categoryIds: [a.id, b.id] },
    });
    expect(put.statusCode).toBe(204);
    const tagged = await app.inject({ method: 'GET', url: `/api/v1/notes/${note.id}`, headers: alice.auth });
    expect(tagged.json().categories.map((c: { name: string }) => c.name)).toEqual(['A', 'B']);
    await app.inject({ method: 'DELETE', url: `/api/v1/categories/${a.id}`, headers: alice.auth });
    const after = await app.inject({ method: 'GET', url: `/api/v1/notes/${note.id}`, headers: alice.auth });
    expect(after.statusCode).toBe(200);
    expect(after.json().categories.map((c: { name: string }) => c.name)).toEqual(['B']);
  });

  it("CAT-4: cannot use another user's category", async () => {
    const bob = await registerUser(app, 'bob');
    const bobs = await createCategory(app, bob, 'Bob only');
    const note = await createNote(app, alice);
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/notes/${note.id}/categories`,
      headers: alice.auth,
      payload: { categoryIds: [bobs.id] },
    });
    expect(res.statusCode).toBe(400);
  });
});
