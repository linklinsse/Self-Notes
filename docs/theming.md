# Theming

Every color, font, size and radius in the UI comes from **theme tokens**, exposed as CSS custom properties (`--sn-*`). Components never contain hard-coded values. The palettes and token model come from the project owner's reference themes (another project, kept untracked in `themes/` at the repository root). Self-Notes ports their values to TypeScript and adds a few tokens of its own (§3).

## 1. Themes

`THEME_LIST` order is the order shown in Settings: dark themes first, then light.

| # | id | Name | Mode | Accent | Background | Notes |
|---|----|------|------|--------|------------|-------|
| 1 | `blushNoir` | Blush Noir | dark | `#f4b8c8` dusty rose | `#0d0d12` | **Default theme**, and the fallback for unknown ids |
| 2 | `sunflower` | Sunflower | dark | `#FFD32C` sunflower yellow | `#0f0c05` | Warm brown undertones |
| 3 | `midnightInk` | Midnight Ink | dark | `#c8b8f4` lavender | `#09090f` | |
| 4 | `oceanBreeze` | Ocean Breeze | dark | `#7dd8f0` cyan | `#090f12` | |
| 5 | `sageDusk` | Sage Dusk | dark | `#b8f0c8` mint | `#0e1210` | |
| 6 | `unicorn` | Unicorn | light | `#d946a6` magenta | `#f6eaff` | Only light theme. Buttons and links use `accentDim` (§4). |

Default in user preferences: `theme: "blushNoir"`. There is no mode that follows the device's light/dark setting (THEME-3).

## 2. Theme palettes (from the reference)

| Token | blushNoir | sunflower | midnightInk | oceanBreeze | sageDusk | unicorn |
|-------|-----------|-----------|-------------|-------------|----------|---------|
| `bgBase` | `#0d0d12` | `#0f0c05` | `#09090f` | `#090f12` | `#0e1210` | `#f6eaff` |
| `bgSurface` | `#13131a` | `#161108` | `#0f0f18` | `#0f1820` | `#141a16` | `#fdf2ff` |
| `bgCard` | `#1a1a24` | `#1e170b` | `#161620` | `#162029` | `#1b231d` | `#fff5fc` |
| `bgRaised` | `#21212e` | `#271f0f` | `#1e1e2a` | `#1d2a35` | `#222d24` | `#ffffff` |
| `accent` | `#f4b8c8` | `#FFD32C` | `#c8b8f4` | `#7dd8f0` | `#b8f0c8` | `#d946a6` |
| `accentDim` | `#c4809a` | `#bf9e21` | `#9880d0` | `#4aa8c8` | `#7ab890` | `#a63384` |
| `text1` | `#f0eaf2` | `#f7f1dc` | `#edeaf5` | `#e8f4f8` | `#eaf2ec` | `#3d2450` |
| `text2` | `#a090a4` | `#b8a878` | `#9890b0` | `#7898a8` | `#90a498` | `#7a4a91` |
| `text3` | `#585060` | `#6b5d34` | `#524e68` | `#3e5868` | `#4e5e52` | `#a878bd` |

The other tokens (`accentGlow`, `accentBg`, `border`, `borderSoft`, `shadowCard`, `shadowGlow`) are `rgba()` values derived from the accent. Their exact values are in the reference files.

## 3. Token model

### Palette (one set per theme)

| Token | CSS variable | Use |
|-------|--------------|-----|
| `dark` | `color-scheme` | `true` / `false`. Decides light or dark for native controls and the Android bar icons. |
| `bgBase` | `--sn-bg` | Page background |
| `bgSurface` | `--sn-bg-surface` | Top bar, side panels, bottom sheets |
| `bgCard` | `--sn-bg-card` | Note cards, editor, dialogs |
| `bgRaised` | `--sn-bg-raised` | Menus, hover states, inputs |
| `accent` | `--sn-accent` | Accent color: icons, focus ring, selected tab, checkboxes |
| `accentDim` | `--sn-accent-dim` | Pressed and secondary accent |
| `accentGlow` | `--sn-accent-glow` | Focus or selection halo (`rgba`) |
| `accentBg` | `--sn-accent-bg` | Tinted background for the selected item (`rgba`) |
| `border` / `borderSoft` | `--sn-border` / `--sn-border-soft` | Card borders and separators (`rgba`) |
| `text1` | `--sn-text-1` | Main text |
| `text2` | `--sn-text-2` | Secondary text: previews, dates, labels |
| `text3` | `--sn-text-3` | **Decorative or disabled only.** Below 4.5:1 by design, so never use it for text a user must read. |
| `shadowCard` / `shadowGlow` | `--sn-shadow-card` / `--sn-shadow-glow` | Card elevation, accent glow |

### Added by Self-Notes (derived when the theme does not set them)

| Token | CSS variable | Default (dark) | Default (light) | Use |
|-------|--------------|----------------|-----------------|-----|
| `accentFill` | `--sn-accent-fill` | `accent` | `accent` | Fill of primary buttons, the "new note" button and selected chips |
| `onAccentFill` | `--sn-on-accent-fill` | `bgBase` | `#ffffff` | Text and icons drawn on `accentFill` |
| `link` | `--sn-link` | `accent` | `accent` | Markdown links and accent-colored text |
| `checkbox` | `--sn-checkbox` | `accent` | `accent` | Checklist boxes (non-text UI: at least 3:1) |
| `danger` / `success` | `--sn-danger` / `--sn-success` | `#ff8a8a` / `#8fe3a8` | `#c0264b` / `#1f7a45` | Delete, errors, saved state |
| `codeBg` | `--sn-code-bg` | `bgBase` | `bgRaised` | Background of code blocks in Markdown |

**Unicorn overrides:** `accentFill: '#a63384'` (white text reaches 6.1:1, compared with 3.9:1 on `#d946a6`) and `link: '#a63384'` (5.8:1 on `bgCard`, compared with 3.7:1).

### Shared tokens (identical in every theme, from the reference `tokens.js`)

| Group | Tokens | Values |
|-------|--------|--------|
| Fonts | `fontDisplay` (logo, note titles, headings), `fontBody` (all UI), `fontMono` (code) | Georgia serif / `system-ui` stack / `SF Mono, Cascadia Code, Fira Code, Consolas, monospace`. System fonts only, so nothing is downloaded and the APK works offline. |
| Font sizes | `fontSizeXs` … `fontSizeXxl` | 13 / 15 / 16 / 19 / 24 / 34 px. Changing them scales the whole UI. |
| Radii | `radiusSm` … `radiusXl` | 8 / 14 / 20 / 28 px |
| Category presets | `categoryPresets` | Vivid, the same in every theme: `#ff4f8b` `#4f7dff` `#1fbf75` `#ff9a1f` `#a45cff` `#ffd23f` `#12b8d6` `#ff5b3a`. |

## 4. Contrast rules (enforced by tests)

All six themes currently pass:

| Pair | Minimum | Current range |
|------|---------|---------------|
| `text1` on `bgCard`, `bgBase` | 4.5:1 | 11.6 – 17.3 |
| `text2` on `bgCard`, `bgBase` | 4.5:1 | 5.4 – 8.3 |
| `onAccentFill` on `accentFill` | 4.5:1 | 6.1 (unicorn) – 14.7 |
| `link` on `bgCard` | 4.5:1 | 5.8 (unicorn) – 12.5 |
| `checkbox` on `bgCard` | 3:1 | 3.7 (unicorn) – 12.5 |
| `text3` | not checked | decorative only |

## 5. Category colors

A category's color is the user's own `#RRGGBB`, stored on the category, so it stays the same when the theme changes. The picker suggests the theme's `categoryPresets` (vivid colors) and also offers a custom color. Chip text is black or white, whichever has the higher contrast with the chip color (at least 4.5:1 on every preset, tested).

Categories are meant to be seen at a glance:

- **Note cards** take the color of their first category: a 6 px left bar, a border at 55 % of the color, and a background tinted at `CARD_CATEGORY_TINT` (7 %). A test checks that `text1` and `text2` keep 4.5:1 on a card tinted with every preset, in every theme.
- **Category filters** on the notes page are tinted with their color and outlined with it, and filled with it when selected.

## 6. How a theme is applied

1. `ThemeProvider` (a React context) resolves the active theme from `preferences.theme`. An unknown id, for example from a theme that was removed (or the old `"system"` choice), falls back to `blushNoir` and never breaks the app.
2. It writes every token to `:root` as `--sn-*` variables and sets `color-scheme` from `dark`.
3. It sets `<meta name="theme-color">` to `bgBase`. On Android it also sets the status bar and navigation bar colors (`bgBase`, light or dark icons from `dark`) through Capacitor's `StatusBar` plugin (THEME-4).
4. On Android it sends the widget colors to the native layer with `SelfNotesNative.setWidgetTheme` (WIDGET-10). `rgba()` values are converted to `#AARRGGBB`:

   | Widget part | Token |
   |-------------|-------|
   | Background | `bgCard` |
   | Header | `bgSurface` |
   | Title / main text | `text1` |
   | Preview / "updated X ago" | `text2` |
   | Icons, checkboxes, progress | `accent` |
   | Row separators | `borderSoft` |

5. The resolved theme id is cached locally so the first render does not flash the wrong colors. Share-link pages use that cached theme (THEME-5).

## 7. Code

```
frontend/src/themes/
├── tokens.ts        # shared FONTS, SIZES, RADII, default category presets
├── defineTheme.ts   # merges shared tokens + derives Self-Notes tokens (§3)
├── palettes.ts      # the six themes
├── index.ts         # THEME_LIST (order = picker order), THEMES derived from it, resolveTheme(), activeTheme()
├── apply.ts         # token → --sn-* variable map, applyTheme() + cache for public/theme-boot.js
├── contrast.ts      # WCAG contrast helpers, readable chip text
├── ThemeProvider.tsx
└── themes.test.ts
```

`themes.test.ts` carries over the checks from the reference and adds the contrast rules:
- every required token is defined and non-empty, and solid colors are valid hex;
- ids are unique, and `THEMES` is derived from `THEME_LIST`;
- at least one light theme exists, so the light-mode code path is always exercised;
- `resolveTheme()` falls back for unknown or undefined ids;
- the contrast rules in §4.

## 8. Adding a theme

1. Add a `defineTheme({...})` entry to `frontend/src/themes/palettes.ts`. Set the palette tokens, and the Self-Notes tokens if the defaults fail contrast.
2. Add it to `THEME_LIST` in `index.ts`. That is the only registration needed.
3. Run the tests: the contrast rules must pass.
4. Add it to the table in §1 and to `CHANGELOG.md`. **Never rename an id** after a release, because user preferences store it.
