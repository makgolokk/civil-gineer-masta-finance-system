import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildFallbackPdfBlob } from "../src/modules/pdfFallback.js";
import { buildFrontendExcelBlob } from "../src/modules/frontendExcelExport.js";
import { templateForPayload } from "../src/modules/documentTemplates.js";

const context = {
  settings: {
    companyProfile: {
      name: "Civil-Gineer Masta Proprietary Limited",
      email: "office@example.com",
      phone: "+267 7000 0000",
      alternatePhone: "+267 7111 1111",
      address: "Gaborone",
      logoPath: "assets/logo.png",
      letterhead: "BUILDING THE FUTURE, MASTERING THE PRESENT",
      footerText: "Configured footer text",
      defaultNotes: "Configured approval note",
      defaultTerms: "Configured payment terms from Settings.",
      preparedBy: "Prepared Person",
      approvedBy: "Approved Person",
      bankingDetails: {
        bank: "Settings Bank",
        accountHolder: "Civil-Gineer Masta Proprietary Limited",
        accountType: "Business Cheque",
        accountNumber: "123456789",
        branchName: "Main Branch",
        branchCode: "001",
      },
    },
    documentSettings: { currency: "BWP", vatEnabled: false, vatRate: 0 },
    documentSignatories: {
      preparedById: "kelesitse-makgolo",
      approvedById: "boago-modise",
      profiles: [
        { id: "kelesitse-makgolo", name: "Kelesitse K. Makgolo", title: "Director", signatureImage: "", active: true },
        { id: "boago-modise", name: "Boago Modise", title: "Director", signatureImage: "", active: true },
      ],
    },
  },
  clients: [{ id: "client-1", name: "FoodNet Holdings Pty Ltd", email: "accounts@foodnet.example", phone: "71234567", address: "Gaborone" }],
  projects: [{ id: "project-1", code: "PRJ-2026-05-0001", name: "Warehouse plan", location: "Block 8" }],
  services: [{ id: "service-1", name: "Architecture" }],
  invoices: [],
  payments: [],
};

const quotationPayload = {
  context,
  document: {
    id: "quote-1",
    number: "CGM-QT-0001",
    clientId: "client-1",
    projectId: "project-1",
    serviceId: "service-1",
    date: "2026-05-28",
    validUntil: "2026-06-28",
    status: "approved",
    notes: "Includes drawings and submission pack.",
    items: [{ description: "Architectural design package", serviceId: "service-1", qty: 1, rate: 8500 }],
  },
};

async function withMockedLogoFetch(callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path === "/logo-doc.png" || path === "/logo.png") {
      const file = await readFile(path === "/logo-doc.png" ? "./public/logo-doc.png" : "./public/logo.png");
      return new Response(file, { status: 200, headers: { "Content-Type": "image/png" } });
    }
    return originalFetch(url);
  };
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("shared document template carries Settings branding and financial blocks", () => {
  const template = templateForPayload("quotation", quotationPayload);

  assert.equal(template.company.logoPath, "/logo.png");
  assert.equal(template.tagline, "BUILDING THE FUTURE, MASTERING THE PRESENT");
  assert.ok(template.companyLines.includes("+267 7000 0000 / +267 7111 1111"));
  assert.equal(template.terms, "Configured payment terms from Settings.");
  assert.equal(template.footerText, "Configured footer text");
  assert.deepEqual(template.bankingRows, [
    ["Bank", "Settings Bank"],
    ["Account Holder", "Civil-Gineer Masta Proprietary Limited"],
    ["Account Type", "Business Cheque"],
    ["Account Number", "123456789"],
    ["Branch", "Main Branch | 001"],
  ]);
  assert.equal(template.preparedBy, "Kelesitse K. Makgolo");
  assert.equal(template.signatories.preparedBy.name, "Kelesitse K. Makgolo");
  assert.equal(template.signatories.approvedBy.name, "Boago Modise");
  assert.equal(template.statusLabel, "Approved");
});

test("quotation signatures follow draft and approved states", () => {
  const draft = templateForPayload("quotation", { ...quotationPayload, document: { ...quotationPayload.document, status: "draft" } });
  const approved = templateForPayload("quotation", { ...quotationPayload, document: { ...quotationPayload.document, status: "approved" } });

  assert.equal(draft.signatories.preparedBy.name, "Kelesitse K. Makgolo");
  assert.equal(draft.signatories.approvedBy, null);
  assert.equal(draft.statusLabel, "Draft");
  assert.equal(approved.signatories.approvedBy.name, "Boago Modise");
  assert.equal(approved.statusLabel, "Approved");
});

test("browser fallback generates a usable quotation PDF blob", async () => {
  const blob = await withMockedLogoFetch(() => buildFallbackPdfBlob("quotation", quotationPayload));

  assert.equal(blob.type, "application/pdf");
  assert.ok(blob.size > 1000);
  const header = await blob.slice(0, 5).text();
  assert.equal(header, "%PDF-");
  const pdfText = Buffer.from(await blob.arrayBuffer()).toString("latin1");
  assert.match(pdfText, /\/Subtype\s*\/Image/);
});

test("approved document PDFs embed authorised signature images", async () => {
  const signature = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAATSURBVBhXYwCC//+BGAhBiOE/ADLfBftP/2lzAAAAAElFTkSuQmCC";
  const signedContext = structuredClone(context);
  signedContext.settings.documentSignatories.profiles.forEach((profile) => { profile.signatureImage = signature; });
  const blob = await withMockedLogoFetch(() => buildFallbackPdfBlob("quotation", {
    context: signedContext,
    document: { ...quotationPayload.document, status: "approved" },
  }));
  const pdfText = Buffer.from(await blob.arrayBuffer()).toString("latin1");
  const imageObjects = pdfText.match(/\/Subtype\s*\/Image/g) || [];

  assert.ok(imageObjects.length >= 2);
});

test("document Excel fallback includes Settings banking and approval blocks", async () => {
  const blob = await buildFrontendExcelBlob("quotation", quotationPayload);
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());
  const sheet = workbook.getWorksheet("Quotation");
  const sheetText = [];
  sheet.eachRow((row) => {
    row.eachCell((cell) => sheetText.push(String(cell.value?.richText ? cell.value.richText.map((part) => part.text).join("") : cell.value ?? "")));
  });
  const joined = sheetText.join("\n");

  assert.ok(sheet);
  assert.match(sheet.getCell("A2").value, /BUILDING THE FUTURE/);
  assert.match(joined, /Settings Bank/);
  assert.match(joined, /123456789/);
  assert.match(joined, /Configured payment terms from Settings/);
  assert.match(joined, /Kelesitse K. Makgolo/);
  assert.match(joined, /Configured footer text/);
});

test("browser fallback generates a usable report PDF blob", async () => {
  const blob = await buildFallbackPdfBlob("report", {
    context,
    report: {
      title: "Project Profitability",
      headers: ["Project", "Client", "Income", "Direct costs", "Profit / loss"],
      rows: [["PRJ-001", "FoodNet Holdings Pty Ltd", "BWP 12,000.00", "BWP 4,500.00", "BWP 7,500.00"]],
    },
  });

  assert.equal(blob.type, "application/pdf");
  assert.ok(blob.size > 1000);
  assert.equal(await blob.slice(0, 5).text(), "%PDF-");
});

test("browser fallback generates a valid office-ready Excel workbook", async () => {
  const blob = await buildFrontendExcelBlob("report", {
    context,
    report: {
      title: "Expense Report",
      headers: ["Date", "Category", "Vendor", "Amount"],
      rows: [["2026-05-28", "Printing", "Office Supplier", "BWP 450.00"]],
    },
  });

  assert.equal(blob.type, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.ok(blob.size > 1200);
  assert.equal(await blob.slice(0, 2).text(), "PK");
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());
  const sheet = workbook.getWorksheet("Expense Report");
  assert.ok(sheet);
  assert.equal(sheet.getCell("A1").value, "Civil-Gineer Masta Proprietary Limited");
  assert.equal(sheet.getCell("A3").value, "Expense Report");
  assert.equal(sheet.getCell("D9").value, 450);
  assert.deepEqual(sheet.getCell("D11").value, { formula: "SUM(D9:D9)" });
});
