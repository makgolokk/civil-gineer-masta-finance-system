from fastapi.testclient import TestClient

from app.main import app


def main() -> None:
    client = TestClient(app)
    health = client.get("/health")
    assert health.status_code == 200, health.text

    payload = {
        "document": {
            "number": "INV-SMOKE-0001",
            "clientId": "client-1",
            "date": "2026-05-27",
            "dueDate": "2026-06-03",
            "items": [{"description": "Smoke test service", "qty": 1, "rate": 1000, "serviceId": "engineering"}],
        },
        "context": {
            "clients": [{"id": "client-1", "name": "Smoke Test Client"}],
            "services": [{"id": "engineering", "name": "Engineering"}],
        },
    }
    response = client.post("/exports/invoice", json=payload)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")
    print("Backend smoke test passed")


if __name__ == "__main__":
    main()
