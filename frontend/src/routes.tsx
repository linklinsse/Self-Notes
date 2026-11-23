import { Link, Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router';
import { useAuth } from './auth/AuthProvider';
import { AppShell, Brand } from './components/AppShell';
import { Button, CenteredSpinner, EmptyState } from './components/ui';
import { LoginPage, RegisterPage } from './features/auth/AuthPages';
import { displayHost } from './features/auth/server';
import { NewNotePage } from './features/notes/NewNotePage';
import { NoteEditorPage } from './features/notes/NoteEditorPage';
import { NotesPage } from './features/notes/NotesPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { SharedNotePage } from './features/sharing/SharedNotePage';
import { platform } from './platform';

function RequireAuth() {
  const { state, retry } = useAuth();
  const location = useLocation();
  if (state.status === 'loading') return <CenteredSpinner />;
  if (state.status === 'anonymous') {
    // An expired session comes back to the same page after sign-in; a sign-out does not.
    const from = state.signedOut ? undefined : location.pathname + location.search;
    return <Navigate to="/login" replace state={from ? { from } : null} />;
  }
  if (state.status === 'unreachable') {
    // Never sign out because of the network (AUTH-4): offer to retry instead.
    return (
      <AppShell bar={<Brand />}>
        <EmptyState icon="cloudOff" title="Can't reach your server">
          <p>{displayHost(platform.getServerUrl())} is not answering. Your session is kept.</p>
          <div className="row">
            <Button variant="primary" icon="refresh" onClick={retry}>
              Try again
            </Button>
            <Link to="/login" className="btn btn-ghost">
              Use another server
            </Link>
          </div>
        </EmptyState>
      </AppShell>
    );
  }
  return <Outlet />;
}

function RequireAnonymous() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === 'loading') return <CenteredSpinner />;
  if (state.status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />;
  }
  return <Outlet />;
}

function NotFound() {
  return (
    <AppShell bar={<Brand />}>
      <EmptyState icon="alert" title="Page not found">
        <Link to="/" className="btn btn-secondary">
          Back to notes
        </Link>
      </EmptyState>
    </AppShell>
  );
}

export const router = createBrowserRouter([
  { path: '/s/:token', element: <SharedNotePage /> },
  {
    element: <RequireAnonymous />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <NotesPage /> },
      { path: '/notes/new', element: <NewNotePage /> },
      { path: '/notes/:id', element: <NoteEditorPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <NotFound /> },
]);
