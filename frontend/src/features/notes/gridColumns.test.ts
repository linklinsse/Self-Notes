import { describe, expect, it } from 'vitest';
import { GRID_COLUMNS, parseGridColumns } from './gridColumns';

describe('NOTE-21: notes per row', () => {
  it('reads 1 to 6, anything else is automatic', () => {
    expect(GRID_COLUMNS.map(String).map(parseGridColumns)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const bad of [null, '', '7', '-1', '2.5', 'abc']) expect(parseGridColumns(bad)).toBe(0);
  });
});
