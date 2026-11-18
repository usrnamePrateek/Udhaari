-- Remove a person from your list.
--  • If the other person never joined: delete the whole ledger.
--  • If they joined: you leave; they keep the full record (your member row becomes a placeholder).
-- Returns 'deleted' or 'left'.

create or replace function public.remove_ledger(p_ledger uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_me uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select id into v_me from ledger_members
   where ledger_id = p_ledger and user_id = auth.uid()
   for update;
  if not found then raise exception 'Ledger not found'; end if;

  if exists (select 1 from ledger_members
              where ledger_id = p_ledger and id <> v_me and user_id is not null) then
    update ledger_members set user_id = null where id = v_me;
    -- unused invites for this ledger are no longer needed
    delete from invites where ledger_id = p_ledger and accepted_at is null;
    return 'left';
  end if;

  delete from ledgers where id = p_ledger;
  return 'deleted';
end $$;

-- Deleting must go through remove_ledger so a shared record can't be wiped by one side.
drop policy if exists "creator deletes ledger" on public.ledgers;
