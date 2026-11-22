/**
 * Line model used by the checklist editor (NOTE-4, NOTE-5).
 * Items are edited; other lines ("raw") are kept in place, untouched.
 */
import { FENCE_RE, TASK_RE } from './tasklist';

export type ItemLine = { kind: 'item'; key: string; checked: boolean; text: string; indent: string };
export type RawLine = { kind: 'raw'; key: string; text: string };
export type Line = ItemLine | RawLine;

let seq = 0;
export const newKey = () => `l${++seq}`;

export const isItem = (line: Line): line is ItemLine => line.kind === 'item';

export function parseLines(content: string): Line[] {
  if (content === '') return [];
  let inFence = false;
  return content.split('\n').map((raw): Line => {
    const text = raw.replace(/\r$/, '');
    if (FENCE_RE.test(text)) {
      inFence = !inFence;
      return { kind: 'raw', key: newKey(), text: raw };
    }
    const match = inFence ? null : TASK_RE.exec(text);
    if (!match) return { kind: 'raw', key: newKey(), text: raw };
    return { kind: 'item', key: newKey(), checked: match[3] !== ' ', text: (match[4] ?? '').trim(), indent: match[1] ?? '' };
  });
}

export function serializeLines(lines: Line[]): string {
  return lines
    .map((l) => (l.kind === 'item' ? `${l.indent}- [${l.checked ? 'x' : ' '}] ${l.text}`.trimEnd() : l.text))
    .join('\n');
}

export function items(lines: Line[]): ItemLine[] {
  return lines.filter(isItem);
}

export function updateItem(lines: Line[], key: string, patch: Partial<Pick<ItemLine, 'checked' | 'text'>>): Line[] {
  return lines.map((l) => (l.key === key && isItem(l) ? { ...l, ...patch } : l));
}

/** Insert a new item after `afterKey` (or at the end). Returns the new lines and the new item's key. */
export function insertItem(lines: Line[], afterKey: string | null, text = ''): { lines: Line[]; key: string } {
  const after = afterKey ? lines.find((l) => l.key === afterKey) : undefined;
  const item: ItemLine = {
    kind: 'item',
    key: newKey(),
    checked: false,
    text,
    indent: after && isItem(after) ? after.indent : '',
  };
  const index = after ? lines.indexOf(after) + 1 : lines.length;
  return { lines: [...lines.slice(0, index), item, ...lines.slice(index)], key: item.key };
}

export function removeItem(lines: Line[], key: string): Line[] {
  return lines.filter((l) => l.key !== key);
}

/** Move an item to the position of another item. Raw lines keep their positions. */
export function moveItem(lines: Line[], fromKey: string, toKey: string): Line[] {
  const list = items(lines);
  const from = list.findIndex((l) => l.key === fromKey);
  const to = list.findIndex((l) => l.key === toKey);
  if (from < 0 || to < 0 || from === to) return lines;
  const reordered = [...list];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved!);
  let i = 0;
  return lines.map((l) => (isItem(l) ? reordered[i++]! : l));
}
