# Civil-Gineer Masta Platform Architecture SWOT

## Strengths

- The app has a strong business workflow: front-office capture feeds accounting records, ledgers, dashboards, statements, and reports.
- Supabase integration gives the platform a real persistence layer.
- Accounting logic is centralized in `cgm-services.js`, which helps statements, dashboards, and reports agree with one another.
- Export generation is separated into Python, which is the right tool for professional PDF and Excel documents.
- The line-item service-category model supports service profitability and future project profitability reporting.

## Weaknesses

- `cgm-app-v2.js` is still too large and carries UI rendering, workflow logic, permissions, exports, and form handling in one place.
- Role security is mostly enforced in the frontend. Supabase Row Level Security policies are still temporary development policies.
- Current document numbering is mostly app-state based. The schema now includes an atomic sequence function, but the UI still needs deeper integration with it.
- Export hosting is separate from Vercel and needs a production service URL configured.
- The codebase is not yet using a component framework structure despite React being installed.

## Opportunities

- Split the app into modules for clients, documents, bookkeeping, accounting, reporting, settings, permissions, and exports.
- Move critical numbering/posting/permission checks into Supabase functions or a backend API.
- Add Supabase Auth and strict RLS policies for Super Admin, Director, Accountant, Bookkeeper, Staff, and Viewer.
- Turn document templates into a full CGM brand system with controlled styles for quotations, invoices, receipts, statements, reminders, and reports.
- Add automated tests for totals, ledger posting, payment allocation, and document numbering.

## Threats

- Multi-user simultaneous capture can still cause conflicts until the frontend uses database-backed sequence reservations everywhere.
- Temporary open RLS policies are not acceptable for sensitive finance data.
- If the export service is not hosted, deployed users will only get browser fallback exports.
- Continued feature growth inside one large JS file will slow down maintenance and increase regression risk.

## Alignment Recommendation

The next phase should be architecture hardening: Supabase Auth/RLS, database-backed numbering, modular frontend files, production export API hosting, and tests around accounting calculations.
