// Builds the notification text from the RECIPIENT's point of view.
// Pure and dependency-free so it runs in Deno (Edge Function) and Vitest alike.

export type EntrySnapshot = {
  from_member: string;
  to_member: string;
  amount_paise: number;
  note: string;
  occurred_on: string; // YYYY-MM-DD
};

export type MessageInput = {
  action: 'create' | 'update' | 'delete' | 'restore';
  old: EntrySnapshot | null;
  new: EntrySnapshot;
  ledgerId: string;
  entryId: string;
  actorName: string;
  recipientMemberId: string;
  /** member id → display name */
  memberNames: Record<string, string>;
  /** Recipient's net balance after the change, in paise. Positive = they are owed. */
  netForRecipient: number;
  currency: string;
};

export type Message = { title: string; body: string; url: string; tag: string };

/** Same output as formatMoney in src/lib/money.ts: "₹500", "₹1,234.50". */
export function money(paise: number, currency = 'INR'): string {
  const abs = Math.abs(paise);
  const decimals = abs % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(abs / 100);
}

function shortDate(ymd: string): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${ymd}T00:00:00Z`),
  );
}

export function buildMessage(m: MessageInput): Message {
  const name = (memberId: string, start = false) =>
    memberId === m.recipientMemberId ? (start ? 'You' : 'you') : m.memberNames[memberId] ?? 'Someone';

  const describe = (e: EntrySnapshot) =>
    `${name(e.from_member, true)} gave ${name(e.to_member)} ${money(e.amount_paise, m.currency)}` +
    (e.note ? ` · ${e.note}` : '');

  const balance =
    m.netForRecipient > 0
      ? `${m.actorName} now owes you ${money(m.netForRecipient, m.currency)}`
      : m.netForRecipient < 0
        ? `You now owe ${m.actorName} ${money(m.netForRecipient, m.currency)}`
        : 'All settled up';

  const entryUrl = `/l/${m.ledgerId}/e/${m.entryId}`;
  const ledgerUrl = `/l/${m.ledgerId}`;
  const tag = `entry-${m.entryId}`;

  switch (m.action) {
    case 'create':
      return { title: `${m.actorName} added an entry`, body: `${describe(m.new)}\n${balance}`, url: entryUrl, tag };

    case 'delete':
      return { title: `${m.actorName} deleted an entry`, body: `${describe(m.new)}\n${balance}`, url: ledgerUrl, tag };

    case 'restore':
      return { title: `${m.actorName} restored an entry`, body: `${describe(m.new)}\n${balance}`, url: entryUrl, tag };

    case 'update': {
      const o = m.old;
      const n = m.new;
      const changes: string[] = [];
      if (!o || o.from_member !== n.from_member || o.to_member !== n.to_member) {
        changes.push(`Now: ${describe(n)}`);
      } else {
        if (o.amount_paise !== n.amount_paise)
          changes.push(`Amount: ${money(o.amount_paise, m.currency)} → ${money(n.amount_paise, m.currency)}`);
        if (o.occurred_on !== n.occurred_on) changes.push(`Date: ${shortDate(o.occurred_on)} → ${shortDate(n.occurred_on)}`);
        if (o.note !== n.note) changes.push(`Note: ${o.note || '(none)'} → ${n.note || '(none)'}`);
      }
      return {
        title: `${m.actorName} edited an entry`,
        body: [...changes, balance].join('\n'),
        url: entryUrl,
        tag,
      };
    }
  }
}
