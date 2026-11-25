import { type Page, expect, test } from '@playwright/test';
import { type ApiUser, card, createNote, registerUser, signIn } from './helpers';

let user: ApiUser;

test.beforeEach(async ({ page, baseURL }) => {
  user = await registerUser(baseURL!, 'nora');
  await signIn(page, user.username);
});

test.afterEach(async () => {
  await user.api.dispose();
});

/** Resolves when an autosave containing `text` has been accepted by the server. */
const savedWith = (page: Page, text: string) =>
  page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.ok() && (r.request().postData() ?? '').includes(text),
  );

test('NOTE-1 NOTE-3 NOTE-13: a text note autosaves its Markdown and renders it', async ({ page }) => {
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByRole('button', { name: 'Text note' }).click();
  await page.waitForURL(/\/notes\/[0-9a-f-]{36}$/);
  await page.getByLabel('Title').fill('Recette');
  const saved = savedWith(page, 'Oeufs');
  await page.getByLabel('Note content').fill('## Ingrédients\n\n- Farine\n- **Oeufs**');
  await saved;

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ingrédients' })).toBeVisible();
  await expect(page.locator('strong', { hasText: 'Oeufs' })).toBeVisible();

  await page.goto('/');
  await expect(card(page, 'Recette')).toContainText('Farine');
});

test('NOTE-2: a single line break in the source is a line break on screen', async ({ page }) => {
  const note = await createNote(user, { title: 'Adresse', content: 'Jean Dupont\n3 place Bellecour\n69002 Lyon\n\nUn autre paragraphe' });
  await page.goto(`/notes/${note.id}`);
  const paragraph = page.locator('.markdown p').first();
  await expect(paragraph).toBeVisible();
  expect((await paragraph.innerText()).split('\n')).toEqual(['Jean Dupont', '3 place Bellecour', '69002 Lyon']);
  await expect(page.locator('.markdown p')).toHaveCount(2);
});

test('NOTE-4 NOTE-5: a checklist keeps its items and shows its progress', async ({ page }) => {
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByRole('button', { name: 'Checklist' }).click();
  await page.waitForURL(/\/notes\/[0-9a-f-]{36}$/);
  await page.getByLabel('Title').fill('Courses');
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.keyboard.type('Lait');
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.keyboard.type('Pain');
  const saved = savedWith(page, '[x] Lait');
  await page.getByRole('checkbox', { name: 'Check Lait' }).check();
  await saved;

  await page.goto('/');
  await expect(card(page, 'Courses')).toContainText('1/2');
});

test('NOTE-10: search ignores case and accents', async ({ page }) => {
  await createNote(user, { title: 'Été à Paris', content: 'Croissants' });
  await createNote(user, { title: 'Hiver', content: 'Ski' });
  await page.reload();
  const search = page.getByPlaceholder('Search notes');

  await search.fill('ete');
  await expect(card(page, 'Été à Paris')).toBeVisible();
  await expect(card(page, 'Hiver')).toHaveCount(0);

  await search.fill('CROISSANT');
  await expect(card(page, 'Été à Paris')).toBeVisible();
  await expect(card(page, 'Hiver')).toHaveCount(0);
});
