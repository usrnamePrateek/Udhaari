import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useIsMutating } from '@tanstack/react-query';
import { formatMoney } from '../lib/money';

export function Page({ title, back, right, children }: { title: string; back?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-xl">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-teal-700 px-4 pb-3 pt-[max(.75rem,env(safe-area-inset-top))] text-white">
        {back && (
          <Link to={back} className="-ml-2 rounded-full p-2 hover:bg-white/10" aria-label="Back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
          </Link>
        )}
        <h1 className="flex-1 truncate text-lg font-bold">{title}</h1>
        {right}
      </header>
      <OfflineBanner />
      <main className="p-4">{children}</main>
    </div>
  );
}

function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  const pending = useIsMutating();
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (online && !pending) return null;
  return (
    <div className={`px-4 py-2 text-center text-sm ${online ? 'bg-sky-50 text-sky-800' : 'bg-amber-50 text-amber-800'}`}>
      {online ? 'Syncing…' : `Offline${pending ? ` · ${pending} change${pending > 1 ? 's' : ''} will sync when back online` : ' · showing saved data'}`}
    </div>
  );
}

export function Balance({ net, currency, name, size = 'md' }: { net: number; currency: string; name?: string; size?: 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'text-3xl' : 'text-base';
  if (net === 0) return <span className={`${cls} font-semibold text-slate-500`}>Settled up</span>;
  const owed = net > 0;
  return (
    <span className={`${cls} font-bold ${owed ? 'text-emerald-700' : 'text-rose-700'}`}>
      <span className="block text-xs font-medium uppercase tracking-wide opacity-80">
        {owed ? (name ? `${name} owes you` : 'You get') : name ? `You owe ${name}` : 'You owe'}
      </span>
      {formatMoney(net, currency)}
    </span>
  );
}

export function Spinner() {
  return <div className="py-10 text-center text-slate-400">Loading…</div>;
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : String(error);
  return <div className="my-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{msg}</div>;
}
