import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { formatMoney } from '../lib/money';
import { useBalances, useLedgers } from '../hooks/useData';
import { useUserId } from '../hooks/useSession';
import { Balance, ErrorBox, Page, Spinner } from '../components/Layout';
import { InstallCard } from '../components/Pwa';

export default function Home() {
  const uid = useUserId();
  const ledgers = useLedgers();
  const balances = useBalances();
  const [adding, setAdding] = useState(false);

  const rows = (ledgers.data ?? []).map((l) => {
    const me = l.ledger_members.find((m) => m.user_id === uid);
    const other = l.ledger_members.find((m) => m.id !== me?.id);
    return { l, me, other, net: me ? balances.data?.[me.id] ?? 0 : 0 };
  });

  // Totals per currency
  const totals = new Map<string, { get: number; owe: number }>();
  for (const r of rows) {
    const t = totals.get(r.l.currency) ?? { get: 0, owe: 0 };
    if (r.net > 0) t.get += r.net;
    else t.owe -= r.net;
    totals.set(r.l.currency, t);
  }

  return (
    <Page
      title="Udhaari"
      right={
        <Link to="/me" className="rounded-full p-2 hover:bg-white/10" aria-label="Profile">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
        </Link>
      }
    >
      {[...totals].map(([cur, t]) => (
        <div key={cur} className="card mb-4 grid grid-cols-2 divide-x divide-slate-200">
          <div className="p-4">
            <div className="text-xs uppercase text-slate-500">You'll get</div>
            <div className="text-xl font-bold text-emerald-700">{formatMoney(t.get, cur)}</div>
          </div>
          <div className="p-4">
            <div className="text-xs uppercase text-slate-500">You owe</div>
            <div className="text-xl font-bold text-rose-700">{formatMoney(t.owe, cur)}</div>
          </div>
        </div>
      ))}

      <InstallCard />
      <ErrorBox error={ledgers.error} />
      {ledgers.isPending ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-slate-500">No one here yet. Add someone you lend money to or borrow from.</p>
      ) : (
        <ul className="card divide-y divide-slate-100">
          {rows.map(({ l, other, net }) => (
            <li key={l.id}>
              <Link to={`/l/${l.id}`} className="flex items-center gap-3 p-4 hover:bg-slate-50">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-100 font-bold text-teal-800">
                  {(other?.display_name ?? l.name).slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{other?.display_name ?? l.name}</div>
                  <div className="text-xs text-slate-500">{other?.user_id ? 'Shared ledger' : 'Not joined yet'}</div>
                </div>
                <div className="text-right">
                  <Balance net={net} currency={l.currency} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {adding ? <AddPerson onDone={() => setAdding(false)} /> : (
        <button className="btn-primary fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-6 rounded-full shadow-lg" onClick={() => setAdding(true)}>
          + Add person
        </button>
      )}
    </Page>
  );
}

function AddPerson({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const qc = useQueryClient();
  const nav = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc('create_ledger', { p_other_name: name.trim() });
    setBusy(false);
    if (error) return setError(error);
    await qc.invalidateQueries({ queryKey: ['ledgers'] });
    onDone();
    nav(`/l/${data}`);
  }

  return (
    <form onSubmit={submit} className="card mt-4 flex flex-col gap-3 p-4">
      <label className="text-sm font-medium">Who is this ledger with?</label>
      <input className="input" autoFocus required placeholder="e.g. Rahul" value={name} onChange={(e) => setName(e.target.value)} />
      <ErrorBox error={error} />
      <div className="flex gap-2">
        <button type="button" className="btn-ghost flex-1" onClick={onDone}>Cancel</button>
        <button className="btn-primary flex-1" disabled={busy || !name.trim()}>Add</button>
      </div>
    </form>
  );
}
