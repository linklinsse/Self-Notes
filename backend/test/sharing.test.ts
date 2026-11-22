import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app.js';
import {
  PUBLIC_URL,
  type TestUser,
  createCategory,
  createNote,
  createTestApp,
  prisma,
  registerUser,
  resetDb,
  share,
} from './helpers.js';

let app: App;
let owner: TestUser;
let editor: TestUser;
let viewer: TestUser;
let outsider: TestUser;
let note: { id: string };

beforeAll(async () => {
  app = await createTestApp();
});
beforeEach(async () => {
  await resetDb();
  owner = await registerUser(app, 'owner');
  editor = await registerUser(app, 'editor');
  viewer = await registerUser(app, 'viewer');
  outsider = await registerUser(app, 'outsider');
  note = await createNote(app, owner, { type: 'list', content: '- [ ] Milk\n- [ ] Bread' });
  await share(app, owner, note.id, editor, 'editor');
  await share(app, owner, note.id, viewer, 'viewer');
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const req = (user: TestUser, method: string, path: string, payload?: Record<string, unknown>) =>
  app.inject({
    method: method as 'GET',
    url: `/api/v1/notes/${note.id}${path}`,
    headers: user.auth,
    ...(payload ? { payload } : {}),
  });

const currentVersion = async () => (await prisma.note.findUniqueOrThrow({ where: { id: note.id } })).version;

describe('permission matrix (specification §5.3)', () => {
  it('read: owner, editor, viewer yes; others 404', async () => {
    expect((await req(owner, 'GET', '')).statusCode).toBe(200);
    expect((await req(editor, 'GET', '')).json().role).toBe('editor');
    expect((await req(viewer, 'GET', '')).json().role).toBe('viewer');
    expect((await req(outsider, 'GET', '')).statusCode).toBe(404);
  });

  it('SHARE-4 / SHARE-5: edit content: owner and editor yes; viewer 403; others 404', async () => {
    expect((await req(owner, 'PATCH', '', { version: await currentVersion(), title: 'o' })).statusCode).toBe(200);
    const byEditor = await req(editor, 'PATCH', '', { version: await currentVersion(), title: 'e' });
    expect(byEditor.statusCode).toBe(200);
    expect(byEditor.json().updatedBy).toEqual({ id: editor.id, username: 'editor' });
    expect((await req(viewer, 'PATCH', '', { version: await currentVersion(), title: 'v' })).statusCode).toBe(403);
    expect((await req(outsider, 'PATCH', '', { version: await currentVersion(), title: 'x' })).statusCode).toBe(404);
  });

  it('SHARE-5: viewers cannot check items', async () => {
    const toggle = { index: 0, text: 'Milk', checked: true };
    expect((await req(viewer, 'POST', '/items/toggle', toggle)).statusCode).toBe(403);
    expect((await req(editor, 'POST', '/items/toggle', toggle)).statusCode).toBe(200);
  });

  it('SHARE-4: only the owner manages members and links, and deletes', async () => {
    for (const user of [editor, viewer]) {
      expect((await req(user, 'POST', '/members', { username: outsider.username, role: 'viewer' })).statusCode).toBe(403);
      expect((await req(user, 'POST', '/links', { role: 'viewer' })).statusCode).toBe(403);
      expect((await req(user, 'GET', '/links')).statusCode).toBe(403);
      expect((await req(user, 'DELETE', '')).statusCode).toBe(403);
    }
    expect((await req(outsider, 'DELETE', '')).statusCode).toBe(404);
    expect((await req(owner, 'DELETE', '')).statusCode).toBe(204);
  });

  it('pin and own categories: every member, for themselves only (NOTE-11, CAT-4)', async () => {
    const cat = await createCategory(app, viewer, 'Mine');
    expect((await req(viewer, 'PUT', '/pinned', { pinned: true })).statusCode).toBe(204);
    expect((await req(viewer, 'PUT', '/categories', { categoryIds: [cat.id] })).statusCode).toBe(204);
    const asViewer = (await req(viewer, 'GET', '')).json();
    expect(asViewer).toMatchObject({ pinned: true, categories: [{ name: 'Mine' }] });
    const asOwner = (await req(owner, 'GET', '')).json();
    expect(asOwner).toMatchObject({ pinned: false, categories: [] });
    expect((await req(outsider, 'PUT', '/pinned', { pinned: true })).statusCode).toBe(404);
  });
});

describe('sharing with users', () => {
  it('SHARE-1: share by username (case-insensitive); unknown username 404; duplicate 409', async () => {
    const members = (await req(owner, 'GET', '/members')).json();
    expect(members.map((m: { role: string }) => m.role)).toEqual(['owner', 'editor', 'viewer']);
    expect(members[1].user).toEqual({ id: editor.id, username: 'editor' });
    expect((await req(owner, 'POST', '/members', { username: 'ghost', role: 'viewer' })).statusCode).toBe(404);
    const dup = await req(owner, 'POST', '/members', { username: 'EDITOR', role: 'viewer' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('ALREADY_MEMBER');
  });

  it('NOTE-9: shared notes appear in "Shared with me", not in "My notes"', async () => {
    const titles = async (user: TestUser, scope: string) =>
      (await app.inject({ method: 'GET', url: `/api/v1/notes?scope=${scope}`, headers: user.auth })).json().items.length;
    expect(await titles(editor, 'shared')).toBe(1);
    expect(await titles(editor, 'mine')).toBe(0);
    expect(await titles(owner, 'mine')).toBe(1);
    expect(await titles(owner, 'shared')).toBe(0);
    expect((await req(owner, 'GET', '')).json().shared).toBe(true);
  });

  it('SHARE-2: change a role and remove a member', async () => {
    const promote = await req(owner, 'PATCH', `/members/${viewer.id}`, { role: 'editor' });
    expect(promote.json().role).toBe('editor');
    expect((await req(viewer, 'PATCH', '', { version: await currentVersion(), title: 'now ok' })).statusCode).toBe(200);
    expect((await req(owner, 'PATCH', `/members/${owner.id}`, { role: 'viewer' })).statusCode).toBe(400);
    expect((await req(owner, 'DELETE', `/members/${viewer.id}`)).statusCode).toBe(204);
    expect((await req(viewer, 'GET', '')).statusCode).toBe(404);
    expect((await req(editor, 'DELETE', `/members/${owner.id}`)).statusCode).toBe(403);
  });

  it('SHARE-3: a member can leave; their categories on the note are removed; the owner cannot leave', async () => {
    const cat = await createCategory(app, editor, 'Tag');
    await req(editor, 'PUT', '/categories', { categoryIds: [cat.id] });
    expect((await req(editor, 'DELETE', '/members/me')).statusCode).toBe(204);
    expect((await req(editor, 'GET', '')).statusCode).toBe(404);
    expect(await prisma.noteCategory.count({ where: { categoryId: cat.id } })).toBe(0);
    expect((await req(owner, 'DELETE', '/members/me')).statusCode).toBe(400);
  });
});

describe('share links', () => {
  const shared = (token: string, method = 'GET', payload?: Record<string, unknown>) =>
    app.inject({
      method: method as 'GET',
      url: `/api/v1/shared/${token}${method === 'POST' ? '/items/toggle' : ''}`,
      ...(payload ? { payload } : {}),
    });

  const createLink = async (role: 'viewer' | 'editor', expiresAt?: string) => {
    const res = await req(owner, 'POST', '/links', { role, ...(expiresAt ? { expiresAt } : {}) });
    expect(res.statusCode, res.body).toBe(201);
    return res.json();
  };

  it('SHARE-7 / SHARE-8 / SHARE-10: a viewer link opens the note without an account', async () => {
    const link = await createLink('viewer');
    expect(link.url).toBe(`${PUBLIC_URL}/s/${link.token}`);
    expect(link.token).toHaveLength(43);
    const res = await shared(link.token);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      note: expect.objectContaining({ id: note.id, type: 'list', content: '- [ ] Milk\n- [ ] Bread', version: 1 }),
      role: 'viewer',
      owner: { username: 'owner' },
    });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-robots-tag']).toBe('noindex');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect((await shared(link.token, 'PATCH', { version: 1, title: 'hack' })).statusCode).toBe(403);
    expect((await shared(link.token, 'POST', { index: 0, text: 'Milk', checked: true })).statusCode).toBe(403);
  });

  it('SHARE-8: an editor link can edit and check items', async () => {
    const link = await createLink('editor');
    const edit = await shared(link.token, 'PATCH', { version: 1, title: 'From link' });
    expect(edit.statusCode).toBe(200);
    expect(edit.json().note).toMatchObject({ title: 'From link', version: 2 });
    expect((await shared(link.token, 'PATCH', { version: 1, title: 'stale' })).statusCode).toBe(409);
    const toggle = await shared(link.token, 'POST', { index: 1, text: 'Bread', checked: true });
    expect(toggle.json().note.content).toBe('- [ ] Milk\n- [x] Bread');
    expect((await req(owner, 'GET', '')).json().updatedBy).toBeNull();
  });

  it('SHARE-9: links are listed, revoked, and expire', async () => {
    const keep = await createLink('viewer');
    const revoke = await createLink('editor');
    const expiring = await createLink('viewer', new Date(Date.now() + 60_000).toISOString());
    expect((await req(owner, 'DELETE', `/links/${revoke.id}`)).statusCode).toBe(204);
    expect((await shared(revoke.token)).statusCode).toBe(404);
    await prisma.shareLink.update({ where: { id: expiring.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await shared(expiring.token)).statusCode).toBe(404);
    const links = (await req(owner, 'GET', '/links')).json();
    expect(links.map((l: { id: string }) => l.id)).toEqual([keep.id]);
    expect((await shared('x'.repeat(43))).statusCode).toBe(404);
    expect((await req(owner, 'POST', '/links', { role: 'viewer', expiresAt: '2000-01-01T00:00:00Z' })).statusCode).toBe(400);
    expect((await req(owner, 'POST', '/links', { role: 'owner' })).statusCode).toBe(400);
  });

  it('NOTE-12: deleting the note invalidates its links', async () => {
    const link = await createLink('viewer');
    await req(owner, 'DELETE', '');
    expect((await shared(link.token)).statusCode).toBe(404);
  });
});

describe('NFR-3: guessing share links', () => {
  it('blocks an address after too many unknown links, valid links included; other addresses are not affected', async () => {
    const guarded = await createTestApp({ SHARE_LINK_MAX_FAILURES: '3', SHARE_LINK_BLOCK: '60s' });
    try {
      const created = await guarded.inject({
        method: 'POST',
        url: `/api/v1/notes/${note.id}/links`,
        headers: owner.auth,
        payload: { role: 'viewer' },
      });
      const token = created.json().token as string;
      const open = (t: string, remoteAddress: string) =>
        guarded.inject({ method: 'GET', url: `/api/v1/shared/${t}`, remoteAddress });

      for (let i = 0; i < 3; i++) {
        expect((await open(`guess-${i}-${'x'.repeat(30)}`, '203.0.113.7')).statusCode).toBe(404);
      }
      const blocked = await open(token, '203.0.113.7');
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json().error.code).toBe('TOO_MANY_ATTEMPTS');
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect((await open(token, '198.51.100.20')).statusCode).toBe(200);
    } finally {
      await guarded.close();
    }
  });
});
