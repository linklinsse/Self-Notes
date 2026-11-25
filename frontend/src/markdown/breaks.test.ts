import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownView } from './Markdown';

const html = (content: string) => renderToStaticMarkup(createElement(MarkdownView, { content }));
const breaks = (content: string) => html(content).match(/<br\/>/g)?.length ?? 0;

describe('NOTE-2: a single line break in the source is a line break', () => {
  it('in paragraphs, whatever the line endings', () => {
    expect(html('One\nTwo')).toMatch(/<p>One<br\/>\s*Two<\/p>/);
    expect(breaks('One\r\nTwo\r\nThree')).toBe(2);
  });

  it('once, when the line also ends with the marks of plain Markdown', () => {
    expect(breaks('One  \nTwo')).toBe(1);
    expect(breaks('One\\\nTwo')).toBe(1);
  });

  it('in list items, quotes and emphasis', () => {
    expect(breaks('- Bread\n  from the bakery')).toBe(1);
    expect(breaks('> First\n> second')).toBe(1);
    expect(breaks('**bold\nstill bold**')).toBe(1);
  });

  it('not between blocks, and not in code', () => {
    expect(breaks('One\n\nTwo\n# Title\n- a\n- b')).toBe(0);
    expect(breaks('```\na\nb\n```')).toBe(0);
    expect(breaks('`a\nb`')).toBe(0);
  });

  it('NOTE-15: an address written on two lines stays one link', () => {
    const out = html('12 rue de la Paix\n75002 Paris');
    expect(out.match(/href="geo:/g)).toHaveLength(1);
    expect(out).toMatch(/Paix<br\/>\s*75002 Paris<\/a>/);
  });

  it('NOTE-18 NOTE-16: the table of contents and the checkboxes still work', () => {
    expect(html('[[_TOC_]]\n\n# One\ntext')).toContain('class="toc"');
    expect(html('- [ ] Tent\n  big one').match(/<input/g)).toHaveLength(1);
  });
});
