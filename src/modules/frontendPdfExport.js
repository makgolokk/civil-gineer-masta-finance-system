import { CGM_COLORS, PDF_LAYOUT } from "./exportStyles.js";
import { asText, dateTimeValue, moneyValue, safeFilename, titleCase } from "./exportFormatters.js";
import { templateForPayload } from "./documentTemplates.js";
import { validatePdfBlob } from "./exportValidation.js";

const logoCache = new Map();

async function pdfTools() {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  return { jsPDF, autoTable: autoTableModule.default };
}

function logoCandidates(path = "/logo.png") {
  const requested = asText(path) || "/logo.png";
  const isDefaultLogo = requested === "/logo.png" || requested === "assets/logo.png" || requested === "/assets/logo.png";
  const candidates = [
    isDefaultLogo ? "/logo-doc.png" : "",
    requested,
    requested === "assets/logo.png" || requested === "/assets/logo.png" ? "/logo.png" : "",
    requested === "assets/logo-doc.png" || requested === "/assets/logo-doc.png" ? "/logo-doc.png" : "",
    isDefaultLogo ? "" : "/logo-doc.png",
    "/logo.png",
  ].filter(Boolean);
  return [...new Set(candidates)];
}

async function logoDataUrl(path = "/logo.png") {
  const cacheKey = logoCandidates(path).join("|");
  if (logoCache.has(cacheKey)) return logoCache.get(cacheKey);
  logoCache.set(cacheKey, "");
  if (typeof fetch !== "function") return logoCache.get(cacheKey);
  for (const logoPath of logoCandidates(path)) {
    try {
      const response = await fetch(logoPath);
      if (!response.ok) continue;
      const blob = await response.blob();
      const dataUrl = await blobToDataUrl(blob);
      logoCache.set(cacheKey, dataUrl);
      return dataUrl;
    } catch (error) {
      console.debug("Logo unavailable for local PDF export", logoPath, error);
    }
  }
  return logoCache.get(cacheKey);
}

async function blobToDataUrl(blob) {
  if (typeof FileReader !== "undefined") {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  const bytes = Buffer.from(await blob.arrayBuffer());
  return `data:${blob.type || "image/png"};base64,${bytes.toString("base64")}`;
}

function setColor(doc, color, method = "setTextColor") {
  doc[method](...color);
}

function fallbackCompanyLines(company = {}) {
  const reg = company.registrationNumber || company.regNumber || company.companyRegistration || "";
  const tax = company.taxVatNumber || company.taxNumber || company.vatNumber || company.tin || "";
  return [
    company.address,
    [company.phone, company.alternatePhone].filter(Boolean).join(" / "),
    company.email,
    company.website,
    [reg ? `Reg: ${reg}` : "", tax ? `Tax/VAT: ${tax}` : ""].filter(Boolean).join(" | "),
  ].filter(Boolean);
}

async function addLetterhead(doc, template) {
  const company = template.company || {};
  setColor(doc, CGM_COLORS.white, "setFillColor");
  doc.rect(0, 0, PDF_LAYOUT.pageWidth, PDF_LAYOUT.topBarHeight + 6, "F");
  setColor(doc, CGM_COLORS.black, "setFillColor");
  doc.rect(0, 0, PDF_LAYOUT.pageWidth, 3, "F");
  setColor(doc, CGM_COLORS.red, "setFillColor");
  doc.rect(0, 36, PDF_LAYOUT.pageWidth, 3, "F");
  const logo = await logoDataUrl(company.logoPath);
  if (logo) {
    try {
      const format = /^data:image\/jpe?g/i.test(logo) ? "JPEG" : "PNG";
      doc.addImage(logo, format, 14, 7, 33, 22, undefined, "FAST");
    } catch (error) {
      console.debug("Logo could not be embedded in local PDF export", error);
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  setColor(doc, CGM_COLORS.black);
  doc.text(company.name || "Civil-Gineer Masta Proprietary Limited", logo ? 52 : 14, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  setColor(doc, CGM_COLORS.muted);
  (template.companyLines || fallbackCompanyLines(company)).slice(0, 4).forEach((line, index) => doc.text(line, logo ? 52 : 14, 18 + index * 3.8));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  setColor(doc, CGM_COLORS.red);
  doc.text(asText(template.title).toUpperCase(), 196, 14, { align: "right" });
  doc.setFontSize(8.5);
  setColor(doc, CGM_COLORS.black);
  doc.text(template.number || "", 196, 22, { align: "right" });
  if (template.tagline || company.letterhead) {
    const tagline = asText(template.tagline || company.letterhead).toUpperCase();
    const tagWidth = Math.min(118, doc.getTextWidth(tagline) + 10);
    const tagX = (PDF_LAYOUT.pageWidth - tagWidth) / 2;
    setColor(doc, CGM_COLORS.paleRed, "setFillColor");
    setColor(doc, CGM_COLORS.red, "setDrawColor");
    doc.roundedRect(tagX, 31, tagWidth, 6.5, 1.4, 1.4, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    setColor(doc, CGM_COLORS.red);
    doc.text(tagline, PDF_LAYOUT.pageWidth / 2, 35.6, { align: "center" });
  }
  setColor(doc, CGM_COLORS.black);
}

function addInfoBox(doc, title, rows, x, y, width, currency) {
  setColor(doc, CGM_COLORS.line, "setDrawColor");
  setColor(doc, CGM_COLORS.soft, "setFillColor");
  doc.roundedRect(x, y, width, 40, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  setColor(doc, CGM_COLORS.red);
  doc.text(title, x + 4, y + 7);
  doc.setFontSize(7.5);
  let offset = 14;
  rows.filter(([, value]) => asText(value)).slice(0, 6).forEach(([label, value]) => {
    setColor(doc, CGM_COLORS.muted);
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, x + 4, y + offset);
    setColor(doc, CGM_COLORS.black);
    doc.setFont("helvetica", "normal");
    const display = typeof value === "number" ? moneyValue(value, currency) : asText(value);
    doc.text(doc.splitTextToSize(display, width - 35), x + 32, y + offset);
    offset += 4.7;
  });
}

function addFooter(doc, template) {
  const company = template.company || {};
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    setColor(doc, CGM_COLORS.line, "setDrawColor");
    doc.line(14, PDF_LAYOUT.footerY, 196, PDF_LAYOUT.footerY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    setColor(doc, CGM_COLORS.muted);
    doc.text([template.footerText, company.name || "Civil-Gineer Masta", company.phone, company.email].filter(Boolean).join(" | "), 14, 291);
    doc.text(`Page ${page} of ${pages}`, 196, 291, { align: "right" });
    setColor(doc, CGM_COLORS.black);
  }
}

function addKeyValueBlock(doc, title, rows, x, y, width) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.8);
  setColor(doc, CGM_COLORS.red);
  doc.text(title, x, y);
  doc.setFontSize(7.5);
  let offset = 6;
  rows.filter(([, value]) => asText(value)).slice(0, 7).forEach(([label, value]) => {
    setColor(doc, CGM_COLORS.muted);
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, x, y + offset);
    setColor(doc, CGM_COLORS.black);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(asText(value), width - 32), x + 31, y + offset);
    offset += 4.5;
  });
  setColor(doc, CGM_COLORS.black);
}

function addTermsAndApproval(doc, template, y) {
  setColor(doc, CGM_COLORS.line, "setDrawColor");
  doc.line(14, y - 5, 196, y - 5);
  addKeyValueBlock(doc, "Banking Details", template.bankingRows || [], 14, y, 88);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.8);
  setColor(doc, CGM_COLORS.red);
  doc.text("Terms & Approval", 110, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  setColor(doc, CGM_COLORS.black);
  doc.text(doc.splitTextToSize(template.terms || template.paymentTerms || "", 86), 110, y + 6);
  doc.setFont("helvetica", "bold");
  doc.text(template.preparedByTitle || "Prepared by", 110, y + 25);
  doc.text(template.approvedByTitle || "Approved by", 154, y + 25);
  setColor(doc, CGM_COLORS.line, "setDrawColor");
  doc.line(110, y + 34, 145, y + 34);
  doc.line(154, y + 34, 190, y + 34);
  doc.setFont("helvetica", "normal");
  setColor(doc, CGM_COLORS.muted);
  doc.text(template.preparedBy || " ", 110, y + 39);
  doc.text(template.approvedBy || " ", 154, y + 39);
  setColor(doc, CGM_COLORS.black);
}

function tableTheme() {
  return {
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7.8, cellPadding: 2.4, overflow: "linebreak", valign: "top", lineColor: CGM_COLORS.line, lineWidth: 0.15 },
    headStyles: { fillColor: CGM_COLORS.black, textColor: CGM_COLORS.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: CGM_COLORS.soft },
    margin: { left: 14, right: 14 },
  };
}

function renderDocument(doc, autoTable, template) {
  addInfoBox(doc, "Client Details", [
    ["Client", template.client.name],
    ["Contact", template.client.contact],
    ["Email", template.client.email],
    ["Phone", template.client.phone],
    ["Address", template.client.address],
  ], 14, 43, 86, template.currency);
  addInfoBox(doc, "Document Details", template.details, 110, 43, 86, template.currency);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Scope and Line Items", 14, 91);
  autoTable(doc, {
    ...tableTheme(),
    startY: 96,
    head: [["Description", "Service", "Qty", "Unit", "Rate", "Amount"]],
    body: template.items.map((item) => [item.description, item.service, item.qty, item.unit, moneyValue(item.rate, template.currency), moneyValue(item.amount, template.currency)]),
    tableWidth: 182,
    columnStyles: { 0: { cellWidth: 66 }, 1: { cellWidth: 34 }, 2: { cellWidth: 13, halign: "right" }, 3: { cellWidth: 16 }, 4: { cellWidth: 25, halign: "right" }, 5: { cellWidth: 28, halign: "right" } },
  });
  const totalsY = Math.min((doc.lastAutoTable?.finalY || 112) + 8, 206);
  autoTable(doc, {
    startY: totalsY,
    margin: { left: 120 },
    body: template.totals.map(([label, value]) => [label, moneyValue(value, template.currency)]),
    theme: "plain",
    tableWidth: 76,
    styles: { fontSize: 8.8, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 38 }, 1: { halign: "right", cellWidth: 38 } },
    didParseCell(data) {
      if (data.row.index >= data.table.body.length - 1) data.cell.styles.fontStyle = "bold";
    },
  });
  setColor(doc, CGM_COLORS.line, "setDrawColor");
  doc.line(14, totalsY, 112, totalsY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.8);
  doc.text("Notes / Exclusions", 14, totalsY + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.text(doc.splitTextToSize(template.notes.join("\n") || "Thank you for your business.", 94), 14, totalsY + 12);
  addTermsAndApproval(doc, template, 236);
}

function renderReceipt(doc, autoTable, template) {
  addInfoBox(doc, "Received From", [["Client", template.client.name], ["Email", template.client.email], ["Phone", template.client.phone], ["Address", template.client.address]], 14, 43, 86, template.currency);
  addInfoBox(doc, "Payment Details", template.details, 110, 43, 86, template.currency);
  setColor(doc, CGM_COLORS.paleRed, "setFillColor");
  setColor(doc, CGM_COLORS.line, "setDrawColor");
  doc.roundedRect(14, 96, 182, 34, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Amount Received", 22, 111);
  doc.setFontSize(20);
  setColor(doc, CGM_COLORS.red);
  doc.text(moneyValue(template.amountReceived, template.currency), 188, 113, { align: "right" });
  setColor(doc, CGM_COLORS.black);
  autoTable(doc, {
    startY: 144,
    margin: { left: 108 },
    body: template.totals.map(([label, value]) => [label, moneyValue(value, template.currency)]),
    theme: "grid",
    tableWidth: 88,
    styles: { fontSize: 8.8, cellPadding: 2, lineColor: CGM_COLORS.line },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 42 }, 1: { halign: "right", cellWidth: 46 } },
  });
  doc.setFontSize(8.5);
  doc.text(doc.splitTextToSize(template.notes.join("\n"), 182), 14, 172);
  addTermsAndApproval(doc, template, 218);
}

function renderStatement(doc, autoTable, template) {
  addInfoBox(doc, "Client", [["Name", template.client.name], ["Email", template.client.email], ["Phone", template.client.phone], ["Address", template.client.address]], 14, 43, 86, template.currency);
  addInfoBox(doc, "Statement", template.details, 110, 43, 86, template.currency);
  autoTable(doc, {
    ...tableTheme(),
    startY: 94,
    head: [template.headers],
    body: template.rows.map((row) => row.map((cell, index) => index >= 3 ? moneyValue(cell, template.currency) : cell)),
    columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
  });
  autoTable(doc, {
    startY: (doc.lastAutoTable?.finalY || 110) + 8,
    margin: { left: 120 },
    body: template.totals.map(([label, value]) => [label, moneyValue(value, template.currency)]),
    theme: "plain",
    tableWidth: 76,
    styles: { fontSize: 9.5, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
  });
  addTermsAndApproval(doc, template, 222);
}

function renderReport(doc, autoTable, template) {
  addInfoBox(doc, "Report Details", [["Generated", dateTimeValue(template.generatedAt)], ...template.filters], 14, 43, 182, template.currency);
  autoTable(doc, {
    ...tableTheme(),
    startY: 94,
    head: [template.headers],
    body: template.rows,
    styles: { ...tableTheme().styles, fontSize: template.headers.length > 5 ? 7 : 8 },
  });
}

export async function buildFrontendPdfBlob(kind, payload) {
  const { jsPDF, autoTable } = await pdfTools();
  const template = templateForPayload(kind, payload);
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  await addLetterhead(doc, template);
  if (template.type === "business-document") renderDocument(doc, autoTable, template);
  else if (template.type === "receipt") renderReceipt(doc, autoTable, template);
  else if (template.type === "statement") renderStatement(doc, autoTable, template);
  else renderReport(doc, autoTable, template);
  addFooter(doc, template);
  const blob = doc.output("blob");
  const validation = await validatePdfBlob(blob);
  if (!validation.ok) throw new Error(validation.reason);
  return blob;
}

export function frontendPdfFilename(kind, payload) {
  return safeFilename(templateForPayload(kind, payload).filenameTitle, "pdf");
}
