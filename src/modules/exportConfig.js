export function exportApiBaseUrl() {
  const env = import.meta.env || {};
  const configured = window.CGM_EXPORT_API_BASE_URL || env.VITE_EXPORT_API_BASE_URL || "";
  if (configured) return configured.replace(/\/$/, "");
  if (["localhost", "127.0.0.1"].includes(window.location.hostname)) return "http://127.0.0.1:8765";
  return "";
}
