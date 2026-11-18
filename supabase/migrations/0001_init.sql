-- Udhaari schema. Paste into Supabase Dashboard → SQL Editor and run once.

-- ───────────────────────── Tables ─────────────────────────

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.ledgers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  currency text not null default 'INR',
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

-- A member with user_id = null is a placeholder for someone not (yet) on the app.
create table public.ledger_members (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers on delete cascade,
  user_id uuid references auth.users on delete set null,
  display_name text not null check (length(trim(display_name)) > 0),
  created_at timestamptz not null default now(),
  unique (ledger_id, user_id)
);
create index on public.ledger_members (user_id);

-- "from_member gave amount to to_member"
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers on delete cascade,
  from_member uuid not null references public.ledger_members on delete cascade,
  to_member uuid not null references public.ledger_members on delete cascade,
  amount_paise bigint not null check (amount_paise > 0),
  note text not null default '',
  occurred_on date not null default current_date,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (from_member <> to_member)
);
create index on public.entries (ledger_id, occurred_on desc);

create table public.entry_history (
  id bigint generated always as identity primary key,
  entry_id uuid not null references public.entries on delete cascade,
  ledger_id uuid not null references public.ledgers on delete cascade,
  action text not null check (action in ('create', 'update', 'delete', 'restore')),
  changed_by uuid references auth.users on delete set null,
  changed_at timestamptz not null default now(),
  old jsonb,
  new jsonb
);
create index on public.entry_history (entry_id, changed_at);

create table public.invites (
  token uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers on delete cascade,
  member_id uuid not null references public.ledger_members on delete cascade,
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users on delete set null
);

-- ───────────────────────── Helpers ─────────────────────────

create or replace function public.is_member(p_ledger uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ledger_members where ledger_id = p_ledger and user_id = auth.uid()
  );
$$;

-- Profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Entry integrity: members must belong to the entry's ledger; immutable fields stay put.
create or replace function public.entries_before_write()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.ledger_id := old.ledger_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  if not exists (select 1 from ledger_members where id = new.from_member and ledger_id = new.ledger_id)
     or not exists (select 1 from ledger_members where id = new.to_member and ledger_id = new.ledger_id) then
    raise exception 'Entry members must belong to the ledger';
  end if;
  return new;
end $$;

create trigger entries_before_write
  before insert or update on public.entries
  for each row execute function public.entries_before_write();

-- Audit log.
create or replace function public.entries_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'create';
  elsif old.deleted_at is null and new.deleted_at is not null then
    v_action := 'delete';
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_action := 'restore';
  else
    -- skip no-op updates
    if (to_jsonb(old) - 'updated_at') = (to_jsonb(new) - 'updated_at') then
      return new;
    end if;
    v_action := 'update';
  end if;

  insert into entry_history (entry_id, ledger_id, action, changed_by, old, new)
  values (
    new.id, new.ledger_id, v_action, auth.uid(),
    case when tg_op = 'UPDATE' then to_jsonb(old) end,
    to_jsonb(new)
  );
  return new;
end $$;

create trigger entries_audit
  after insert or update on public.entries
  for each row execute function public.entries_audit();

-- ───────────────────────── RPCs ─────────────────────────

-- Create a ledger with me + a placeholder for the other person.
create or replace function public.create_ledger(p_other_name text, p_currency text default 'INR')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ledger uuid;
  v_me text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select display_name into v_me from profiles where id = auth.uid();

  insert into ledgers (name, currency, created_by)
  values (trim(p_other_name), coalesce(p_currency, 'INR'), auth.uid())
  returning id into v_ledger;

  insert into ledger_members (ledger_id, user_id, display_name)
  values (v_ledger, auth.uid(), coalesce(v_me, 'Me'));

  insert into ledger_members (ledger_id, user_id, display_name)
  values (v_ledger, null, trim(p_other_name));

  return v_ledger;
end $$;

-- Public-ish preview of an invite (no auth needed beyond being signed in).
create or replace function public.invite_info(p_token uuid)
returns table (ledger_name text, inviter_name text, member_name text, valid boolean)
language sql stable security definer set search_path = public as $$
  select l.name,
         coalesce(p.display_name, 'Someone'),
         m.display_name,
         (i.accepted_at is null and i.expires_at > now() and m.user_id is null)
  from invites i
  join ledgers l on l.id = i.ledger_id
  join ledger_members m on m.id = i.member_id
  left join profiles p on p.id = i.created_by
  where i.token = p_token;
$$;

create or replace function public.accept_invite(p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_inv invites%rowtype;
  v_name text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select * into v_inv from invites where token = p_token for update;
  if not found then raise exception 'Invite not found'; end if;

  -- Already a member? Just return the ledger.
  if exists (select 1 from ledger_members where ledger_id = v_inv.ledger_id and user_id = auth.uid()) then
    return v_inv.ledger_id;
  end if;

  if v_inv.accepted_at is not null then raise exception 'Invite already used'; end if;
  if v_inv.expires_at < now() then raise exception 'Invite expired'; end if;

  select display_name into v_name from profiles where id = auth.uid();

  update ledger_members
     set user_id = auth.uid()
   where id = v_inv.member_id and user_id is null;
  if not found then raise exception 'This spot is already taken'; end if;

  update invites set accepted_at = now(), accepted_by = auth.uid() where token = p_token;
  return v_inv.ledger_id;
end $$;

-- ───────────────────────── Balances ─────────────────────────

-- net_paise > 0 → this member has given more than received (is owed money).
create or replace view public.ledger_balances with (security_invoker = true) as
select m.ledger_id,
       m.id as member_id,
       coalesce(sum(case when e.from_member = m.id then e.amount_paise
                         when e.to_member = m.id then -e.amount_paise end), 0)::bigint as net_paise
from public.ledger_members m
left join public.entries e
  on e.ledger_id = m.ledger_id
 and e.deleted_at is null
 and (e.from_member = m.id or e.to_member = m.id)
group by m.ledger_id, m.id;

-- ───────────────────────── RLS ─────────────────────────

alter table public.profiles enable row level security;
alter table public.ledgers enable row level security;
alter table public.ledger_members enable row level security;
alter table public.entries enable row level security;
alter table public.entry_history enable row level security;
alter table public.invites enable row level security;

create policy "own profile read" on public.profiles for select using (id = auth.uid());
create policy "own profile update" on public.profiles for update using (id = auth.uid());

create policy "members read ledger" on public.ledgers for select using (public.is_member(id));
create policy "members rename ledger" on public.ledgers for update using (public.is_member(id));
create policy "creator deletes ledger" on public.ledgers for delete using (created_by = auth.uid());

create policy "members read members" on public.ledger_members for select using (public.is_member(ledger_id));
create policy "members rename members" on public.ledger_members for update using (public.is_member(ledger_id));
-- only display_name may be changed from the client
revoke update on public.ledger_members from authenticated, anon;
grant update (display_name) on public.ledger_members to authenticated;

create policy "members read entries" on public.entries for select using (public.is_member(ledger_id));
create policy "members add entries" on public.entries for insert with check (public.is_member(ledger_id));
create policy "members edit entries" on public.entries for update
  using (public.is_member(ledger_id)) with check (public.is_member(ledger_id));
-- no hard delete: use deleted_at

create policy "members read history" on public.entry_history for select using (public.is_member(ledger_id));
-- inserts only through the security-definer trigger

create policy "members read invites" on public.invites for select using (public.is_member(ledger_id));
create policy "members create invites" on public.invites for insert
  with check (
    public.is_member(ledger_id)
    and exists (select 1 from public.ledger_members m
                where m.id = member_id and m.ledger_id = invites.ledger_id and m.user_id is null)
  );

-- ───────────────────────── Realtime ─────────────────────────

alter publication supabase_realtime add table public.entries, public.ledger_members, public.ledgers;
