import { describe, expect, it } from 'vitest';
import { contrastRatio, readableTextOn } from './contrast';
import { THEMES, THEME_LIST, activeTheme, resolveTheme } from './index';
import { CARD_CATEGORY_TINT } from './tokens';

/** CSS color-mix(in srgb, a p, b) for opaque #rrggbb colors. */
function mix(a: string, p: number, b: string): string {
  const parts = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [x, y] = [parts(a), parts(b)];
  return `#${x.map((v, i) => Math.round(v * p + y[i]! * (1 - p)).toString(16).padStart(2, '0')).join('')}`;
}

const SOLID_KEYS = ['bgBase', 'bgSurface', 'bgCard', 'bgRaised', 'accent', 'accentDim', 'text1', 'text2', 'text3',
  'accentFill', 'onAccentFill', 'link', 'checkbox', 'danger', 'success', 'codeBg'] as const;

describe('theme registry', () => {
  it('has unique ids and THEMES is derived from THEME_LIST', () => {
    const ids = THEME_LIST.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(THEMES).sort()).toEqual([...ids].sort());
  });

  it('includes at least one light theme, so the light code path stays exercised', () => {
    expect(THEME_LIST.some((t) => !t.dark)).toBe(true);
  });

  it('falls back for unknown and missing ids', () => {
    expect(resolveTheme('no-such-theme').id).toBe('blushNoir');
    expect(resolveTheme(undefined).id).toBe('blushNoir');
    expect(resolveTheme('unicorn').id).toBe('unicorn');
  });

  it('THEME-2 / THEME-3: the chosen theme; an old "system" choice shows the default', () => {
    expect(activeTheme({ theme: 'sunflower' }).id).toBe('sunflower');
    expect(activeTheme({ theme: 'system' }).id).toBe('blushNoir');
    expect(activeTheme({}).id).toBe('blushNoir');
  });
});

describe.each(THEME_LIST.map((t) => [t.name, t] as const))('theme %s', (_name, theme) => {
  it('defines valid solid colors', () => {
    for (const key of SOLID_KEYS) expect(theme[key], key).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('meets the contrast rules (docs/theming.md §4)', () => {
    for (const bg of [theme.bgCard, theme.bgBase]) {
      expect(contrastRatio(theme.text1, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.text2, bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(theme.onAccentFill, theme.accentFill)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(theme.link, theme.bgCard)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(theme.checkbox, theme.bgCard)).toBeGreaterThanOrEqual(3);
  });

  it('category presets get readable chip text', () => {
    for (const color of theme.categoryPresets) {
      expect(contrastRatio(readableTextOn(color), color)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('cards tinted with a category preset keep readable text', () => {
    for (const color of theme.categoryPresets) {
      const card = mix(color, CARD_CATEGORY_TINT, theme.bgCard);
      expect(contrastRatio(theme.text1, card), color).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.text2, card), color).toBeGreaterThanOrEqual(4.5);
    }
  });
});
