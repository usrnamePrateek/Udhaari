-- Web Push subscriptions: one row per device that has notifications turned on.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy "own subscriptions read" on public.push_subscriptions for select using (user_id = auth.uid());
create policy "own subscriptions delete" on public.push_subscriptions for delete using (user_id = auth.uid());
-- No insert/update policy: writes go through save_push_subscription below.

-- Save (or move) this device's subscription to the signed-in user.
-- Upserting on endpoint means a phone that switches accounts moves to the new account.
create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent;
end $$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;
