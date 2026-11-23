import { type APIRequestContext, type Page, expect, request } from '@playwright/test';

export const PASSWORD = 'e2e-password-123';

/** A username nobody else uses in this run (AUTH-1: 3 to 32 of a-z 0-9 . _ -). */
export function uniqueUsername(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.slice(0, 32);
}

export interface ApiUser {
  username: string;
  api: APIRequestContext;
}

/** Registers a user through the API and returns a request context that calls the API as them. */
export async function registerUser(baseURL: string, prefix: string): Promise<ApiUser> {
  const username = uniqueUsername(prefix);
  const anonymous = await request.newContext({ baseURL });
  const res = await anonymous.post('/api/v1/auth/register', {
    headers: { 'X-Token-Transport': 'body' },
    data: { username, password: PASSWORD },
  });
  expect(res.status(), await res.text()).toBe(201);
  const { accessToken } = (await res.json()) as { accessToken: string };
  await anonymous.dispose();
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` } });
  return { username, api };
}

export async function createNote(
  user: ApiUser,
  note: { title: string; type?: 'text' | 'list'; content?: string },
): Promise<{ id: string }> {
  const res = await user.api.post('/api/v1/notes', { data: { type: 'text', content: '', ...note } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { id: string };
}

/** Signs in through the login page (AUTH-3). */
export async function signIn(page: Page, username: string, password = PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('tab', { name: 'My notes' })).toBeVisible();
}

/** A card of the notes grid, by its title. */
export const card = (page: Page, title: string) =>
  page.locator('.note-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
