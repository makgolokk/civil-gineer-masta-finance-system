# CGM Export Backend Production Plan

The Vercel app is a static frontend. Professional PDF and Excel generation is handled by `export_backend.py`, which should run as a separate Python service.

## Recommended Deployment

1. Deploy the Python service with Docker using `Dockerfile.export`.
2. Set environment variables:
   - `HOST=0.0.0.0`
   - `PORT=8765` or the platform-provided port
3. Confirm the service responds at:
   - `/health`
   - `/api/export/pdf`
   - `/api/export/excel`
4. Add the hosted service URL to Vercel:
   - `VITE_EXPORT_API_BASE_URL=https://your-export-service.example.com`
5. Redeploy the Vercel frontend.

## Good Hosting Options

- Render Web Service using the Dockerfile
- Railway Docker service
- Fly.io Docker app
- A small VPS with Docker and HTTPS reverse proxy

## Why Separate Hosting

The export backend uses ReportLab and OpenPyXL. Keeping it separate from the static Vercel frontend gives better control over Python dependencies, memory, file generation, and future server-side permissions.

## Next Security Step

Before real multi-user use, protect export endpoints so staff can only export records they are allowed to view.
