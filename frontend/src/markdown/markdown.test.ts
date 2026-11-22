import { describe, expect, it } from 'vitest';
import { insertItem, items, moveItem, parseLines, removeItem, serializeLines, updateItem } from './listModel';
import { parseTaskItems, taskProgress, textToList, toggleTaskItem } from './tasklist';

// Same cases as backend/test/tasklist.test.ts.
describe('tasklist (mirror of the backend)', () => {
  const list = '- [ ] Milk\n- [x] Bread\n* [X] Eggs\n1. [ ] **Butter**\nNot an item';

  it('parses GFM task items', () => {
    expect(parseTaskItems(list).map((i) => [i.checked, i.text])).toEqual([
      [false, 'Milk'],
      [true, 'Bread'],
      [true, 'Eggs'],
      [false, '**Butter**'],
    ]);
  });

  it('toggles by index, falls back to the text, and fails when ambiguous', () => {
    expect(toggleTaskItem(list, { index: 0, text: 'Milk', checked: true })).toMatch(/^- \[x\] Milk/);
    expect(toggleTaskItem('- [ ] New\n- [ ] Milk', { index: 0, text: 'Milk', checked: true })).toBe('- [ ] New\n- [x] Milk');
    expect(toggleTaskItem('- [ ] A\n- [ ] A', { index: 5, text: 'A', checked: true })).toBeNull();
  });

  it('converts text to a list and counts progress', () => {
    expect(textToList('Milk\n\n- Bread\n- [x] Eggs\n2. Butter')).toBe('- [ ] Milk\n- [ ] Bread\n- [x] Eggs\n- [ ] Butter');
    expect(taskProgress(list)).toEqual({ checked: 2, total: 4 });
  });
});

describe('checklist line model', () => {
  const content = '- [ ] Milk\nA note line\n- [x] Bread\n  - [ ] Sub';

  it('round-trips content', () => {
    expect(serializeLines(parseLines(content))).toBe(content);
    expect(parseLines('')).toEqual([]);
  });

  it('edits, inserts and removes items, keeping raw lines', () => {
    let lines = parseLines(content);
    const [milk, bread] = items(lines);
    lines = updateItem(lines, milk!.key, { checked: true, text: 'Oat milk' });
    const inserted = insertItem(lines, bread!.key, 'Eggs');
    lines = inserted.lines;
    expect(serializeLines(lines)).toBe('- [x] Oat milk\nA note line\n- [x] Bread\n- [ ] Eggs\n  - [ ] Sub');
    lines = removeItem(lines, milk!.key);
    expect(serializeLines(lines)).toBe('A note line\n- [x] Bread\n- [ ] Eggs\n  - [ ] Sub');
    expect(serializeLines(insertItem([], null).lines)).toBe('- [ ]');
  });

  it('moves items without moving raw lines', () => {
    const lines = parseLines(content);
    const [milk, , sub] = items(lines);
    expect(serializeLines(moveItem(lines, sub!.key, milk!.key))).toBe('  - [ ] Sub\nA note line\n- [ ] Milk\n- [x] Bread');
  });

  it('NOTE-6: checking an item keeps its place', () => {
    const lines = parseLines(content);
    const [, bread] = items(lines);
    const unchecked = updateItem(lines, bread!.key, { checked: false });
    expect(items(unchecked).map((l) => l.text)).toEqual(['Milk', 'Bread', 'Sub']);
    expect(serializeLines(unchecked)).toBe(serializeLines(lines).replace('- [x] Bread', '- [ ] Bread'));
  });
});
