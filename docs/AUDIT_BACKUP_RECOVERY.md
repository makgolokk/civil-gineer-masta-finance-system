# Audit Trail, Backup, and Recovery

This pass strengthens the reliability layer around the Civil-Gineer Masta platform without changing the main workflows.

## Audit Trail

The app records audit entries for saves that include an audit action, including:

- user and role
- date and time
- record type and record/document number
- action performed
- old and new values
- reason for change

The Audit Log screen now shows human-readable summaries and filters for action, module, and date range. Raw JSON is still available in the detail modal for traceability.

## Manual Backups

Backups are downloaded from Settings > Data safety and recovery.

Backup files use a structured envelope:

- `schema`: `cgm-accounting-backup`
- `version`: backup schema version
- `createdAt`
- `createdBy`
- `reason`
- record counts
- full app state

Legacy raw JSON backups are still accepted if they contain recognizable CGM app state.

## Restore Safety

Before restoring, the app:

- validates that the selected file looks like a CGM backup
- shows backup metadata and record counts
- asks for a reason for the audit trail
- downloads an automatic pre-restore safety backup
- restores and syncs the selected backup to Supabase

## Local Recovery Copy

The browser stores a local recovery copy after successful app saves and after Supabase loads. If Supabase cannot load, the app can fall back to the latest local copy instead of opening empty.

This is not a replacement for manual backups. Manual backups are still recommended before settings changes, restores, month-end reviews, or major data cleanup.
