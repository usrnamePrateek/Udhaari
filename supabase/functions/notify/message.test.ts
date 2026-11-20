import { describe, expect, it } from 'vitest';
import { buildMessage, money, type EntrySnapshot, type MessageInput } from './message';

const RAHUL = 'm-rahul'; // actor
const PRIYA = 'm-priya'; // recipient

const base = (over: Partial<MessageInput> = {}): MessageInput => ({
  action: 'create',
  old: null,
  new: entry(),
  ledgerId: 'L1',
  entryId: 'E1',
  actorName: 'Rahul',
  recipientMemberId: PRIYA,
  memberNames: { [RAHUL]: 'Rahul', [PRIYA]: 'Priya' },
  netForRecipient: 0,
  currency: 'INR',
  ...over,
});

function entry(over: Partial<EntrySnapshot> = {}): EntrySnapshot {
  return { from_member: RAHUL, to_member: PRIYA, amount_paise: 50000, note: 'Dinner', occurred_on: '2026-11-01', ...over };
}

describe('money', () => {
  it('matches the app formatting', () => {
    expect(money(50000)).toBe('₹500');
    expect(money(123450)).toBe('₹1,234.50');
    expect(money(-12345678)).toBe('₹1,23,456.78');
  });
});

describe('buildMessage: create', () => {
  it('describes money the recipient received', () => {
    const msg = buildMessage(base({ netForRecipient: -50000 }));
    expect(msg.title).toBe('Rahul added an entry');
    expect(msg.body).toBe('Rahul gave you ₹500 · Dinner\nYou now owe Rahul ₹500');
    expect(msg.url).toBe('/l/L1/e/E1');
    expect(msg.tag).toBe('entry-E1');
  });

  it('describes money the recipient gave (recorded by the actor)', () => {
    const msg = buildMessage(base({ new: entry({ from_member: PRIYA, to_member: RAHUL }), netForRecipient: 30000 }));
    expect(msg.body).toBe('You gave Rahul ₹500 · Dinner\nRahul now owes you ₹300');
  });

  it('omits an empty note', () => {
    expect(buildMessage(base({ new: entry({ note: '' }) })).body.split('\n')[0]).toBe('Rahul gave you ₹500');
  });

  it('says settled when the balance is zero', () => {
    expect(buildMessage(base({ netForRecipient: 0 })).body).toMatch(/\nAll settled up$/);
  });
});

describe('buildMessage: update', () => {
  const update = (o: Partial<EntrySnapshot>, n: Partial<EntrySnapshot>, net = -60000) =>
    buildMessage(base({ action: 'update', old: entry(o), new: entry(n), netForRecipient: net }));

  it('lists an amount change', () => {
    const msg = update({}, { amount_paise: 60000 });
    expect(msg.title).toBe('Rahul edited an entry');
    expect(msg.body).toBe('Amount: ₹500 → ₹600\nYou now owe Rahul ₹600');
    expect(msg.url).toBe('/l/L1/e/E1');
  });

  it('lists date and note changes together', () => {
    const msg = update({}, { occurred_on: '2026-11-03', note: 'Dinner + cab' });
    expect(msg.body.split('\n')).toEqual(['Date: 1 Nov → 3 Nov', 'Note: Dinner → Dinner + cab', 'You now owe Rahul ₹600']);
  });

  it('shows (none) for added or removed notes', () => {
    expect(update({ note: '' }, { note: 'Rent' }).body).toContain('Note: (none) → Rent');
    expect(update({ note: 'Rent' }, { note: '' }).body).toContain('Note: Rent → (none)');
  });

  it('restates the whole entry when the direction flips', () => {
    const msg = update({}, { from_member: PRIYA, to_member: RAHUL, amount_paise: 70000 }, 70000);
    expect(msg.body).toBe('Now: You gave Rahul ₹700 · Dinner\nRahul now owes you ₹700');
  });

  it('still sends the balance when nothing visible changed', () => {
    expect(update({}, {}).body).toBe('You now owe Rahul ₹600');
  });
});

describe('buildMessage: delete / restore', () => {
  it('links to the ledger for deletes (the entry is gone)', () => {
    const msg = buildMessage(base({ action: 'delete', netForRecipient: 0 }));
    expect(msg.title).toBe('Rahul deleted an entry');
    expect(msg.body).toBe('Rahul gave you ₹500 · Dinner\nAll settled up');
    expect(msg.url).toBe('/l/L1');
  });

  it('links to the entry for restores', () => {
    const msg = buildMessage(base({ action: 'restore', netForRecipient: -50000 }));
    expect(msg.title).toBe('Rahul restored an entry');
    expect(msg.url).toBe('/l/L1/e/E1');
  });
});
