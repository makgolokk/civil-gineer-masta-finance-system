import { asNumber, asText, dateValue, documentSubtotal, documentTax, documentTotal, lineAmount, moneyValue, titleCase } from "./exportFormatters.js";

export function exportCurrency(context = {}) {
  return context.settings?.documentSettings?.currency || "BWP";
}

export function companyProfile(context = {}) {
  const profile = context.settings?.companyProfile || {};
  return { ...profile, logoPath: normalizeLogoPath(profile.logoPath) };
}

export function documentSettings(context = {}) {
  return context.settings?.documentSettings || {};
}

export function normalizeLogoPath(value = "") {
  const path = asText(value);
  if (!path || path === "assets/logo.png" || path === "/assets/logo.png") return "/logo.png";
  if (path === "assets/logo-doc.png" || path === "/assets/logo-doc.png") return "/logo-doc.png";
  return path;
}

export function bankingRows(company = {}) {
  const bank = company.bankingDetails || {};
  return [
    ["Bank", bank.bank],
    ["Account Holder", bank.accountHolder],
    ["Account Type", bank.accountType],
    ["Account Number", bank.accountNumber],
    ["Branch", [bank.branchName, bank.branchCode].filter(Boolean).join(" | ")],
  ].filter(([, value]) => asText(value));
}

export function companyContactLines(company = {}) {
  const reg = company.registrationNumber || company.regNumber || company.companyRegistration || "";
  const tax = company.taxVatNumber || company.taxNumber || company.vatNumber || company.tin || "";
  return [
    company.address,
    [company.phone, company.alternatePhone].filter(Boolean).join(" / "),
    company.email,
    company.website,
    [reg ? `Reg: ${reg}` : "", tax ? `Tax/VAT: ${tax}` : ""].filter(Boolean).join(" | "),
  ].filter((line) => asText(line));
}

export function termsText(company = {}, context = {}, document = {}) {
  return document.paymentTerms || company.defaultTerms || documentSettings(context).defaultPaymentTerms || "Payment due as agreed.";
}

export function findById(items = [], id = "") {
  return items.find((item) => item.id === id) || null;
}

export function clientForDocument(context = {}, document = {}) {
  return findById(context.clients, document.clientId) || document.clientSnapshot || {};
}

export function projectForDocument(context = {}, document = {}) {
  return findById(context.projects, document.projectId) || {};
}

export function serviceName(context = {}, serviceId = "") {
  return findById(context.services, serviceId)?.name || "";
}

export function documentNumber(document = {}, fallback = "") {
  return document.number || document.receiptNumber || document.statementNumber || fallback;
}

export function buildBusinessDocumentTemplate(kind, payload = {}) {
  const document = payload.document || {};
  const context = payload.context || {};
  const company = companyProfile(context);
  const docSettings = documentSettings(context);
  const client = clientForDocument(context, document);
  const project = projectForDocument(context, document);
  const currency = exportCurrency(context);
  const subtotal = documentSubtotal(document.items || []);
  const discount = asNumber(document.discount);
  const tax = documentTax(document);
  const total = documentTotal(document);
  const paid = asNumber(document.amountPaid);
  const balance = document.balanceDue !== undefined && document.balanceDue !== null ? asNumber(document.balanceDue) : Math.max(0, total - paid);
  const dueLabel = kind === "invoice" ? "Due date" : "Valid until";
  const dueDate = kind === "invoice" ? document.dueDate : document.validUntil;
  const title = titleCase(kind);
  const number = documentNumber(document, title);
  const vatEnabled = !!context.settings?.documentSettings?.vatEnabled || asNumber(document.taxRate) > 0 || tax > 0;
  const defaultNotes = company.defaultNotes || "";
  const terms = termsText(company, context, document);
  const bankRows = bankingRows(company);
  return {
    type: "business-document",
    kind,
    title,
    number,
    filenameTitle: `${title} ${number}`,
    company,
    companyLines: companyContactLines(company),
    tagline: company.letterhead || "",
    footerText: company.footerText || company.defaultNotes || "",
    context,
    currency,
    client: {
      name: client.name || "Prospective client",
      contact: client.contact || "",
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
    },
    details: [
      ["Document no.", number],
      ["Issue date", dateValue(document.date)],
      [dueLabel, dateValue(dueDate)],
      ["Project", document.projectName || project.name || document.projectCode || ""],
      ["Location", document.location || project.location || ""],
      ["Service", serviceName(context, document.serviceId)],
      ["Status", titleCase(document.status || "draft")],
    ],
    items: (document.items || []).map((item) => ({
      description: asText(item.description || item.name || "Item"),
      service: serviceName(context, item.serviceId || document.serviceId),
      qty: asNumber(item.qty ?? item.quantity ?? 1),
      unit: asText(item.unit || ""),
      rate: asNumber(item.rate ?? item.unitPrice ?? item.price),
      amount: lineAmount(item),
    })),
    totals: [
      ["Subtotal", subtotal],
      ...(discount ? [["Discount", discount]] : []),
      ...(vatEnabled ? [[`VAT / Tax ${asNumber(document.taxRate) || ""}%`.trim(), tax]] : []),
      ...(paid ? [["Amount paid", paid]] : []),
      ["Grand total", total],
      ...(paid || balance ? [["Balance due", balance]] : []),
    ],
    notes: [document.notes || defaultNotes, document.exclusions].filter(Boolean),
    paymentTerms: terms,
    terms,
    preparedBy: document.preparedBy || company.preparedBy || "",
    preparedByTitle: company.preparedByTitle || "Prepared by",
    approvedBy: document.approvedBy || company.approvedBy || "",
    approvedByTitle: company.approvedByTitle || "Approved / Client signature",
    bankingDetails: company.bankingDetails || {},
    bankingRows: bankRows,
    meta: [
      ["Client", client.name || "Prospective client"],
      ["Project", document.projectName || project.name || document.projectCode || ""],
      ["Date", dateValue(document.date)],
      ["Total", moneyValue(total, currency)],
      ["Payment terms", terms],
      ...bankRows.map(([label, value]) => [`Banking - ${label}`, value]),
    ],
  };
}

export function buildReceiptTemplate(payload = {}) {
  const receipt = payload.receipt || {};
  const context = payload.context || {};
  const invoice = findById(context.invoices, receipt.invoiceId) || {};
  const client = clientForDocument(context, invoice.clientId ? invoice : receipt);
  const company = companyProfile(context);
  const currency = exportCurrency(context);
  const invoiceTotal = documentTotal(invoice);
  const paidTotal = (context.payments || []).filter((payment) => payment.invoiceId === receipt.invoiceId).reduce((sum, payment) => sum + asNumber(payment.amount), 0);
  const number = receipt.receiptNumber || receipt.number || "Receipt";
  return {
    type: "receipt",
    kind: "receipt",
    title: "Receipt",
    number,
    filenameTitle: `Receipt ${number}`,
    company,
    companyLines: companyContactLines(company),
    tagline: company.letterhead || "",
    footerText: company.footerText || company.defaultNotes || "",
    context,
    currency,
    client: {
      name: client.name || "",
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
    },
    details: [
      ["Receipt no.", number],
      ["Issue date", dateValue(receipt.date)],
      ["Invoice", invoice.number || receipt.invoiceId || ""],
      ["Method", receipt.method || ""],
      ["Reference", receipt.reference || ""],
      ["Prepared by", receipt.preparedBy || company.preparedBy || ""],
    ],
    amountReceived: asNumber(receipt.amount),
    totals: [
      ["Invoice total", invoiceTotal],
      ["Total paid", paidTotal],
      ["Balance", Math.max(0, invoiceTotal - paidTotal)],
    ],
    terms: termsText(company, context, receipt),
    paymentTerms: termsText(company, context, receipt),
    preparedBy: receipt.preparedBy || company.preparedBy || "",
    preparedByTitle: company.preparedByTitle || "Prepared by",
    approvedBy: receipt.approvedBy || company.approvedBy || "",
    approvedByTitle: company.approvedByTitle || "Approved / Client signature",
    bankingDetails: company.bankingDetails || {},
    bankingRows: bankingRows(company),
    notes: [`Thank you for your payment. This receipt confirms funds recorded against invoice ${invoice.number || receipt.invoiceId || ""}.`],
    meta: [["Client", client.name || ""], ["Date", dateValue(receipt.date)], ["Amount", moneyValue(receipt.amount, currency)]],
  };
}

export function buildStatementTemplate(payload = {}) {
  const statement = payload.statement || {};
  const context = payload.context || {};
  const company = companyProfile(context);
  const currency = exportCurrency(context);
  const client = statement.client || {};
  return {
    type: "statement",
    kind: "client-statement",
    title: "Statement of Account",
    number: statement.statementNumber || client.name || "Statement",
    filenameTitle: `${client.name || "Client"} Statement`,
    company,
    companyLines: companyContactLines(company),
    tagline: company.letterhead || "",
    footerText: company.footerText || company.defaultNotes || "",
    context,
    currency,
    client: {
      name: client.name || "",
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
    },
    details: [
      ["Statement date", dateValue(statement.toDate)],
      ["From", dateValue(statement.fromDate)],
      ["To", dateValue(statement.toDate)],
      ["Opening balance", asNumber(statement.openingBalance)],
      ["Closing balance", asNumber(statement.balance)],
    ],
    headers: ["Date", "Type", "Number", "Debit", "Credit", "Balance"],
    rows: (statement.rows || []).map((row) => [dateValue(row.date), row.type, row.number, asNumber(row.debit), asNumber(row.credit), asNumber(row.balance)]),
    totals: [["Closing balance", asNumber(statement.balance)]],
    terms: termsText(company, context, statement),
    paymentTerms: termsText(company, context, statement),
    bankingDetails: company.bankingDetails || {},
    bankingRows: bankingRows(company),
    meta: [["Client", client.name || ""], ["Closing balance", moneyValue(statement.balance, currency)]],
  };
}

export function buildReportTemplate(report = {}, context = {}, options = {}) {
  return {
    type: "report",
    kind: options.kind || "report",
    title: report.title || "Report",
    number: "",
    filenameTitle: report.title || "Report",
    company: companyProfile(context),
    companyLines: companyContactLines(companyProfile(context)),
    tagline: companyProfile(context).letterhead || "",
    footerText: companyProfile(context).footerText || companyProfile(context).defaultNotes || "",
    context,
    currency: exportCurrency(context),
    headers: report.headers || [],
    rows: report.rows || [],
    filters: options.filters || [],
    generatedAt: report.generatedAt || new Date().toISOString(),
    meta: [["Generated", new Date(report.generatedAt || Date.now()).toLocaleString("en-BW")], ...(options.filters || [])],
  };
}

export function templateForPayload(kind, payload = {}) {
  if (kind === "quotation" || kind === "invoice") return buildBusinessDocumentTemplate(kind, payload);
  if (kind === "receipt") return buildReceiptTemplate(payload);
  if (kind === "client-statement") return buildStatementTemplate(payload);
  return buildReportTemplate(payload.report || payload, payload.context || {}, { kind });
}
