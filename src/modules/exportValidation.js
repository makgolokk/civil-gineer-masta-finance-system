export async function validatePdfBlob(blob) {
  if (!(blob instanceof Blob)) return { ok: false, reason: "PDF export did not return a file." };
  if (blob.size < 800) return { ok: false, reason: "PDF export returned an empty or incomplete file." };
  const header = await blob.slice(0, 5).text();
  if (header !== "%PDF-") return { ok: false, reason: "PDF export returned an invalid file." };
  return { ok: true };
}

export async function validateExcelBlob(blob) {
  if (!(blob instanceof Blob)) return { ok: false, reason: "Excel export did not return a file." };
  if (blob.size < 1200) return { ok: false, reason: "Excel export returned an empty or incomplete workbook." };
  const header = await blob.slice(0, 2).text();
  if (header !== "PK") return { ok: false, reason: "Excel export returned an invalid workbook." };
  return { ok: true };
}

export async function isValidPdfBlob(blob) {
  return (await validatePdfBlob(blob)).ok;
}

export async function isValidExcelBlob(blob) {
  return (await validateExcelBlob(blob)).ok;
}
