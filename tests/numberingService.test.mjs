import assert from "node:assert/strict";
import test from "node:test";

globalThis.window = { location: { hostname: "localhost" } };

const numbering = await import("../src/modules/numberingService.js");

test("period keys are stable for date strings and Date objects", () => {
  assert.equal(numbering.periodKey("2026-05-28"), "2026-05");
  assert.equal(numbering.periodKey(new Date("2026-12-01T00:00:00")), "2026-12");
});

test("previewed period codes do not mutate counters until reserved", () => {
  const state = { counters: { invoice: 7 } };
  const code = numbering.previewPeriodCode(state, "invoice", "CGM-INV", "2026-05-28");
  assert.equal(code, "CGM-INV-2026-05-0007");
  assert.equal(state.counters.invoice, 7);

  assert.equal(numbering.reservePreviewedPeriodCode(state, "invoice", "CGM-INV", code, "2026-05-28"), code);
  assert.equal(state.counters.invoice, 8);
});

test("manual existing codes only move counters forward", () => {
  const state = { counters: { quotation: 2 } };
  numbering.syncCounterFromCode(state, "quotation", "CGM-QT-2026-05-0011");
  assert.equal(state.counters.quotation, 12);
  numbering.syncCounterFromCode(state, "quotation", "CGM-QT-2026-05-0003");
  assert.equal(state.counters.quotation, 12);
});

test("number existence checks are case insensitive", () => {
  assert.equal(numbering.numberExists([{ number: "INV-001" }], "number", "inv-001"), true);
  assert.equal(numbering.numberExists([{ number: "INV-001" }], "number", "INV-002"), false);
});

test("development fallback refuses duplicates and advances locally", async () => {
  const state = { counters: { receipt: 1 } };
  globalThis.window.CGMDatabase = null;
  const originalWarn = console.warn;
  console.warn = () => {};
  let value = "";
  try {
    value = await numbering.nextOfficialNumber({
      state,
      key: "receipt",
      prefix: "RCT",
      records: [{ receiptNumber: "RCT-0001" }],
      field: "receiptNumber",
      label: "receipt",
    });
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(value, "RCT-0002");
  assert.equal(state.counters.receipt, 3);
});
