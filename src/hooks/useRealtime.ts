import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { useUserId } from './useSession';

/** One channel for everything; RLS makes sure we only hear about our own ledgers. */
export function useRealtime() {
  const uid = useUserId();
  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel('udhaari')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, (payload) => {
        const row = (payload.new ?? payload.old) as { id?: string; ledger_id?: string };
        if (row?.ledger_id) queryClient.invalidateQueries({ queryKey: ['entries', row.ledger_id] });
        if (row?.id) queryClient.invalidateQueries({ queryKey: ['history', row.id] });
        queryClient.invalidateQueries({ queryKey: ['balances'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ledger_members' }, () => {
        queryClient.invalidateQueries({ queryKey: ['ledgers'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ledgers' }, () => {
        queryClient.invalidateQueries({ queryKey: ['ledgers'] });
      })
      .subscribe();

    // Refresh when coming back online / to the foreground.
    const refresh = () => queryClient.invalidateQueries();
    window.addEventListener('online', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      supabase.removeChannel(channel);
    };
  }, [uid]);
}
