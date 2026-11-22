import type { NoteListQuery, NoteSummary } from '../../api/types';

/** NOTE-9: the orders offered on the notes grid, remembered in the user's preferences. */
export type NoteSort = 'favorites' | 'updated' | 'title' | 'category';

export const NOTE_SORTS: { id: NoteSort; label: string }[] = [
  { id: 'favorites', label: 'Favorites first' },
  { id: 'updated', label: 'Last updated' },
  { id: 'title', label: 'A to Z' },
  { id: 'category', label: 'By category' },
];

export function noteSortOf(value: string | undefined): NoteSort {
  return NOTE_SORTS.find((s) => s.id === value)?.id ?? 'favorites';
}

/** The API sorts; "by category" is a grouping of the favorites order. */
export function apiSort(sort: NoteSort): NonNullable<NoteListQuery['sort']> {
  return sort === 'category' ? 'favorites' : sort;
}

export interface NoteGroup {
  key: string;
  title: string | null;
  notes: NoteSummary[];
}

/**
 * Sections of the grid. By category, each note appears once, under the first of its categories
 * in the user's category order; notes without a category come last.
 */
export function groupNotes(notes: NoteSummary[], sort: NoteSort, categories: { id: string; name: string }[]): NoteGroup[] {
  let groups: NoteGroup[];
  if (sort === 'favorites') {
    const favorites = notes.filter((n) => n.pinned);
    groups = [
      { key: 'favorites', title: 'Favorites', notes: favorites },
      { key: 'others', title: favorites.length > 0 ? 'Others' : null, notes: notes.filter((n) => !n.pinned) },
    ];
  } else if (sort === 'category') {
    const rank = new Map(categories.map((c, i) => [c.id, i]));
    const primary = (note: NoteSummary) =>
      note.categories
        .map((c) => c.id)
        .filter((id) => rank.has(id))
        .sort((a, b) => rank.get(a)! - rank.get(b)!)[0];
    groups = [
      ...categories.map((c) => ({ key: c.id, title: c.name, notes: notes.filter((n) => primary(n) === c.id) })),
      { key: 'none', title: 'No category', notes: notes.filter((n) => primary(n) === undefined) },
    ];
  } else {
    groups = [{ key: 'all', title: null, notes }];
  }
  return groups.filter((g) => g.notes.length > 0);
}
