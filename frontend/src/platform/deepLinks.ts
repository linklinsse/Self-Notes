/**
 * App links that open the Android app (architecture §6.2), used by the widgets:
 *   selfnotes://notes/{id}                  → /notes/{id}
 *   selfnotes://notes/new?type=list|text    → /notes/new?type=…
 * Parsed by hand: older WebViews do not parse hosts of non-http URLs.
 */
const LINK = /^selfnotes:\/\/notes\/([^/?#]+)\/?(?:\?([^#]*))?(?:#.*)?$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The in-app path for an app link, or null when the link is not one of ours. */
export function deepLinkPath(url: string): string | null {
  const match = LINK.exec(url.trim());
  if (!match) return null;
  const [, target = '', query = ''] = match;
  if (target === 'new') {
    const type = new URLSearchParams(query).get('type') === 'list' ? 'list' : 'text';
    return `/notes/new?type=${type}`;
  }
  return UUID.test(target) ? `/notes/${target.toLowerCase()}` : null;
}
