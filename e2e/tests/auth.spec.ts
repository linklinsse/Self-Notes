import { expect, test } from '@playwright/test';
import { PASSWORD, signIn, uniqueUsername } from './helpers';

test('AUTH-1 AUTH-3: sign up with a username, sign out, sign in again', async ({ page }) => {
  const username = uniqueUsername('ada');
  await page.goto('/login');
  await page.getByRole('link', { name: 'Create one' }).click();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Your notes will live here')).toBeVisible();

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByLabel('Username')).toHaveValue(username);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Wrong username or password.')).toBeVisible();

  await signIn(page, username);
  await expect(page.getByText('Your notes will live here')).toBeVisible();
});

test('AUTH-4: a reload keeps the user signed in', async ({ page }) => {
  const username = uniqueUsername('remy');
  await page.goto('/register');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Your notes will live here')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'My notes' })).toBeVisible();
});
