from __future__ import annotations

import json
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from urllib.parse import urlparse

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

HOST = "127.0.0.1"
PORT = 8765
CURRENCY = "BWP"

COMPANY = {
    "name": "Civil-Gineer Masta",
    "subtitle": "Civil and structural engineering services",
    "address": "Gaborone, Botswana",
    "phone": "+267 00 000 000",
    "email": "accounts@civilgineermasta.com",
    "terms": "Payment due according to agreed project terms. Please reference the document number on all payments.",
}

RED = "D71920"
BLACK = "111111"
WHITE = "FFFFFF"
LIGHT = "F5F6F8"


def money(value):
    return f"{CURRENCY} {float(value or 0):,.2f}"


def line_total(item):
    return float(item.get("qty") or 0) * float(item.get("rate") or 0)


def document_total(document):
    return sum(line_total(item) for item in document.get("items", []))


def invoice_paid(data, invoice_id):
    return sum(float(payment.get("amount") or 0) for payment in data.get("payments", []) if payment.get("invoiceId") == invoice_id)


def invoice_status(data, invoice):
    total = document_total(invoice)
    paid = invoice_paid(data, invoice.get("id"))
    if paid <= 0:
        return "Unpaid"
    if paid + 0.01 >= total:
        return "Paid"
    return "Partial"


def find_by_id(items, item_id):
    return next((item for item in items if item.get("id") == item_id), None)


def client_name(data, client_id):
    client = find_by_id(data.get("clients", []), client_id) or {}
    return client.get("name", "")


def month_key(value):
    return str(value or "")[:7]


def current_month_summary(data):
    month = datetime.now().strftime("%Y-%m")
    invoices = [item for item in data.get("invoices", []) if month_key(item.get("date")) == month]
    payments = [item for item in data.get("payments", []) if month_key(item.get("date")) == month]
    expenses = [item for item in data.get("expenses", []) if month_key(item.get("date")) == month]
    invoiced = sum(document_total(item) for item in invoices)
    received = sum(float(item.get("amount") or 0) for item in payments)
    spent = sum(float(item.get("amount") or 0) for item in expenses)
    return {
        "month": month,
        "invoiced": invoiced,
        "received": received,
        "expenses": spent,
        "net": received - spent,
    }


def stylesheet():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="SmallMuted",
            parent=styles["Normal"],
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#5F6672"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="DocTitle",
            parent=styles["Heading1"],
            fontSize=18,
            leading=22,
            textColor=colors.HexColor(f"#{BLACK}"),
            spaceAfter=6,
        )
    )
    return styles


def brand_header(title, number, styles):
    return Table(
        [
            [
                Paragraph(f"<b>{COMPANY['name']}</b><br/><font size='8'>{COMPANY['subtitle']}</font>", styles["Normal"]),
                Paragraph(f"<b>{title}</b><br/><font size='9'>{number}</font>", styles["Normal"]),
            ],
            [
                Paragraph(f"{COMPANY['address']}<br/>{COMPANY['phone']}<br/>{COMPANY['email']}", styles["SmallMuted"]),
                "",
            ],
        ],
        colWidths=[115 * mm, 55 * mm],
        style=[
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(f"#{BLACK}")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#FFFFFF")),
            ("LINEBELOW", (0, 0), (-1, 0), 2, colors.HexColor(f"#{RED}")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ALIGN", (1, 0), (1, 0), "RIGHT"),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ],
    )


def build_document_pdf(data, kind, document):
    styles = stylesheet()
    client = find_by_id(data.get("clients", []), document.get("clientId")) or {}
    buffer = BytesIO()
    pdf = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm)
    story = [
        brand_header(kind.title(), document.get("number", ""), styles),
        Spacer(1, 8 * mm),
        Paragraph(f"<b>Client Details</b><br/>{client.get('name', '')}<br/>{client.get('contact', '')}<br/>{client.get('email', '')}<br/>{client.get('phone', '')}<br/>{client.get('address', '')}", styles["Normal"]),
        Spacer(1, 5 * mm),
    ]
    due_label = "Due date" if kind == "invoice" else "Valid until"
    due_value = document.get("dueDate") if kind == "invoice" else document.get("validUntil")
    story.append(
        Table(
            [["Document date", document.get("date", ""), due_label, due_value or ""]],
            colWidths=[35 * mm, 45 * mm, 35 * mm, 45 * mm],
            style=[
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(f"#{LIGHT}")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#D8DDE4")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D8DDE4")),
                ("FONTNAME", (0, 0), (0, 0), "Helvetica-Bold"),
                ("FONTNAME", (2, 0), (2, 0), "Helvetica-Bold"),
                ("PADDING", (0, 0), (-1, -1), 8),
            ],
        )
    )
    story.append(Spacer(1, 7 * mm))
    rows = [["Description", "Qty", "Rate", "Line Total"]]
    for item in document.get("items", []):
        rows.append([item.get("description", ""), item.get("qty", 0), money(item.get("rate")), money(line_total(item))])
    rows.append(["", "", "Total", money(document_total(document))])
    table = Table(rows, colWidths=[88 * mm, 18 * mm, 30 * mm, 34 * mm], repeatRows=1)
    table.setStyle(document_table_style())
    story.extend([table, Spacer(1, 7 * mm)])
    if kind == "invoice":
        story.append(Paragraph(f"<b>Payment status:</b> {invoice_status(data, document)} | <b>Paid:</b> {money(invoice_paid(data, document.get('id')))}", styles["Normal"]))
        story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(f"<b>Payment Terms</b><br/>{COMPANY['terms']}", styles["Normal"]))
    if document.get("notes"):
        story.extend([Spacer(1, 4 * mm), Paragraph(f"<b>Notes</b><br/>{document.get('notes')}", styles["Normal"])])
    story.extend([Spacer(1, 14 * mm), signature_table()])
    pdf.build(story)
    return buffer.getvalue()


def document_table_style():
    return TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(f"#{RED}")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
            ("FONTNAME", (-2, -1), (-1, -1), "Helvetica-Bold"),
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor(f"#{LIGHT}")),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D8DDE4")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("PADDING", (0, 0), (-1, -1), 7),
        ]
    )


def signature_table():
    return Table(
        [["Prepared by", "Approved / Client Signature"], ["", ""]],
        colWidths=[80 * mm, 80 * mm],
        rowHeights=[8 * mm, 18 * mm],
        style=[
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("LINEBELOW", (0, 1), (-1, 1), 0.8, colors.HexColor("#333333")),
            ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ],
    )


def build_receipt_pdf(data, payment):
    styles = stylesheet()
    invoice = find_by_id(data.get("invoices", []), payment.get("invoiceId")) or {}
    client = find_by_id(data.get("clients", []), invoice.get("clientId")) or {}
    buffer = BytesIO()
    pdf = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm)
    rows = [
        ["Receipt number", payment.get("receiptNumber", "")],
        ["Payment date", payment.get("date", "")],
        ["Received from", client.get("name", "")],
        ["Invoice", invoice.get("number", "")],
        ["Amount", money(payment.get("amount"))],
        ["Method", payment.get("method", "")],
        ["Reference", payment.get("reference", "")],
    ]
    story = [
        brand_header("Receipt", payment.get("receiptNumber", ""), styles),
        Spacer(1, 10 * mm),
        Table(rows, colWidths=[45 * mm, 105 * mm], style=document_table_style()),
        Spacer(1, 8 * mm),
        Paragraph(f"<b>Notes</b><br/>Thank you for your payment. This receipt confirms funds recorded against invoice {invoice.get('number', '')}.", styles["Normal"]),
        Spacer(1, 14 * mm),
        signature_table(),
    ]
    pdf.build(story)
    return buffer.getvalue()


def build_report_pdf(data):
    styles = stylesheet()
    summary = current_month_summary(data)
    buffer = BytesIO()
    pdf = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=14 * mm)
    rows = [
        ["Metric", "Amount"],
        ["Invoice value issued", money(summary["invoiced"])],
        ["Cash received", money(summary["received"])],
        ["Expenses recorded", money(summary["expenses"])],
        ["Net cash position", money(summary["net"])],
    ]
    invoices = [["Invoice", "Client", "Total", "Paid", "Status"]]
    for invoice in data.get("invoices", []):
        invoices.append([invoice.get("number", ""), client_name(data, invoice.get("clientId")), money(document_total(invoice)), money(invoice_paid(data, invoice.get("id"))), invoice_status(data, invoice)])
    story = [
        brand_header("Monthly Financial Report", summary["month"], styles),
        Spacer(1, 8 * mm),
        Paragraph("<b>Summary</b>", styles["DocTitle"]),
        Table(rows, colWidths=[70 * mm, 45 * mm], style=document_table_style()),
        Spacer(1, 8 * mm),
        Paragraph("<b>Invoice Payment Position</b>", styles["DocTitle"]),
        Table(invoices, colWidths=[35 * mm, 75 * mm, 35 * mm, 35 * mm, 35 * mm], style=document_table_style()),
        Spacer(1, 10 * mm),
        signature_table(),
    ]
    pdf.build(story)
    return buffer.getvalue()


def build_generic_report_pdf(report):
    styles = stylesheet()
    title = report.get("title", "Accounting Report")
    headers = report.get("headers", [])
    rows = report.get("rows", [])
    buffer = BytesIO()
    pdf = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=14 * mm, rightMargin=14 * mm, topMargin=14 * mm, bottomMargin=14 * mm)
    table_rows = [headers] + rows if headers else rows
    widths = [250 / max(len(table_rows[0]), 1) * mm for _ in table_rows[0]] if table_rows else [60 * mm]
    story = [
        brand_header(title, datetime.now().strftime("%Y-%m-%d"), styles),
        Spacer(1, 8 * mm),
        Table(table_rows or [["No records"]], colWidths=widths, style=document_table_style()),
        Spacer(1, 10 * mm),
        signature_table(),
    ]
    pdf.build(story)
    return buffer.getvalue()


def build_workbook(data):
    wb = Workbook()
    wb.remove(wb.active)
    add_summary_sheet(wb, data)
    add_table_sheet(wb, "Clients", ["Name", "Contact", "Email", "Phone", "Address", "Tax/VAT", "Created"], [
        [c.get("name", ""), c.get("contact", ""), c.get("email", ""), c.get("phone", ""), c.get("address", ""), c.get("taxId", ""), c.get("createdAt", "")]
        for c in data.get("clients", [])
    ])
    add_table_sheet(wb, "Quotations", ["Number", "Client", "Date", "Valid Until", "Status", "Total", "Notes"], [
        [q.get("number", ""), client_name(data, q.get("clientId")), q.get("date", ""), q.get("validUntil", ""), q.get("status", ""), document_total(q), q.get("notes", "")]
        for q in data.get("quotations", [])
    ], money_cols=[6])
    add_table_sheet(wb, "Quotation Items", ["Quotation", "Client", "Description", "Qty", "Rate", "Line Total"], [
        [q.get("number", ""), client_name(data, q.get("clientId")), item.get("description", ""), item.get("qty", 0), item.get("rate", 0), line_total(item)]
        for q in data.get("quotations", []) for item in q.get("items", [])
    ], money_cols=[5, 6])
    add_table_sheet(wb, "Invoices", ["Number", "Client", "Date", "Due Date", "Total", "Paid", "Outstanding", "Status", "Notes"], [
        [i.get("number", ""), client_name(data, i.get("clientId")), i.get("date", ""), i.get("dueDate", ""), document_total(i), invoice_paid(data, i.get("id")), document_total(i) - invoice_paid(data, i.get("id")), invoice_status(data, i), i.get("notes", "")]
        for i in data.get("invoices", [])
    ], money_cols=[5, 6, 7])
    add_table_sheet(wb, "Invoice Items", ["Invoice", "Client", "Description", "Qty", "Rate", "Line Total"], [
        [i.get("number", ""), client_name(data, i.get("clientId")), item.get("description", ""), item.get("qty", 0), item.get("rate", 0), line_total(item)]
        for i in data.get("invoices", []) for item in i.get("items", [])
    ], money_cols=[5, 6])
    add_table_sheet(wb, "Payments", ["Date", "Receipt", "Invoice", "Client", "Amount", "Method", "Reference"], [
        [p.get("date", ""), p.get("receiptNumber", ""), invoice_number(data, p.get("invoiceId")), payment_client(data, p), p.get("amount", 0), p.get("method", ""), p.get("reference", "")]
        for p in data.get("payments", [])
    ], money_cols=[5])
    add_table_sheet(wb, "Receipts", ["Receipt", "Date", "Client", "Invoice", "Amount", "Method", "Reference"], [
        [p.get("receiptNumber", ""), p.get("date", ""), payment_client(data, p), invoice_number(data, p.get("invoiceId")), p.get("amount", 0), p.get("method", ""), p.get("reference", "")]
        for p in data.get("payments", [])
    ], money_cols=[5])
    add_table_sheet(wb, "Expenses", ["Date", "Category", "Vendor", "Description", "Amount", "Payment Method"], [
        [e.get("date", ""), e.get("category", ""), e.get("vendor", ""), e.get("description", ""), e.get("amount", 0), e.get("paymentMethod", "")]
        for e in data.get("expenses", [])
    ], money_cols=[5])
    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def build_generic_report_workbook(report):
    wb = Workbook()
    ws = wb.active
    ws.title = "Report"
    title = report.get("title", "Accounting Report")
    headers = report.get("headers", [])
    rows = report.get("rows", [])
    ws.append([title])
    ws.append(headers)
    for row in rows:
      ws.append(row)
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=max(len(headers), 1))
    ws["A1"].font = Font(bold=True, size=16, color=WHITE)
    ws["A1"].fill = PatternFill("solid", fgColor=BLACK)
    style_sheet(ws)
    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def invoice_number(data, invoice_id):
    invoice = find_by_id(data.get("invoices", []), invoice_id) or {}
    return invoice.get("number", "")


def payment_client(data, payment):
    invoice = find_by_id(data.get("invoices", []), payment.get("invoiceId")) or {}
    return client_name(data, invoice.get("clientId"))


def add_summary_sheet(wb, data):
    ws = wb.create_sheet("Monthly Summary")
    summary = current_month_summary(data)
    rows = [
        ["Civil-Gineer Masta", "", "", ""],
        ["Monthly Financial Summary", summary["month"], "", ""],
        ["Metric", "Amount", "Formula / Notes", ""],
        ["Invoice value issued", summary["invoiced"], "Sum of invoices dated this month", ""],
        ["Cash received", summary["received"], "Sum of payments dated this month", ""],
        ["Expenses recorded", summary["expenses"], "Sum of expenses dated this month", ""],
        ["Net cash position", None, "=B5-B6", ""],
    ]
    for row in rows:
        ws.append(row)
    ws["B7"] = "=B5-B6"
    style_sheet(ws, money_cols=[2])
    ws.merge_cells("A1:D1")
    ws["A1"].font = Font(bold=True, size=18, color=WHITE)
    ws["A1"].fill = PatternFill("solid", fgColor=BLACK)
    ws["A2"].font = Font(bold=True, size=13, color=RED)


def add_table_sheet(wb, title, headers, rows, money_cols=None):
    ws = wb.create_sheet(title)
    ws.append(headers)
    for row in rows:
        ws.append(row)
    if rows:
        total_row = ws.max_row + 1
        ws.cell(total_row, 1, "Totals")
        for col in money_cols or []:
            letter = get_column_letter(col)
            ws.cell(total_row, col, f"=SUM({letter}2:{letter}{total_row - 1})")
    style_sheet(ws, money_cols=money_cols or [])


def style_sheet(ws, money_cols=None):
    header_fill = PatternFill("solid", fgColor=RED)
    title_fill = PatternFill("solid", fgColor=BLACK)
    thin = Side(style="thin", color="D8DDE4")
    for row in ws.iter_rows():
        for cell in row:
            cell.border = Border(bottom=thin)
            cell.alignment = Alignment(vertical="top", wrap_text=True)
    for cell in ws[1]:
        cell.fill = header_fill if ws.title != "Monthly Summary" else title_fill
        cell.font = Font(bold=True, color=WHITE)
    for col in money_cols or []:
        for cell in ws.iter_cols(min_col=col, max_col=col, min_row=2):
            for item in cell:
                item.number_format = '"BWP" #,##0.00'
    ws.freeze_panes = "A2"
    for index, column in enumerate(ws.columns, start=1):
        max_len = max(len(str(cell.value or "")) for cell in column)
        ws.column_dimensions[get_column_letter(index)].width = min(max(max_len + 2, 12), 34)


class ExportHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if urlparse(self.path).path == "/health":
            self._send_json({"ok": True, "service": "CGM export backend"})
            return
        self.send_error(404)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            data = payload.get("data", {})
            path = urlparse(self.path).path
            if path == "/api/export/pdf":
                content = self._pdf(payload, data)
                self._send_file(content, "application/pdf", payload.get("filename") or "cgm-export.pdf")
                return
            if path == "/api/export/excel":
                content = build_generic_report_workbook(payload["report"]) if payload.get("report") else build_workbook(data)
                self._send_file(content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", payload.get("filename") or "cgm-accounting-export.xlsx")
                return
            self.send_error(404)
        except Exception as exc:
            self._send_json({"ok": False, "error": str(exc)}, status=500)

    def _pdf(self, payload, data):
        kind = payload.get("kind")
        item_id = payload.get("id")
        if kind == "quotation":
            document = find_by_id(data.get("quotations", []), item_id)
            return build_document_pdf(data, "quotation", document)
        if kind == "invoice":
            document = find_by_id(data.get("invoices", []), item_id)
            return build_document_pdf(data, "invoice", document)
        if kind == "receipt":
            payment = find_by_id(data.get("payments", []), item_id)
            return build_receipt_pdf(data, payment)
        if kind == "financial-report":
            return build_report_pdf(data)
        if kind == "generic-report":
            return build_generic_report_pdf(payload.get("report", {}))
        raise ValueError("Unsupported PDF export kind")

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send_file(self, content, content_type, filename):
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def _send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    print(f"CGM export backend running at http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), ExportHandler).serve_forever()
