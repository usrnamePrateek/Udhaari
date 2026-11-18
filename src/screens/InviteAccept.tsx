import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { ErrorBox, Page, Spinner } from '../components/Layout';

export default function InviteAccept() {
  const { token } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const info = useQuery({
    queryKey: ['invite', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('invite_info', { p_token: token });
      if (error) throw error;
      return (data as { ledger_name: string; inviter_name: string; member_name: string; valid: boolean }[])[0] ?? null;
    },
  });

  async function accept() {
    setBusy(true);
    const { data, error } = await supabase.rpc('accept_invite', { p_token: token });
    setBusy(false);
    if (error) return setError(error);
    await qc.invalidateQueries({ queryKey: ['ledgers'] });
    await qc.invalidateQueries({ queryKey: ['balances'] });
    nav(`/l/${data}`, { replace: true });
  }

  return (
    <Page title="Invitation" back="/">
      {info.isPending ? <Spinner /> : !info.data ? (
        <ErrorBox error={info.error ?? 'This invite link is not valid.'} />
      ) : (
        <div className="card p-6 text-center">
          <p className="text-lg">
            <b>{info.data.inviter_name}</b> invited you to share a ledger.
          </p>
          <p className="mt-2 text-sm text-slate-500">
            You'll join as <b>{info.data.member_name}</b>. You'll both be able to see and edit every entry, and each change is recorded.
          </p>
          {info.data.valid ? (
            <button className="btn-primary mt-6 w-full" onClick={accept} disabled={busy}>{busy ? 'Joining…' : 'Accept & open ledger'}</button>
          ) : (
            <ErrorBox error="This invite has expired or was already used. Ask for a new link." />
          )}
          <ErrorBox error={error} />
        </div>
      )}
    </Page>
  );
}
