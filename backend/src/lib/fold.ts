/**
 * Keys that ignore case and accents. SQLite only folds ASCII letters (LIKE, NOCASE), so the app
 * computes these keys and stores them next to the text: `notes.title_key`, `notes.content_key`
 * and `categories.name_key` (see docs/data-model.md).
 */

/** Lower case, accents and other combining marks removed, compatibility forms unified (ﬁ → fi). */
export function fold(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').normalize('NFC');
}

/**
 * NOTE-10: what search compares, for stored text and queries alike. Prisma does not escape the
 * SQLite LIKE wildcards in `contains`, so % and _ become private-use characters: a search for
 * "100%" then finds "100%" only.
 */
export function searchKey(text: string): string {
  return fold(text).replace(/[%_]/g, (c) => (c === '%' ? '\uE025' : '\uE05F'));
}

/** NOTE-9, NOTE-10: search and the A to Z order. NULL for a blank title, which sorts last. */
export function titleKey(title: string): string | null {
  const key = searchKey(title.trim());
  return key === '' ? null : key;
}

/** NOTE-10, NOTE-17: search in the content. Encrypted content is never searched. */
export function contentKey(content: string, locked: boolean): string {
  return locked ? '' : searchKey(content);
}

/** CAT-1: a user's category names are unique regardless of case ("Work" and "work" clash). */
export function categoryNameKey(name: string): string {
  return name.normalize('NFC').toLowerCase();
}
