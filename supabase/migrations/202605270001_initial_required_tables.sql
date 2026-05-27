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
