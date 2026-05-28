const RED = [215, 25, 32];
const BLACK = [17, 17, 17];
const MUTED = [91, 102, 120];
const LINE = [216, 222, 232];

function money(value, currency = "BWP") {
  return new Intl.NumberFormat("en-BW", { style: "currency", currency }).format(Number(value || 0));
}

function text(value) {
  return String(value ?? "").trim();
}

function title(value) {
  return text(value).replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function asNumber(value) {
  return Number(value || 0) || 0;
}

function lineAmount(item) {
  return asNumber(item.qty ?? item.quantity ?? 1) * asNumber(item.rate ?? item.unitPrice ?? item.price);
}

function subtotal(items = []) {
  return items.reduce((sum, item) => sum + lineAmount(item), 0);
}

function totalFor(document = {}) {
  if (document.total !== undefined && document.total !== null) return asNumber(document.total);
  const base = subtotal(document.items);
  const discount = asNumber(document.discount);
  const tax = document.taxAmount !== undefined && document.taxAmount !== null
    ? asNumber(document.taxAmount)
    : Math.max(0, base - discount) * (asNumber(document.taxRate) / 100);
  return Math.max(0, base - discount + tax);
}

function currencyFrom(context = {}) {
  return context.settings?.documentSettings?.currency || "BWP";
}

function companyFrom(context = {}) {
  return context.settings?.companyProfile || {};
}

function findById(items = [], id = "") {
  return items.find((item) => item.id === id) || null;
}

function clientFor(context = {}, document = {}) {
  return findById(context.clients, document.clientId) || document.clientSnapshot || {};
}

function projectFor(context = {}, document = {}) {
  return findById(context.projects, document.projectId) || {};
}

function serviceFor(context = {}, serviceId = "") {
  return findById(context.services, serviceId) || {};
}

function docNumber(document = {}, fallback = "") {
  return document.number || document.receiptNumber || document.statementNumber || fallback;
}

function addHeader(doc, context, label, number) {
  const company = companyFrom(context);
  doc.setFillColor(...BLACK);
  doc.rect(0, 0, 210, 34, "F");
  doc.setFillColor(...RED);
  doc.rect(0, 30, 210, 4, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(company.name || "Civil-Gineer Masta", 14, 15);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text([company.address, company.phone, company.email].filter(Boolean).join(" | "), 14, 23);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(label, 196, 15, { align: "right" });
  doc.setFontSize(10);
  doc.text(number || "", 196, 23, { align: "right" });
  doc.setTextColor(...BLACK);
}

function addInfoBox(doc, titleText, rows, x, y, w) {
  doc.setDrawColor(...LINE);
  doc.setFillColor(250, 250, 251);
  doc.roundedRect(x, y, w, 38, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...RED);
  doc.text(titleText, x + 4, y + 7);
  doc.setTextColor(...BLACK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  let offset = 14;
  rows.filter(([, value]) => text(value)).slice(0, 5).forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, x + 4, y + offset);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(text(value), w - 34), x + 31, y + offset);
    offset += 5;
  });
}

function addFooter(doc, context) {
  const company = companyFrom(context);
  const pages = doc.getNumberOfPages();
  for (let index = 1; index <= pages; index += 1) {
    doc.setPage(index);
    doc.setDrawColor(...LINE);
    doc.line(14, 286, 196, 286);
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(company.name || "Civil-Gineer Masta Proprietary Limited", 14, 291);
    doc.text(`Page ${index} of ${pages}`, 196, 291, { align: "right" });
    doc.setTextColor(...BLACK);
  }
}

function totalsRows(document, context) {
  const currency = currencyFrom(context);
  const base = subtotal(document.items || []);
  const discount = asNumber(document.discount);
  const tax = document.taxAmount !== undefined && document.taxAmount !== null
    ? asNumber(document.taxAmount)
    : Math.max(0, base - discount) * (asNumber(document.taxRate) / 100);
  const total = totalFor(document);
  const paid = asNumber(document.amountPaid);
  const balance = document.balanceDue !== undefined && document.balanceDue !== null ? asNumber(document.balanceDue) : Math.max(0, total - paid);
  const rows = [["Subtotal", money(base, currency)]];
  if (discount) rows.push(["Discount", money(discount, currency)]);
  if (tax || asNumber(document.taxRate)) rows.push([`VAT / Tax ${asNumber(document.taxRate) || ""}%`.trim(), money(tax, currency)]);
  if (paid) rows.push(["Paid", money(paid, currency)]);
  rows.push(["Total", money(total, currency)]);
  if (paid || balance) rows.push(["Balance due", money(balance, currency)]);
  return rows;
}

async function pdfTools() {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  return { jsPDF, autoTable: autoTableModule.default };
}

async function buildDocumentPdf(kind, payload) {
  const { jsPDF, autoTable } = await pdfTools();
  const { document, context = {} } = payload;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const company = companyFrom(context);
  const client = clientFor(context, document);
  const project = projectFor(context, document);
  const service = serviceFor(context, document.serviceId);
  const currency = currencyFrom(context);
  const number = docNumber(document, kind);
  addHeader(doc, context, kind, number);
  addInfoBox(doc, "Client Details", [
    ["Client", client.name || "Prospective client"],
    ["Contact", client.contact],
    ["Email", client.email],
    ["Phone", client.phone],
    ["Address", client.address],
  ], 14, 43, 86);
  addInfoBox(doc, "Document Details", [
    ["Document no.", number],
    ["Date", document.date],
    [kind === "Invoice" ? "Due date" : "Valid until", kind === "Invoice" ? document.dueDate : document.validUntil],
    ["Project", document.projectName || project.name || document.projectCode],
    ["Service", service.name],
    ["Status", title(document.status || "draft")],
  ], 110, 43, 86);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BLACK);
  doc.text("Scope and Line Items", 14, 90);
  autoTable(doc, {
    startY: 95,
    head: [["Description", "Service", "Qty", "Rate", "Amount"]],
    body: (document.items || []).map((item) => [
      item.description || item.name || "Item",
      serviceFor(context, item.serviceId || document.serviceId).name || service.name || "",
      String(item.qty ?? item.quantity ?? 1),
      money(item.rate ?? item.unitPrice ?? item.price, currency),
      money(lineAmount(item), currency),
    ]),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 2.4, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: BLACK, textColor: [255, 255, 255], fontStyle: "bold" },
    tableWidth: 172,
    columnStyles: { 0: { cellWidth: 68 }, 1: { cellWidth: 34 }, 2: { cellWidth: 14, halign: "right" }, 3: { cellWidth: 27, halign: "right" }, 4: { cellWidth: 29, halign: "right" } },
    alternateRowStyles: { fillColor: [250, 250, 251] },
  });

  const y = Math.min((doc.lastAutoTable?.finalY || 110) + 8, 236);
  autoTable(doc, {
    startY: y,
    margin: { left: 122 },
    body: totalsRows(document, context),
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 2 },
    tableWidth: 70,
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 34 }, 1: { halign: "right", cellWidth: 36 } },
    didParseCell(data) {
      if (data.row.index >= data.table.body.length - 1) data.cell.styles.fontStyle = "bold";
    },
  });
  doc.setDrawColor(...LINE);
  doc.line(14, y, 112, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Notes / Exclusions", 14, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const notes = [document.notes || company.defaultNotes, document.exclusions].filter(Boolean).join("\n");
  doc.text(doc.splitTextToSize(notes || "Thank you for your business.", 94), 14, y + 12);
  doc.setFont("helvetica", "bold");
  doc.text("Payment Terms", 14, 270);
  doc.setFont("helvetica", "normal");
  doc.text(doc.splitTextToSize(document.paymentTerms || company.paymentTerms || "Payment due as agreed.", 92), 14, 275);
  addFooter(doc, context);
  return doc.output("blob");
}

async function buildReceiptPdf(payload) {
  const { jsPDF, autoTable } = await pdfTools();
  const { receipt, context = {} } = payload;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const invoice = findById(context.invoices, receipt.invoiceId) || {};
  const client = clientFor(context, invoice.clientId ? invoice : receipt);
  const currency = currencyFrom(context);
  const invoiceTotal = totalFor(invoice);
  const paidTotal = (context.payments || []).filter((payment) => payment.invoiceId === receipt.invoiceId).reduce((sum, payment) => sum + asNumber(payment.amount), 0);
  addHeader(doc, context, "Receipt", receipt.receiptNumber || receipt.number);
  addInfoBox(doc, "Received From", [
    ["Client", client.name],
    ["Email", client.email],
    ["Phone", client.phone],
    ["Address", client.address],
  ], 14, 43, 86);
  addInfoBox(doc, "Payment Details", [
    ["Receipt no.", receipt.receiptNumber || receipt.number],
    ["Date", receipt.date],
    ["Invoice", invoice.number],
    ["Method", receipt.method],
    ["Reference", receipt.reference],
  ], 110, 43, 86);
  doc.setFillColor(255, 248, 248);
  doc.setDrawColor(...LINE);
  doc.roundedRect(14, 96, 182, 34, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Amount Received", 22, 111);
  doc.setFontSize(20);
  doc.setTextColor(...RED);
  doc.text(money(receipt.amount, currency), 188, 113, { align: "right" });
  doc.setTextColor(...BLACK);
  autoTable(doc, {
    startY: 145,
    margin: { left: 112 },
    body: [
      ["Invoice total", money(invoiceTotal, currency)],
      ["Total paid", money(paidTotal, currency)],
      ["Balance", money(Math.max(0, invoiceTotal - paidTotal), currency)],
    ],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right" } },
  });
  doc.setFontSize(9);
  doc.text(doc.splitTextToSize(`Thank you for your payment. This receipt confirms funds recorded against invoice ${invoice.number || receipt.invoiceId || ""}.`, 182), 14, 170);
  addFooter(doc, context);
  return doc.output("blob");
}

async function buildStatementPdf(payload) {
  const { jsPDF, autoTable } = await pdfTools();
  const { statement, context = {} } = payload;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const currency = currencyFrom(context);
  addHeader(doc, context, "Statement of Account", statement.statementNumber || statement.client?.name || "");
  addInfoBox(doc, "Client", [
    ["Name", statement.client?.name],
    ["Email", statement.client?.email],
    ["Phone", statement.client?.phone],
    ["Address", statement.client?.address],
  ], 14, 43, 86);
  addInfoBox(doc, "Statement", [
    ["Statement date", statement.toDate],
    ["From", statement.fromDate],
    ["To", statement.toDate],
    ["Opening balance", money(statement.openingBalance, currency)],
    ["Closing balance", money(statement.balance, currency)],
  ], 110, 43, 86);
  autoTable(doc, {
    startY: 94,
    head: [["Date", "Type", "Number", "Debit", "Credit", "Balance"]],
    body: (statement.rows || []).map((row) => [row.date, row.type, row.number, money(row.debit, currency), money(row.credit, currency), money(row.balance, currency)]),
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: BLACK, textColor: [255, 255, 255] },
    columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
    alternateRowStyles: { fillColor: [250, 250, 251] },
  });
  const y = (doc.lastAutoTable?.finalY || 110) + 8;
  autoTable(doc, {
    startY: y,
    margin: { left: 122 },
    body: [["Closing balance", money(statement.balance, currency)]],
    theme: "plain",
    styles: { fontSize: 10, fontStyle: "bold" },
    tableWidth: 70,
    columnStyles: { 0: { cellWidth: 34 }, 1: { halign: "right", cellWidth: 36 } },
  });
  addFooter(doc, context);
  return doc.output("blob");
}

export async function buildFallbackPdfBlob(kind, payload) {
  if (kind === "quotation") return buildDocumentPdf("Quotation", payload);
  if (kind === "invoice") return buildDocumentPdf("Invoice", payload);
  if (kind === "receipt") return buildReceiptPdf(payload);
  if (kind === "client-statement") return buildStatementPdf(payload);
  return null;
}
