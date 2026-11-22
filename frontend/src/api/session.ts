/**
 * Access token handling, outside React so the API client can use it.
 * - Access token: memory only.
 * - Refresh token: kept by the platform (platform/index.ts → SessionBackend): httpOnly cookie or
 *   localStorage on web, the native SessionStore on Android.
 * - Refreshes are single-flight and serialized across tabs (Web Locks), so rotation never races.
 *   On Android the native mutex also covers the widgets.
 * - A network failure never ends the session (AUTH-4): only a 401 from /auth/refresh does.
 */
import { type AccessToken, type SessionTokens, platform } from '../platform';
import { storage } from '../platform/storage';

/** Set while this device has a session: avoids a pointless refresh call (and 401) for guests. */
const SESSION_HINT_KEY = 'sn.hasSession';

export function mightHaveSession(): boolean {
  return storage.get(SESSION_HINT_KEY) === '1';
}

let accessToken: string | null = null;
let accessExpiresAt = 0;
let refreshing: Promise<boolean> | null = null;
const endedListeners = new Set<() => void>();

/** Refresh this long before the access token expires. */
const EARLY_REFRESH_MS = 30_000;

export function transportHeaders(): Record<string, string> {
  return platform.tokenTransport() === 'body' ? { 'X-Token-Transport': 'body' } : {};
}

function remember(token: AccessToken | null): void {
  accessToken = token?.accessToken ?? null;
  accessExpiresAt = token ? Date.parse(token.accessTokenExpiresAt) : 0;
}

/** After login or register. */
export async function acceptTokens(tokens: SessionTokens): Promise<void> {
  remember(tokens);
  storage.set(SESSION_HINT_KEY, '1');
  await platform.session.save(tokens);
}

/** Forgets the session on this device only (server change, session rejected). */
export async function forgetSession(): Promise<void> {
  remember(null);
  storage.set(SESSION_HINT_KEY, null);
  await platform.session.clear(false);
}

/** Logout: the server revokes the session (best effort, offline included), then it is forgotten here. */
export async function signOut(): Promise<void> {
  remember(null);
  storage.set(SESSION_HINT_KEY, null);
  await platform.session.clear(true);
}

/** Called when the server rejected the session: the app goes back to the login page. */
async function endSession(): Promise<void> {
  await forgetSession();
  for (const listener of endedListeners) listener();
}

export function onSessionEnded(listener: () => void): () => void {
  endedListeners.add(listener);
  return () => endedListeners.delete(listener);
}

async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('sn-refresh', fn);
  }
  return fn();
}

/**
 * Single-flight refresh. Resolves true when a new access token was obtained, false when there is
 * no valid session (401). Throws ApiError (offline) when the server cannot be reached.
 * `force`: the current access token was refused by the server.
 */
export function refreshSession(force = false): Promise<boolean> {
  refreshing ??= withRefreshLock(async () => {
    const fresh = await platform.session.refresh(force);
    if (fresh) remember(fresh);
    return fresh !== null;
  }).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** A valid access token, refreshing it first when needed. Null when signed out. */
export async function getAccessToken(): Promise<string | null> {
  if (accessToken && accessExpiresAt - Date.now() > EARLY_REFRESH_MS) return accessToken;
  const ok = await refreshSession();
  if (!ok) {
    if (accessToken) await endSession();
    return null;
  }
  return accessToken;
}

/** After a 401 on an API call: try one refresh; end the session if it is rejected. */
export async function recoverFromUnauthorized(): Promise<string | null> {
  accessExpiresAt = 0;
  const ok = await refreshSession(true);
  if (!ok) {
    await endSession();
    return null;
  }
  return accessToken;
}
