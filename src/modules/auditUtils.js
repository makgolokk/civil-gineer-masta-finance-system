const auditLabels = {
  amount: "Amount",
  status: "Status",
  date: "Date",
  dueDate: "Due date",
  validUntil: "Valid until",
  number: "Number",
  receiptNumber: "Receipt number",
  name: "Name",
  clientId: "Client",
  supplierId: "Supplier",
  projectId: "Project",
  projectCode: "Project code",
  projectName: "Project name",
  serviceId: "Service category",
  taxRate: "VAT / tax percentage",
  taxAmount: "VAT / tax amount",
  discount: "Discount",
  items: "Line items",
  lines: "Journal lines",
  settings: "Settings",
  active: "Active status",
};

export function parseAuditValue(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
}

export function auditFieldLabel(key) {
  return auditLabels[key] || String(key || "").replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

export function formatAuditValue(value, moneyFormatter) {
  if (value === undefined || value === null || value === "") return "blank";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return moneyFormatter ? moneyFormatter.format(value) : String(value);
  if (Array.isArray(value)) return `${value.length} line${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") return "details updated";
  const numeric = Number(value);
  if (!Number.isNaN(numeric) && String(value).trim() !== "" && /amount|rate|price|balance|total|discount|tax/i.test(String(value))) {
    return moneyFormatter ? moneyFormatter.format(numeric) : String(value);
  }
  return String(value);
}

export function auditChangeRows(entry, options = {}) {
  const before = parseAuditValue(entry.oldValue);
  const after = parseAuditValue(entry.newValue);
  if (!before && after && typeof after === "object") {
    return [["Record created", recordLabel(after, options)]];
  }
  if (before && !after && typeof before === "object") {
    return [["Record removed", recordLabel(before, options)]];
  }
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return [];

  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    .filter((key) => !["updatedAt", "createdAt"].includes(key))
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));

  return keys.map((key) => [
    auditFieldLabel(key),
    `${formatAuditValue(before[key], options.moneyFormatter)} -> ${formatAuditValue(after[key], options.moneyFormatter)}`,
  ]);
}

export function summarizeAuditEntry(entry, options = {}) {
  const rows = auditChangeRows(entry, options);
  if (rows.length) {
    return rows.slice(0, 3).map(([field, change]) => `${field}: ${change}`).join("; ");
  }
  return entry.reason || `${auditFieldLabel(entry.action)} recorded`;
}

export function filterAuditEntries(entries, filters = {}) {
  return (entries || []).filter((entry) => {
    if (filters.action && entry.action !== filters.action) return false;
    if (filters.module && entry.recordType !== filters.module) return false;
    if (filters.fromDate && String(entry.at || "").slice(0, 10) < filters.fromDate) return false;
    if (filters.toDate && String(entry.at || "").slice(0, 10) > filters.toDate) return false;
    return true;
  });
}

export function auditOptions(entries, key) {
  return Array.from(new Set((entries || []).map((entry) => entry[key]).filter(Boolean))).sort();
}

function recordLabel(record, options = {}) {
  if (!record || typeof record !== "object") return "";
  const value = record.number || record.receiptNumber || record.reference || record.name || record.id || "";
  return value ? formatAuditValue(value, options.moneyFormatter) : "New record";
}
