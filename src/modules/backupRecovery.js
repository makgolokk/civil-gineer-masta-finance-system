export const BACKUP_SCHEMA = "cgm-accounting-backup";
export const BACKUP_VERSION = 1;

const requiredCollections = ["clients", "projects", "quotations", "invoices", "payments", "expenses", "supplierBills", "users", "auditLog"];

export function createBackupEnvelope(state, meta = {}) {
  return {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    app: "Civil-Gineer Masta Business Platform",
    createdAt: new Date().toISOString(),
    createdBy: meta.createdBy || "System",
    reason: meta.reason || "Manual backup",
    source: meta.source || "manual",
    counts: backupCounts(state),
    state,
  };
}

export function parseBackupText(text) {
  const parsed = JSON.parse(text);
  const isEnvelope = parsed?.schema === BACKUP_SCHEMA && parsed?.state;
  const state = isEnvelope ? parsed.state : parsed;
  const metadata = isEnvelope
    ? {
        schema: parsed.schema,
        version: parsed.version,
        createdAt: parsed.createdAt,
        createdBy: parsed.createdBy,
        reason: parsed.reason,
        source: parsed.source,
        counts: parsed.counts || backupCounts(state),
      }
    : {
        schema: "legacy-raw-state",
        version: 0,
        createdAt: "",
        createdBy: "",
        reason: "Legacy raw JSON backup",
        source: "legacy",
        counts: backupCounts(state),
      };

  const warnings = validateBackupState(state);
  if (warnings.some((warning) => warning.startsWith("Invalid backup"))) {
    throw new Error(`Backup is not valid: ${warnings.join(" ")}`);
  }

  return { state, metadata, warnings };
}

export function backupCounts(state = {}) {
  return {
    clients: (state.clients || []).length,
    projects: (state.projects || []).length,
    quotations: (state.quotations || []).length,
    invoices: (state.invoices || []).length,
    receipts: (state.payments || []).length,
    expenses: (state.expenses || []).length,
    supplierBills: (state.supplierBills || []).length,
    auditEntries: (state.auditLog || []).length,
  };
}

export function backupFilename(prefix = "cgm-backup", dateValue = new Date()) {
  const stamp = new Date(dateValue).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${prefix}-${stamp}.json`;
}

export function backupCountRows(counts = {}) {
  return [
    ["Clients", counts.clients || 0],
    ["Projects", counts.projects || 0],
    ["Quotations", counts.quotations || 0],
    ["Invoices", counts.invoices || 0],
    ["Receipts / payments", counts.receipts || 0],
    ["Expenses", counts.expenses || 0],
    ["Supplier bills", counts.supplierBills || 0],
    ["Audit entries", counts.auditEntries || 0],
  ];
}

function validateBackupState(state) {
  const warnings = [];
  if (!state || typeof state !== "object") return ["Invalid backup: missing app state object."];
  const recognizableCollections = requiredCollections.filter((key) => Array.isArray(state[key]));
  if (!recognizableCollections.length && !state.settings) return ["Invalid backup: no recognizable CGM records were found."];
  requiredCollections.forEach((key) => {
    if (!Array.isArray(state[key])) warnings.push(`Missing ${key} list; it will be rebuilt with defaults if possible.`);
  });
  if (!state.settings || typeof state.settings !== "object") warnings.push("Missing settings.");
  return warnings;
}
