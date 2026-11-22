import type { Preferences } from '../../api/types';
import { THEME_LIST, type Theme, activeTheme } from '../../themes';

function Swatch({ theme }: { theme: Theme }) {
  return (
    <span className="swatch" style={{ background: theme.bgBase, borderColor: theme.border }} aria-hidden>
      <span className="swatch-card" style={{ background: theme.bgCard }}>
        <span className="swatch-line" style={{ background: theme.text1 }} />
        <span className="swatch-line short" style={{ background: theme.text2 }} />
        <span className="swatch-dot" style={{ background: theme.accent }} />
      </span>
    </span>
  );
}

/** THEME-1 / THEME-2: pick a theme. */
export function ThemePicker({ prefs, onChange }: { prefs: Preferences; onChange: (patch: Preferences) => void }) {
  const current = activeTheme(prefs).id;

  return (
    <div className="theme-picker">
      <div className="theme-grid" role="radiogroup" aria-label="Theme">
        {THEME_LIST.map((theme) => (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={current === theme.id}
            className={`theme-option ${current === theme.id ? 'is-active' : ''}`}
            onClick={() => onChange({ theme: theme.id })}
          >
            <Swatch theme={theme} />
            <span>{theme.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
