import { describe, expect, it } from 'vitest';
import type { NoteSummary } from '../../api/types';
import { apiSort, groupNotes, noteSortOf } from './noteGroups';

const note = (title: string, pinned: boolean, categoryIds: string[] = []) =>
  ({ id: title, title, pinned, categories: categoryIds.map((id) => ({ id, name: id, color: '#ff4f8b' })) }) as unknown as NoteSummary;

const categories = [
  { id: 'home', name: 'Home' },
  { id: 'work', name: 'Work' },
];
const notes = [note('a', true, ['work']), note('b', false, ['work', 'home']), note('c', false), note('d', true, ['home'])];
const view = (sort: Parameters<typeof groupNotes>[1]) =>
  groupNotes(notes, sort, categories).map((g) => [g.title, g.notes.map((n) => n.title)]);

describe('NOTE-9: grid order', () => {
  it('favorites first, then the others', () => {
    expect(view('favorites')).toEqual([
      ['Favorites', ['a', 'd']],
      ['Others', ['b', 'c']],
    ]);
    expect(groupNotes([note('x', false)], 'favorites', []).map((g) => g.title)).toEqual([null]);
  });

  it('one plain section for "last updated" and "A to Z" (the API sorts)', () => {
    expect(view('updated')).toEqual([[null, ['a', 'b', 'c', 'd']]]);
    expect(view('title')).toEqual([[null, ['a', 'b', 'c', 'd']]]);
  });

  it('by category: once per note, under its first category in the user order, then "No category"', () => {
    expect(view('category')).toEqual([
      ['Home', ['b', 'd']],
      ['Work', ['a']],
      ['No category', ['c']],
    ]);
  });

  it('reads the saved preference, the default being favorites first', () => {
    expect(noteSortOf('title')).toBe('title');
    expect(noteSortOf(undefined)).toBe('favorites');
    expect(noteSortOf('system')).toBe('favorites');
    expect(apiSort('category')).toBe('favorites');
  });
});
