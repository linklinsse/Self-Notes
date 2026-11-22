/**
 * GFM task-list helpers. A list note is Markdown whose items are `- [ ] text` / `- [x] text`.
 * Mirror of frontend/src/markdown/tasklist.ts; both are tested against the same cases.
 */

const TASK_RE = /^(\s*)([-*+]|\d+[.)])\s+\[([ xX])\](?:[ \t]+(.*))?$/;
const BULLET_RE = /^\s*(?:[-*+]|\d+[.)])\s+/;

export interface TaskItem {
  /** Line number in the content (0-based). */
  line: number;
  checked: boolean;
  text: string;
}

function splitLines(content: string): string[] {
  return content.split('\n');
}

/** Task items in document order. Lines inside fenced code blocks are ignored. */
export function parseTaskItems(content: string): TaskItem[] {
  const items: TaskItem[] = [];
  let inFence = false;
  splitLines(content).forEach((raw, line) => {
    const text = raw.replace(/\r$/, '');
    if (/^\s*(```|~~~)/.test(text)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const match = TASK_RE.exec(text);
    if (match) {
      items.push({ line, checked: match[3] !== ' ', text: (match[4] ?? '').trim() });
    }
  });
  return items;
}

export interface ToggleInput {
  /** Position among task items (0-based), as seen by the client. */
  index: number;
  /** Item text as seen by the client. */
  text: string;
  checked: boolean;
}

/**
 * Set the checked state of one item. The item is the one at `index` if its text still matches,
 * otherwise the only item with that text. Returns null when the item cannot be found.
 */
export function toggleTaskItem(content: string, input: ToggleInput): string | null {
  const items = parseTaskItems(content);
  let target = items[input.index];
  if (!target || target.text !== input.text.trim()) {
    const sameText = items.filter((i) => i.text === input.text.trim());
    target = sameText.length === 1 ? sameText[0] : undefined;
  }
  if (!target) return null;
  const lines = splitLines(content);
  lines[target.line] = lines[target.line]!.replace(/\[([ xX])\]/, input.checked ? '[x]' : '[ ]');
  return lines.join('\n');
}

/** NOTE-7: text -> list. Each non-empty line that is not already an item becomes an unchecked item. */
export function textToList(content: string): string {
  return splitLines(content)
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim() !== '')
    .map((l) => (TASK_RE.test(l) ? l : `- [ ] ${l.trim().replace(BULLET_RE, '')}`))
    .join('\n');
}

export function taskProgress(content: string): { checked: number; total: number } {
  const items = parseTaskItems(content);
  return { checked: items.filter((i) => i.checked).length, total: items.length };
}

/** Remove inline Markdown: links, images, code, emphasis, HTML tags. */
export function stripInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__|~~)(.+?)\1/g, '$2')
    .replace(/\*(\S(?:.*?\S)?)\*/g, '$1')
    .replace(/(^|\W)_(\S(?:.*?\S)?)_(?=\W|$)/g, '$1$2')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Plain-text preview (no Markdown), at most `max` characters. */
export function plainPreview(content: string, type: 'text' | 'list', max = 200): string {
  if (type === 'list') {
    const items = parseTaskItems(content);
    if (items.length > 0) {
      return truncate(items.map((i) => stripInline(i.text)).filter(Boolean).join(' · '), max);
    }
  }
  const parts: string[] = [];
  let inFence = false;
  let hidden = false;
  for (const raw of splitLines(content)) {
    const fence = /^\s*(```|~~~)\s*(\S*)/.exec(raw);
    if (fence) {
      inFence = !inFence;
      // Mermaid diagrams (NOTE-19) are drawings: their source says nothing in a preview.
      hidden = inFence && fence[2]!.toLowerCase() === 'mermaid';
      continue;
    }
    if (hidden) continue;
    let line = raw.trim();
    if (!inFence && /^(?:\[\[_TOC_\]\]|\[TOC\])$/.test(line)) continue; // NOTE-18: table of contents marker
    if (!inFence) {
      line = line
        .replace(/^#{1,6}\s+/, '')
        .replace(/^>\s?/, '')
        .replace(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '')
        .replace(/^(?:-{3,}|\*{3,}|_{3,})$/, '');
      line = stripInline(line);
    }
    if (line) parts.push(line);
    if (parts.join(' ').length > max) break;
  }
  return truncate(parts.join(' ').replace(/\s+/g, ' '), max);
}
