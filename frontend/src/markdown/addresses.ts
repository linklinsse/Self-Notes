/**
 * NOTE-15: postal addresses written in a note become links that open a maps app. The link is a
 * standard geo: URI, so no map provider is hard-coded: Android asks which installed app to use.
 * Detection is a heuristic for French and English street addresses:
 *   "12 rue de la Paix, 75002 Paris", "3 bis avenue Victor Hugo", "221B Baker Street".
 */
import type { Link, Root } from 'mdast';
import { findAndReplace } from 'mdast-util-find-and-replace';

/** "rue" → "(?:[Rr]ue|RUE)": case-insensitive street words without the `i` flag (it breaks \p{Lu}). */
const anyCase = (word: string) => `(?:[${word[0]!.toUpperCase()}${word[0]}]${word.slice(1)}|${word.toUpperCase()})`;

const FR_TYPES = [
  'rue', 'avenue', 'av', 'boulevard', 'bd', 'bld', 'chemin', 'allée', 'allee', 'impasse', 'place', 'quai',
  'route', 'rte', 'square', 'passage', 'rond-point', 'voie', 'sentier', 'faubourg', 'fbg', 'parvis',
  'esplanade', 'promenade', 'résidence', 'residence', 'cité', 'cite', 'hameau', 'lotissement', 'montée',
  'traverse', 'villa', 'ruelle', 'venelle', 'lieu-dit',
];
const EN_TYPES = [
  'street', 'st', 'road', 'rd', 'avenue', 'ave', 'boulevard', 'blvd', 'lane', 'ln', 'drive', 'dr', 'way',
  'court', 'ct', 'place', 'pl', 'square', 'sq', 'terrace', 'crescent', 'close', 'highway', 'hwy',
];
// Longest first, so that "avenue" wins over "av".
const alternation = (words: string[]) =>
  [...new Set(words)].sort((a, b) => b.length - a.length).map(anyCase).join('|');

const NUMBER = String.raw`\d{1,4}(?:\s?(?:bis|ter|quater)\b|[A-Da-d]\b)?`;
const WORD = String.raw`[\p{L}\d][\p{L}\d'’-]*`;
const CAPITALIZED = String.raw`(?:\p{Lu}[\p{L}'’-]*|\d+)`;
const CONNECTOR = String.raw`(?:de|du|des|la|le|les|à|aux|en|sur|sous|et|d['’]|l['’])`;

/**
 * Street name: Capitalized words joined by "de", "la"… ("de la Paix", "Victor Hugo"), which stops
 * before ordinary words; else, for names typed in lowercase, any words up to a comma, a period, a
 * line end or a postal code. ("cours" is not a street word here: "2 cours de piano" is too common.)
 */
const FR_NAME = String.raw`(?:(?:\s+(?:${CONNECTOR}\s*)*${CAPITALIZED})+|(?:\s+${WORD}){1,6}(?=\s*(?:[,;.]|\n|$|\d{5}\b)))`;
/** More words of a city name: "Saint Martin de Ré". A small word only counts before a Capitalized one. */
const CITY_MORE = String.raw`(?:[ -](?:(?:sur|sous|en|le|la|les|de|du|des)(?=[ -]\p{Lu})|\p{Lu}[\p{L}'’-]*)){0,4}`;
const CITY = String.raw`\p{Lu}[\p{L}'’-]*${CITY_MORE}`;
const POSTAL_CITY = String.raw`(?:,?\s*\d{5}(?:\s+[\p{L}][\p{L}'’-]*${CITY_MORE})?)`;

const FRENCH = String.raw`${NUMBER},?\s+(?:${alternation(FR_TYPES)})\.?${FR_NAME}(?:${POSTAL_CITY}|,\s*${CITY})?`;
const ENGLISH = String.raw`${NUMBER}(?:\s+\p{Lu}[\p{L}'’-]*){1,4}\s+(?:${alternation(EN_TYPES)})\b\.?(?:,\s*${CITY})?`;

/** Global, so that it can be used with findAndReplace and String.matchAll. */
export const ADDRESS = new RegExp(String.raw`(?<![\p{L}\d])(?:${FRENCH}|${ENGLISH})`, 'gu');

/** The addresses found in a piece of text, as written. */
export function findAddresses(text: string): string[] {
  return [...text.matchAll(ADDRESS)].map((m) => m[0].trim());
}

/** geo: URI with a search query: every maps app understands it, none is imposed. */
export function geoUrl(address: string): string {
  return `geo:0,0?q=${encodeURIComponent(address.replace(/\s+/g, ' ').trim())}`;
}

/** remark plugin: wraps the addresses of text nodes in links (never inside links or code). */
export function remarkAddresses() {
  return (tree: Root) => {
    findAndReplace(
      tree,
      [
        ADDRESS,
        (match: string): Link => ({
          type: 'link',
          url: geoUrl(match),
          title: 'Open in a maps app',
          children: [{ type: 'text', value: match }],
        }),
      ],
      { ignore: ['link', 'linkReference', 'inlineCode', 'code'] },
    );
  };
}
