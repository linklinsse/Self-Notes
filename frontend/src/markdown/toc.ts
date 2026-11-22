/**
 * NOTE-18: headings get anchors, and `[[_TOC_]]` or `[TOC]` alone on a line becomes a table of
 * contents, as in GitLab Flavored Markdown. Heading ids follow GitLab's rules:
 *   lowercase; punctuation and other non-word characters removed; spaces become hyphens;
 *   runs of hyphens become one; a repeated id gets -1, -2… appended.
 * In the page, ids are prefixed with `user-content-` so that a note can never take the id of an
 * element of the app; links to `#anchor` are resolved with that prefix (Markdown.tsx).
 */
import type { Heading, List, ListItem, Paragraph, PhrasingContent, Root } from 'mdast';
import { toString } from 'mdast-util-to-string';

export const ANCHOR_PREFIX = 'user-content-';
const TOC_MARKERS = new Set(['[[_TOC_]]', '[TOC]']);

/** GitLab's heading anchor for `text`, unique within `seen` (which it updates). */
export function headingSlug(text: string, seen: Map<string, number>): string {
  const base =
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
      .replace(/ /g, '-')
      .replace(/-{2,}/g, '-') || 'section';
  const count = seen.get(base);
  seen.set(base, (count ?? 0) + 1);
  return count === undefined ? base : `${base}-${count}`;
}

interface Entry {
  depth: number;
  text: string;
  slug: string;
}

/** Nested list of links, following the heading levels (a level may be skipped). */
function tocList(entries: Entry[]): List {
  const root: List = { type: 'list', ordered: false, spread: false, children: [] };
  const stack: { depth: number; list: List }[] = [{ depth: 0, list: root }];
  for (const entry of entries) {
    while (stack.length > 1 && stack.at(-1)!.depth >= entry.depth) stack.pop();
    const item: ListItem = {
      type: 'listItem',
      spread: false,
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'link', url: `#${entry.slug}`, children: [{ type: 'text', value: entry.text }] }],
        },
      ],
    };
    stack.at(-1)!.list.children.push(item);
    const nested: List = { type: 'list', ordered: false, spread: false, children: [] };
    item.children.push(nested);
    stack.push({ depth: entry.depth, list: nested });
  }
  // Drop the empty nested lists.
  const prune = (list: List) => {
    for (const item of list.children) {
      item.children = item.children.filter((child) => child.type !== 'list' || child.children.length > 0);
      for (const child of item.children) if (child.type === 'list') prune(child);
    }
  };
  prune(root);
  return root;
}

/** remark plugin: heading ids, and the table of contents in place of its marker. */
export function remarkToc() {
  return (tree: Root, file: { value: unknown }) => {
    const source = String(file.value ?? '');
    const seen = new Map<string, number>();
    const entries: Entry[] = [];
    for (const node of tree.children) {
      if (node.type !== 'heading') continue;
      const heading = node as Heading;
      const text = toString(heading);
      const slug = headingSlug(text, seen);
      heading.data = { ...heading.data, hProperties: { ...heading.data?.hProperties, id: `${ANCHOR_PREFIX}${slug}` } };
      entries.push({ depth: heading.depth, text, slug });
    }
    tree.children = tree.children.map((node) => {
      if (node.type !== 'paragraph' || !isMarker(node, source)) return node;
      const toc = tocList(entries);
      toc.data = { hProperties: { className: ['toc'] } };
      return toc;
    });
  };
}

function isMarker(paragraph: Paragraph, source: string): boolean {
  const { start, end } = paragraph.position ?? {};
  const raw =
    start?.offset !== undefined && end?.offset !== undefined
      ? source.slice(start.offset, end.offset)
      : toString({ type: 'paragraph', children: paragraph.children as PhrasingContent[] });
  return TOC_MARKERS.has(raw.trim());
}
