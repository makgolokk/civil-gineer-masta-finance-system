import { argb, EXCEL_STYLE, sheetName, thinBorder } from "./exportStyles.js";
import { asNumber, columnLooksNumeric, dateTimeValue, parseReportCell, safeFilename } from "./exportFormatters.js";
import { templateForPayload } from "./documentTemplates.js";
import { validateExcelBlob } from "./exportValidation.js";

async function excelTools() {
  const module = await import("exceljs");
  return module.default || module;
}

function styleTitle(row) {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, size: 14, color: { argb: argb(EXCEL_STYLE.white) } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(EXCEL_STYLE.titleFill) } };
    cell.alignment = { vertical: "middle" };
  });
}

function styleSubtitle(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: argb(EXCEL_STYLE.red) } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(EXCEL_STYLE.paleFill) } };
  });
}

function styleHeader(row) {
  row.height = 20;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: argb(EXCEL_STYLE.white) } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(EXCEL_STYLE.headerFill) } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = thinBorder();
  });
}

function styleBody(row, currencyColumns = []) {
  row.eachCell((cell, colNumber) => {
    cell.alignment = { vertical: "top", wrapText: true };
    cell.border = thinBorder();
    if (currencyColumns.includes(colNumber)) {
      cell.numFmt = '"BWP" #,##0.00;[Red]-"BWP" #,##0.00';
      cell.alignment = { vertical: "top", horizontal: "right", wrapText: true };
    }
  });
}

function addCompanyHeader(sheet, template, columnCount) {
  const company = template.company || {};
  sheet.mergeCells(1, 1, 1, columnCount);
  sheet.getCell(1, 1).value = company.name || "Civil-Gineer Masta Proprietary Limited";
  styleTitle(sheet.getRow(1));
  sheet.mergeCells(2, 1, 2, columnCount);
  sheet.getCell(2, 1).value = [company.address, company.phone, company.email].filter(Boolean).join(" | ");
  sheet.getRow(2).font = { color: { argb: argb(EXCEL_STYLE.muted) } };
  sheet.mergeCells(3, 1, 3, columnCount);
  sheet.getCell(3, 1).value = template.title;
  styleSubtitle(sheet.getRow(3));
  sheet.mergeCells(4, 1, 4, columnCount);
  sheet.getCell(4, 1).value = `Generated ${dateTimeValue(new Date())}${template.number ? ` | ${template.number}` : ""}`;
  sheet.getRow(4).font = { color: { argb: argb(EXCEL_STYLE.muted) } };
}

function addMetaRows(sheet, template, startRow = 6) {
  let rowNumber = startRow;
  (template.meta || []).filter(([, value]) => value !== "").forEach(([label, value]) => {
    const row = sheet.getRow(rowNumber);
    row.getCell(1).value = label;
    row.getCell(2).value = value;
    row.getCell(1).font = { bold: true };
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(EXCEL_STYLE.softFill) } };
    row.eachCell((cell) => {
      cell.border = thinBorder();
      cell.alignment = { wrapText: true, vertical: "top" };
    });
    rowNumber += 1;
  });
  return rowNumber + 1;
}

function configureSheet(sheet, columnWidths) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.pageSetup = { paperSize: 9, orientation: columnWidths.length > 5 ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  sheet.properties.defaultRowHeight = 18;
  sheet.columns = columnWidths.map((width) => ({ width }));
}

function addDocumentSheet(workbook, template) {
  const sheet = workbook.addWorksheet(sheetName(template.title));
  configureSheet(sheet, [36, 20, 12, 14, 16, 16]);
  addCompanyHeader(sheet, template, 6);
  let rowNumber = addMetaRows(sheet, template, 6);
  const header = sheet.getRow(rowNumber);
  ["Description", "Service", "Qty", "Unit", "Rate", "Amount"].forEach((value, index) => { header.getCell(index + 1).value = value; });
  styleHeader(header);
  rowNumber += 1;
  template.items.forEach((item) => {
    const row = sheet.getRow(rowNumber);
    row.values = [item.description, item.service, item.qty, item.unit, item.rate, { formula: `C${rowNumber}*E${rowNumber}`, result: item.amount }];
    styleBody(row, [5, 6]);
    rowNumber += 1;
  });
  rowNumber += 1;
  template.totals.forEach(([label, value]) => {
    const row = sheet.getRow(rowNumber);
    row.getCell(5).value = label;
    row.getCell(6).value = value;
    row.getCell(5).font = { bold: true };
    row.getCell(6).font = { bold: true };
    styleBody(row, [6]);
    rowNumber += 1;
  });
  rowNumber += 1;
  sheet.getCell(rowNumber, 1).value = "Notes / Exclusions";
  sheet.getCell(rowNumber, 1).font = { bold: true, color: { argb: argb(EXCEL_STYLE.red) } };
  sheet.mergeCells(rowNumber + 1, 1, rowNumber + 3, 6);
  sheet.getCell(rowNumber + 1, 1).value = template.notes.join("\n") || "Thank you for your business.";
  sheet.getCell(rowNumber + 1, 1).alignment = { wrapText: true, vertical: "top" };
  sheet.getCell(rowNumber + 1, 1).border = thinBorder();
}

function addReceiptSheet(workbook, template) {
  const sheet = workbook.addWorksheet("Receipt");
  configureSheet(sheet, [24, 36, 20, 20]);
  addCompanyHeader(sheet, template, 4);
  let rowNumber = addMetaRows(sheet, template, 6);
  const amountRow = sheet.getRow(rowNumber);
  amountRow.getCell(1).value = "Amount received";
  amountRow.getCell(2).value = template.amountReceived;
  amountRow.getCell(1).font = { bold: true, size: 13 };
  amountRow.getCell(2).font = { bold: true, size: 13, color: { argb: argb(EXCEL_STYLE.red) } };
  styleBody(amountRow, [2]);
  rowNumber += 2;
  template.totals.forEach(([label, value]) => {
    const row = sheet.getRow(rowNumber);
    row.getCell(1).value = label;
    row.getCell(2).value = value;
    row.getCell(1).font = { bold: true };
    styleBody(row, [2]);
    rowNumber += 1;
  });
}

function addStatementSheet(workbook, template) {
  const sheet = workbook.addWorksheet("Statement");
  configureSheet(sheet, [15, 18, 22, 16, 16, 16]);
  addCompanyHeader(sheet, template, 6);
  let rowNumber = addMetaRows(sheet, template, 6);
  const header = sheet.getRow(rowNumber);
  template.headers.forEach((value, index) => { header.getCell(index + 1).value = value; });
  styleHeader(header);
  rowNumber += 1;
  template.rows.forEach((values) => {
    const row = sheet.getRow(rowNumber);
    row.values = values;
    styleBody(row, [4, 5, 6]);
    rowNumber += 1;
  });
  rowNumber += 1;
  template.totals.forEach(([label, value]) => {
    const row = sheet.getRow(rowNumber);
    row.getCell(5).value = label;
    row.getCell(6).value = value;
    row.getCell(5).font = { bold: true };
    row.getCell(6).font = { bold: true };
    styleBody(row, [6]);
    rowNumber += 1;
  });
}

function addReportSheet(workbook, template) {
  const sheet = workbook.addWorksheet(sheetName(template.title));
  const columnCount = Math.max(2, template.headers.length);
  configureSheet(sheet, template.headers.map((header) => Math.min(34, Math.max(14, String(header).length + 6))));
  addCompanyHeader(sheet, template, columnCount);
  let rowNumber = addMetaRows(sheet, template, 6);
  const header = sheet.getRow(rowNumber);
  template.headers.forEach((value, index) => { header.getCell(index + 1).value = value; });
  styleHeader(header);
  const headerRow = rowNumber;
  rowNumber += 1;
  const numericColumns = template.headers
    .map((headerText, index) => columnLooksNumeric(headerText, template.rows.map((row) => row[index])) ? index + 1 : 0)
    .filter(Boolean);
  template.rows.forEach((values) => {
    const row = sheet.getRow(rowNumber);
    values.forEach((value, index) => { row.getCell(index + 1).value = numericColumns.includes(index + 1) ? parseReportCell(value) : value; });
    styleBody(row, numericColumns);
    rowNumber += 1;
  });
  if (template.rows.length && numericColumns.length) {
    rowNumber += 1;
    const totalRow = sheet.getRow(rowNumber);
    totalRow.getCell(1).value = "Summary totals";
    totalRow.getCell(1).font = { bold: true };
    numericColumns.forEach((column) => {
      totalRow.getCell(column).value = { formula: `SUM(${sheet.getColumn(column).letter}${headerRow + 1}:${sheet.getColumn(column).letter}${rowNumber - 2})` };
      totalRow.getCell(column).font = { bold: true };
    });
    styleBody(totalRow, numericColumns);
  }
  sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: columnCount } };
}

export async function buildFrontendExcelBlob(kind, payload) {
  const ExcelJS = await excelTools();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Civil-Gineer Masta";
  workbook.created = new Date();
  workbook.modified = new Date();
  const template = templateForPayload(kind, payload);
  if (template.type === "business-document") addDocumentSheet(workbook, template);
  else if (template.type === "receipt") addReceiptSheet(workbook, template);
  else if (template.type === "statement") addStatementSheet(workbook, template);
  else addReportSheet(workbook, template);
  workbook.eachSheet((sheet) => {
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.alignment = { ...(cell.alignment || {}), wrapText: true, vertical: cell.alignment?.vertical || "top" };
      });
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const validation = await validateExcelBlob(blob);
  if (!validation.ok) throw new Error(validation.reason);
  return blob;
}

export function frontendExcelFilename(kind, payload) {
  return safeFilename(templateForPayload(kind, payload).filenameTitle, "xlsx");
}
