export function decorateResponsiveTables(root = document) {
  [...root.querySelectorAll(".table-wrap table")].forEach((table) => {
    const headers = [...table.querySelectorAll("thead th")].map((header) => header.textContent.trim());
    [...table.querySelectorAll("tbody tr")].forEach((row) => {
      [...row.querySelectorAll("td")].forEach((cell, index) => {
        cell.dataset.label = headers[index] || "";
      });
    });
  });
}

export function filterTableRows(root, tableId, query) {
  const table = root.querySelector(`#${CSS.escape(tableId)}`);
  if (!table) return;
  const needle = String(query || "").toLowerCase();
  [...table.querySelectorAll("tbody tr")].forEach((row) => {
    row.hidden = Boolean(needle) && !row.textContent.toLowerCase().includes(needle);
  });
}

export function tableHtml({ id, headers, rows, escapeHtml, allowHtml = true }) {
  const safeRows = rows.length ? rows : [["No records yet", ...headers.slice(1).map(() => "")]];
  return `<div class="table-wrap"><table id="${escapeHtml(id)}"><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${safeRows.map((row) => `<tr>${row.map((cell) => {
    const value = String(cell);
    const isHtml = allowHtml && (value.startsWith("<button") || value.startsWith("<div") || value.startsWith("<span"));
    return `<td>${isHtml ? value : escapeHtml(value)}</td>`;
  }).join("")}</tr>`).join("")}</tbody></table></div>`;
}

export function miniReportTable({ caption = "", rows, headers = ["Metric", "Value"], escapeHtml }) {
  const safeRows = rows.length ? rows : [["No records yet", ""]];
  return `${caption ? `<h3>${escapeHtml(caption)}</h3>` : ""}<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${safeRows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
