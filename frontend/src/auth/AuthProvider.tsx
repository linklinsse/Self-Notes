import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, meApi } from '../api/endpoints';
import { isApiError } from '../api/errors';
import { acceptTokens, forgetSession, mightHaveSession, onSessionEnded, refreshSession, signOut } from '../api/session';
import type { User } from '../api/types';
import { storage } from '../platform/storage';

export type AuthState =
  | { status: 'loading' }
  /**
   * `signedOut`: the user signed out. The next sign-in then starts from the notes grid rather
   * than the page left (which may belong to another account on a shared device).
   */
  | { status: 'anonymous'; signedOut?: boolean }
  /** A session may exist but the server cannot be reached: never log out because of the network. */
  | { status: 'unreachable' }
  | { status: 'authenticated'; user: User };

interface AuthContextValue {
  state: AuthState;
  login(username: string, password: string): Promise<void>;
  register(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  setUser(user: User): void;
  retry(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Last known preferences, used before login and on share-link pages (THEME-5). */
export const PREFS_KEY = 'sn.prefs';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const signedIn = useCallback((user: User) => {
    storage.set(PREFS_KEY, JSON.stringify(user.preferences));
    setState({ status: 'authenticated', user });
  }, []);

  // Restore the session on start (cookie or stored refresh token).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!mightHaveSession() || !(await refreshSession())) {
          await forgetSession();
          if (!cancelled) setState({ status: 'anonymous' });
          return;
        }
        const user = await meApi.get();
        if (!cancelled) signedIn(user);
      } catch (err) {
        if (cancelled) return;
        setState(isApiError(err) && err.isOffline ? { status: 'unreachable' } : { status: 'anonymous' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, signedIn]);

  useEffect(
    () =>
      onSessionEnded(() => {
        queryClient.clear();
        setState({ status: 'anonymous' });
      }),
    [queryClient],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      async login(username, password) {
        const res = await authApi.login(username, password);
        await acceptTokens(res);
        queryClient.clear();
        signedIn(res.user);
      },
      async register(username, password) {
        const res = await authApi.register(username, password);
        await acceptTokens(res);
        queryClient.clear();
        signedIn(res.user);
      },
      async logout() {
        await signOut();
        queryClient.clear();
        setState({ status: 'anonymous', signedOut: true });
      },
      setUser: signedIn,
      retry: () => {
        setState({ status: 'loading' });
        setAttempt((n) => n + 1);
      },
    }),
    [state, queryClient, signedIn],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** The signed-in user. Only use inside routes guarded by <RequireAuth>. */
export function useUser(): User {
  const { state } = useAuth();
  if (state.status !== 'authenticated') throw new Error('useUser requires a signed-in user');
  return state.user;
}
