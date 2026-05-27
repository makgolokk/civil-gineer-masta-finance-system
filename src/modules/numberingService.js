export function periodKey(dateValue = new Date()) {
  const date = typeof dateValue === "string" ? new Date(`${dateValue}T00:00:00`) : dateValue;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function previewPeriodCode(state, key, prefix, dateValue = new Date()) {
  return `${prefix}-${periodKey(dateValue)}-${String((state.counters?.[key] || 1)).padStart(4, "0")}`;
}

export function nextPeriodCode(state, key, prefix, dateValue = new Date()) {
  const value = state.counters?.[key] || 1;
  state.counters[key] = value + 1;
  return `${prefix}-${periodKey(dateValue)}-${String(value).padStart(4, "0")}`;
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

export function clientCodeFromNumber(number, dateValue = new Date()) {
  const sequence = String(number || "").match(/(\d+)$/)?.[1] || "1";
  return `CL-${periodKey(dateValue)}-${sequence.padStart(4, "0")}`;
}
