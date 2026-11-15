import { useCallback, useEffect, useState } from 'react';

import { getAccess, type Access } from './admin';
import { supabase } from './supabase';

/** Current admin session + role. Re-checks on sign-in / sign-out. */
export function useAdmin() {
  const [access, setAccess] = useState<Access | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setAccess(await getAccess());
    } catch {
      setAccess(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void getAccess().then(setAccess).catch(() => setAccess(null)).finally(() => setReady(true));
    const { data } = supabase.auth.onAuthStateChange(() => { void refresh(); });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  return { access, ready, refresh };
}
