/**
 * Android: the session belongs to the native SessionStore (architecture §6.1), reached through the
 * local Capacitor plugin SelfNotesNative (frontend/android/app/src/main/java/app/selfnotes/session/).
 * The refresh token never enters the WebView, and every refresh runs under the native mutex.
 */
import { App } from '@capacitor/app';
import { registerPlugin } from '@capacitor/core';
import { ApiError, networkError } from '../api/errors';
import { deepLinkPath } from './deepLinks';
import type { AccessToken, Platform, ThemeColors } from './index';

interface SelfNotesNativePlugin {
  getServerUrl(): Promise<{ url?: string }>;
  setServerUrl(options: { url: string }): Promise<void>;
  setSession(options: { serverUrl: string; refreshToken: string } & AccessToken): Promise<void>;
  /** `{}` when signed out. Rejects with code OFFLINE or REFRESH_FAILED (the session is kept). */
  getAccessToken(options: { forceRefresh: boolean }): Promise<Partial<AccessToken>>;
  clearSession(options: { revoke: boolean }): Promise<void>;
  /** Bar icons and the background behind the bars (THEME-4). */
  setSystemBars(options: { background: string; dark: boolean }): Promise<void>;
  /** WIDGET-8. Calls within 2 seconds make one refresh. */
  refreshWidgets(options: { noteId?: string }): Promise<void>;
  /** WIDGET-10: CSS colors of the resolved theme. */
  setWidgetTheme(options: ThemeColors): Promise<void>;
}

const SelfNotesNative = registerPlugin<SelfNotesNativePlugin>('SelfNotesNative');

/** The build's DEFAULT_SERVER_URL (repository variable, docs/release.md), or empty (AUTH-7). */
const DEFAULT_SERVER_URL = (import.meta.env.VITE_DEFAULT_SERVER_URL ?? '').trim().replace(/\/+$/, '');

/** Read from the SessionStore by init(), so that getServerUrl() can stay synchronous. */
let serverUrl = DEFAULT_SERVER_URL;

export const nativePlatform: Platform = {
  kind: 'android',

  async init() {
    const { url } = await SelfNotesNative.getServerUrl();
    if (url) serverUrl = url;
  },

  defaultServerUrl: () => DEFAULT_SERVER_URL,

  getServerUrl: () => serverUrl,

  async setServerUrl(url) {
    serverUrl = url;
    await SelfNotesNative.setServerUrl({ url });
  },

  tokenTransport: () => 'body',

  session: {
    async save(tokens) {
      if (!tokens.refreshToken) throw new Error('The server did not return a refresh token.');
      await SelfNotesNative.setSession({
        serverUrl,
        accessToken: tokens.accessToken,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        refreshToken: tokens.refreshToken,
      });
    },

    async refresh(force) {
      let result: Partial<AccessToken>;
      try {
        result = await SelfNotesNative.getAccessToken({ forceRefresh: force });
      } catch (err) {
        if ((err as { code?: string }).code === 'OFFLINE') throw networkError();
        throw new ApiError(500, 'REFRESH_FAILED', 'The server could not refresh the session.');
      }
      const { accessToken, accessTokenExpiresAt } = result;
      return accessToken && accessTokenExpiresAt ? { accessToken, accessTokenExpiresAt } : null;
    },

    clear: (revoke) => SelfNotesNative.clearSession({ revoke }),
  },

  setThemeColors(colors) {
    SelfNotesNative.setSystemBars({ background: colors.background, dark: colors.dark }).catch(() => {});
    SelfNotesNative.setWidgetTheme(colors).catch(() => {});
  },

  refreshWidgets() {
    SelfNotesNative.refreshWidgets({}).catch(() => {});
  },

  onDeepLink(open) {
    // Also delivered for the link that launched the app: Capacitor keeps it until a listener exists.
    void App.addListener('appUrlOpen', ({ url }) => {
      const path = deepLinkPath(url);
      if (path) open(path);
    });
  },
};
