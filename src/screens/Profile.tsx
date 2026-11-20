import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSession } from '../hooks/useSession';
import { ErrorBox, Page } from '../components/Layout';
import { InstallButton } from '../components/Pwa';
import { NotificationsToggle } from '../components/Notifications';
import { disablePush } from '../lib/push';

export default function Profile() {
  const { session } = useSession();
  const uid = session!.user.id;
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    supabase.from('profiles').select('display_name').eq('id', uid).single()
      .then(({ data }) => data && setName(data.display_name));
  }, [uid]);

  async function signOut() {
    // Stop this device getting the account's notifications once signed out.
    await disablePush().catch(() => {});
    await supabase.auth.signOut();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = name.trim();
    const a = await supabase.from('profiles').update({ display_name: n }).eq('id', uid);
    if (a.error) return setError(a.error);
    // Also update how I appear inside every ledger.
    const b = await supabase.from('ledger_members').update({ display_name: n }).eq('user_id', uid);
    if (b.error) return setError(b.error);
    qc.invalidateQueries({ queryKey: ['ledgers'] });
    setMsg('Saved');
  }

  return (
    <Page title="Profile" back="/">
      <form onSubmit={save} className="card flex flex-col gap-3 p-4">
        <div className="text-sm text-slate-500">Signed in as {session!.user.email}</div>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Your name (shown to others)</span>
          <input className="input" required value={name} onChange={(e) => { setName(e.target.value); setMsg(null); }} />
        </label>
        <button className="btn-primary">Save</button>
        {msg && <div className="text-sm text-emerald-700">{msg}</div>}
        <ErrorBox error={error} />
      </form>
      <NotificationsToggle />
      <div className="mt-6"><InstallButton /></div>
      <button className="btn-ghost mt-3 w-full" onClick={signOut}>Sign out</button>
    </Page>
  );
}
