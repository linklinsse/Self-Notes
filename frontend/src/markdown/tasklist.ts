/**
 * GFM task-list helpers. Mirror of backend/src/lib/tasklist.ts; both are tested with the same cases.
 */

export const TASK_RE = /^(\s*)([-*+]|\d+[.)])\s+\[([ xX])\](?:[ \t]+(.*))?$/;
const BULLET_RE = /^\s*(?:[-*+]|\d+[.)])\s+/;
export const FENCE_RE = /^\s*(```|~~~)/;

export interface TaskItem {
  line: number;
  checked: boolean;
  text: string;
}

export function parseTaskItems(content: string): TaskItem[] {
  const items: TaskItem[] = [];
  let inFence = false;
  content.split('\n').forEach((raw, line) => {
    const text = raw.replace(/\r$/, '');
    if (FENCE_RE.test(text)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const match = TASK_RE.exec(text);
    if (match) items.push({ line, checked: match[3] !== ' ', text: (match[4] ?? '').trim() });
  });
  return items;
}

export interface ToggleInput {
  index: number;
  text: string;
  checked: boolean;
}

export function toggleTaskItem(content: string, input: ToggleInput): string | null {
  const items = parseTaskItems(content);
  let target = items[input.index];
  if (!target || target.text !== input.text.trim()) {
    const sameText = items.filter((i) => i.text === input.text.trim());
    target = sameText.length === 1 ? sameText[0] : undefined;
  }
  if (!target) return null;
  const lines = content.split('\n');
  lines[target.line] = lines[target.line]!.replace(/\[([ xX])\]/, input.checked ? '[x]' : '[ ]');
  return lines.join('\n');
}

export function textToList(content: string): string {
  return content
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim() !== '')
    .map((l) => (TASK_RE.test(l) ? l : `- [ ] ${l.trim().replace(BULLET_RE, '')}`))
    .join('\n');
}

export function taskProgress(content: string): { checked: number; total: number } {
  const items = parseTaskItems(content);
  return { checked: items.filter((i) => i.checked).length, total: items.length };
}
