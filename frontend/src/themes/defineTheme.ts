import { CATEGORY_PRESETS, FONTS, RADII, SIZES } from './tokens';

/** Palette tokens every theme defines (same names as the reference themes). */
export interface ThemePalette {
  id: string;
  name: string;
  dark: boolean;
  bgBase: string;
  bgSurface: string;
  bgCard: string;
  bgRaised: string;
  accent: string;
  accentDim: string;
  accentGlow: string;
  accentBg: string;
  border: string;
  borderSoft: string;
  text1: string;
  text2: string;
  /** Decorative / disabled only: below 4.5:1 by design. */
  text3: string;
  shadowCard: string;
  shadowGlow: string;
}

/** Tokens added by Self-Notes, derived when a theme does not set them (docs/theming.md §3). */
export interface SelfNotesTokens {
  accentFill: string;
  onAccentFill: string;
  link: string;
  checkbox: string;
  danger: string;
  success: string;
  codeBg: string;
  categoryPresets: string[];
}

export type Theme = ThemePalette & SelfNotesTokens & typeof FONTS & typeof SIZES & typeof RADII;

export function defineTheme(palette: ThemePalette & Partial<SelfNotesTokens>): Theme {
  const derived: SelfNotesTokens = {
    accentFill: palette.accent,
    onAccentFill: palette.dark ? palette.bgBase : '#ffffff',
    link: palette.accent,
    checkbox: palette.accent,
    danger: palette.dark ? '#ff8a8a' : '#c0264b',
    success: palette.dark ? '#8fe3a8' : '#1f7a45',
    codeBg: palette.dark ? palette.bgBase : palette.bgRaised,
    categoryPresets: CATEGORY_PRESETS,
  };
  return { ...FONTS, ...SIZES, ...RADII, ...derived, ...palette };
}
