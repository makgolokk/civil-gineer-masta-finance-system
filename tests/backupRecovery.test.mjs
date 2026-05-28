import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKUP_SCHEMA,
  backupCountRows,
  backupCounts,
  backupFilename,
  createBackupEnvelope,
  parseBackupText,
} from "../src/modules/backupRecovery.js";

const state = {
  clients: [{ id: "client-1" }],
  projects: [{ id: "project-1" }],
  quotations: [{ id: "quote-1" }],
  invoices: [{ id: "invoice-1" }],
  payments: [{ id: "payment-1" }],
  expenses: [{ id: "expense-1" }],
  supplierBills: [{ id: "bill-1" }],
  users: [{ id: "user-1" }],
  auditLog: [{ id: "audit-1" }],
  settings: { companyProfile: { name: "Civil-Gineer Masta" } },
};

test("backup envelopes preserve app state and metadata", () => {
  const envelope = createBackupEnvelope(state, { createdBy: "Tester", reason: "Regression test", source: "automated" });
  assert.equal(envelope.schema, BACKUP_SCHEMA);
  assert.equal(envelope.createdBy, "Tester");
  assert.equal(envelope.reason, "Regression test");
  assert.deepEqual(envelope.counts, backupCounts(state));

  const parsed = parseBackupText(JSON.stringify(envelope));
  assert.equal(parsed.metadata.schema, BACKUP_SCHEMA);
  assert.equal(parsed.metadata.createdBy, "Tester");
  assert.equal(parsed.warnings.length, 0);
  assert.deepEqual(parsed.state, state);
});

test("legacy raw state backups remain compatible", () => {
  const parsed = parseBackupText(JSON.stringify(state));
  assert.equal(parsed.metadata.schema, "legacy-raw-state");
  assert.deepEqual(parsed.metadata.counts, backupCounts(state));
  assert.deepEqual(parsed.state, state);
});

test("invalid backups are rejected before restore", () => {
  assert.throws(() => parseBackupText(JSON.stringify({ random: true })), /Backup is not valid/);
});

test("backup filenames and count rows are office readable", () => {
  const filename = backupFilename("cgm-test", new Date("2026-05-28T08:09:10Z"));
  assert.match(filename, /^cgm-test-2026-05-28T08-09-10\.json$/);
  assert.deepEqual(backupCountRows(backupCounts(state))[0], ["Clients", 1]);
});
