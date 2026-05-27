create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid null,
  name text not null,
  email text,
  phone text,
  role text not null default 'Bookkeeper',
  status text not null default 'active',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid null references public.users(id) on delete set null,
  name text not null,
  code text,
  email text,
  phone text,
  status text not null default 'active',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  status text not null default 'active',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid null references public.clients(id) on delete set null,
  code text,
  name text not null,
  status text not null default 'active',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid null references public.clients(id) on delete set null,
  project_id uuid null references public.projects(id) on delete set null,
  number text not null,
  document_date date,
  amount numeric(14, 2) not null default 0,
  status text not null default 'draft',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid null references public.clients(id) on delete set null,
  project_id uuid null references public.projects(id) on delete set null,
  quotation_id uuid null references public.quotations(id) on delete set null,
  number text not null,
  document_date date,
  due_date date,
  amount numeric(14, 2) not null default 0,
  status text not null default 'issued',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid null references public.invoices(id) on delete set null,
  client_id uuid null references public.clients(id) on delete set null,
  project_id uuid null references public.projects(id) on delete set null,
  receipt_number text,
  payment_date date,
  amount numeric(14, 2) not null default 0,
  status text not null default 'paid',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid null references public.projects(id) on delete set null,
  reference text,
  expense_date date,
  category text,
  vendor text,
  amount numeric(14, 2) not null default 0,
  status text not null default 'paid',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_bills (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid null references public.suppliers(id) on delete set null,
  project_id uuid null references public.projects(id) on delete set null,
  number text not null,
  bill_date date,
  due_date date,
  amount numeric(14, 2) not null default 0,
  status text not null default 'issued',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid null references public.suppliers(id) on delete set null,
  bill_id uuid null references public.supplier_bills(id) on delete set null,
  reference text,
  payment_date date,
  amount numeric(14, 2) not null default 0,
  status text not null default 'paid',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  number text,
  status text not null default 'posted',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cash_transactions (
  id uuid primary key default gen_random_uuid(),
  number text,
  status text not null default 'posted',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'active',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_settings (
  id text primary key default 'default',
  company_name text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients add column if not exists code text;
alter table public.expenses add column if not exists reference text;
alter table public.supplier_payments add column if not exists reference text;

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

create index if not exists idx_projects_client_id on public.projects(client_id);
create index if not exists idx_quotations_client_id on public.quotations(client_id);
create index if not exists idx_quotations_project_id on public.quotations(project_id);
create index if not exists idx_invoices_client_id on public.invoices(client_id);
create index if not exists idx_invoices_project_id on public.invoices(project_id);
create index if not exists idx_invoices_quotation_id on public.invoices(quotation_id);
create index if not exists idx_payments_invoice_id on public.payments(invoice_id);
create index if not exists idx_payments_client_id on public.payments(client_id);
create index if not exists idx_expenses_project_id on public.expenses(project_id);
create index if not exists idx_supplier_bills_supplier_id on public.supplier_bills(supplier_id);
create unique index if not exists idx_clients_code_unique on public.clients(code) where code is not null and code <> '';
create unique index if not exists idx_projects_code_unique on public.projects(code) where code is not null and code <> '';
create unique index if not exists idx_quotations_number_unique on public.quotations(number);
create unique index if not exists idx_invoices_number_unique on public.invoices(number);
create unique index if not exists idx_payments_receipt_number_unique on public.payments(receipt_number) where receipt_number is not null and receipt_number <> '';
create unique index if not exists idx_expenses_reference_unique on public.expenses(reference) where reference is not null and reference <> '';
create unique index if not exists idx_supplier_bills_number_unique on public.supplier_bills(number);
create unique index if not exists idx_supplier_payments_reference_unique on public.supplier_payments(reference) where reference is not null and reference <> '';
create unique index if not exists idx_journal_entries_number_unique on public.journal_entries(number) where number is not null and number <> '';
create unique index if not exists idx_cash_transactions_number_unique on public.cash_transactions(number) where number is not null and number <> '';

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at before update on public.users for each row execute function public.set_updated_at();
drop trigger if exists set_clients_updated_at on public.clients;
create trigger set_clients_updated_at before update on public.clients for each row execute function public.set_updated_at();
drop trigger if exists set_suppliers_updated_at on public.suppliers;
create trigger set_suppliers_updated_at before update on public.suppliers for each row execute function public.set_updated_at();
drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at before update on public.projects for each row execute function public.set_updated_at();
drop trigger if exists set_quotations_updated_at on public.quotations;
create trigger set_quotations_updated_at before update on public.quotations for each row execute function public.set_updated_at();
drop trigger if exists set_invoices_updated_at on public.invoices;
create trigger set_invoices_updated_at before update on public.invoices for each row execute function public.set_updated_at();
drop trigger if exists set_payments_updated_at on public.payments;
create trigger set_payments_updated_at before update on public.payments for each row execute function public.set_updated_at();
drop trigger if exists set_expenses_updated_at on public.expenses;
create trigger set_expenses_updated_at before update on public.expenses for each row execute function public.set_updated_at();
drop trigger if exists set_supplier_bills_updated_at on public.supplier_bills;
create trigger set_supplier_bills_updated_at before update on public.supplier_bills for each row execute function public.set_updated_at();
drop trigger if exists set_supplier_payments_updated_at on public.supplier_payments;
create trigger set_supplier_payments_updated_at before update on public.supplier_payments for each row execute function public.set_updated_at();
drop trigger if exists set_journal_entries_updated_at on public.journal_entries;
create trigger set_journal_entries_updated_at before update on public.journal_entries for each row execute function public.set_updated_at();
drop trigger if exists set_cash_transactions_updated_at on public.cash_transactions;
create trigger set_cash_transactions_updated_at before update on public.cash_transactions for each row execute function public.set_updated_at();
drop trigger if exists set_audit_log_updated_at on public.audit_log;
create trigger set_audit_log_updated_at before update on public.audit_log for each row execute function public.set_updated_at();
drop trigger if exists set_company_settings_updated_at on public.company_settings;
create trigger set_company_settings_updated_at before update on public.company_settings for each row execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.clients enable row level security;
alter table public.suppliers enable row level security;
alter table public.projects enable row level security;
alter table public.quotations enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.supplier_bills enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.journal_entries enable row level security;
alter table public.cash_transactions enable row level security;
alter table public.audit_log enable row level security;
alter table public.company_settings enable row level security;
alter table public.app_sequences enable row level security;

drop policy if exists "temporary anonymous development access to users" on public.users;
create policy "temporary anonymous development access to users" on public.users for all using (true) with check (true);
drop policy if exists "temporary anonymous development access to clients" on public.clients;
create policy "temporary anonymous development access to clients" on public.clients for all using (true) with check (true);
drop policy if exists "temporary anonymous development access to suppliers" on public.suppliers;
create policy "temporary anonymous development access to suppliers" on public.suppliers for all using (true) with check (true);
drop policy if exists "temporary anonymous development access to projects" on public.projects;
create policy "temporary anonymous development access to projects" on public.projects for all using (true) with check (true);
drop policy if exists "temporary anonymous development access to quotations" on public.quotations;
create policy "temporary anonymous development access to quotations" on public.quotations for all using (true) with check (true);
drop policy if exists "temporary anonymous development access to invoices" on public.invoices;
create policy "temporary anonymous development access to invoices" on public.invoices for all using (true) with check (true);
drop policy if exists "temporary anonymous development access to payments" on public.payments;
create policy "temporary anonymous development access to payments" on public.payments for all using (true) with check (true);
drop policy if exists "temporary anonymous development access to expenses" on public.expenses;
create policy "temporary anonymous development access to expenses" on public.expenses for all using (true) with check (true);
drop policy if exists "temporary anonymous development access to supplier_bills" on public.supplier_bills;
create policy "temporary anonymous development access to supplier_bills" on public.supplier_bills for all using (true) with check (true);
drop policy if exists "temporary anonymous development access to supplier_payments" on public.supplier_payments;
create policy "temporary anonymous development access to supplier_payments" on public.supplier_payments for all using (true) with check (true);
drop policy if exists "temporary anonymous development access to journal_entries" on public.journal_entries;
create policy "temporary anonymous development access to journal_entries" on public.journal_entries for all using (true) with check (true);
drop policy if exists "temporary anonymous development access to cash_transactions" on public.cash_transactions;
create policy "temporary anonymous development access to cash_transactions" on public.cash_transactions for all using (true) with check (true);
drop policy if exists "temporary anonymous development access to audit_log" on public.audit_log;
create policy "temporary anonymous development access to audit_log" on public.audit_log for all using (true) with check (true);
drop policy if exists "temporary anonymous development access to company_settings" on public.company_settings;
create policy "temporary anonymous development access to company_settings" on public.company_settings for all using (true) with check (true);
drop policy if exists "temporary anonymous development access to app_sequences" on public.app_sequences;
create policy "temporary anonymous development access to app_sequences" on public.app_sequences for all using (true) with check (true);
