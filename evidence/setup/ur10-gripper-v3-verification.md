# ROBO BRIDGE MCP V3 — UR10 real-gripper verification

- Date: 2026-08-30
- Base Git HEAD: `e64cc6959f2a8cda14c0bd91b4b816d6ff1c1351`
- Branch: `codex/ur10-real-gripper-v3-integration`
- Hardware contacted: none
- External network runtime dependency: none

## Supplied asset verification

- Gripper GLB: 6,420,824 bytes; SHA-256 `e866760a7bd5ee91f4944d073b1d96db315786e51c540a0f97463f79ae62126e`
- Three.js r185 module SHA-256: `86bcee248b64f44bcfc23c331ae74619061957d59cab040171dcb6fb5900beb6`
- Three.js r185 core SHA-256: `0e9dd2793e01d0d9eb4f2ab00b4ffcdd4488275ebebee5c31fa8d347bc29f0bf`
- Parameters JSON SHA-256: `95ba58464a8e5be8849fde16e1b1a40d8a253b1dcac1397f59f83ca7ec2b7838`
- Materials JSON SHA-256: `f4b54ba0b0d8920bc4bfa4ef312df4b77645a4c63c8002b8ace9c02933175c79`

## Baseline before integration

`python scripts/verify.py`

- JavaScript: 59/59 passed
- Reliability: 20/20 passed
- JavaScript syntax: 33 files passed
- Python syntax: 4 files passed
- Required/removed-path checks: passed

## Final local verification

`python scripts/verify.py`

- JavaScript: 64/64 passed, 0 failed, 0 skipped
- Reliability: 20/20 passed, acceptance met
- JavaScript syntax: 35 files passed
- Python syntax: 4 files passed
- Required files: passed
- Removed legacy/Newton paths: passed

## Browser acceptance

Headless Microsoft Edge was launched locally with proxying disabled for `127.0.0.1`.

- HTTP: 200
- health: `{ "ok": true, "service": "robo-bridge-web" }`
- runtime global: present
- canvas: rendered at desktop size
- gripper diagnostic: `REAL GLB READY`
- initial TCP: `600.0 / 0.0 / 450.0 mm`
- one UI-driven placement: passed
- latched brick: `brick-002-red`
- accepted target: `t_r00_c00`
- build progress: `0/2 -> 1/2`
- final TCP: `600.0 / 0.0 / 450.0 mm`
- final held brick: `NONE`
- console errors: 0
- failed requests: 0

Screenshot: `evidence/setup/robo-bridge-v3-real-gripper.png`

## External gate

Native signed-in WebMCP enumeration/execution was not available in this browser context. Page-side progressive enhancement correctly reported WebMCP unavailable; schema/unit proof remains green.