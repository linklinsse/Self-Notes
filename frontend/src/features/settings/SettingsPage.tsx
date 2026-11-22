import { useQuery } from '@tanstack/react-query';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { healthApi, meApi } from '../../api/endpoints';
import { errorMessage, isApiError } from '../../api/errors';
import { useAuth, useUser } from '../../auth/AuthProvider';
import { AppShell } from '../../components/AppShell';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { Button, ErrorNote, Field } from '../../components/ui';
import { APP_VERSION } from '../../lib/version';
import { platform } from '../../platform';
import { displayHost } from '../auth/server';
import { USERNAME_HINT, usernameInputProps } from '../auth/username';
import { CategoryManager } from '../categories/CategoryManager';
import { ThemePicker } from './ThemePicker';
import { useUpdatePreferences } from './usePreferences';

function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section className="settings-section" id={id}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function SettingsPage() {
  const user = useUser();
  const { setUser, logout } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const [username, setUsername] = useState(user.username);
  const health = useQuery({ queryKey: ['health'], queryFn: healthApi.get });

  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [location.hash]);

  const updatePrefs = useUpdatePreferences();

  async function saveUsername(e: FormEvent) {
    e.preventDefault();
    try {
      const updated = await meApi.update({ username });
      setUser(updated);
      setUsername(updated.username);
      toast('Username saved');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <AppShell
      bar={
        <>
          <Link to="/" className="icon-btn" aria-label="Back to notes" title="Back to notes">
            <Icon name="back" />
          </Link>
          <h1 className="topbar-title">Settings</h1>
        </>
      }
    >
      <div className="settings">
        <Section title="Profile">
          <form className="inline-form" onSubmit={saveUsername}>
            <Field
              label="Username"
              autoComplete="username"
              maxLength={32}
              required
              {...usernameInputProps}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <Button type="submit" disabled={username.trim().toLowerCase() === user.username || !username.trim()}>
              Save
            </Button>
          </form>
          <p className="muted small">You sign in with this username, and people share notes with you by it. {USERNAME_HINT}</p>
        </Section>

        <Section title="Theme">
          <ThemePicker prefs={user.preferences} onChange={(patch) => void updatePrefs(patch)} />
        </Section>

        <Section id="categories" title="Categories">
          <p className="muted small">Your categories are personal: people you share notes with do not see them.</p>
          <CategoryManager />
        </Section>

        <Section title="Password">
          <PasswordForm />
        </Section>

        <Section title="About">
          <dl className="about">
            <dt>App version</dt>
            <dd>{APP_VERSION}</dd>
            <dt>Server</dt>
            <dd>{displayHost(platform.getServerUrl())}</dd>
            <dt>Server version</dt>
            <dd>{health.data?.version ?? (health.isError ? 'unreachable' : '…')}</dd>
          </dl>
          <Button icon="logout" variant="danger" onClick={() => void logout()}>
            Sign out
          </Button>
        </Section>
      </div>
    </AppShell>
  );
}

function PasswordForm() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await meApi.changePassword(current, next);
      setCurrent('');
      setNext('');
      toast('Password changed. Your other devices were signed out.');
    } catch (err) {
      setError(isApiError(err, 'INVALID_CREDENTIALS') ? 'The current password is wrong.' : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <Field label="Current password" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      <Field
        label="New password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        hint="At least 8 characters. Your other devices will be signed out."
        value={next}
        onChange={(e) => setNext(e.target.value)}
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      <div>
        <Button type="submit" busy={busy}>
          Change password
        </Button>
      </div>
    </form>
  );
}
