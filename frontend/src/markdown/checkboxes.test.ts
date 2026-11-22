import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownView } from './Markdown';

const content = '# Trip\n\nBring:\n\n- [ ] Tent\n- [x] Map\n\n```\n- [ ] not a task (code)\n```\n\n- [ ] Snacks';

describe('NOTE-16: checkboxes in Markdown notes', () => {
  it('are read-only without a toggle handler (viewers, previews)', () => {
    const html = renderToStaticMarkup(createElement(MarkdownView, { content }));
    expect(html.match(/<input[^>]*>/g)).toHaveLength(3);
    for (const input of html.match(/<input[^>]*>/g)!) expect(input).toContain('disabled');
  });

  it('can be checked in place when the reader may edit, each one tied to its own line', () => {
    const html = renderToStaticMarkup(createElement(MarkdownView, { content, onToggleTask: () => {} }));
    const inputs = html.match(/<input[^>]*>/g)!;
    expect(inputs).toHaveLength(3);
    for (const input of inputs) expect(input).not.toContain('disabled');
    expect(inputs[0]).toContain('aria-label="Check Tent"');
    expect(inputs[0]).toContain('data-line="5"');
    expect(inputs[1]).toContain('aria-label="Uncheck Map"');
    expect(inputs[2]).toContain('aria-label="Check Snacks"');
  });
});
