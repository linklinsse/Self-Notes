import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseTaskItems,
  plainPreview,
  stripInline,
  taskProgress,
  textToList,
  toggleTaskItem,
} from '../src/lib/tasklist.js';
import type { TaskItem } from '../src/lib/tasklist.js';

// Shared with the frontend and the Android widgets: a checkbox toggled anywhere targets the same item.
const fixtures = JSON.parse(
  readFileSync(new URL('../../frontend/src/markdown/task-items.fixtures.json', import.meta.url), 'utf8'),
) as { cases: { name: string; content: string; items: TaskItem[] }[] };

describe('task items: shared fixtures', () => {
  it.each(fixtures.cases)('NOTE-5: $name', ({ content, items }) => {
    expect(parseTaskItems(content)).toEqual(items);
  });
});

describe('tasklist', () => {
  const list = '- [ ] Milk\n- [x] Bread\n* [X] Eggs\n1. [ ] **Butter**\nNot an item';

  it('NOTE-5: parses GFM task items and keeps other lines out', () => {
    expect(parseTaskItems(list)).toEqual([
      { line: 0, checked: false, text: 'Milk' },
      { line: 1, checked: true, text: 'Bread' },
      { line: 2, checked: true, text: 'Eggs' },
      { line: 3, checked: false, text: '**Butter**' },
    ]);
  });

  it('ignores task-like lines inside fenced code blocks', () => {
    expect(parseTaskItems('```\n- [ ] code\n```\n- [ ] real')).toEqual([{ line: 3, checked: false, text: 'real' }]);
  });

  it('toggles by index when the text matches', () => {
    expect(toggleTaskItem(list, { index: 0, text: 'Milk', checked: true })).toBe(
      '- [x] Milk\n- [x] Bread\n* [X] Eggs\n1. [ ] **Butter**\nNot an item',
    );
  });

  it('falls back to the only item with the same text when the index moved', () => {
    const moved = '- [ ] New first\n- [ ] Milk';
    expect(toggleTaskItem(moved, { index: 0, text: 'Milk', checked: true })).toBe('- [ ] New first\n- [x] Milk');
  });

  it('returns null when the item cannot be found or is ambiguous', () => {
    expect(toggleTaskItem(list, { index: 9, text: 'Gone', checked: true })).toBeNull();
    expect(toggleTaskItem('- [ ] A\n- [ ] A', { index: 5, text: 'A', checked: true })).toBeNull();
  });

  it('keeps CRLF line endings untouched on other lines', () => {
    expect(toggleTaskItem('- [ ] A\r\n- [ ] B', { index: 1, text: 'B', checked: true })).toBe('- [ ] A\r\n- [x] B');
  });

  it('NOTE-7: converts text to a list', () => {
    expect(textToList('Milk\n\n- Bread\n- [x] Eggs\n2. Butter')).toBe(
      '- [ ] Milk\n- [ ] Bread\n- [x] Eggs\n- [ ] Butter',
    );
  });

  it('counts progress', () => {
    expect(taskProgress(list)).toEqual({ checked: 2, total: 4 });
  });

  it('strips inline Markdown', () => {
    expect(stripInline('**bold** _it_ [link](http://x) `code` ~~old~~ snake_case')).toBe(
      'bold it link code old snake_case',
    );
  });

  it('builds plain previews', () => {
    expect(plainPreview('# Title\n\nSome **text** with a [link](http://x).\n> quote', 'text')).toBe(
      'Title Some text with a link. quote',
    );
    expect(plainPreview(list, 'list')).toBe('Milk · Bread · Eggs · Butter');
    expect(plainPreview('a'.repeat(300), 'text')).toHaveLength(200);
  });

  it('NOTE-18 / NOTE-19: previews skip the table of contents marker and Mermaid sources', () => {
    const note = '# Plan\n\n[[_TOC_]]\n\n```mermaid\ngraph TD\n  A --> B\n```\n\n## Steps\n\n```js\nrun()\n```\n[TOC]';
    expect(plainPreview(note, 'text')).toBe('Plan Steps run()');
  });
});
