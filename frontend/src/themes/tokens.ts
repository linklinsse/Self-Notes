/**
 * Tokens shared by every theme (ported from the reference themes' tokens.js).
 * System fonts only: nothing is downloaded, so the APK works offline.
 */
export const FONTS = {
  /** Logo, note titles, headings. */
  fontDisplay: "Georgia, 'Times New Roman', serif",
  /** All UI text. */
  fontBody: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  /** Code. */
  fontMono: "'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
};

/** Change these to scale the whole UI. */
export const SIZES = {
  fontSizeXs: '13px',
  fontSizeSm: '15px',
  fontSizeMd: '16px',
  fontSizeLg: '19px',
  fontSizeXl: '24px',
  fontSizeXxl: '34px',
};

export const RADII = {
  radiusSm: '8px',
  radiusMd: '14px',
  radiusLg: '20px',
  radiusXl: '28px',
};

/** Preset colors offered by the category color picker: vivid, so categories stand out on every theme. */
/** Share of the first category's color mixed into a note card's background (app.css, .note-card.has-accent). */
export const CARD_CATEGORY_TINT = 0.07;

export const CATEGORY_PRESETS = ['#ff4f8b', '#4f7dff', '#1fbf75', '#ff9a1f', '#a45cff', '#ffd23f', '#12b8d6', '#ff5b3a'];
