import { exportApiBaseUrl } from "./exportConfig.js";

const DEFAULT_TIMEOUT_MS = 45000;
const PDF_TIMEOUT_MS = 12000;

async function postBlob(path, payload, options = {}) {
  const baseUrl = exportApiBaseUrl();
  if (!baseUrl) throw new Error("Export backend URL is not configured.");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Export backend failed with HTTP ${response.status}`);
    }
    return await response.blob();
  } finally {
    window.clearTimeout(timeout);
  }
}

async function postPdf(path, payload, options = {}) {
  return postBlob(path, payload, { timeoutMs: PDF_TIMEOUT_MS, ...options });
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

export function exportReportExcel(payload) {
  return postBlob("/exports/excel", payload);
}

export async function checkExportBackendHealth() {
  const baseUrl = exportApiBaseUrl();
  if (!baseUrl) return { ok: false, reason: "Export backend URL is not configured." };
  const response = await fetch(`${baseUrl}/health`);
  return { ok: response.ok, status: response.status, data: response.ok ? await response.json() : null };
}
