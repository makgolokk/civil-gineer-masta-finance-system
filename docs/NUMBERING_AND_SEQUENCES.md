# Numbering and Sequences

Civil-Gineer Masta uses Supabase-backed numbering for new official records. Existing saved records are not renumbered.

## How Numbering Works

The app calls the Supabase RPC function `public.next_app_number(sequence_key, prefix, period_key)` before saving a new official record. The RPC updates `public.app_sequences` atomically inside PostgreSQL, which prevents two users from receiving the same number at the same time.

Numbers without a period use this format:

```text
INV-0001
RCT-0001
EXP-0001
```

Month/year codes use this format:

```text
CL-2026-05-0001
PRJ-2026-05-0001
```

## Records Using Supabase RPC Numbering

- Client internal numbers: `C-0001`
- Client codes: `CL-YYYY-MM-0001`
- Project codes: `PRJ-YYYY-MM-0001`
- Quotation numbers: configured prefix, default `QT-0001`
- Invoice numbers: configured prefix, default `INV-0001`
- Receipt numbers: configured prefix, default `RCT-0001`
- Expense references: `EXP-0001`
- Supplier bill numbers: configured prefix, default `BILL-0001`
- Supplier payment references: `SPAY-0001`
- Cash transfer references: `CASH-0001`
- Journal entry numbers: `JNL-0001`

## Supabase Migration

Run the current `supabase-schema.sql` in Supabase SQL Editor before production use. It creates or updates:

- `public.app_sequences`
- `public.next_app_number(text, text, text)`
- unique indexes for client codes, project codes, quotation numbers, invoice numbers, receipt numbers, expense references, supplier bill numbers, supplier payment references, cash transaction numbers, and journal entry numbers
- reference columns for expenses and supplier payments

If unique index creation fails, the database already contains duplicate numbers. Resolve those duplicates manually before rerunning the migration.

## Duplicate Protection

The app checks generated numbers against loaded records before saving. If the number already exists locally, it requests another number from Supabase. Database unique indexes provide a final safety layer.

## Local Development Fallback

When running locally on `localhost` or `127.0.0.1`, the app can fall back to local counters if Supabase RPC numbering is unavailable. This is only for testing and logs a console warning:

```text
[CGM numbering] Development fallback used...
```

Production deployments should not rely on this fallback. On non-local hosts, numbering failures are shown to the user and the record is not saved.

## Required Environment Variables

Frontend:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_EXPORT_API_BASE_URL
```

`VITE_EXPORT_API_BASE_URL` is only required when using the Python export backend from production. Local browser fallback exports can still run without it, but professional production exports should point to the hosted export service.
