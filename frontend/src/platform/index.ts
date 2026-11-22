/**
 * Everything that differs between the web app and the Android app goes through this module
 * (docs/architecture.md §6). The rest of the front never imports web.ts or native.ts directly.
 */
import { Capacitor } from '@capacitor/core';
import { nativePlatform } from './native';
import { webPlatform } from './web';

export type TokenTransport = 'cookie' | 'body';

export interface AccessToken {
  accessToken: string;
  accessTokenExpiresAt: string;
}

/** Tokens returned by login, register and refresh. */
export interface SessionTokens extends AccessToken {
  /** Only with the body transport. */
  refreshToken?: string;
}

/**
 * Where the refresh token lives and who refreshes it (architecture §3 and §6.1): the browser
 * (cookie or localStorage) on web, the native SessionStore on Android.
 */
export interface SessionBackend {
  /** Keeps the session opened by login or register. */
  save(tokens: SessionTokens): Promise<void>;
  /**
   * A new access token, or null when there is no session or the server rejected it (401).
   * `force`: the current access token was refused. Throws ApiError when the server cannot be reached.
   */
  refresh(force: boolean): Promise<AccessToken | null>;
  /** Forgets the session on this device. With `revoke`, first asks the server to revoke it (best effort). */
  clear(revoke: boolean): Promise<void>;
}

export interface Platform {
  kind: 'web' | 'android';
  /** Loads what is kept outside the WebView. Called once, before the first render. */
  init(): Promise<void>;
  /** Base URL of the API server, without trailing slash. Empty when none is set yet (AUTH-6, AUTH-7). */
  getServerUrl(): string;
  setServerUrl(url: string): Promise<void>;
  defaultServerUrl(): string;
  /** How the refresh token travels: httpOnly cookie (same-origin web) or JSON body. */
  tokenTransport(): TokenTransport;
  session: SessionBackend;
  /** THEME-4: the system bars follow the theme (Android). `background` is a #rrggbb color. */
  setThemeColors(colors: { background: string; dark: boolean }): void;
  /** Links that open the app (selfnotes://…, architecture §6.2), as in-app paths. */
  onDeepLink(open: (path: string) => void): void;
}

export const platform: Platform = Capacitor.isNativePlatform() ? nativePlatform : webPlatform;
