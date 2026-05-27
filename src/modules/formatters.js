export const moneyFormatter = new Intl.NumberFormat("en-BW", { style: "currency", currency: "BWP" });

export function formatLongDate(dateValue) {
  return new Date(`${dateValue}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatMonthName(dateValue) {
  return new Date(dateValue).toLocaleString(undefined, { month: "long" });
}

export function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
