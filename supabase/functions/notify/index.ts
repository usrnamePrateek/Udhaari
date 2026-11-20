// Supabase Edge Function: called by a Database Webhook on INSERT into public.entry_history.
// Sends a Web Push notification to the *other* member(s) of the ledger.
//
// Secrets (npx supabase secrets set …): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { buildMessage, type EntrySnapshot, type MessageInput } from './message.ts';

type HistoryRow = {
  entry_id: string;
  ledger_id: string;
  action: MessageInput['action'];
  changed_by: string | null;
  old: EntrySnapshot | null;
  new: EntrySnapshot | null;
};

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  let payload: { type?: string; table?: string; record?: HistoryRow };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const h = payload.record;
  if (payload.type !== 'INSERT' || payload.table !== 'entry_history' || !h?.new) {
    return json({ skipped: 'not an entry_history insert' });
  }
  // Changes made from the dashboard / service role have no actor: don't notify.
  if (!h.changed_by) return json({ skipped: 'no actor' });

  const [membersRes, ledgerRes, balancesRes] = await Promise.all([
    db.from('ledger_members').select('id, user_id, display_name').eq('ledger_id', h.ledger_id),
    db.from('ledgers').select('currency').eq('id', h.ledger_id).single(),
    db.from('ledger_balances').select('member_id, net_paise').eq('ledger_id', h.ledger_id),
  ]);
  if (membersRes.error) return json({ error: membersRes.error.message }, 500);
  const members = membersRes.data;
  const currency = ledgerRes.data?.currency ?? 'INR';
  const net = Object.fromEntries((balancesRes.data ?? []).map((b) => [b.member_id, Number(b.net_paise)]));

  const actorName = members.find((m) => m.user_id === h.changed_by)?.display_name ?? 'Someone';
  const recipients = members.filter((m) => m.user_id && m.user_id !== h.changed_by);
  if (recipients.length === 0) return json({ skipped: 'no recipients' });

  const { data: subs, error: subsErr } = await db
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', recipients.map((r) => r.user_id!));
  if (subsErr) return json({ error: subsErr.message }, 500);
  if (!subs?.length) return json({ skipped: 'recipients have notifications off' });

  const memberNames = Object.fromEntries(members.map((m) => [m.id, m.display_name]));
  const sent: string[] = [];
  const expired: string[] = [];
  const failed: { id: string; status?: number; message: string }[] = [];

  await Promise.all(
    subs.map(async (s) => {
      const recipient = recipients.find((r) => r.user_id === s.user_id)!;
      const msg = buildMessage({
        action: h.action,
        old: h.old,
        new: h.new!,
        ledgerId: h.ledger_id,
        entryId: h.entry_id,
        actorName,
        recipientMemberId: recipient.id,
        memberNames,
        netForRecipient: net[recipient.id] ?? 0,
        currency,
      });
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(msg),
          { TTL: 60 * 60 * 24, urgency: 'normal' },
        );
        sent.push(s.id);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) expired.push(s.id); // device unsubscribed / app uninstalled
        else failed.push({ id: s.id, status, message: String((err as Error).message ?? err) });
      }
    }),
  );

  if (expired.length) await db.from('push_subscriptions').delete().in('id', expired);
  if (sent.length) await db.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).in('id', sent);

  console.log(JSON.stringify({ entry: h.entry_id, action: h.action, sent: sent.length, expired: expired.length, failed }));
  return json({ sent: sent.length, expired: expired.length, failed: failed.length });
});
