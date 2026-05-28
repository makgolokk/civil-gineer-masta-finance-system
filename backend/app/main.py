from typing import Any

from fastapi import Body, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .config import get_settings
from .excel import build_report_excel
from .models import (
    ExportContext,
    HealthResponse,
    Invoice,
    InvoiceExportRequest,
    Quotation,
    QuotationExportRequest,
    Receipt,
    ReceiptExportRequest,
    ClientStatement,
    StatementExportRequest,
)
from .pdf import build_document_pdf, build_receipt_pdf, build_statement_pdf

settings = get_settings()

app = FastAPI(title=settings.app_name, version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins or ["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def pdf_response(content: bytes, filename: str) -> Response:
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(content=content, media_type="application/pdf", headers=headers)


def excel_response(content: bytes, filename: str) -> Response:
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return Response(content=content, media_type=media_type, headers=headers)


def get_context(payload: dict[str, Any]) -> ExportContext:
    return ExportContext.model_validate(payload.get("context") or payload.get("data") or {})


def get_filename(payload: dict[str, Any], fallback: str) -> str:
    return payload.get("filename") or fallback


def generic_kind(payload: dict[str, Any]) -> str:
    return str(payload.get("documentType") or payload.get("type") or payload.get("kind") or payload.get("title") or "").lower().replace("_", "-").strip()


def generic_pdf(payload: dict[str, Any]) -> Response:
    kind = generic_kind(payload)
    context = get_context(payload)
    source = payload.get("document") or payload.get("receipt") or payload.get("statement") or payload.get("data") or payload
    if "quotation" in kind or source.get("quotationNumber"):
        document = Quotation.model_validate(source)
        return pdf_response(build_document_pdf("Quotation", document, context, settings.resolved_logo_path), get_filename(payload, f"{document.number or 'quotation'}.pdf"))
    if "invoice" in kind or source.get("invoiceNumber"):
        document = Invoice.model_validate(source)
        return pdf_response(build_document_pdf("Invoice", document, context, settings.resolved_logo_path), get_filename(payload, f"{document.number or 'invoice'}.pdf"))
    if "receipt" in kind or source.get("receiptNumber"):
        receipt = Receipt.model_validate(source)
        return pdf_response(build_receipt_pdf(receipt, context, settings.resolved_logo_path), get_filename(payload, f"{receipt.receiptNumber or 'receipt'}.pdf"))
    if "statement" in kind:
        statement = ClientStatement.model_validate(source)
        label = statement.statementNumber or statement.client.name or "client-statement"
        return pdf_response(build_statement_pdf(statement, context, settings.resolved_logo_path), get_filename(payload, f"{label}.pdf"))
    raise ValueError("Unsupported PDF export type. Send documentType as quotation, invoice, receipt, or client-statement.")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", service=settings.app_name, environment=settings.environment)


@app.post("/exports/quotation")
def export_quotation(payload: QuotationExportRequest) -> Response:
    filename = payload.filename or f"{payload.document.number}.pdf"
    content = build_document_pdf("Quotation", payload.document, payload.context, settings.resolved_logo_path)
    return pdf_response(content, filename)


@app.post("/exports/invoice")
def export_invoice(payload: InvoiceExportRequest) -> Response:
    filename = payload.filename or f"{payload.document.number}.pdf"
    content = build_document_pdf("Invoice", payload.document, payload.context, settings.resolved_logo_path)
    return pdf_response(content, filename)


@app.post("/exports/receipt")
def export_receipt(payload: ReceiptExportRequest) -> Response:
    filename = payload.filename or f"{payload.receipt.receiptNumber}.pdf"
    content = build_receipt_pdf(payload.receipt, payload.context, settings.resolved_logo_path)
    return pdf_response(content, filename)


@app.post("/exports/client-statement")
def export_client_statement(payload: StatementExportRequest) -> Response:
    filename = payload.filename or f"{payload.statement.client.name or 'client-statement'}.pdf"
    content = build_statement_pdf(payload.statement, payload.context, settings.resolved_logo_path)
    return pdf_response(content, filename)


@app.post("/exports/excel")
@app.post("/export/excel")
@app.post("/api/export/excel")
def export_excel(payload: dict[str, Any] = Body(...)) -> Response:
    context = get_context(payload)
    filename = payload.get("filename") or f"{payload.get('title') or 'cgm-report'}.xlsx"
    return excel_response(build_report_excel(payload, context), filename)


@app.post("/export/pdf")
@app.post("/api/export/pdf")
def export_pdf(payload: dict[str, Any] = Body(...)) -> Response:
    return generic_pdf(payload)
