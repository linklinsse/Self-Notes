import type { Element, Root, RootContent } from 'hast';
import { type ChangeEvent, useMemo } from 'react';
import Markdown, { type Components, defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkAddresses } from './addresses';
import { remarkLineBreaks } from './breaks';
import { MermaidDiagram } from './Mermaid';
import { remarkPhones } from './phones';
import { parseTaskItems } from './tasklist';
import { ANCHOR_PREFIX, remarkToc } from './toc';

/*
 * NOTE-2 / NFR-5: GFM rendering without raw HTML (no rehype-raw). react-markdown's default URL
 * transform drops javascript: and other unsafe URLs; geo: (addresses) and tel: (phone numbers)
 * are allowed on top of it (NOTE-15). Web links open in a new tab without opener/referrer. geo:
 * and tel: links are handed to the system: maps app chooser, dialer.
 */
const isGeo = (href: string | undefined) => /^geo:/i.test(href ?? '');
const isTel = (href: string | undefined) => /^tel:/i.test(href ?? '');

const urlTransform = (url: string) => (isGeo(url) || isTel(url) ? url : defaultUrlTransform(url));

/** NOTE-18: `#anchor` links scroll to the heading (ids carry ANCHOR_PREFIX) without leaving the note. */
function scrollToAnchor(hash: string) {
  const id = decodeURIComponent(hash);
  const target = document.getElementById(`${ANCHOR_PREFIX}${id}`) ?? document.getElementById(id);
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const components: Components = {
  a: ({ node: _node, ...props }) =>
    props.href?.startsWith('#') ? (
      <a
        {...props}
        onClick={(e) => {
          e.preventDefault();
          scrollToAnchor(props.href!.slice(1));
        }}
      />
    ) : isGeo(props.href) ? (
      <a {...props} className="address-link" />
    ) : isTel(props.href) ? (
      <a {...props} className="phone-link" />
    ) : (
      <a {...props} target="_blank" rel="noopener noreferrer" />
    ),
  input: ({ node: _node, ...props }) => <input {...props} disabled />,
  // NOTE-19: ```mermaid blocks become diagrams; other code blocks stay as they are.
  pre: ({ node, children, ...props }) => {
    const code = node?.children[0];
    const classes = code?.type === 'element' && code.tagName === 'code' ? code.properties.className : undefined;
    if (code?.type === 'element' && Array.isArray(classes) && classes.includes('language-mermaid')) {
      const text = code.children.map((child) => (child.type === 'text' ? child.value : '')).join('');
      return <MermaidDiagram code={text.trimEnd()} />;
    }
    return <pre {...props}>{children}</pre>;
  },
};

// Addresses first: their postal codes and numbers are never taken for phone numbers.
const plugins = [remarkGfm, remarkAddresses, remarkPhones];
// Full notes also get heading anchors, the table of contents (NOTE-18) and line breaks as typed (NOTE-2).
const notePlugins = [remarkGfm, remarkToc, remarkAddresses, remarkPhones, remarkLineBreaks];

/**
 * rehype plugin: gives each task checkbox the source line of its list item (data-line, 1-based),
 * so that a click can be matched to the exact `- [ ]` line of the Markdown.
 */
function rehypeTaskLines() {
  const walk = (node: Root | RootContent, line: number | undefined) => {
    if (node.type !== 'element' && node.type !== 'root') return;
    const element = node.type === 'element' ? (node as Element) : null;
    const here = element?.tagName === 'li' ? (element.position?.start.line ?? line) : line;
    if (element?.tagName === 'input' && element.properties.type === 'checkbox' && here !== undefined) {
      element.properties.dataLine = here;
    }
    for (const child of node.children) walk(child, here);
  };
  return (tree: Root) => walk(tree, undefined);
}
const rehypePlugins = [rehypeTaskLines];

export type TaskToggleHandler = (index: number, text: string, checked: boolean) => void;

/**
 * Full Markdown. With `onToggleTask` (the reader may edit the note), task checkboxes can be
 * checked in place, without switching to the editor (NOTE-16). Otherwise they are read-only.
 */
export function MarkdownView({
  content,
  className,
  onToggleTask,
}: {
  content: string;
  className?: string;
  onToggleTask?: TaskToggleHandler;
}) {
  const view = useMemo<Components>(() => {
    if (!onToggleTask) return components;
    const items = parseTaskItems(content);
    return {
      ...components,
      input: ({ node: _node, ...props }) => {
        const index = items.findIndex((item) => item.line === Number(props['data-line' as keyof typeof props]) - 1);
        if (props.type !== 'checkbox' || index < 0) return <input {...props} disabled />;
        const item = items[index]!;
        return (
          <input
            {...props}
            disabled={false}
            aria-label={`${item.checked ? 'Uncheck' : 'Check'} ${item.text || 'item'}`}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onToggleTask(index, item.text, e.target.checked)}
          />
        );
      },
    };
  }, [content, onToggleTask]);

  return (
    <div className={`markdown ${className ?? ''}`}>
      <Markdown
        remarkPlugins={notePlugins}
        rehypePlugins={rehypePlugins}
        components={view}
        urlTransform={urlTransform}
      >
        {content}
      </Markdown>
    </div>
  );
}

const inlineComponents: Components = {
  ...components,
  p: ({ children }) => <>{children}</>,
};
const INLINE_ELEMENTS = ['p', 'strong', 'em', 'del', 'code', 'a'];

/** Inline Markdown only (bold, italics, code, links, strikethrough): used for checklist items. */
export function InlineMarkdown({ text }: { text: string }) {
  return (
    <Markdown
      remarkPlugins={plugins}
      components={inlineComponents}
      allowedElements={INLINE_ELEMENTS}
      unwrapDisallowed
      urlTransform={urlTransform}
    >
      {text}
    </Markdown>
  );
}
