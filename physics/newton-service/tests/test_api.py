from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient

from app.main import app
from test_fallback import request_payload


def test_health_endpoint() -> None:
    response = TestClient(app).get('/health')
    assert response.status_code == 200
    body = response.json()
    assert body['service'] == 'robo-sim-mcp-physics'
    assert body['backend'] == 'deterministic-physics-fallback'
    assert body['requestedBackend'] == 'fallback'
    assert body['requestedBackendReady'] is True


def test_scene_sync_reset_and_result_lifecycle() -> None:
    client = TestClient(app)
    payload = request_payload()
    sync = client.post('/v1/scene/sync', json=payload['scene'])
    assert sync.status_code == 200
    assert sync.json() == {'ok': True, 'sceneRevision': 0, 'objectCount': 3}

    simulation = client.post('/v1/simulate/trajectory', json=payload)
    assert simulation.status_code == 200
    stored = client.get('/v1/results/test-plan')
    assert stored.status_code == 200
    assert stored.json()['requestId'] == 'test-plan'

    reset = client.post('/v1/scene/reset')
    assert reset.status_code == 200
    assert reset.json() == {'ok': True, 'sceneRevision': None, 'resultCount': 0}
    assert client.get('/v1/results/test-plan').status_code == 404
