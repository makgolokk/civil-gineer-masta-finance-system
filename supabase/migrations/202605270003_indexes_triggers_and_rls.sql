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

do $$
declare
  trigger_record record;
begin
  for trigger_record in
    select * from (values
      ('users', 'set_users_updated_at'),
      ('clients', 'set_clients_updated_at'),
      ('suppliers', 'set_suppliers_updated_at'),
      ('projects', 'set_projects_updated_at'),
      ('quotations', 'set_quotations_updated_at'),
      ('invoices', 'set_invoices_updated_at'),
      ('payments', 'set_payments_updated_at'),
      ('expenses', 'set_expenses_updated_at'),
      ('supplier_bills', 'set_supplier_bills_updated_at'),
      ('supplier_payments', 'set_supplier_payments_updated_at'),
      ('journal_entries', 'set_journal_entries_updated_at'),
      ('cash_transactions', 'set_cash_transactions_updated_at'),
      ('audit_log', 'set_audit_log_updated_at'),
      ('company_settings', 'set_company_settings_updated_at')
    ) as trigger_values(table_name, trigger_name)
  loop
    if not exists (
      select 1
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = trigger_record.table_name
        and t.tgname = trigger_record.trigger_name
        and not t.tgisinternal
    ) then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
        trigger_record.trigger_name,
        trigger_record.table_name
      );
    end if;
  end loop;
end;
$$;

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

do $$
declare
  policy_record record;
begin
  for policy_record in
    select * from (values
      ('users', 'temporary anonymous development access to users'),
      ('clients', 'temporary anonymous development access to clients'),
      ('suppliers', 'temporary anonymous development access to suppliers'),
      ('projects', 'temporary anonymous development access to projects'),
      ('quotations', 'temporary anonymous development access to quotations'),
      ('invoices', 'temporary anonymous development access to invoices'),
      ('payments', 'temporary anonymous development access to payments'),
      ('expenses', 'temporary anonymous development access to expenses'),
      ('supplier_bills', 'temporary anonymous development access to supplier_bills'),
      ('supplier_payments', 'temporary anonymous development access to supplier_payments'),
      ('journal_entries', 'temporary anonymous development access to journal_entries'),
      ('cash_transactions', 'temporary anonymous development access to cash_transactions'),
      ('audit_log', 'temporary anonymous development access to audit_log'),
      ('company_settings', 'temporary anonymous development access to company_settings'),
      ('app_sequences', 'temporary anonymous development access to app_sequences')
    ) as policy_values(table_name, policy_name)
  loop
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = policy_record.table_name
        and policyname = policy_record.policy_name
    ) then
      execute format(
        'create policy %I on public.%I for all using (true) with check (true)',
        policy_record.policy_name,
        policy_record.table_name
      );
    end if;
  end loop;
end;
$$;
