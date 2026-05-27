# Supabase CLI Migrations

The database source of truth for Civil-Gineer Masta is now `supabase/migrations/*.sql`.

`supabase-schema.sql` is still kept as a reference snapshot, but new database changes should be made as new timestamped migration files under `supabase/migrations/`.

## Setup

Install and sign in to the Supabase CLI. The CLI is installed as a project dev dependency, so use `npx supabase` or the npm scripts in this repo:

```bash
npm install
npx supabase login
```

Link this local repository to the correct Supabase project:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```

`YOUR_PROJECT_REF` is the project id in the Supabase URL:

```text
https://YOUR_PROJECT_REF.supabase.co
```

## Push Migrations Manually

From the project root, run:

```bash
npm run db:push
```

This runs:

```bash
supabase db push
```

The current migrations are intentionally written with `create table if not exists`, `alter table add column if not exists`, and `create index if not exists` so they can be applied safely to an existing database without dropping tables or data.

## Check Migration Status

Run:

```bash
npm run db:status
```

This runs:

```bash
supabase migration list
```

Use the output to compare local migration files with the linked remote database.

## Current Migration Files

- `202605270001_initial_required_tables.sql`: required application tables, `pgcrypto`, and the `set_updated_at()` helper.
- `202605270002_app_sequences_and_numbering_rpc.sql`: `app_sequences` and the atomic `next_app_number()` RPC used for safe numbering.
- `202605270003_indexes_triggers_and_rls.sql`: indexes, unique official-number protections, update triggers, RLS enablement, and current temporary access policies.

## GitHub Automation Later

GitHub Actions automation has been prepared in `.github/workflows/supabase-migrations.yml`.

It runs when migration files or Supabase config are pushed to `main`, and it can also be started manually from the GitHub Actions tab.

Add these repository secrets before enabling production migration pushes:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_PROJECT_ID
SUPABASE_DB_PASSWORD
```

Do not add these secrets to the repository. Add them only in GitHub repository settings or Supabase integration settings.

The workflow follows Supabase's recommended pattern: check out the repo, set up the Supabase CLI, link the project, list migrations, and run `supabase db push`.

You can still use Supabase's GitHub Integration separately from the Supabase dashboard if you want Supabase-managed branch previews later. For this project, GitHub Actions is the prepared deployment path.

## Important Safety Notes

- Do not edit old migration files after they have been pushed to production.
- Add a new timestamped migration for every future database change.
- Resolve duplicate document numbers before applying unique indexes if Supabase reports a conflict.
- The current RLS policies are temporary broad-access policies for the current app workflow. They should be tightened when real Supabase Auth and role-based backend security are introduced.
