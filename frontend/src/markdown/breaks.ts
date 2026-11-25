/**
 * NOTE-2: a single line break in the source is a line break on screen, as people type it (plain
 * Markdown joins the lines and asks for two spaces or a backslash). Code is left alone: its text is
 * not made of text nodes.
 */
import type { Root } from 'mdast';
import { findAndReplace } from 'mdast-util-find-and-replace';

/** remark plugin. Runs last: an address written on two lines must be found before it is split. */
export function remarkLineBreaks() {
  return (tree: Root) => {
    findAndReplace(tree, [/\r?\n|\r/g, () => ({ type: 'break' as const })]);
  };
}
