import { type FormEvent, type ReactNode, useState } from 'react';
import { Link } from 'react-router';
import { isApiError } from '../../api/errors';
import { useAuth } from '../../auth/AuthProvider';
import { Button, ErrorNote, Field } from '../../components/ui';
import type { ServerCheck } from './server';
import { ServerField } from './ServerField';
import { USERNAME_HINT, usernameInputProps } from './username';

/** AUTH-1: sign-up is offered only when the chosen server allows it (unknown: offered). */
type Render = ReactNode | ((registrationOpen: boolean) => ReactNode);

function AuthLayout({ title, children, footer }: { title: string; children: Render; footer: Render }) {
  const [check, setCheck] = useState<ServerCheck | null>(null);
  const registrationOpen = !check?.ok || check.registration;
  const render = (part: Render) => (typeof part === 'function' ? part(registrationOpen) : part);
  const end = render(footer);
  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="brand brand-large">Self-Notes</div>
        <h1>{title}</h1>
        <ServerField onCheck={setCheck} />
        {render(children)}
        {end && <p className="auth-footer">{end}</p>}
      </div>
    </main>
  );
}

function messageFor(err: unknown): string {
  if (isApiError(err)) {
    if (err.isOffline) return "Can't reach the server. Check your connection or the server address.";
    if (err.code === 'VALIDATION_ERROR') return `Please check the fields. Username: ${USERNAME_HINT.toLowerCase()}`;
    return err.message;
  }
  return 'Something went wrong.';
}

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      setError(messageFor(err));
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      footer={(registrationOpen) =>
        registrationOpen && (
          <>
            No account yet? <Link to="/register">Create one</Link>
          </>
        )
      }
    >
      <form className="form" onSubmit={submit}>
        <Field
          label="Username"
          autoComplete="username"
          required
          {...usernameInputProps}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" variant="primary" busy={busy} className="btn-block">
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(username, password);
    } catch (err) {
      setError(messageFor(err));
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      footer={
        <>
          Already have an account? <Link to="/login">Sign in</Link>
        </>
      }
    >
      {(registrationOpen) =>
        !registrationOpen ? (
          <p className="auth-closed muted">
            Sign-up is closed on this server. Ask its administrator for an account, or choose another server above.
          </p>
        ) : (
          <form className="form" onSubmit={submit}>
            <Field
              label="Username"
              autoComplete="username"
              required
              maxLength={32}
              hint={USERNAME_HINT}
              {...usernameInputProps}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <Field
              label="Password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              hint="At least 8 characters."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit" variant="primary" busy={busy} className="btn-block">
              Create account
            </Button>
          </form>
        )
      }
    </AuthLayout>
  );
}
