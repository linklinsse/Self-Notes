/**
 * NOTE-15: phone numbers written in a note become tel: links (the phone's dialer, or the
 * computer's calling app). Recognized: French national numbers ("06 12 34 56 78",
 * "06.12.34.56.78", "0612345678") and international ones ("+33 6 12 34 56 78", "+33 (0)6 …").
 * Dates, amounts and bank account numbers do not match.
 */
import type { Link, Root } from 'mdast';
import { findAndReplace } from 'mdast-util-find-and-replace';

const SEP = String.raw`[\s.-]?`;
/** 10 digits starting with 0, in pairs or not. */
const FRENCH = String.raw`0\d(?:${SEP}\d{2}){4}`;
/** "+" and 8 to 15 digits, with an optional "(0)" after the country code. */
const INTERNATIONAL = String.raw`\+\d{1,3}(?:${SEP}\(0\))?(?:${SEP}\d){6,12}`;

export const PHONE = new RegExp(String.raw`(?<![\p{L}\d+])(?:${INTERNATIONAL}|${FRENCH})(?![\p{L}\d])`, 'gu');

export function findPhones(text: string): string[] {
  return [...text.matchAll(PHONE)].map((m) => m[0]);
}

/** tel: URI with digits only (and the leading +): "+33 (0)6 12…" → "tel:+33612…". */
export function telUrl(phone: string): string {
  return `tel:${phone.replace(/\(0\)/g, '').replace(/[^\d+]/g, '')}`;
}

/** remark plugin: wraps the phone numbers of text nodes in links (never inside links or code). */
export function remarkPhones() {
  return (tree: Root) => {
    findAndReplace(
      tree,
      [
        PHONE,
        (match: string): Link => ({
          type: 'link',
          url: telUrl(match),
          title: 'Call',
          children: [{ type: 'text', value: match }],
        }),
      ],
      { ignore: ['link', 'linkReference', 'inlineCode', 'code'] },
    );
  };
}
