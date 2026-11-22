import createClient from 'openapi-fetch';
import { platform } from '../platform';
import { ApiError, networkError } from './errors';
import type { paths } from './schema';
import { getAccessToken, recoverFromUnauthorized, transportHeaders } from './session';

/** Endpoints that never carry the access token. */
function isPublicPath(path: string): boolean {
  return path === '/api/health' || path.startsWith('/api/v1/auth/') || path.startsWith('/api/v1/shared/');
}

/**
 * Share-link pages always talk to the server that served them (the link's own origin),
 * everything else to the server chosen on the login page.
 */
function baseUrlFor(path: string): string {
  return path.startsWith('/api/v1/shared/') ? window.location.origin : platform.getServerUrl();
}

async function send(request: Request): Promise<Response> {
  try {
    return await fetch(request);
  } catch {
    throw networkError();
  }
}

/** fetch used by openapi-fetch: rewrites the URL to the current server, adds the token, refreshes on 401. */
async function apiFetch(input: Request): Promise<Response> {
  const { pathname, search } = new URL(input.url);
  const url = `${baseUrlFor(pathname)}${pathname}${search}`;
  // Buffer the body: it can then be sent twice (retry after refresh), and Safari cannot send streams.
  const raw = input.method === 'GET' || input.method === 'HEAD' ? null : await input.arrayBuffer();
  const body = raw && raw.byteLength > 0 ? raw : undefined;

  const build = (token: string | null) => {
    const headers = new Headers(input.headers);
    if (!body) headers.delete('Content-Type'); // Fastify rejects an empty JSON body
    for (const [name, value] of Object.entries(transportHeaders())) headers.set(name, value);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return new Request(url, { method: input.method, headers, body, credentials: 'include' });
  };

  if (isPublicPath(pathname)) return send(build(null));
  const token = await getAccessToken();
  const response = await send(build(token));
  if (response.status !== 401 || !token) return response;
  const fresh = await recoverFromUnauthorized();
  return fresh ? send(build(fresh)) : response;
}

// The base URL is a placeholder: apiFetch replaces it with the current server on each request.
export const api = createClient<paths>({ baseUrl: 'http://self-notes.invalid', fetch: apiFetch });

interface FetchResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/** Resolve an openapi-fetch call to its data, or throw ApiError. */
export async function unwrap<T>(call: Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>;
  try {
    result = await call;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw networkError();
  }
  if (result.response.ok) return result.data as T;
  const body = result.error as { error?: { code?: string; message?: string; details?: unknown } } | undefined;
  throw new ApiError(
    result.response.status,
    body?.error?.code ?? `HTTP_${result.response.status}`,
    body?.error?.message ?? result.response.statusText,
    body?.error?.details,
  );
}
