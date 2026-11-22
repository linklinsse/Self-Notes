/** Server URL handling for the login page (AUTH-6). */

/** "notes.example.com/" -> "https://notes.example.com". Returns null when it cannot be a URL. */
export function normalizeServerUrl(input: string): string | null {
  let value = input.trim();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const path = url.pathname.replace(/\/+$/, '').replace(/\/api$/, '');
    return `${url.origin}${path}`;
  } catch {
    return null;
  }
}

export type ServerCheck = { ok: true; version: string } | { ok: false; reason: string };

/** GET <url>/api/health must answer { name: "Self-Notes" }. */
export async function checkServer(url: string, signal?: AbortSignal): Promise<ServerCheck> {
  let response: Response;
  try {
    response = await fetch(`${url}/api/health`, { headers: { Accept: 'application/json' }, signal });
  } catch {
    return {
      ok: false,
      reason:
        "Can't reach this server. Check the address. If the server is on another domain, its CORS_ORIGINS setting must allow this app.",
    };
  }
  const body = (await response.json().catch(() => null)) as { name?: string; version?: string; status?: string } | null;
  if (body?.name !== 'Self-Notes') return { ok: false, reason: 'This address does not answer like a Self-Notes server.' };
  if (body.status !== 'ok') return { ok: false, reason: 'The server is up, but its database is not reachable.' };
  return { ok: true, version: body.version ?? '?' };
}

export function displayHost(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return url;
  }
}
