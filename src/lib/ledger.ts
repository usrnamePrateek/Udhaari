import type { Entry, Member } from './types';

/** How an entry moves *my* balance: + when I gave, − when I received, 0 if I'm not involved. */
export function entryDelta(entry: Pick<Entry, 'from_member' | 'to_member' | 'amount_paise'>, meId: string): number {
  if (entry.from_member === meId) return entry.amount_paise;
  if (entry.to_member === meId) return -entry.amount_paise;
  return 0;
}

/** Net balance in paise. Positive = the other person owes me. */
export function netBalance(entries: Entry[], meId: string): number {
  return entries.reduce((sum, e) => sum + entryDelta(e, meId), 0);
}

/**
 * Balance after each entry, keyed by entry id.
 * `entries` is newest-first (as displayed); balances accumulate oldest → newest.
 */
export function runningBalances(entries: Entry[], meId: string): Map<string, number> {
  const out = new Map<string, number>();
  let acc = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    acc += entryDelta(entries[i], meId);
    out.set(entries[i].id, acc);
  }
  return out;
}

/**
 * For a newest-first list: per index, the index of the entry that settled its group
 * (balance 0), running down to the next older zero. -1 = newer than the last settlement.
 */
export function settledGroupStarts(entries: Entry[], running: Map<string, number>): number[] {
  let g = -1;
  return entries.map((e, i) => {
    if (running.get(e.id) === 0) g = i;
    return g;
  });
}

/** Sum of what I'll get and what I owe, per currency, from per-ledger nets. */
export function totalsByCurrency(items: { currency: string; net: number }[]): Map<string, { get: number; owe: number }> {
  const totals = new Map<string, { get: number; owe: number }>();
  for (const { currency, net } of items) {
    const t = totals.get(currency) ?? { get: 0, owe: 0 };
    if (net > 0) t.get += net;
    else t.owe -= net;
    totals.set(currency, t);
  }
  return totals;
}

/**
 * Mirrors the database rule (migration 0003): only whoever added an entry may change it,
 * unless they no longer have access to the ledger. Null created_by = account gone, or a
 * freshly added offline entry that hasn't synced yet.
 */
export function canEditEntry(entry: Pick<Entry, 'created_by'>, me: Pick<Member, 'user_id'>, members: Pick<Member, 'user_id'>[]): boolean {
  if (!entry.created_by || entry.created_by === me.user_id) return true;
  return !members.some((m) => m.user_id === entry.created_by);
}
