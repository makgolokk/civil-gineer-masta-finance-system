import assert from "node:assert/strict";
import test from "node:test";

import {
  businessHealth,
  dashboardAlerts,
  inPeriod,
  selectedPeriod,
} from "../src/modules/dashboardUtils.js";

const money = { format: (value) => `BWP ${Number(value).toFixed(2)}` };

test("selected periods produce correct month, quarter, and year windows", () => {
  const month = selectedPeriod({ mode: "month", month: "2026-05" }, "2026-05-28", (date) => date.toLocaleString("en", { month: "long" }));
  assert.equal(month.label, "May 2026");
  assert.equal(inPeriod("2026-05-01", month), true);
  assert.equal(inPeriod("2026-06-01", month), false);

  const quarter = selectedPeriod({ mode: "quarter", quarter: "2026-Q2" }, "2026-05-28", () => "");
  assert.equal(quarter.label, "Quarter 2, 2026");
  assert.equal(inPeriod("2026-04-01", quarter), true);
  assert.equal(inPeriod("2026-07-01", quarter), false);

  const year = selectedPeriod({ mode: "year", year: "2026" }, "2026-05-28", () => "");
  assert.equal(year.label, "Year 2026");
  assert.equal(inPeriod("2026-12-31", year), true);
});

test("business health reacts to cash, profit, debtors, and expense pressure", () => {
  const excellent = businessHealth({
    periodNetCash: 1000,
    overdueAmount: 0,
    periodExpenses: 250,
    periodInvoiced: 1500,
    netProfitLoss: 900,
    unpaidAmount: 0,
    periodPayments: 1200,
  });
  assert.equal(excellent.status, "Excellent");

  const weak = businessHealth({
    periodNetCash: -500,
    overdueAmount: 600,
    periodExpenses: 1200,
    periodInvoiced: 1000,
    netProfitLoss: -200,
    unpaidAmount: 1500,
    periodPayments: 300,
  });
  assert.equal(weak.status, "Critical");
  assert.equal(weak.score < excellent.score, true);
});

test("dashboard alerts stay readable for office follow-up", () => {
  const alerts = dashboardAlerts({
    periodPayments: 500,
    periodExpenses: 800,
    overdueCount: 2,
    overdueAmount: 1200,
    debtors: 2500,
    periodInvoiced: 1000,
    bankCashBalance: 100,
    creditorsDueAmount: 300,
    periodNetCash: -300,
    unpaidAmount: 700,
  }, money);

  assert.equal(alerts.some((alert) => alert.title === "Action needed"), true);
  assert.equal(alerts.some((alert) => alert.level === "danger"), true);
  assert.equal(alerts.every((alert) => !/undefined|NaN/.test(alert.message)), true);
});
