import type { Theme } from './defineTheme';
import { blushNoir, midnightInk, oceanBreeze, sageDusk, sunflower, unicorn } from './palettes';

export type { Theme } from './defineTheme';

/** Source of truth. Order = order in Settings (dark themes first, then light). */
export const THEME_LIST: Theme[] = [blushNoir, sunflower, midnightInk, oceanBreeze, sageDusk, unicorn];

/** Derived from THEME_LIST: never edit directly. */
export const THEMES: Record<string, Theme> = Object.fromEntries(THEME_LIST.map((t) => [t.id, t]));

export const DEFAULT_THEME_ID = 'blushNoir';

/** Unknown ids (e.g. a removed theme still saved in preferences) fall back to the default theme. */
export function resolveTheme(id: string | undefined | null): Theme {
  return (id ? THEMES[id] : undefined) ?? THEMES[DEFAULT_THEME_ID]!;
}

export interface ThemePreferences {
  theme?: string;
}

/**
 * THEME-2: the theme chosen in Settings. There is no "follow the device" mode (THEME-3): an old
 * saved "system" choice is an unknown id, so it shows the default theme.
 */
export function activeTheme(prefs: ThemePreferences): Theme {
  return resolveTheme(prefs.theme);
}
