export const CGM_COLORS = {
  red: [215, 25, 32],
  black: [17, 17, 17],
  charcoal: [33, 37, 45],
  muted: [91, 102, 120],
  line: [216, 222, 232],
  soft: [250, 250, 251],
  paleRed: [255, 248, 248],
  white: [255, 255, 255],
};

export const PDF_LAYOUT = {
  pageWidth: 210,
  pageHeight: 297,
  marginX: 14,
  topBarHeight: 34,
  footerY: 286,
  contentWidth: 182,
};

export const EXCEL_STYLE = {
  titleFill: "111111",
  accentFill: "D71920",
  headerFill: "111111",
  paleFill: "FFF8F8",
  softFill: "FAFAFB",
  white: "FFFFFF",
  line: "D8DEE8",
  text: "111111",
  muted: "5B6678",
  red: "D71920",
};

export function argb(hex) {
  return `FF${hex.replace("#", "")}`;
}

export function thinBorder(color = EXCEL_STYLE.line) {
  return {
    top: { style: "thin", color: { argb: argb(color) } },
    left: { style: "thin", color: { argb: argb(color) } },
    bottom: { style: "thin", color: { argb: argb(color) } },
    right: { style: "thin", color: { argb: argb(color) } },
  };
}

export function sheetName(value) {
  return String(value || "Export").replace(/[\[\]*?:/\\]/g, " ").slice(0, 31).trim() || "Export";
}
