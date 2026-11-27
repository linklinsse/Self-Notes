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

test('NOTE-4: a checklist item may span several lines (Shift+Enter), Enter starts the next item', async ({ page }) => {
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByRole('button', { name: 'Checklist' }).click();
  await page.waitForURL(/\/notes\/[0-9a-f-]{36}$/);
  await page.getByLabel('Title').fill('Courses');
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.keyboard.type('Lait');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('demi-écrémé');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Pain');
  const saved = savedWith(page, 'Pain');
  await page.getByLabel('Title').click();
  const body = JSON.parse((await saved).request().postData() ?? '{}') as { content?: string };
  expect(body.content).toBe('- [ ] Lait\n  demi-écrémé\n- [ ] Pain');

  // Shown on two lines, and checking it still works (the server finds it by its first line).
  const item = page.locator('.check-item').first();
  await expect(item.locator('.item-text br')).toHaveCount(1);
  const toggled = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/items/toggle') && r.ok());
  await page.getByRole('checkbox', { name: 'Check Lait' }).check();
  await toggled;
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

test('NOTE-21: notes per row are chosen in the sort menu and kept on this device', async ({ page }) => {
  for (const title of ['A', 'B', 'C', 'D', 'E']) await createNote(user, { title, content: 'x' });
  await page.reload();
  const perRow = async () => {
    const tops = await page.locator('.note-card').evaluateAll((cards) => cards.map((c) => Math.round(c.getBoundingClientRect().top)));
    return tops.filter((top) => top === tops[0]).length;
  };
  await expect(page.locator('.note-card')).toHaveCount(5);

  await page.getByRole('button', { name: /^Sort:/ }).click();
  await page.getByRole('button', { name: '2 per row' }).click();
  await expect.poll(perRow).toBe(2);
  await page.reload();
  await expect(page.locator('.note-card')).toHaveCount(5);
  await expect.poll(perRow).toBe(2);

  await page.getByRole('button', { name: /^Sort:/ }).click();
  await page.getByRole('button', { name: 'Automatic' }).click();
  await expect.poll(perRow).toBe(5);
});
