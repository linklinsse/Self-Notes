/**
 * Line model used by the checklist editor (NOTE-4, NOTE-5).
 * Items are edited; other lines ("raw") are kept in place, untouched.
 *
 * An item may span several lines (NOTE-4): its next lines are written indented under it, which
 * Markdown reads as part of the same list item:
 *   - [ ] Milk
 *     semi-skimmed, 2 bottles
 * In the model, `text` holds them all, joined by "\n". The first line alone identifies the item
 * for the server's toggle (`parseTaskItems`).
 */
import { FENCE_RE, TASK_RE } from './tasklist';

export type ItemLine = { kind: 'item'; key: string; checked: boolean; text: string; indent: string };
export type RawLine = { kind: 'raw'; key: string; text: string };
export type Line = ItemLine | RawLine;

let seq = 0;
export const newKey = () => `l${++seq}`;

export const isItem = (line: Line): line is ItemLine => line.kind === 'item';

/** Width of the leading whitespace, a tab counting as two spaces. */
const indentWidth = (line: string) => (/^\s*/.exec(line)?.[0] ?? '').replace(/\t/g, '  ').length;

export function parseLines(content: string): Line[] {
  if (content === '') return [];
  let inFence = false;
  const lines: Line[] = [];
  // The item that the next indented line continues, if any.
  let open: ItemLine | null = null;
  for (const raw of content.split('\n')) {
    const text = raw.replace(/\r$/, '');
    if (FENCE_RE.test(text)) {
      inFence = !inFence;
      open = null;
      lines.push({ kind: 'raw', key: newKey(), text: raw });
      continue;
    }
    const match = inFence ? null : TASK_RE.exec(text);
    if (match) {
      open = { kind: 'item', key: newKey(), checked: match[3] !== ' ', text: (match[4] ?? '').trim(), indent: match[1] ?? '' };
      lines.push(open);
    } else if (open && text.trim() !== '' && indentWidth(text) >= indentWidth(open.indent) + 2) {
      open.text += `\n${text.trim()}`;
    } else {
      open = null;
      lines.push({ kind: 'raw', key: newKey(), text: raw });
    }
  }
  return lines;
}

/** The first line of an item: what the server knows it by (`parseTaskItems`). */
export const firstLine = (text: string) => text.split('\n')[0]!.trim();

function serializeItem(item: ItemLine): string {
  const [first = '', ...more] = item.text.split('\n');
  const head = `${item.indent}- [${item.checked ? 'x' : ' '}] ${first.trim()}`.trimEnd();
  // Blank lines would end the item: they are dropped.
  const rest = more.map((l) => l.trim()).filter((l) => l !== '').map((l) => `${item.indent}  ${l}`);
  return [head, ...rest].join('\n');
}

export function serializeLines(lines: Line[]): string {
  return lines.map((l) => (l.kind === 'item' ? serializeItem(l) : l.text)).join('\n');
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
