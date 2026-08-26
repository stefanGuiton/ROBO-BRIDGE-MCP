from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint() -> None:
    response = TestClient(app).get('/health')
    assert response.status_code == 200
    body = response.json()
    assert body['service'] == 'robo-sim-mcp-physics'
    assert body['backend'] == 'deterministic-physics-fallback'
