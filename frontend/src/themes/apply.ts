import type { Theme } from './defineTheme';

/** Theme token -> CSS custom property. Components only use these variables. */
const CSS_VARS: Record<string, keyof Theme> = {
  '--sn-bg': 'bgBase',
  '--sn-bg-surface': 'bgSurface',
  '--sn-bg-card': 'bgCard',
  '--sn-bg-raised': 'bgRaised',
  '--sn-accent': 'accent',
  '--sn-accent-dim': 'accentDim',
  '--sn-accent-glow': 'accentGlow',
  '--sn-accent-bg': 'accentBg',
  '--sn-border': 'border',
  '--sn-border-soft': 'borderSoft',
  '--sn-text-1': 'text1',
  '--sn-text-2': 'text2',
  '--sn-text-3': 'text3',
  '--sn-shadow-card': 'shadowCard',
  '--sn-shadow-glow': 'shadowGlow',
  '--sn-accent-fill': 'accentFill',
  '--sn-on-accent-fill': 'onAccentFill',
  '--sn-link': 'link',
  '--sn-checkbox': 'checkbox',
  '--sn-danger': 'danger',
  '--sn-success': 'success',
  '--sn-code-bg': 'codeBg',
  '--sn-font-display': 'fontDisplay',
  '--sn-font-body': 'fontBody',
  '--sn-font-mono': 'fontMono',
  '--sn-fs-xs': 'fontSizeXs',
  '--sn-fs-sm': 'fontSizeSm',
  '--sn-fs-md': 'fontSizeMd',
  '--sn-fs-lg': 'fontSizeLg',
  '--sn-fs-xl': 'fontSizeXl',
  '--sn-fs-xxl': 'fontSizeXxl',
  '--sn-r-sm': 'radiusSm',
  '--sn-r-md': 'radiusMd',
  '--sn-r-lg': 'radiusLg',
  '--sn-r-xl': 'radiusXl',
};

export function themeVars(theme: Theme): Record<string, string> {
  return Object.fromEntries(Object.entries(CSS_VARS).map(([name, key]) => [name, String(theme[key])]));
}

const CACHE_KEY = 'sn.themeVars';

/** Write the theme to :root, and cache it for public/theme-boot.js (first paint) and share-link pages. */
export function applyTheme(theme: Theme): void {
  const vars = themeVars(theme);
  const root = document.documentElement;
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  root.style.colorScheme = theme.dark ? 'dark' : 'light';
  root.dataset.theme = theme.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.bgBase);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ id: theme.id, dark: theme.dark, vars }));
  } catch {
    // storage unavailable (private mode): the theme still applies for this page
  }
}
