/**
 * NOTE-19: ```mermaid code blocks are drawn as diagrams.
 * - mermaid is loaded on demand (its own chunk): notes without diagrams never download it.
 * - securityLevel "strict" (no click handlers, labels escaped), then the SVG is sanitized again
 *   with DOMPurify before it enters the page (NFR-5).
 * - Colors come from the current theme, so diagrams follow it.
 */
import DOMPurify from 'dompurify';
import { useEffect, useState } from 'react';
import type { Theme } from '../themes';
import { useTheme } from '../themes/ThemeProvider';

let queue: Promise<unknown> = Promise.resolve();
let counter = 0;

async function draw(code: string, theme: Theme): Promise<string> {
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    // Labels as SVG text, not HTML in <foreignObject> (which DOMPurify removes, and which is
    // HTML coming from the note).
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    theme: 'base',
    darkMode: theme.dark,
    fontFamily: theme.fontBody,
    themeVariables: {
      darkMode: theme.dark,
      background: theme.bgCard,
      primaryColor: theme.bgRaised,
      primaryTextColor: theme.text1,
      primaryBorderColor: theme.accent,
      secondaryColor: theme.bgSurface,
      tertiaryColor: theme.bgCard,
      lineColor: theme.text2,
      textColor: theme.text1,
      fontFamily: theme.fontBody,
      // Pie slices: the theme's accent, then the vivid category colors.
      ...Object.fromEntries([theme.accent, ...theme.categoryPresets].map((color, i) => [`pie${i + 1}`, color])),
      pieSectionTextColor: theme.dark ? theme.bgBase : theme.text1,
      pieStrokeColor: theme.bgCard,
      pieOuterStrokeColor: theme.border,
      pieTitleTextColor: theme.text1,
      pieLegendTextColor: theme.text1,
    },
  });
  await mermaid.parse(code); // throws a readable syntax error before anything is drawn
  const { svg } = await mermaid.render(`sn-mermaid-${++counter}`, code);
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true, html: true } });
}

/** One diagram at a time: mermaid keeps global state while it renders. */
function render(code: string, theme: Theme): Promise<string> {
  const job = queue.then(() => draw(code, theme));
  queue = job.catch(() => {});
  return job;
}

type Result = { svg: string; error?: undefined } | { svg?: undefined; error: string };

export function MermaidDiagram({ code }: { code: string }) {
  const theme = useTheme();
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let cancelled = false;
    render(code, theme).then(
      (svg) => !cancelled && setResult({ svg }),
      (err: unknown) => !cancelled && setResult({ error: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [code, theme]);

  if (result?.error !== undefined) {
    return (
      <figure className="mermaid-error">
        <figcaption>This Mermaid diagram has an error: {result.error.split('\n')[0]}</figcaption>
        <pre>
          <code>{code}</code>
        </pre>
      </figure>
    );
  }
  if (!result) {
    return (
      <div className="mermaid is-loading" role="img" aria-label="Diagram">
        Drawing the diagram…
      </div>
    );
  }
  // Sanitized SVG from mermaid (strict) and DOMPurify: the only HTML a note can produce.
  return <div className="mermaid" role="img" aria-label="Diagram" dangerouslySetInnerHTML={{ __html: result.svg }} />;
}
