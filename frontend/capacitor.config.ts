import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android packaging of the web app (docs/architecture.md §6).
 * The version is not set here: android/app/build.gradle reads the repository's VERSION file.
 */
const config: CapacitorConfig = {
  // Permanent once released (roadmap Q4).
  appId: 'app.selfnotes',
  appName: 'Self-Notes',
  webDir: 'dist',
  server: {
    // WebView origin https://localhost: the default CORS_ORIGINS of the server allows it.
    androidScheme: 'https',
    // Shown instead of a blank screen when the WebView is too old (minWebViewVersion).
    errorPath: 'webview-error.html',
  },
  android: {
    // Only HTTPS servers, or http://localhost through `adb reverse` (docs/deployment.md).
    allowMixedContent: false,
    // The bundle (build.target es2022 + dependencies) needs Chromium 93 (Object.hasOwn). 100 leaves
    // some margin; phones that get WebView updates from the Play Store all have a newer one.
    minWebViewVersion: 100,
  },
  plugins: {
    SystemBars: {
      // Edge to edge: index.html uses viewport-fit=cover and the CSS pads with env(safe-area-inset-*).
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
      // Light icons on the dark default background until the theme applies (SelfNotesNative.setSystemBars).
      style: 'DARK',
    },
  },
};

export default config;
