import { expect, test } from '@playwright/test';
import { card, createNote, registerUser, signIn } from './helpers';

test('SHARE-1 SHARE-4: a note shared by username can be edited by the other user', async ({ page, browser, baseURL }) => {
  const owner = await registerUser(baseURL!, 'olga');
  const friend = await registerUser(baseURL!, 'fred');
  const note = await createNote(owner, { title: 'Projet', content: 'Plan initial' });

  await signIn(page, owner.username);
  await card(page, 'Projet').click();
  await page.getByRole('button', { name: 'Share' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('Username of a Self-Notes user').fill(friend.username);
  await dialog.getByRole('button', { name: 'Share' }).click();
  await expect(dialog.getByText(friend.username, { exact: true })).toBeVisible();

  const friendPage = await (await browser.newContext()).newPage();
  await signIn(friendPage, friend.username);
  await friendPage.getByRole('tab', { name: 'Shared with me' }).click();
  await card(friendPage, 'Projet').click();
  await friendPage.getByRole('button', { name: 'Edit' }).click();
  const saved = friendPage.waitForResponse((r) => r.request().method() === 'PATCH' && r.ok());
  await friendPage.getByLabel('Note content').fill('Plan modifié');
  await saved;

  const current = await (await owner.api.get(`/api/v1/notes/${note.id}`)).json();
  expect(current.content).toBe('Plan modifié');
  await owner.api.dispose();
  await friend.api.dispose();
});

test('SHARE-7 SHARE-8: a read-only link opens without an account', async ({ page, browser, baseURL }) => {
  const owner = await registerUser(baseURL!, 'lina');
  await createNote(owner, { title: 'Infos pratiques', content: 'Le code du portail est **4321**.' });

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await signIn(page, owner.username);
  await card(page, 'Infos pratiques').click();
  await page.getByRole('button', { name: 'Share' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Create link' }).click();
  await dialog.getByRole('button', { name: 'Copy link' }).first().click();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/\/s\/[\w-]{20,}$/);

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(url);
  await expect(visitor.getByLabel('Title')).toHaveValue('Infos pratiques');
  await expect(visitor.getByLabel('Title')).not.toBeEditable();
  await expect(visitor.getByText('Read-only')).toBeVisible();
  await expect(visitor.locator('strong', { hasText: '4321' })).toBeVisible();
  await owner.api.dispose();
});
