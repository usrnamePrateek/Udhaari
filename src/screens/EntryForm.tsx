import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { SAVE_ENTRY } from '../lib/queryClient';
import { formatMoney, paiseToInput, parseToPaise, today } from '../lib/money';
import type { Entry, EntryInput, HistoryRow, Member } from '../lib/types';
import { useEntries, useHistory, useLedger, useSides } from '../hooks/useData';
import { ErrorBox, Page, Spinner } from '../components/Layout';

export default function EntryForm() {
  const { id, entryId } = useParams();
  const ledger = useLedger(id);
  const entries = useEntries(id);
  const { me, other } = useSides(ledger.data);
  const existing = entryId ? entries.data?.find((e) => e.id === entryId) : undefined;

  if (ledger.isPending || (entryId && entries.isPending)) return <Page title="" back={`/l/${id}`}><Spinner /></Page>;
  if (!ledger.data || !me || !other) return <Page title="Not found" back="/"><ErrorBox error="Ledger not found." /></Page>;
  if (entryId && !existing) return <Page title="Not found" back={`/l/${id}`}><ErrorBox error="This entry was deleted." /></Page>;

  const members = ledger.data.ledger_members;
  if (existing && !canEdit(existing, me, members)) {
    return <ReadOnly ledgerId={ledger.data.id} currency={ledger.data.currency} me={me} entry={existing} members={members} />;
  }

  return <Form key={existing?.id ?? 'new'} ledgerId={ledger.data.id} currency={ledger.data.currency} me={me} other={other} existing={existing} members={members} />;
}

/**
 * Mirrors the database rule (migration 0003): only whoever added an entry may change it,
 * unless they no longer have access to the ledger. Null created_by = account gone, or a
 * freshly added offline entry that hasn't synced yet.
 */
function canEdit(entry: Entry, me: Member, members: Member[]): boolean {
  if (!entry.created_by || entry.created_by === me.user_id) return true;
  return !members.some((m) => m.user_id === entry.created_by);
}

function ReadOnly({ ledgerId, currency, me, entry, members }: {
  ledgerId: string; currency: string; me: Member; entry: Entry; members: Member[];
}) {
  const name = (memberId: string) => (memberId === me.id ? 'You' : members.find((m) => m.id === memberId)?.display_name ?? '?');
  const owner = members.find((m) => m.user_id === entry.created_by)?.display_name ?? 'the other person';
  const gave = entry.from_member === me.id;
  return (
    <Page title="Entry" back={`/l/${ledgerId}`}>
      <div className="card p-5">
        <div className="text-sm text-slate-500">{name(entry.from_member)} gave {name(entry.to_member) === 'You' ? 'you' : name(entry.to_member)}</div>
        <div className={`mt-1 text-3xl font-bold ${gave ? 'text-rose-700' : 'text-emerald-700'}`}>{formatMoney(entry.amount_paise, currency)}</div>
        <div className="mt-3 text-sm text-slate-600">
          {new Date(entry.occurred_on + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
        {entry.note && <div className="mt-1 text-slate-800">{entry.note}</div>}
      </div>
      <div className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-600">
        Added by <b>{owner}</b>. Only they can edit or delete it.
      </div>
      <History entryId={entry.id} members={members} me={me} currency={currency} />
    </Page>
  );
}

function Form({ ledgerId, currency, me, other, existing, members }: {
  ledgerId: string; currency: string; me: Member; other: Member; existing?: Entry; members: Member[];
}) {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const save = useMutation<void, Error, EntryInput>({ mutationKey: SAVE_ENTRY });

  const [gave, setGave] = useState(existing ? existing.from_member === me.id : params.get('dir') !== 'got');
  const [amount, setAmount] = useState(existing ? paiseToInput(existing.amount_paise) : '');
  const [date, setDate] = useState(existing?.occurred_on ?? today());
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent, deleted = false) {
    e.preventDefault();
    const paise = parseToPaise(amount);
    if (!paise) return setError('Enter a valid amount');
    const input: EntryInput = {
      id: existing?.id ?? crypto.randomUUID(),
      ledger_id: ledgerId,
      from_member: gave ? me.id : other.id,
      to_member: gave ? other.id : me.id,
      amount_paise: paise,
      note: note.trim(),
      occurred_on: date,
      deleted_at: deleted ? new Date().toISOString() : null,
    };
    // Fire and forget: optimistic + queued if offline (see lib/queryClient.ts).
    save.mutate(input);
    nav(`/l/${ledgerId}`, { replace: true });
  }

  return (
    <Page title={existing ? 'Edit entry' : 'New entry'} back={`/l/${ledgerId}`}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-200 p-1">
          <button type="button" onClick={() => setGave(true)}
            className={`rounded-lg py-2 font-semibold ${gave ? 'bg-rose-600 text-white shadow' : 'text-slate-600'}`}>
            I gave {other.display_name}
          </button>
          <button type="button" onClick={() => setGave(false)}
            className={`rounded-lg py-2 font-semibold ${!gave ? 'bg-emerald-600 text-white shadow' : 'text-slate-600'}`}>
            {other.display_name} gave me
          </button>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Amount ({currency})</span>
          <input className="input text-2xl font-bold" inputMode="decimal" autoFocus={!existing} required placeholder="0"
            value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Date</span>
          <input className="input" type="date" required value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Note</span>
          <input className="input" placeholder="e.g. Dinner, rent, cab" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        {error && <ErrorBox error={error} />}
        <button className="btn-primary">{existing ? 'Save changes' : 'Add entry'}</button>
        {existing && (
          <button type="button" className="btn-danger"
            onClick={(e) => { if (confirm('Delete this entry? It stays in the history.')) submit(e, true); }}>
            Delete entry
          </button>
        )}
      </form>

      {existing && <History entryId={existing.id} members={members} me={me} currency={currency} />}
    </Page>
  );
}

function History({ entryId, members, me, currency }: { entryId: string; members: Member[]; me: Member; currency: string }) {
  const history = useHistory(entryId);
  const who = (uid: string | null) =>
    uid === me.user_id ? 'You' : members.find((m) => m.user_id === uid)?.display_name ?? 'Someone';
  const memberName = (id: string) => (id === me.id ? 'you' : members.find((m) => m.id === id)?.display_name ?? '?');

  function describe(h: HistoryRow): string[] {
    const n = h.new, o = h.old;
    if (!n) return [];
    if (h.action === 'create') return [`${memberName(n.from_member)} → ${memberName(n.to_member)} · ${formatMoney(n.amount_paise, currency)}`];
    if (h.action !== 'update' || !o) return [];
    const out: string[] = [];
    if (o.amount_paise !== n.amount_paise) out.push(`Amount ${formatMoney(o.amount_paise, currency)} → ${formatMoney(n.amount_paise, currency)}`);
    if (o.from_member !== n.from_member) out.push(`Direction flipped: now ${memberName(n.from_member)} → ${memberName(n.to_member)}`);
    if (o.occurred_on !== n.occurred_on) out.push(`Date ${o.occurred_on} → ${n.occurred_on}`);
    if (o.note !== n.note) out.push(`Note "${o.note}" → "${n.note}"`);
    return out;
  }

  const verb = { create: 'added this', update: 'edited', delete: 'deleted', restore: 'restored' } as const;

  return (
    <section className="mt-8">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">History</h2>
      {history.isPending ? <Spinner /> : (
        <ol className="card divide-y divide-slate-100">
          {(history.data ?? []).map((h) => (
            <li key={h.id} className="p-3 text-sm">
              <div><b>{who(h.changed_by)}</b> {verb[h.action]}
                <span className="ml-2 text-xs text-slate-400">{new Date(h.changed_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
              {describe(h).map((d) => <div key={d} className="text-slate-600">{d}</div>)}
            </li>
          ))}
          {history.data?.length === 0 && <li className="p-3 text-sm text-slate-500">Not synced yet.</li>}
        </ol>
      )}
    </section>
  );
}
