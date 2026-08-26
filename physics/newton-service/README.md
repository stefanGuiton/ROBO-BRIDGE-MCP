# Physics service

The service exposes one stable browser protocol now:

- `GET /health`
- `POST /v1/simulate/trajectory`

The active foundation backend performs deterministic trajectory clearance, grasp proximity, attachment, release, gravity settlement, and final-state checks. It is deliberately conservative and does not claim full rigid-body or contact fidelity.

`app/newton_backend.py` is the explicit integration boundary for Newton. It detects Newton and Warp, but stays inactive until the SCARA articulation, gripper colliders, workcell bodies, contact settings, trajectory stepping, and result extraction have tests.

Run:

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

On Linux/macOS, use `.venv/bin/python`.
