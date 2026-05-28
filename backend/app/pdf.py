from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .models import (
    Client,
    ClientStatement,
    CompanyProfile,
    ExportContext,
    Invoice,
    ItemLine,
    Quotation,
    Receipt,
)

RED = colors.HexColor("#D71920")
BLACK = colors.HexColor("#111111")
INK = colors.HexColor("#1F2328")
MUTED = colors.HexColor("#5F6672")
LINE = colors.HexColor("#D8DDE4")
SOFT = colors.HexColor("#F5F6F8")
PAPER = colors.white


def money(value: float, currency: str = "BWP") -> str:
    return f"{currency} {float(value or 0):,.2f}"


def line_total(item: ItemLine) -> float:
    return float(item.qty or 0) * float(item.rate or 0)


def document_subtotal(items: list[ItemLine]) -> float:
    return sum(line_total(item) for item in items)


def document_tax(subtotal: float, discount: float, tax_rate: float, tax_amount: float | None) -> float:
    if tax_amount is not None:
        return float(tax_amount or 0)
    return max(0, subtotal - float(discount or 0)) * (float(tax_rate or 0) / 100)


def document_total(items: list[ItemLine], discount: float = 0, tax_rate: float = 0, tax_amount: float | None = None) -> float:
    subtotal = document_subtotal(items)
    tax = document_tax(subtotal, discount, tax_rate, tax_amount)
    return max(0, subtotal - float(discount or 0) + tax)


def styles():
    sheet = getSampleStyleSheet()
    sheet["Normal"].fontName = "Helvetica"
    sheet["Normal"].fontSize = 9
    sheet["Normal"].leading = 12
    sheet["Normal"].textColor = INK
    sheet.add(ParagraphStyle(name="Muted", parent=sheet["Normal"], fontSize=8, leading=10, textColor=MUTED))
    sheet.add(ParagraphStyle(name="Tiny", parent=sheet["Normal"], fontSize=7, leading=9, textColor=MUTED))
    sheet.add(ParagraphStyle(name="DocTitle", parent=sheet["Heading1"], fontSize=23, leading=26, textColor=RED, spaceAfter=4))
    sheet.add(ParagraphStyle(name="BoxTitle", parent=sheet["Normal"], fontName="Helvetica-Bold", fontSize=8.5, leading=10, textColor=BLACK))
    sheet.add(ParagraphStyle(name="Amount", parent=sheet["Normal"], fontName="Helvetica-Bold", fontSize=21, leading=24, textColor=RED, alignment=2))
    sheet.add(ParagraphStyle(name="Right", parent=sheet["Normal"], alignment=2))
    return sheet


def p(text: object, style) -> Paragraph:
    return Paragraph(str(text or "").replace("\n", "<br/>"), style)


def context_company(context: ExportContext) -> CompanyProfile:
    return context.settings.companyProfile


def context_currency(context: ExportContext) -> str:
    return context.settings.documentSettings.currency or "BWP"


def find_by_id(items, item_id: str):
    return next((item for item in items if item.id == item_id), None)


def client_for_document(context: ExportContext, document) -> Client:
    client = find_by_id(context.clients, getattr(document, "clientId", ""))
    if client:
        return client
    snapshot = getattr(document, "clientSnapshot", {}) or {}
    return Client(
        name=snapshot.get("name", "Prospective client"),
        contact=snapshot.get("contact", ""),
        email=snapshot.get("email", ""),
        phone=snapshot.get("phone", ""),
        address=snapshot.get("address", ""),
    )


def project_label(context: ExportContext, document) -> str:
    project = find_by_id(context.projects, getattr(document, "projectId", ""))
    if project:
        return f"{project.code} - {project.name}".strip(" -")
    return getattr(document, "projectName", "") or getattr(document, "projectCode", "") or "General works"


def project_location(context: ExportContext, document) -> str:
    project = find_by_id(context.projects, getattr(document, "projectId", ""))
    return getattr(document, "location", "") or getattr(project, "location", "") or ""


def service_name(context: ExportContext, service_id: str) -> str:
    service = find_by_id(context.services, service_id)
    return service.name if service else "General"


def brand_header(company: CompanyProfile, title: str, number: str, sheet, logo_override: Path | None = None) -> Table:
    logo_path = logo_override or Path(company.logoPath or "")
    brand_cells = []
    if logo_path.exists():
        image = Image(str(logo_path), width=32 * mm, height=22 * mm, kind="proportional")
        brand_cells.append(image)
    brand_text = [
        p(f"<b>{company.name}</b>", sheet["BoxTitle"]),
        p(company.letterhead, sheet["Muted"]),
        p(company.address, sheet["Tiny"]),
        p(" | ".join([value for value in [company.phone, company.alternatePhone, company.email] if value]), sheet["Tiny"]),
    ]
    brand_cells.append(brand_text)
    table = Table(
        [[brand_cells, [p(title.upper(), sheet["DocTitle"]), p(number, sheet["Right"])]]],
        colWidths=[122 * mm, 52 * mm],
    )
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LINEBELOW", (0, 0), (-1, -1), 1.3, BLACK),
    ]))
    return table


def info_box(title: str, rows: list[tuple[str, str]], sheet, width: float = 86 * mm) -> Table:
    body = [[p(title, sheet["BoxTitle"])]]
    body.extend([[p(label, sheet["Tiny"]), p(value, sheet["Normal"])] for label, value in rows])
    table = Table(body, colWidths=[width * 0.34, width * 0.66])
    table.setStyle(TableStyle([
        ("SPAN", (0, 0), (-1, 0)),
        ("BACKGROUND", (0, 0), (-1, 0), SOFT),
        ("BOX", (0, 0), (-1, -1), 0.7, LINE),
        ("INNERGRID", (0, 1), (-1, -1), 0.3, LINE),
        ("PADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return table


def items_table(items: list[ItemLine], sheet, currency: str) -> Table:
    data = [[p("Description", sheet["BoxTitle"]), p("Qty", sheet["BoxTitle"]), p("Unit", sheet["BoxTitle"]), p("Rate", sheet["BoxTitle"]), p("Amount", sheet["BoxTitle"])]]
    for item in items:
        data.append([
            p(item.description, sheet["Normal"]),
            p(item.qty, sheet["Right"]),
            p(item.unit or "Each", sheet["Normal"]),
            p(money(item.rate, currency), sheet["Right"]),
            p(money(line_total(item), currency), sheet["Right"]),
        ])
    if len(data) == 1:
        data.append([p("No line items supplied", sheet["Normal"]), "", "", "", ""])
    table = Table(data, colWidths=[82 * mm, 18 * mm, 24 * mm, 26 * mm, 30 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BLACK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAFAFB")]),
        ("PADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
    ]))
    return table


def totals_box(subtotal: float, discount: float, tax: float, paid: float, total: float, sheet, currency: str, balance: float | None = None) -> Table:
    balance_due = max(0, total - paid) if balance is None else float(balance or 0)
    rows = [
        ["Subtotal", money(subtotal, currency)],
        ["Discount", money(discount, currency)],
        ["VAT / Tax", money(tax, currency)],
        ["Amount paid", money(paid, currency)],
        ["Balance due", money(balance_due, currency)],
        ["Total", money(total, currency)],
    ]
    table = Table([[p(label, sheet["Normal"]), p(value, sheet["Right"])] for label, value in rows], colWidths=[32 * mm, 38 * mm])
    table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.7, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, LINE),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#FFF1F1")),
        ("TEXTCOLOR", (1, -1), (1, -1), RED),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def footer_sections(company: CompanyProfile, sheet, payment_terms: str = "", prepared_by: str = "", approved_by: str = "") -> list:
    bank = company.bankingDetails
    return [
        Table([[info_box("Banking Details", [
            ("Bank", bank.bank),
            ("Account holder", bank.accountHolder),
            ("Account type", bank.accountType),
            ("Account number", bank.accountNumber),
            ("Branch", f"{bank.branchName} {bank.branchCode}".strip()),
        ], sheet), info_box("Terms and Approval", [
            ("Terms", payment_terms or company.defaultTerms),
            ("Prepared by", prepared_by or company.preparedBy),
            ("Approved by", approved_by or company.approvedBy or "________________"),
            ("Signature", "________________________"),
        ], sheet)]], colWidths=[86 * mm, 86 * mm]),
        Spacer(1, 6),
        p(company.footerText, sheet["Muted"]),
    ]


def build_pdf(story: list) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=17 * mm, rightMargin=17 * mm, topMargin=13 * mm, bottomMargin=13 * mm)

    def draw_page_footer(canvas, document):
        canvas.saveState()
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.4)
        canvas.line(17 * mm, 10 * mm, A4[0] - 17 * mm, 10 * mm)
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(MUTED)
        canvas.drawString(17 * mm, 6 * mm, "Civil-Gineer Masta Proprietary Limited")
        canvas.drawRightString(A4[0] - 17 * mm, 6 * mm, f"Page {document.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=draw_page_footer, onLaterPages=draw_page_footer)
    return buffer.getvalue()


def build_document_pdf(kind: str, document: Quotation | Invoice, context: ExportContext, logo_path: Path | None = None) -> bytes:
    sheet = styles()
    company = context_company(context)
    currency = context_currency(context)
    client = client_for_document(context, document)
    subtotal = document_subtotal(document.items)
    discount = float(document.discount or 0)
    tax = document_tax(subtotal, discount, float(document.taxRate or 0), document.taxAmount)
    total = float(document.total) if getattr(document, "total", None) is not None else document_total(document.items, discount, float(document.taxRate or 0), document.taxAmount)
    paid = float(getattr(document, "amountPaid", 0) or 0)
    balance_due = getattr(document, "balanceDue", None)
    due_label = "Due date" if kind == "Invoice" else "Valid until"
    due_value = getattr(document, "dueDate", "") if kind == "Invoice" else getattr(document, "validUntil", "")
    notes = document.notes or company.defaultNotes
    exclusions = getattr(document, "exclusions", "")
    story = [
        brand_header(company, kind, document.number, sheet, logo_path),
        Spacer(1, 12),
        Table([[
            info_box("Client Details", [
                ("Client", client.name),
                ("Contact", client.contact),
                ("Email", client.email),
                ("Phone", client.phone),
                ("Address", client.address),
            ], sheet),
            info_box("Document Details", [
                ("Document no.", document.number),
                ("Date", document.date),
                (due_label, due_value),
                ("Project", project_label(context, document)),
                ("Location", project_location(context, document)),
                ("Service", service_name(context, document.serviceId)),
                ("Status", document.status.title()),
            ], sheet),
        ]], colWidths=[86 * mm, 86 * mm]),
        Spacer(1, 12),
        p("Scope and Line Items", sheet["BoxTitle"]),
        Spacer(1, 4),
        items_table(document.items, sheet, currency),
        Spacer(1, 10),
        Table([[p("<b>Notes / Exclusions</b><br/>" + "<br/>".join([value for value in [notes, exclusions] if value]), sheet["Normal"]), totals_box(subtotal, discount, tax, paid, total, sheet, currency, balance_due)]], colWidths=[98 * mm, 74 * mm]),
        Spacer(1, 12),
        *footer_sections(company, sheet, getattr(document, "paymentTerms", ""), getattr(document, "preparedBy", ""), getattr(document, "approvedBy", "")),
    ]
    return build_pdf(story)


def build_receipt_pdf(receipt: Receipt, context: ExportContext, logo_path: Path | None = None) -> bytes:
    sheet = styles()
    company = context_company(context)
    currency = context_currency(context)
    invoice = find_by_id(context.invoices, receipt.invoiceId) or Invoice(number="", clientId=receipt.clientId)
    client = client_for_document(context, invoice)
    total = document_total(invoice.items, invoice.discount, invoice.taxRate, invoice.taxAmount) if invoice.number else 0
    paid_total = sum(payment.amount for payment in context.payments if payment.invoiceId == receipt.invoiceId)
    balance = max(0, total - paid_total)
    story = [
        brand_header(company, "Receipt", receipt.receiptNumber, sheet, logo_path),
        Spacer(1, 12),
        Table([[
            info_box("Received From", [("Client", client.name), ("Email", client.email), ("Phone", client.phone), ("Address", client.address)], sheet),
            info_box("Payment Details", [
                ("Receipt no.", receipt.receiptNumber),
                ("Date", receipt.date),
                ("Invoice", invoice.number),
                ("Quotation / ref.", receipt.reference),
                ("Method", receipt.method),
                ("Reference", receipt.reference),
                ("Prepared by", getattr(receipt, "preparedBy", "") or company.preparedBy),
            ], sheet),
        ]], colWidths=[86 * mm, 86 * mm]),
        Spacer(1, 18),
        Table([[p("Amount Received", sheet["BoxTitle"]), p(money(receipt.amount, currency), sheet["Amount"])]], colWidths=[74 * mm, 98 * mm], style=[
            ("BOX", (0, 0), (-1, -1), 0.9, LINE),
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFF8F8")),
            ("PADDING", (0, 0), (-1, -1), 10),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]),
        Spacer(1, 10),
        totals_box(total, 0, 0, paid_total, total, sheet, currency, balance),
        Spacer(1, 14),
        p(f"Thank you for your payment. This receipt confirms funds recorded against invoice {invoice.number or receipt.invoiceId}. Balance remaining: {money(balance, currency)}.", sheet["Normal"]),
        Spacer(1, 12),
        *footer_sections(company, sheet),
    ]
    return build_pdf(story)


def build_statement_pdf(statement: ClientStatement, context: ExportContext, logo_path: Path | None = None) -> bytes:
    sheet = styles()
    company = context_company(context)
    currency = context_currency(context)
    rows = [[p("Date", sheet["BoxTitle"]), p("Type", sheet["BoxTitle"]), p("Number", sheet["BoxTitle"]), p("Debit", sheet["BoxTitle"]), p("Credit", sheet["BoxTitle"]), p("Balance", sheet["BoxTitle"])]]
    for row in statement.rows:
        rows.append([p(row.date, sheet["Normal"]), p(row.type, sheet["Normal"]), p(row.number, sheet["Normal"]), p(money(row.debit, currency), sheet["Right"]), p(money(row.credit, currency), sheet["Right"]), p(money(row.balance, currency), sheet["Right"])])
    if len(rows) == 1:
        rows.append([p("No transactions", sheet["Normal"]), "", "", "", "", ""])
    table = Table(rows, colWidths=[24 * mm, 33 * mm, 34 * mm, 27 * mm, 27 * mm, 31 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BLACK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAFAFB")]),
        ("PADDING", (0, 0), (-1, -1), 5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story = [
        brand_header(company, "Statement of Account", statement.statementNumber or statement.client.name, sheet, logo_path),
        Spacer(1, 12),
        Table([[
            info_box("Client", [("Name", statement.client.name), ("Email", statement.client.email), ("Phone", statement.client.phone), ("Address", statement.client.address)], sheet),
            info_box("Statement", [("Statement date", statement.toDate), ("From", statement.fromDate), ("To", statement.toDate), ("Opening balance", money(statement.openingBalance, currency)), ("Closing balance", money(statement.balance, currency))], sheet),
        ]], colWidths=[86 * mm, 86 * mm]),
        Spacer(1, 12),
        table,
        Spacer(1, 12),
        totals_box(0, 0, 0, 0, statement.balance, sheet, currency),
        Spacer(1, 12),
        *footer_sections(company, sheet),
    ]
    return build_pdf(story)
