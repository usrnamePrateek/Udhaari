export type Member = {
  id: string;
  ledger_id: string;
  user_id: string | null;
  display_name: string;
};

export type Ledger = {
  id: string;
  name: string;
  currency: string;
  created_by: string;
  created_at: string;
  ledger_members: Member[];
};

export type Entry = {
  id: string;
  ledger_id: string;
  from_member: string;
  to_member: string;
  amount_paise: number;
  note: string;
  occurred_on: string; // YYYY-MM-DD
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type HistoryRow = {
  id: number;
  entry_id: string;
  action: 'create' | 'update' | 'delete' | 'restore';
  changed_by: string | null;
  changed_at: string;
  old: Entry | null;
  new: Entry | null;
};

/** What the client sends when creating/updating an entry. */
export type EntryInput = Pick<
  Entry,
  'id' | 'ledger_id' | 'from_member' | 'to_member' | 'amount_paise' | 'note' | 'occurred_on' | 'deleted_at'
>;
