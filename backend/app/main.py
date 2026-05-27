from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .config import get_settings
from .models import (
    HealthResponse,
    InvoiceExportRequest,
    QuotationExportRequest,
    ReceiptExportRequest,
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
