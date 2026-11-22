import { ApiError, networkError } from '../api/errors';
import type { Platform, SessionTokens } from './index';
import { storage } from './storage';

const SERVER_KEY = 'sn.serverUrl';
const REFRESH_KEY = 'sn.refreshToken';

function sameOrigin(url: string): boolean {
  try {
    return new URL(url).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * POST to an auth endpoint with the refresh token: in the cookie (same origin) or in the body.
 * Throws ApiError (offline) when the server cannot be reached.
 */
async function postRefreshToken(path: string): Promise<Response | null> {
  const body = webPlatform.tokenTransport() === 'body';
  const refreshToken = body ? storage.get(REFRESH_KEY) : null;
  if (body && !refreshToken) return null;
  try {
    return await fetch(`${webPlatform.getServerUrl()}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(body ? { 'X-Token-Transport': 'body' } : {}) },
      body: JSON.stringify(body ? { refreshToken } : {}),
    });
  } catch {
    throw networkError();
  }
}

export const webPlatform: Platform = {
  kind: 'web',

  async init() {},

  defaultServerUrl: () => window.location.origin,

  getServerUrl: () => storage.get(SERVER_KEY) ?? window.location.origin,

  async setServerUrl(url) {
    storage.set(SERVER_KEY, sameOrigin(url) ? null : url);
  },

  // Cookies are not sent across sites: a server on another origin uses the body transport.
  tokenTransport() {
    return sameOrigin(this.getServerUrl()) ? 'cookie' : 'body';
  },

  session: {
    async save(tokens) {
      if (tokens.refreshToken) storage.set(REFRESH_KEY, tokens.refreshToken);
    },

    async refresh() {
      const response = await postRefreshToken('/api/v1/auth/refresh');
      if (!response || response.status === 401) return null;
      if (!response.ok) {
        throw new ApiError(response.status, 'REFRESH_FAILED', 'The server could not refresh the session.');
      }
      const tokens = (await response.json()) as SessionTokens;
      if (tokens.refreshToken) storage.set(REFRESH_KEY, tokens.refreshToken);
      return tokens;
    },

    async clear(revoke) {
      if (revoke) {
        try {
          await postRefreshToken('/api/v1/auth/logout');
        } catch {
          // offline: the session is forgotten on this device anyway
        }
      }
      storage.set(REFRESH_KEY, null);
    },
  },

  setThemeColors() {
    // The browser uses <meta name="theme-color">, set by applyTheme().
  },

  onDeepLink() {
    // Web links are plain URLs: the router handles them.
  },
};
