FROM python:3.12-slim

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY assets ./assets

ENV CGM_EXPORT_ENVIRONMENT=production
ENV CGM_EXPORT_LOGO_PATH=assets/logo.png
EXPOSE 8765

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8765}"]
