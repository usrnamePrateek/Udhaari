import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Entry, HistoryRow, Ledger, Member } from '../lib/types';
import { useUserId } from './useSession';

export function useLedgers() {
  return useQuery({
    queryKey: ['ledgers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ledgers')
        .select('*, ledger_members(id, ledger_id, user_id, display_name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Ledger[];
    },
  });
}

export function useLedger(id: string | undefined) {
  const q = useLedgers();
  return { ...q, data: q.data?.find((l) => l.id === id) };
}

/** Map member_id → net paise (positive = member is owed). */
export function useBalances() {
  return useQuery({
    queryKey: ['balances'],
    queryFn: async () => {
      const { data, error } = await supabase.from('ledger_balances').select('member_id, net_paise');
      if (error) throw error;
      return Object.fromEntries(data.map((r) => [r.member_id as string, Number(r.net_paise)])) as Record<string, number>;
    },
  });
}

export function useEntries(ledgerId: string | undefined) {
  return useQuery({
    queryKey: ['entries', ledgerId],
    enabled: Boolean(ledgerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entries')
        .select('*')
        .eq('ledger_id', ledgerId!)
        .is('deleted_at', null)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Entry[];
    },
  });
}

export function useHistory(entryId: string | undefined) {
  return useQuery({
    queryKey: ['history', entryId],
    enabled: Boolean(entryId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entry_history')
        .select('*')
        .eq('entry_id', entryId!)
        .order('changed_at', { ascending: false });
      if (error) throw error;
      return data as HistoryRow[];
    },
  });
}

/** Split a two-person ledger into "me" and "them". */
export function useSides(ledger: Ledger | undefined): { me?: Member; other?: Member } {
  const uid = useUserId();
  if (!ledger) return {};
  const me = ledger.ledger_members.find((m) => m.user_id === uid);
  const other = ledger.ledger_members.find((m) => m.id !== me?.id);
  return { me, other };
}
