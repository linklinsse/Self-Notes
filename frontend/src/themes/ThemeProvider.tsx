import { type ReactNode, createContext, useContext, useLayoutEffect } from 'react';
import type { Preferences } from '../api/types';
import { PREFS_KEY, useAuth } from '../auth/AuthProvider';
import { platform } from '../platform';
import { storage } from '../platform/storage';
import { applyTheme } from './apply';
import { THEMES, type Theme, activeTheme } from './index';

const ThemeContext = createContext<Theme>(THEMES.blushNoir!);

/** Applies the user's theme (THEME-2); before login, the last preferences seen on this device (THEME-5). */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const prefs: Preferences =
    state.status === 'authenticated' ? state.user.preferences : (storage.getJson<Preferences>(PREFS_KEY) ?? {});
  const theme = activeTheme(prefs);

  useLayoutEffect(() => {
    applyTheme(theme);
    // THEME-4, WIDGET-10
    platform.setThemeColors({
      dark: theme.dark,
      background: theme.bgBase,
      surface: theme.bgSurface,
      card: theme.bgCard,
      accent: theme.accent,
      accentFill: theme.accentFill,
      onAccentFill: theme.onAccentFill,
      border: theme.border,
      text1: theme.text1,
      text2: theme.text2,
      checkbox: theme.checkbox,
      codeBg: theme.codeBg,
    });
  }, [theme]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
