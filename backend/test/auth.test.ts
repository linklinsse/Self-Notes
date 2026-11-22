import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app.js';
import { AccessTokens } from '../src/lib/tokens.js';
import { BODY, JWT_SECRET, createTestApp, prisma, registerUser, resetDb } from './helpers.js';

let app: App;

beforeAll(async () => {
  app = await createTestApp();
});
beforeEach(resetDb);
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const login = (username: string, password = 'password123', headers: Record<string, string> = BODY) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/login', headers, payload: { username, password } });

const refresh = (refreshToken: string) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: BODY, payload: { refreshToken } });

describe('health', () => {
  it('reports the server identity and version', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', name: 'Self-Notes' });
    expect(res.json().version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('answers unknown routes with the standard error format', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  });
});

describe('registration and login', () => {
  it('AUTH-1: registers and returns tokens in the body with X-Token-Transport: body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: BODY,
      payload: { username: 'alice', password: 'password123' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user).toEqual({ id: expect.any(String), username: 'alice', preferences: {} });
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('AUTH-1: web clients get the refresh token as an httpOnly cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { username: 'web', password: 'password123' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().refreshToken).toBeUndefined();
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/^sn_refresh=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('AUTH-1: rejects short passwords', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { username: 'short', password: 'short' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('AUTH-1: sign-up can be disabled, and /api/health says so', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/health' })).json().registration).toBe(true);
    const closed = await createTestApp({ ALLOW_REGISTRATION: 'false' });
    const res = await closed.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { username: 'late', password: 'password123' },
    });
    const health = await closed.inject({ method: 'GET', url: '/api/health' });
    await closed.close();
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('REGISTRATION_DISABLED');
    expect(health.json()).toMatchObject({ status: 'ok', name: 'Self-Notes', registration: false });
  });

  it('AUTH-2: usernames are unique and case-insensitive (stored lowercase)', async () => {
    const bob = await registerUser(app, 'Bob');
    expect(bob.username).toBe('bob');
    expect((await login('BOB')).statusCode).toBe(200);
    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { username: ' bOb ', password: 'password123' },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('USERNAME_TAKEN');
  });

  it('AUTH-1: usernames are 3 to 32 letters, digits, dots, dashes or underscores', async () => {
    const register = (username: string) =>
      app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: BODY, payload: { username, password: 'password123' } });
    for (const ok of ['abc', 'jean.dupont', 'jd_42', 'x-y-z', '0zero', 'a'.repeat(32)]) {
      expect((await register(ok)).statusCode, ok).toBe(201);
    }
    for (const bad of ['ab', '_lead', '.dot', 'has space', 'émilie', 'a@b.c', 'a'.repeat(33), '']) {
      const res = await register(bad);
      expect(res.statusCode, bad).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('AUTH-3: same error for a wrong password and an unknown username', async () => {
    await registerUser(app, 'carol');
    const wrong = await login('carol', 'not-the-password');
    const unknown = await login('nobody');
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
    expect(wrong.json().error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('access tokens', () => {
  it('protected routes require a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects invalid tokens', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { authorization: 'Bearer nope' } });
    expect(res.statusCode).toBe(401);
  });

  it('expired tokens give TOKEN_EXPIRED so clients know to refresh', async () => {
    const user = await registerUser(app, 'dave');
    const expired = await new AccessTokens(JWT_SECRET, -60).sign({ userId: user.id, sessionFamilyId: 'x' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${expired.token}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('TOKEN_EXPIRED');
  });
});

describe('AUTH-4: refresh tokens', () => {
  it('rotates the refresh token and slides the expiry to 30 days', async () => {
    const user = await registerUser(app, 'erin');
    const res = await refresh(user.refreshToken);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.refreshToken).toBeTruthy();
    expect(body.refreshToken).not.toBe(user.refreshToken);
    const sessions = await prisma.session.findMany({ where: { userId: user.id, replacedById: null } });
    expect(sessions).toHaveLength(1);
    const days = (sessions[0]!.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect((await refresh(body.refreshToken)).statusCode).toBe(200);
  });

  it('works with the cookie for web clients', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { username: 'cookie', password: 'password123' },
    });
    const token = /sn_refresh=([^;]+)/.exec(String(reg.headers['set-cookie']))![1]!;
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', cookies: { sn_refresh: token } });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().refreshToken).toBeUndefined();
    expect(String(res.headers['set-cookie'])).toMatch(/^sn_refresh=/);
  });

  it('a lost response within the grace period does not log the user out', async () => {
    const user = await registerUser(app, 'frank');
    const lost = await refresh(user.refreshToken); // the client never receives this response
    expect(lost.statusCode).toBe(200);
    const retry = await refresh(user.refreshToken);
    expect(retry.statusCode).toBe(200);
    expect((await refresh(lost.json().refreshToken)).statusCode).toBe(401); // unused replacement was revoked
    expect((await refresh(retry.json().refreshToken)).statusCode).toBe(200);
  });

  it('reusing a token whose replacement was already used revokes the whole session', async () => {
    const user = await registerUser(app, 'grace');
    const first = (await refresh(user.refreshToken)).json().refreshToken;
    const second = (await refresh(first)).json().refreshToken;
    const stolen = await refresh(user.refreshToken);
    expect(stolen.statusCode).toBe(401);
    expect(stolen.json().error.code).toBe('INVALID_REFRESH_TOKEN');
    expect((await refresh(second)).statusCode).toBe(401);
  });

  it('reuse after the grace period revokes the whole session', async () => {
    const user = await registerUser(app, 'heidi');
    const next = (await refresh(user.refreshToken)).json().refreshToken;
    await prisma.session.updateMany({
      where: { userId: user.id, replacedById: null },
      data: { createdAt: new Date(Date.now() - 3 * 60 * 1000) },
    });
    expect((await refresh(user.refreshToken)).statusCode).toBe(401);
    expect((await refresh(next)).statusCode).toBe(401);
  });

  it('expired refresh tokens are rejected', async () => {
    const user = await registerUser(app, 'ivan');
    await prisma.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await refresh(user.refreshToken)).statusCode).toBe(401);
  });

  it('logout revokes the session', async () => {
    const user = await registerUser(app, 'judy');
    const out = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: BODY,
      payload: { refreshToken: user.refreshToken },
    });
    expect(out.statusCode).toBe(204);
    expect((await refresh(user.refreshToken)).statusCode).toBe(401);
  });
});

describe('current user', () => {
  it('AUTH-5 / THEME-2: changes the username and the theme', async () => {
    const user = await registerUser(app, 'kim');
    await registerUser(app, 'taken');
    const patch = (payload: Record<string, unknown>) =>
      app.inject({ method: 'PATCH', url: '/api/v1/me', headers: user.auth, payload });

    const first = await patch({ username: 'Kimberly', preferences: { theme: 'sunflower', noteSort: 'title' } });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ username: 'kimberly', preferences: { theme: 'sunflower', noteSort: 'title' } });
    expect((await login('kimberly')).statusCode).toBe(200);
    expect((await login('kim')).statusCode).toBe(401);

    const clash = await patch({ username: 'TAKEN' });
    expect(clash.statusCode).toBe(409);
    expect(clash.json().error.code).toBe('USERNAME_TAKEN');
    // Removed preferences (follow device, checked items at the bottom) are rejected.
    expect((await patch({ preferences: { checkedItemsToBottom: true } })).statusCode).toBe(400);

    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: user.auth });
    expect(me.json()).toEqual({ id: user.id, username: 'kimberly', preferences: { theme: 'sunflower', noteSort: 'title' } });
    expect((await patch({ preferences: { noteSort: 'random' } })).statusCode).toBe(400);
  });

  it('rejects unknown preference keys', async () => {
    const user = await registerUser(app, 'leo');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: user.auth,
      payload: { preferences: { color: 'red' } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('AUTH-5: changing the password revokes the other sessions only', async () => {
    const user = await registerUser(app, 'mia');
    const other = (await login(user.username)).json();
    const wrong = await app.inject({
      method: 'PUT',
      url: '/api/v1/me/password',
      headers: user.auth,
      payload: { currentPassword: 'nope', newPassword: 'new-password-1' },
    });
    expect(wrong.statusCode).toBe(403);
    const ok = await app.inject({
      method: 'PUT',
      url: '/api/v1/me/password',
      headers: user.auth,
      payload: { currentPassword: 'password123', newPassword: 'new-password-1' },
    });
    expect(ok.statusCode).toBe(204);
    expect((await refresh(other.refreshToken)).statusCode).toBe(401);
    expect((await refresh(user.refreshToken)).statusCode).toBe(200);
    expect((await login(user.username, 'new-password-1')).statusCode).toBe(200);
    expect((await login(user.username)).statusCode).toBe(401);
  });
});
