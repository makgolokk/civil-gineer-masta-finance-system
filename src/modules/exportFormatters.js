export const DEFAULT_CURRENCY = "BWP";

export function asText(value) {
  return String(value ?? "").trim();
}

export function asNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = asText(value).replace(/[^\d.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function moneyValue(value, currency = DEFAULT_CURRENCY) {
  return new Intl.NumberFormat("en-BW", { style: "currency", currency }).format(asNumber(value));
}

export function titleCase(value) {
  return asText(value).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function dateValue(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return asText(value);
  return parsed.toLocaleDateString("en-BW", { year: "numeric", month: "short", day: "2-digit" });
}

export function dateTimeValue(value = new Date()) {
  const parsed = value instanceof Date ? value : new Date(value);
  return parsed.toLocaleString("en-BW", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function safeFilename(value, extension) {
  const base = asText(value || "export").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  return `${base || "export"}.${extension}`;
}

export function lineAmount(item = {}) {
  return asNumber(item.qty ?? item.quantity ?? 1) * asNumber(item.rate ?? item.unitPrice ?? item.price);
}

export function documentSubtotal(items = []) {
  return items.reduce((sum, item) => sum + lineAmount(item), 0);
}

export function documentTax(document = {}) {
  if (document.taxAmount !== undefined && document.taxAmount !== null) return asNumber(document.taxAmount);
  const taxable = Math.max(0, documentSubtotal(document.items || []) - asNumber(document.discount));
  return taxable * (asNumber(document.taxRate) / 100);
}

export function documentTotal(document = {}) {
  if (document.total !== undefined && document.total !== null) return asNumber(document.total);
  return Math.max(0, documentSubtotal(document.items || []) - asNumber(document.discount) + documentTax(document));
}

export function columnLooksNumeric(header = "", values = []) {
  const label = asText(header).toLowerCase();
  if (/amount|total|balance|debit|credit|income|cost|profit|loss|cash|inflow|outflow|net|paid|price|rate|subtotal|vat|tax/.test(label)) return true;
  const populated = values.filter((value) => asText(value));
  return populated.length > 0 && populated.every((value) => /^[-\sBWP,\d.]+$/.test(asText(value)));
}

export function parseReportCell(value) {
  const raw = asText(value);
  if (!raw) return "";
  if (/^[-\sBWP,\d.]+$/.test(raw) && /\d/.test(raw)) return asNumber(raw);
  return raw;
}
