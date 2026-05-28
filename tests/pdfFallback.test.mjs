import assert from "node:assert/strict";
import test from "node:test";
import { buildFallbackPdfBlob } from "../src/modules/pdfFallback.js";
import { buildFrontendExcelBlob } from "../src/modules/frontendExcelExport.js";

const context = {
  settings: {
    companyProfile: {
      name: "Civil-Gineer Masta Proprietary Limited",
      email: "office@example.com",
      phone: "+267 7000 0000",
      address: "Gaborone",
      paymentTerms: "Payment due on acceptance.",
    },
    documentSettings: { currency: "BWP", vatEnabled: false, vatRate: 0 },
  },
  clients: [{ id: "client-1", name: "FoodNet Holdings Pty Ltd", email: "accounts@foodnet.example", phone: "71234567", address: "Gaborone" }],
  projects: [{ id: "project-1", code: "PRJ-2026-05-0001", name: "Warehouse plan", location: "Block 8" }],
  services: [{ id: "service-1", name: "Architecture" }],
  invoices: [],
  payments: [],
};

test("browser fallback generates a usable quotation PDF blob", async () => {
  const blob = await buildFallbackPdfBlob("quotation", {
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
  });

  assert.equal(blob.type, "application/pdf");
  assert.ok(blob.size > 1000);
  const header = await blob.slice(0, 5).text();
  assert.equal(header, "%PDF-");
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
