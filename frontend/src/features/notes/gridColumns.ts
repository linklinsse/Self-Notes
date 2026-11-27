/**
 * NOTE-21: how many notes a row of the grid holds. Saved on the device, not on the account: a
 * phone and a computer need different numbers. 0 means automatic: as many as fit.
 */
import { useState } from 'react';
import { storage } from '../../platform/storage';

const KEY = 'sn.gridColumns';
export const GRID_COLUMNS = [0, 1, 2, 3, 4, 5, 6] as const;

/** A stored value, or 0 (automatic) when it is missing or not 1 to 6. */
export function parseGridColumns(value: string | null): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n : 0;
}

export function useGridColumns(): [number, (columns: number) => void] {
  const [columns, setColumns] = useState(() => parseGridColumns(storage.get(KEY)));
  const update = (next: number) => {
    storage.set(KEY, next ? String(next) : null);
    setColumns(next);
  };
  return [columns, update];
}
