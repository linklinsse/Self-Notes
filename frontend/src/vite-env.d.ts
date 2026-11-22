/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Server pre-filled on the Android login page (repository variable DEFAULT_SERVER_URL). */
  readonly VITE_DEFAULT_SERVER_URL?: string;
}
