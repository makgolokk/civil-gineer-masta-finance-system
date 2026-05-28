export function periodKey(dateValue = new Date()) {
  const date = typeof dateValue === "string" ? new Date(`${dateValue}T00:00:00`) : dateValue;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function isDevelopmentHost() {
  const env = import.meta.env || {};
  return ["localhost", "127.0.0.1", ""].includes(window.location.hostname) || Boolean(env.DEV);
}

export function previewPeriodCode(state, key, prefix, dateValue = new Date()) {
  return `${prefix}-${periodKey(dateValue)}-${String((state.counters?.[key] || 1)).padStart(4, "0")}`;
}

export function syncCounterFromCode(state, key, code) {
  const sequence = Number(String(code || "").match(/(\d+)$/)?.[1] || 0);
  if (!sequence) return;
  state.counters[key] = Math.max(state.counters?.[key] || 1, sequence + 1);
}

export function reservePreviewedPeriodCode(state, key, prefix, code, dateValue = new Date()) {
  const cleanCode = String(code || "").trim();
  if (!cleanCode) return "";
  if (cleanCode === previewPeriodCode(state, key, prefix, dateValue)) {
    state.counters[key] = (state.counters?.[key] || 1) + 1;
    return cleanCode;
  }
  syncCounterFromCode(state, key, cleanCode);
  return cleanCode;
}

function localNextNumber(state, key, prefix, period = "") {
  const value = state.counters?.[key] || 1;
  state.counters[key] = value + 1;
  const middle = period ? `${period}-` : "";
  return `${prefix}-${middle}${String(value).padStart(4, "0")}`;
}

export function numberExists(records, field, value) {
  if (!value) return false;
  return (records || []).some((record) => String(record?.[field] || "").toLowerCase() === String(value).toLowerCase());
}

export async function nextOfficialNumber({ state, key, prefix, period = "", records = [], field = "number", label = "record" }) {
  const database = window.CGMDatabase;
  const canUseRpc = Boolean(database?.nextNumber);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      if (!canUseRpc) throw new Error("Supabase numbering RPC is unavailable");
      const value = await database.nextNumber(key, prefix, period);
      if (!numberExists(records, field, value)) return value;
      console.warn(`[CGM numbering] Duplicate ${label} number from Supabase RPC; requesting another`, value);
    } catch (error) {
      if (!isDevelopmentHost()) {
        throw new Error(`Could not generate a safe ${label} number from Supabase. Please apply the numbering migration and retry.`);
      }
      const value = localNextNumber(state, key, prefix, period);
      console.warn(`[CGM numbering] Development fallback used for ${label}. This is not production-safe.`, error);
      if (!numberExists(records, field, value)) return value;
    }
  }

  throw new Error(`Could not generate a unique ${label} number. Please try again.`);
}
