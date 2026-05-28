import assert from "node:assert/strict";
import test from "node:test";
import { buildFallbackPdfBlob } from "../src/modules/pdfFallback.js";

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
