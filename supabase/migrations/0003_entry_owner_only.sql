-- Only the person who added an entry can edit, delete or restore it.
-- Exception: if that person no longer has access to the ledger (left via remove_ledger,
-- or deleted their account so created_by is null), the remaining member may change it.
-- Updates without a signed-in user (dashboard / service role) are not restricted.

create or replace function public.entries_before_write()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if auth.uid() is not null
       and old.created_by is not null
       and old.created_by <> auth.uid()
       and exists (select 1 from ledger_members
                   where ledger_id = old.ledger_id and user_id = old.created_by) then
      raise exception 'Only the person who added this entry can change or delete it';
    end if;

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
