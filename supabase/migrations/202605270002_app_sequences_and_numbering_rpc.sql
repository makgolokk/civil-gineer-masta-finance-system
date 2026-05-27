-- Collision-safe application sequence store.
-- Each row represents the next value for one business sequence, optionally scoped by period_key.
-- Empty period_key sequences are used for official documents such as invoices, receipts, expenses,
-- supplier bills, journal entries, supplier payments, and cash transfer references.
-- Month/year period_key sequences are used for searchable client and project codes such as CL-2026-05-0001.
create table if not exists public.app_sequences (
  sequence_key text not null,
  period_key text not null default '',
  next_value bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (sequence_key, period_key)
);

comment on table public.app_sequences is 'Atomic sequence counters used by next_app_number() for collision-safe Civil-Gineer Masta business numbers.';
comment on column public.app_sequences.sequence_key is 'Logical sequence name, for example invoice, quotation, receipt, clientCode, projectCode, expense, supplierBill, journal, or cash.';
comment on column public.app_sequences.period_key is 'Optional YYYY-MM period scope for codes that include month/year. Empty string means one continuous sequence.';
comment on column public.app_sequences.next_value is 'The next numeric value to issue for this sequence and period.';

-- Atomic RPC used by the web app before saving new official records.
-- The insert/on-conflict update runs inside PostgreSQL, so two users cannot receive the same number.
create or replace function public.next_app_number(
  p_sequence_key text,
  p_prefix text,
  p_period_key text default ''
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_value bigint;
  clean_period text := coalesce(p_period_key, '');
begin
  insert into public.app_sequences(sequence_key, period_key, next_value)
  values (p_sequence_key, clean_period, 2)
  on conflict (sequence_key, period_key)
  do update set next_value = public.app_sequences.next_value + 1, updated_at = now()
  returning next_value - 1 into current_value;

  if clean_period = '' then
    return p_prefix || '-' || lpad(current_value::text, 4, '0');
  end if;

  return p_prefix || '-' || clean_period || '-' || lpad(current_value::text, 4, '0');
end;
$$;

comment on function public.next_app_number(text, text, text) is 'Returns the next formatted app number using app_sequences. Use period_key for month/year codes and an empty period for continuous document numbers.';
