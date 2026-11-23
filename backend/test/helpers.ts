import { PrismaClient } from '@prisma/client';
import { expect } from 'vitest';
import { type App, buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { TEST_DATABASE_URL } from './test-db.js';

export const JWT_SECRET = 'test-secret-test-secret-test-secret-0123456789';
export const PUBLIC_URL = 'http://notes.test';

export const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });

export async function createTestApp(env: Record<string, string> = {}): Promise<App> {
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    JWT_SECRET,
    PUBLIC_URL,
    RATE_LIMIT: 'false',
    // Off by default: several suites open unknown links on purpose. sharing.test.ts turns it on.
    SHARE_LINK_MAX_FAILURES: '0',
    LOG_LEVEL: 'silent',
    API_DOCS: 'false',
    ...env,
  });
  const app = await buildApp(config, { prisma, logger: false });
  await app.ready();
  return app;
}

/** Empty every table (children first: SQLite enforces the foreign keys). */
export async function resetDb(): Promise<void> {
  await prisma.$transaction([
    prisma.shareLink.deleteMany(),
    prisma.noteCategory.deleteMany(),
    prisma.noteMember.deleteMany(),
    prisma.note.deleteMany(),
    prisma.category.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

export interface TestUser {
  id: string;
  username: string;
  accessToken: string;
  refreshToken: string;
  auth: { authorization: string };
}

export const BODY = { 'x-token-transport': 'body' } as const;

export async function registerUser(app: App, name: string): Promise<TestUser> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers: BODY,
    payload: { username: name, password: 'password123' },
  });
  expect(res.statusCode, res.body).toBe(201);
  const body = res.json();
  return {
    id: body.user.id,
    username: body.user.username,
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    auth: { authorization: `Bearer ${body.accessToken}` },
  };
}

export async function createNote(app: App, user: TestUser, payload: Record<string, unknown> = {}) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/notes',
    headers: user.auth,
    payload: { type: 'text', title: 'Note', content: 'Hello', ...payload },
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json();
}

export async function share(app: App, owner: TestUser, noteId: string, user: TestUser, role: 'editor' | 'viewer') {
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/notes/${noteId}/members`,
    headers: owner.auth,
    payload: { username: user.username, role },
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json();
}

export async function createCategory(app: App, user: TestUser, name: string, color = '#f4b8c8') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/categories',
    headers: user.auth,
    payload: { name, color },
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json();
}
