# Civil-Gineer Masta Export Backend

FastAPI service for production PDF and Excel exports. It is separate from the Vite frontend and is required for client-ready quotation, invoice, receipt, and client statement PDFs.

## Endpoints

- `GET /health`
- `POST /exports/quotation`
- `POST /exports/invoice`
- `POST /exports/receipt`
- `POST /exports/client-statement`
- `POST /exports/excel`
- compatibility: `POST /api/export/pdf`, `POST /api/export/excel`, `POST /export/pdf`, `POST /export/excel`

PDF export endpoints accept structured JSON and return `application/pdf`. Excel exports return `.xlsx` workbooks with company/report headings, frozen headers, readable widths, BWP currency formatting, and totals formulas where useful.

## Local Setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8765 --reload
```

Health check:

```bash
curl http://127.0.0.1:8765/health
```

## Environment Variables

All settings use the `CGM_EXPORT_` prefix:

```text
CGM_EXPORT_ENVIRONMENT=development
CGM_EXPORT_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173
CGM_EXPORT_FRONTEND_ORIGIN=http://localhost:5173
CGM_EXPORT_ADDITIONAL_ALLOWED_ORIGINS=
CGM_EXPORT_LOGO_PATH=assets/logo.png
CGM_EXPORT_DEFAULT_CURRENCY=BWP
```

## Docker

From the repository root:

```bash
docker build -f backend/Dockerfile -t cgm-export-backend .
docker run --rm -p 8765:8765 cgm-export-backend
```

## Tests

```bash
cd backend
pytest
```

## Frontend Integration

The frontend can later point to this service by setting:

```text
VITE_EXPORT_API_BASE_URL=https://your-export-backend.example.com
```

Known document types are intentionally not downgraded to raw browser PDFs if this backend is unavailable.
