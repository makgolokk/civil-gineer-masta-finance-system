from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def context():
    return {
        "settings": {
            "companyProfile": {
                "name": "Civil-Gineer Masta (Pty) Ltd",
                "letterhead": "BUILDING THE FUTURE, MASTERING THE PRESENT",
                "bankingDetails": {
                    "bank": "FNB / RMB",
                    "accountHolder": "Civil-Gineer Masta (Pty) Ltd",
                    "accountType": "Business Cheque Account",
                    "accountNumber": "63119613734",
                    "branchName": "Gaborone Industrial",
                    "branchCode": "283567",
                },
            },
            "documentSettings": {"currency": "BWP"},
        },
        "clients": [{"id": "client-1", "name": "Sample Client", "email": "client@example.com"}],
        "projects": [{"id": "project-1", "code": "PRJ-2026-05-0001", "name": "Sample Project"}],
        "services": [{"id": "engineering", "name": "Engineering"}],
    }


def assert_pdf_response(response):
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")
    assert len(response.content) > 1000


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_invoice_export():
    payload = {
        "document": {
            "id": "inv-1",
            "number": "INV-0001",
            "clientId": "client-1",
            "projectId": "project-1",
            "serviceId": "engineering",
            "date": "2026-05-27",
            "dueDate": "2026-06-03",
            "items": [{"description": "Engineering design", "serviceId": "engineering", "qty": 1, "rate": 1200}],
        },
        "context": context(),
    }
    assert_pdf_response(client.post("/exports/invoice", json=payload))


def test_quotation_export():
    payload = {
        "document": {
            "number": "QT-0001",
            "clientSnapshot": {"name": "Prospect Client"},
            "projectName": "Concept design",
            "serviceId": "engineering",
            "date": "2026-05-27",
            "validUntil": "2026-06-26",
            "items": [{"description": "Concept proposal", "serviceId": "engineering", "qty": 2, "rate": 500}],
        },
        "context": context(),
    }
    assert_pdf_response(client.post("/exports/quotation", json=payload))


def test_approved_quotation_embeds_authorised_signatures():
    signature = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAATSURBVBhXYwCC//+BGAhBiOE/ADLfBftP/2lzAAAAAElFTkSuQmCC"
    ctx = context()
    ctx["settings"]["documentSignatories"] = {
        "preparedById": "kelesitse-makgolo",
        "approvedById": "boago-modise",
        "profiles": [
            {"id": "kelesitse-makgolo", "name": "Kelesitse K. Makgolo", "title": "Director", "signatureImage": signature},
            {"id": "boago-modise", "name": "Boago Modise", "title": "Director", "signatureImage": signature},
        ],
    }
    payload = {
        "document": {
            "number": "QT-SIGNED-0001",
            "clientSnapshot": {"name": "Signed Client"},
            "status": "approved",
            "items": [{"description": "Signed proposal", "qty": 1, "rate": 500}],
        },
        "context": ctx,
    }
    response = client.post("/exports/quotation", json=payload)

    assert_pdf_response(response)
    assert response.content.count(b"/Subtype /Image") >= 2


def test_receipt_export():
    ctx = context()
    ctx["invoices"] = [{
        "id": "inv-1",
        "number": "INV-0001",
        "clientId": "client-1",
        "items": [{"description": "Engineering design", "qty": 1, "rate": 1200}],
    }]
    ctx["payments"] = [{"id": "pay-1", "invoiceId": "inv-1", "receiptNumber": "RCT-0001", "amount": 600}]
    payload = {
        "receipt": {"id": "pay-1", "invoiceId": "inv-1", "receiptNumber": "RCT-0001", "date": "2026-05-27", "amount": 600},
        "context": ctx,
    }
    assert_pdf_response(client.post("/exports/receipt", json=payload))


def test_client_statement_export():
    payload = {
        "statement": {
            "client": {"id": "client-1", "name": "Sample Client"},
            "rows": [{"date": "2026-05-27", "type": "Invoice", "number": "INV-0001", "debit": 1200, "credit": 0, "balance": 1200}],
            "balance": 1200,
            "statementNumber": "ST-0001",
        },
        "context": context(),
    }
    assert_pdf_response(client.post("/exports/client-statement", json=payload))


def test_generic_invoice_payload_uses_professional_layout():
    payload = {
        "documentType": "invoice",
        "filename": "invoice.pdf",
        "documentNumber": "INV-ALIAS-1",
        "issueDate": "2026-05-27",
        "dueDate": "2026-06-03",
        "clientName": "Alias Client",
        "project": "Office fit-out",
        "location": "Gaborone",
        "lineItems": [{"description": "Site work", "quantity": 2, "unit": "Hours", "unitPrice": 750}],
        "vat": 0,
        "amountPaid": 500,
        "paymentTerms": "Due within 7 days",
        "context": context(),
    }
    assert_pdf_response(client.post("/api/export/pdf", json=payload))


def test_excel_export():
    payload = {
        "filename": "report.xlsx",
        "report": {
            "title": "Income Statement",
            "headers": ["Line", "Amount"],
            "rows": [["Revenue", "BWP 1,200.00"], ["Expenses", "BWP 300.00"]],
        },
        "context": context(),
    }
    response = client.post("/exports/excel", json=payload)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    assert response.content.startswith(b"PK")
    assert len(response.content) > 3000
