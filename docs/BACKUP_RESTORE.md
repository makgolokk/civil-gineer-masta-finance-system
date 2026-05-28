# Backup and Restore

Backups are available in Settings > Data safety and recovery.

## Backup Contents

The backup envelope includes:

- schema and version
- created date and creator
- reason/source
- record counts
- full app state, including clients, projects, quotations, invoices, payments, expenses, supplier bills, users, settings, counters, and audit log

Legacy raw JSON backups are still accepted when recognizable CGM records are present.

## Restore Safety

Restore is intentionally guarded:

- validates the selected file before overwrite
- shows backup metadata and record counts
- asks for a restore reason
- downloads an automatic pre-restore safety backup
- saves restored data back to Supabase
- records the restore in the audit log

## Production Rules

- Do not restore over live data without downloading a fresh backup first.
- Do not manually edit document counters unless recovering from a verified numbering issue.
- Do not delete audit log entries from backup files.
- After restore, manually verify dashboard totals, client statements, invoices, receipts, reports, and settings.
