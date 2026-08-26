# Physics service

The service exposes one stable browser protocol now:

- `GET /health`
- `POST /v1/simulate/trajectory`

The active foundation backend performs deterministic trajectory clearance, grasp proximity, attachment, release, gravity settlement, and final-state checks. It is deliberately conservative and does not claim full rigid-body or contact fidelity.

`app/newton_backend.py` is the explicit integration boundary for Newton. It uses a trajectory-driven kinematic two-finger proxy and leaves SCARA FK/IK in the browser controller. Newton owns cube contact, lift, obstacle collision, release, gravity settlement, and final object pose.

Run:

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

On Linux/macOS, use `.venv/bin/python`.

The proven fallback remains the safe default. After Newton and the machine's thermal state are qualified, start the complete local system with:

```powershell
.venv\Scripts\python.exe scripts\run_foundation.py --physics-backend newton
```

Newton defaults to its CPU device for deterministic local qualification. Select CUDA only after a temperature check:

```powershell
$env:ROBO_SIM_NEWTON_DEVICE = 'cuda'
.venv\Scripts\python.exe scripts\run_foundation.py --physics-backend newton
```

Run the three real-physics acceptance cases explicitly:

```powershell
$env:ROBO_SIM_RUN_NEWTON_TESTS = '1'
$env:ROBO_SIM_NEWTON_DEVICE = 'cpu'
.venv\Scripts\python.exe -m pytest physics\newton-service\tests\test_newton.py -v
```
