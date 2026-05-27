import { exportApiBaseUrl } from "./exportConfig.js";

async function postPdf(path, payload) {
  const baseUrl = exportApiBaseUrl();
  if (!baseUrl) throw new Error("Export backend URL is not configured.");
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Export backend failed with HTTP ${response.status}`);
  }
  return await response.blob();
}

export function exportQuotationPdf(payload) {
  return postPdf("/exports/quotation", payload);
}

export function exportInvoicePdf(payload) {
  return postPdf("/exports/invoice", payload);
}

export function exportReceiptPdf(payload) {
  return postPdf("/exports/receipt", payload);
}

export function exportClientStatementPdf(payload) {
  return postPdf("/exports/client-statement", payload);
}

export async function checkExportBackendHealth() {
  const baseUrl = exportApiBaseUrl();
  if (!baseUrl) return { ok: false, reason: "Export backend URL is not configured." };
  const response = await fetch(`${baseUrl}/health`);
  return { ok: response.ok, status: response.status, data: response.ok ? await response.json() : null };
}
