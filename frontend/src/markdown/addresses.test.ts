import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { findAddresses, geoUrl } from './addresses';
import { InlineMarkdown, MarkdownView } from './Markdown';

describe('NOTE-15: postal addresses', () => {
  it.each([
    ['RDV au 12 rue de la Paix, 75002 Paris demain', '12 rue de la Paix, 75002 Paris'],
    ['12 rue de la Paix, Paris', '12 rue de la Paix, Paris'],
    ['On se voit au 12 rue de la Paix demain', '12 rue de la Paix'],
    ['3 bis avenue Victor Hugo et après on mange', '3 bis avenue Victor Hugo'],
    ['5 bd Saint-Germain', '5 bd Saint-Germain'],
    ["8 allée d'Alsace, 13100 Aix-en-Provence", "8 allée d'Alsace, 13100 Aix-en-Provence"],
    ['10 place du 8 Mai 1945', '10 place du 8 Mai 1945'],
    ['chez lui: 7 impasse des lilas, ensuite', '7 impasse des lilas'],
    ['14 Rue Nationale 59000 Lille', '14 Rue Nationale 59000 Lille'],
    ['221B Baker Street, London', '221B Baker Street, London'],
    ['1600 Pennsylvania Avenue', '1600 Pennsylvania Avenue'],
  ])('finds the address in %j', (text, address) => {
    expect(findAddresses(text)).toEqual([address]);
  });

  it.each([
    'Acheter 2 baguettes et 3 places de cinéma',
    "J'ai 2 cours de piano cette semaine.",
    'Rendez-vous à 14 h place de la République',
    'A12 rue',
    'Version 1.2 route',
    'Il y a 3 rues à traverser',
  ])('ignores %j', (text) => {
    expect(findAddresses(text)).toEqual([]);
  });

  it('builds a geo: URI that any maps app understands', () => {
    expect(geoUrl('12 rue de la Paix,\n75002 Paris')).toBe('geo:0,0?q=12%20rue%20de%20la%20Paix%2C%2075002%20Paris');
  });
});

describe('NOTE-15 / NFR-5: rendering', () => {
  const render = (content: string) => renderToStaticMarkup(createElement(MarkdownView, { content }));

  it('turns addresses into geo: links handed to the system (no new tab)', () => {
    const html = render('Chez Léa : 12 rue de la Paix, 75002 Paris');
    expect(html).toContain(
      '<a href="geo:0,0?q=12%20rue%20de%20la%20Paix%2C%2075002%20Paris" title="Open in a maps app" class="address-link">12 rue de la Paix, 75002 Paris</a>',
    );
    expect(html).not.toContain('target=');
  });

  it('leaves code and existing links alone, and still drops javascript: URLs', () => {
    expect(render('`12 rue de la Paix`')).not.toContain('geo:');
    expect(render('[12 rue de la Paix](https://example.com)')).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">12 rue de la Paix</a>',
    );
    expect(render('[x](javascript:alert(1))')).toContain('<a href="" target="_blank"');
  });

  it('works in checklist items too', () => {
    const html = renderToStaticMarkup(createElement(InlineMarkdown, { text: 'Passer au 3 place Bellecour, Lyon' }));
    expect(html).toContain('href="geo:0,0?q=3%20place%20Bellecour%2C%20Lyon"');
  });
});
