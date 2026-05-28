# Audit Trail

The audit trail records important business actions for office accountability.

## Captured Fields

- date and time
- user and role
- action
- record type and record id/document number
- old value
- new value
- reason

The Audit Log screen provides readable summaries, filters by action/module/date, and detail views for traceability.

## Actions Expected To Be Logged

- create/edit of business records
- void/archive/restore actions
- settings changes
- backup creation
- backup restore

## Production Guidance

- Normal staff should use readable summaries first.
- Raw JSON is retained in the detail modal for traceability and investigation.
- Do not delete audit entries during backup cleanup or restore.
- If a Supabase save fails, the optimistic audit entry is removed locally so the log does not claim an unsaved action succeeded.
