import { expect, test } from '@playwright/test';
import { card, createNote, registerUser, signIn } from './helpers';

test('NOTE-17: a note locked with a password shows its title only until unlocked', async ({ page, baseURL }) => {
  const user = await registerUser(baseURL!, 'vera');
  const note = await createNote(user, { title: 'Coffre', content: 'Code du coffre : 1234' });

  await signIn(page, user.username);
  await card(page, 'Coffre').click();
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Lock with a password' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Password', { exact: true }).fill('mot-de-passe-1');
  await dialog.getByLabel('Confirm the password').fill('mot-de-passe-1');
  await dialog.getByRole('button', { name: 'Lock the note' }).click();
  await expect(page.getByText('Note locked')).toBeVisible();

  // The server only has ciphertext.
  const stored = await (await user.api.get(`/api/v1/notes/${note.id}`)).json();
  expect(stored.locked).toBe(true);
  expect(stored.content).not.toContain('1234');

  await page.goto('/');
  await expect(card(page, 'Coffre')).toContainText('Locked with a password');
  await expect(card(page, 'Coffre')).not.toContainText('1234');

  await card(page, 'Coffre').click();
  await page.locator('.unlock-form').getByLabel('Password').fill('mot-de-passe-1');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('Code du coffre : 1234')).toBeVisible();
  await user.api.dispose();
});
