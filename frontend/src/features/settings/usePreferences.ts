import { useCallback } from 'react';
import { meApi } from '../../api/endpoints';
import { errorMessage } from '../../api/errors';
import type { Preferences } from '../../api/types';
import { useAuth, useUser } from '../../auth/AuthProvider';
import { useToast } from '../../components/Toast';

/** Preferences follow the account (THEME-2, NOTE-9): applied at once, then saved; rolled back on error. */
export function useUpdatePreferences(): (patch: Preferences) => Promise<void> {
  const user = useUser();
  const { setUser } = useAuth();
  const toast = useToast();
  return useCallback(
    async (patch: Preferences) => {
      const previous = user;
      setUser({ ...user, preferences: { ...user.preferences, ...patch } });
      try {
        setUser(await meApi.update({ preferences: patch }));
      } catch (err) {
        setUser(previous);
        toast(errorMessage(err), 'error');
      }
    },
    [user, setUser, toast],
  );
}
