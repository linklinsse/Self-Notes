import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownView } from './Markdown';
import { findPhones, telUrl } from './phones';

describe('NOTE-15: phone numbers', () => {
  it.each([
    ['Appeler Jean au 06 12 34 56 78 demain', '06 12 34 56 78', 'tel:0612345678'],
    ['Tél. 06.12.34.56.78', '06.12.34.56.78', 'tel:0612345678'],
    ['fixe: 0145678901', '0145678901', 'tel:0145678901'],
    ['Mobile +33 6 12 34 56 78.', '+33 6 12 34 56 78', 'tel:+33612345678'],
    ['+33 (0)1 45 67 89 01', '+33 (0)1 45 67 89 01', 'tel:+33145678901'],
    ['US office: +1 555-123-4567', '+1 555-123-4567', 'tel:+15551234567'],
  ])('finds the number in %j', (text, phone, url) => {
    expect(findPhones(text)).toEqual([phone]);
    expect(telUrl(phone)).toBe(url);
  });

  it.each([
    'Le 21/11/2026 à 14:30',
    'Date : 2026-11-21',
    '250 g de farine, 4 œufs',
    'IBAN FR76 3000 6000 0112 3456 7890 189',
    'Commande n°A0612345678',
    'Code 061234567',
  ])('ignores %j', (text) => {
    expect(findPhones(text)).toEqual([]);
  });

  it('renders tel: links next to address links, without a new tab', () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownView, { content: 'Plombier : 06 12 34 56 78, 14 rue des Lilas, 69003 Lyon' }),
    );
    expect(html).toContain('<a href="tel:0612345678" title="Call" class="phone-link">06 12 34 56 78</a>');
    expect(html).toContain('class="address-link">14 rue des Lilas, 69003 Lyon</a>');
    expect(html).not.toContain('target=');
  });
});
