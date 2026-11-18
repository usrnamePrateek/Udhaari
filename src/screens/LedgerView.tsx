import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatMoney } from '../lib/money';
import { useEntries, useLedger, useSides } from '../hooks/useData';
import { Balance, ErrorBox, Page, Spinner } from '../components/Layout';

export default function LedgerView() {
  const { id } = useParams();
  const ledger = useLedger(id);
  const entries = useEntries(id);
  const { me, other } = useSides(ledger.data);

  if (ledger.isPending) return <Page title="" back="/"><Spinner /></Page>;
  if (!ledger.data || !me) return <Page title="Not found" back="/"><ErrorBox error={ledger.error ?? 'Ledger not found or you are not a member.'} /></Page>;

  const cur = ledger.data.currency;
  const list = entries.data ?? [];
  const net = list.reduce((s, e) => s + (e.from_member === me.id ? e.amount_paise : e.to_member === me.id ? -e.amount_paise : 0), 0);
  const name = other?.display_name ?? ledger.data.name;

  // Running balance (oldest → newest), shown next to each row.
  const running = new Map<string, number>();
  [...list].reverse().reduce((acc, e) => {
    const v = acc + (e.from_member === me.id ? e.amount_paise : -e.amount_paise);
    running.set(e.id, v);
    return v;
  }, 0);

  return (
    <Page title={name} back="/">
      <div className="card mb-4 p-5 text-center">
        <Balance net={net} currency={cur} name={name} size="lg" />
        {other && !other.user_id && <InviteButton ledgerId={ledger.data.id} memberId={other.id} name={name} />}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Link to={`/l/${id}/new?dir=gave`} className="btn bg-rose-600 text-white hover:bg-rose-700">I gave</Link>
        <Link to={`/l/${id}/new?dir=got`} className="btn bg-emerald-600 text-white hover:bg-emerald-700">I got</Link>
      </div>

      <ErrorBox error={entries.error} />
      {entries.isPending ? (
        <Spinner />
      ) : list.length === 0 ? (
        <p className="py-8 text-center text-slate-500">No entries yet.</p>
      ) : (
        <ul className="card divide-y divide-slate-100">
          {list.map((e) => {
            const gave = e.from_member === me.id;
            const run = running.get(e.id) ?? 0;
            return (
              <li key={e.id}>
                <Link to={`/l/${id}/e/${e.id}`} className="flex items-center gap-3 p-4 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{e.note || (gave ? `You gave ${name}` : `${name} gave you`)}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(e.occurred_on + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' · '}bal {run === 0 ? 'settled' : `${run > 0 ? '+' : '−'}${formatMoney(run, cur)}`}
                    </div>
                  </div>
                  <div className={`text-right font-bold ${gave ? 'text-rose-700' : 'text-emerald-700'}`}>
                    <div className="text-[10px] font-medium uppercase opacity-70">{gave ? 'You gave' : 'You got'}</div>
                    {formatMoney(e.amount_paise, cur)}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}

function InviteButton({ ledgerId, memberId, name }: { ledgerId: string; memberId: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function invite() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase
      .from('invites')
      .insert({ ledger_id: ledgerId, member_id: memberId })
      .select('token')
      .single();
    setBusy(false);
    if (error) return setError(error);
    const url = `${window.location.origin}/invite/${data.token}`;
    setLink(url);
    const text = `Join our Udhaari ledger so we can both track what's owed:`;
    if (navigator.share) {
      navigator.share({ title: 'Udhaari', text, url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url).catch(() => {});
    }
  }

  return (
    <div className="mt-4">
      <button className="btn-ghost w-full" onClick={invite} disabled={busy}>
        {busy ? 'Creating link…' : `Invite ${name} to view & edit`}
      </button>
      {link && (
        <div className="mt-2 text-left text-xs text-slate-500">
          Link copied or shared. Valid for 7 days:
          <input readOnly className="input mt-1 py-2 text-xs" value={link} onFocus={(e) => e.currentTarget.select()} />
          <a className="mt-2 block text-teal-700 underline" target="_blank" rel="noreferrer"
             href={`https://wa.me/?text=${encodeURIComponent('Join our Udhaari ledger: ' + link)}`}>Send on WhatsApp</a>
        </div>
      )}
      <ErrorBox error={error} />
    </div>
  );
}
