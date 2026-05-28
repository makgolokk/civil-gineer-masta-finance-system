import assert from "node:assert/strict";
import test from "node:test";

globalThis.window = { location: { hostname: "localhost" }, CGM_EXPORT_API_BASE_URL: "" };

const { exportApiBaseUrl } = await import("../src/modules/exportConfig.js");

test("export API base URL trims trailing slash", () => {
  window.CGM_EXPORT_API_BASE_URL = "https://exports.example.com/";
  assert.equal(exportApiBaseUrl(), "https://exports.example.com");
});

test("local development defaults to the local export backend", () => {
  window.CGM_EXPORT_API_BASE_URL = "";
  window.location.hostname = "127.0.0.1";
  assert.equal(exportApiBaseUrl(), "http://127.0.0.1:8765");
});

test("production requires explicit export backend configuration", () => {
  window.CGM_EXPORT_API_BASE_URL = "";
  window.location.hostname = "app.example.com";
  assert.equal(exportApiBaseUrl(), "");
});
