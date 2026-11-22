import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownView } from './Markdown';
import { headingSlug } from './toc';

const render = (content: string) => renderToStaticMarkup(createElement(MarkdownView, { content }));

describe('NOTE-18: heading anchors (GitLab rules)', () => {
  it.each([
    ['This heading has spaces in it', 'this-heading-has-spaces-in-it'],
    ['This heading has a 3.5 in it (and parentheses)', 'this-heading-has-a-35-in-it-and-parentheses'],
    ['This heading has  multiple spaces and --- hyphens', 'this-heading-has-multiple-spaces-and-hyphens'],
    ['Été : les vacances !', 'été-les-vacances-'],
    ['!!!', 'section'],
  ])('%j → %j', (text, slug) => {
    expect(headingSlug(text, new Map())).toBe(slug);
  });

  it('numbers repeated headings: x, x-1, x-2', () => {
    const seen = new Map<string, number>();
    expect(['Notes', 'Notes', 'Notes'].map((t) => headingSlug(t, seen))).toEqual(['notes', 'notes-1', 'notes-2']);
  });
});

describe('NOTE-18: [[_TOC_]]', () => {
  const note = '# Trip\n\n[[_TOC_]]\n\n## Before\n\n### Papers\n\n## During\n\n```\n[[_TOC_]]\n## not a heading\n```';

  it('replaces the marker with nested links to the headings, which get prefixed ids', () => {
    const html = render(note);
    expect(html).toContain('<h1 id="user-content-trip">Trip</h1>');
    expect(html).toContain('<h3 id="user-content-papers">Papers</h3>');
    expect(html.replace(/\n/g, '')).toContain(
      '<ul class="toc"><li><a href="#trip">Trip</a><ul><li><a href="#before">Before</a><ul><li><a href="#papers">Papers</a></li></ul></li><li><a href="#during">During</a></li></ul></li></ul>',
    );
    expect(html).not.toContain('<p>[[');
    expect(html).toContain('[[_TOC_]]\n## not a heading'); // code blocks are left alone
  });

  it('also accepts [TOC], and only alone on its line', () => {
    expect(render('[TOC]\n\n## A').replace(/\n/g, '')).toContain('<ul class="toc"><li><a href="#a">A</a></li></ul>');
    expect(render('See [[_TOC_]] here\n\n## A')).not.toContain('class="toc"');
  });

  it('anchor links do not open a new tab', () => {
    expect(render('[[_TOC_]]\n\n## A')).not.toContain('target=');
  });
});
