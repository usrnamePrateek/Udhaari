import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { get, set, del } from 'idb-keyval';
import { supabase } from './supabase';
import type { Entry, EntryInput } from './types';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24 * 7, // keep cached data a week for offline use
      staleTime: 1000 * 30,
      retry: 1,
    },
  },
});

export const persister = createAsyncStoragePersister({
  storage: { getItem: get, setItem: set, removeItem: del },
  key: 'udhaari-cache',
});

export const SAVE_ENTRY = ['saveEntry'] as const;

/**
 * Registered as a default (not inline in a component) so that mutations made offline,
 * persisted to IndexedDB and restored after a reload, still know how to run.
 */
queryClient.setMutationDefaults(SAVE_ENTRY, {
  mutationFn: async (input: EntryInput) => {
    // upsert keyed by a client-generated id → safe to retry
    const { error } = await supabase.from('entries').upsert(input, { onConflict: 'id' });
    if (error) throw error;
  },
  onMutate: async (input: EntryInput) => {
    const key = ['entries', input.ledger_id];
    await queryClient.cancelQueries({ queryKey: key });
    queryClient.setQueryData<Entry[]>(key, (prev = []) => {
      const now = new Date().toISOString();
      const existing = prev.find((e) => e.id === input.id);
      const merged: Entry = existing
        ? { ...existing, ...input, updated_at: now }
        : { ...input, created_by: null, created_at: now, updated_at: now };
      const rest = prev.filter((e) => e.id !== input.id);
      return merged.deleted_at ? rest : sortEntries([merged, ...rest]);
    });
  },
  onSettled: (_d, _e, input: EntryInput) => {
    queryClient.invalidateQueries({ queryKey: ['entries', input.ledger_id] });
    queryClient.invalidateQueries({ queryKey: ['history', input.id] });
    queryClient.invalidateQueries({ queryKey: ['balances'] });
  },
});

export function sortEntries(list: Entry[]): Entry[] {
  return [...list].sort(
    (a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at),
  );
}
