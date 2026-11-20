import { describe, expect, it } from 'vitest';
import { canEditEntry, entryDelta, netBalance, runningBalances, totalsByCurrency } from './ledger';
import type { Entry } from './types';

const ME = 'm-me';
const THEM = 'm-them';

let seq = 0;
function entry(from: string, to: string, amount: number, extra: Partial<Entry> = {}): Entry {
  seq++;
  return {
    id: `e${seq}`,
    ledger_id: 'l1',
    from_member: from,
    to_member: to,
    amount_paise: amount,
    note: '',
    occurred_on: '2026-11-01',
    created_by: 'u-me',
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    deleted_at: null,
    ...extra,
  };
}

describe('entryDelta', () => {
  it('is positive when I gave', () => {
    expect(entryDelta(entry(ME, THEM, 500), ME)).toBe(500);
  });
  it('is negative when I received', () => {
    expect(entryDelta(entry(THEM, ME, 500), ME)).toBe(-500);
  });
  it('is zero when I am not involved', () => {
    expect(entryDelta(entry('x', 'y', 500), ME)).toBe(0);
  });
});

describe('netBalance', () => {
  it('is 0 with no entries', () => {
    expect(netBalance([], ME)).toBe(0);
  });
  it('nets what I gave against what I got', () => {
    const list = [entry(ME, THEM, 50000), entry(THEM, ME, 20000), entry(ME, THEM, 1050)];
    expect(netBalance(list, ME)).toBe(31050);
  });
  it('is mirrored from the other side', () => {
    const list = [entry(ME, THEM, 50000), entry(THEM, ME, 20000)];
    expect(netBalance(list, THEM)).toBe(-netBalance(list, ME));
  });
  it('can settle to exactly zero', () => {
    expect(netBalance([entry(ME, THEM, 700), entry(THEM, ME, 700)], ME)).toBe(0);
  });
});

describe('runningBalances', () => {
  it('accumulates from oldest to newest for a newest-first list', () => {
    const oldest = entry(ME, THEM, 1000);
    const middle = entry(THEM, ME, 300);
    const newest = entry(ME, THEM, 50);
    const run = runningBalances([newest, middle, oldest], ME);
    expect(run.get(oldest.id)).toBe(1000);
    expect(run.get(middle.id)).toBe(700);
    expect(run.get(newest.id)).toBe(750);
  });
  it('ends at the net balance', () => {
    const list = [entry(ME, THEM, 10), entry(THEM, ME, 40), entry(ME, THEM, 5)];
    expect(runningBalances(list, ME).get(list[0].id)).toBe(netBalance(list, ME));
  });
  it('is empty for no entries', () => {
    expect(runningBalances([], ME).size).toBe(0);
  });
});

describe('totalsByCurrency', () => {
  it('splits positive and negative nets into get / owe', () => {
    const t = totalsByCurrency([
      { currency: 'INR', net: 50000 },
      { currency: 'INR', net: -20000 },
      { currency: 'INR', net: 1000 },
      { currency: 'INR', net: 0 },
    ]);
    expect(t.get('INR')).toEqual({ get: 51000, owe: 20000 });
  });
  it('keeps currencies separate', () => {
    const t = totalsByCurrency([
      { currency: 'INR', net: 100 },
      { currency: 'USD', net: -200 },
    ]);
    expect(t.get('INR')).toEqual({ get: 100, owe: 0 });
    expect(t.get('USD')).toEqual({ get: 0, owe: 200 });
  });
  it('is empty for no ledgers', () => {
    expect(totalsByCurrency([]).size).toBe(0);
  });
});

describe('canEditEntry', () => {
  const me = { user_id: 'u-me' };
  const members = [{ user_id: 'u-me' }, { user_id: 'u-them' }];

  it('lets me edit my own entry', () => {
    expect(canEditEntry({ created_by: 'u-me' }, me, members)).toBe(true);
  });
  it("blocks editing the other member's entry", () => {
    expect(canEditEntry({ created_by: 'u-them' }, me, members)).toBe(false);
  });
  it('allows editing when the creator has left the ledger', () => {
    expect(canEditEntry({ created_by: 'u-them' }, me, [{ user_id: 'u-me' }, { user_id: null }])).toBe(true);
  });
  it('allows editing when created_by is null (deleted account or unsynced offline entry)', () => {
    expect(canEditEntry({ created_by: null }, me, members)).toBe(true);
  });
});
