# Export QA Checklist

Use this checklist before production releases that touch PDF, Excel, backend exports, frontend fallback exports, Render, Vercel, or document wording/layout.

## Export Modes

- Backend mode: Render export service is awake and `VITE_EXPORT_API_BASE_URL` points to it.
- Fallback mode: temporarily use an invalid export backend URL or stop Render access so the browser local export engine is used.
- Invalid backend response: point the export URL to a reachable endpoint that does not return a valid PDF/XLSX and confirm fallback still runs.
- Render sleeping/unavailable: wait for Render cold start or simulate timeout; export should show “Backend export unavailable. Generated using local office-ready export.”

## PDF Checks

- Quotation PDF: logo, letterhead, company registration/tax/contact details, quote number, issue date, client details, project details, itemized table, subtotal, VAT/tax when enabled, grand total, notes/exclusions, payment terms, prepared/approved by, footer, page number.
- Invoice PDF: logo, letterhead, invoice number, due date, client/project/service details, itemized table, paid/balance fields, totals, banking/payment terms, footer.
- Receipt PDF: logo, receipt number, received-from details, payment method/reference, amount received, linked invoice/balance summary, footer.
- Statement PDF: logo, statement number/date range, client details, transaction table, debit/credit/balance columns, closing balance, footer/page numbers.
- Report PDF: dashboard, client, project, expense, supplier, ledger, ageing, income statement, balance sheet, cash flow, and trial balance reports have title, generated date, styled table headers, readable wrapped rows, BWP formatting, and footer.

## Excel Checks

- Quotation Excel: company header, document title, generated date, document/client/project metadata, styled item table, formulas/totals, BWP currency formatting, wrapped text, usable column widths, print-ready A4 setup.
- Invoice Excel: same as quotation plus paid/balance fields where applicable.
- Receipt Excel: received-from/payment metadata, amount received, invoice total/paid/balance summary, BWP formatting.
- Statement Excel: client metadata, transaction table, debit/credit/balance formatting, closing balance, frozen table header.
- Reports Excel: client/project/expense/supplier/ledger/accounting reports have company header, report title, generated date, styled headers, borders, wrapped text, frozen headers, formulas for numeric summary totals, BWP number formats, useful sheet names, A4 page setup.

## Regression Checks

- Quotation creation still saves and previews/exports.
- Transfer to invoice still creates a valid invoice and does not overlap table controls.
- Invoice creation and receipt/payment recording still save.
- Supabase saving/loading still works.
- Audit trail entries still record create/edit/archive/void/transfer actions.
- Numbering still reserves unique quote, invoice, receipt, project, and client codes.
- All export/download buttons route through the hybrid export engine.
- Failed backend exports log technical details only to the developer console and show friendly user feedback.
