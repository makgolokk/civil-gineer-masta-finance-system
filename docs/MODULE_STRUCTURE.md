# Module Structure

This milestone starts reducing the size and risk of `cgm-app-v2.js` without changing the app's core workflows.

## Current Module Layout

- `src/modules/numberingService.js`
  Handles Supabase-safe number/code generation, period keys, duplicate checks, and local development fallback warnings.

- `src/modules/exportConfig.js`
  Resolves the export backend base URL for local and production export calls.

- `src/modules/exportBackendService.js`
  Frontend service wrapper for the FastAPI export backend endpoints. Professional quotation, invoice, receipt, and client statement PDFs require this backend so known client documents do not degrade into raw field/value browser PDFs.

- `src/modules/formatters.js`
  Shared BWP currency, long date, month, and date-time formatters.

- `src/modules/permissions.js`
  Role and record-action permission checks used by the UI.

- `src/modules/clientProjectUtils.js`
  Shared lookup helpers for clients, suppliers, accounts, services, project labels, quotation client names, and front-office client snapshots.

- `src/modules/dashboardUtils.js`
  Management dashboard period selection, period filtering, trend calculations, business health scoring, alerts, and decision summary calculations.

- `src/modules/tableUtils.js`
  Responsive table decoration, table filtering, normal table rendering, and compact report table rendering.

## Logic Moved Out Of `cgm-app-v2.js`

- Dashboard model calculations and health/alert/decision logic moved to `dashboardUtils.js`.
- Client, supplier, service, account, project, and quotation lookup helpers moved to `clientProjectUtils.js`.
- Responsive table labels, table filtering, and reusable table HTML helpers moved to `tableUtils.js`.
- Existing formatter and permission wrappers now consistently delegate to their modules.

## What Still Remains In `cgm-app-v2.js`

The large rendering and workflow handlers remain in `cgm-app-v2.js` for now:

- Page rendering for bookkeeping and accounting views
- Form submit handlers
- Modal workflows
- Record edit/void/archive/restore workflows
- Export dispatch and browser fallback downloads
- Document preview orchestration

These areas are higher risk because they combine UI rendering, state mutation, permissions, audit trail, numbering, Supabase save calls, and document exports.

## UI/UX Improvements In This Pass

- Export errors now use user-facing office language while technical detail stays in console output.
- Missing Supabase configuration is surfaced as a setup/data-status problem instead of silently failing.
- Excel report exports now prefer the backend `.xlsx` builder with title, company name, generated date, frozen headers, widths, currency formatting, and totals.
- Row action buttons are now compact icon buttons with accessible labels and hover titles.
- Mobile still shows action text so office users are not left guessing.
- Help guide content is collapsed into a cleaner single Help area using expandable cards.
- Floating quick-action styling is smaller and calmer.
- Desktop table/mobile label duplication is explicitly prevented with desktop-only CSS guards.
- Table helper logic now centralizes responsive `data-label` assignment.

## Recommended Next Refactor Milestones

1. Move document/report export assembly into `documentTemplates.js` and report modules.
2. Split form handlers by workflow: clients, sales documents, payments, expenses, suppliers, journals.
3. Move modal/confirmation helpers into a UI module.
4. Move record editing logic into dedicated record editor modules.
5. Add automated tests for dashboard calculations, payment allocation, numbering, permissions, and ledger posting before deeper workflow extraction.
6. Replace temporary broad Supabase RLS policies with Auth-backed role-safe policies.
