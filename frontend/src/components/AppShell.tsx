import type { ReactNode } from 'react';
import { Link } from 'react-router';

/** Page frame: sticky top bar + centered content. */
export function AppShell({ bar, children }: { bar: ReactNode; children: ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">{bar}</div>
      </header>
      <main className="shell-main">{children}</main>
    </div>
  );
}

export function Brand() {
  return (
    <Link to="/" className="brand">
      Self-Notes
    </Link>
  );
}
