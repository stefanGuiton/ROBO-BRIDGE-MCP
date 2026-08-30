# MAIN_DEMO Player V8 Verification

Date: 2026-08-30
Project: ROBO BRIDGE MCP MAIN_DEMO
Version: 3.1.0
Branch baseline: `ba1818c71ddb2395ba6ec26f42896cd1ed392806`
Verified source fingerprint: `8a4684caaa39c5d213574f94d386bec1473761dd3e354d051d709c6cd1b8b43e`

## Root verification

Command: `python scripts\build_release.py`

- JavaScript: 85 passed, 0 failed, 0 skipped.
- Persistent production reliability: 20/20 passed.
- JavaScript syntax: 47 files passed.
- Python syntax: 4 files passed.
- Required-file and removed-legacy checks: passed.
- Release: `dist/ROBO_BRIDGE_MCP_MAIN_DEMO.zip`.
- Release file count: 301.
- Release SHA-256: `659791e9ec86305ccef39c6ac071581326cd78d9192b1e39cfc26d58f8243d02`.

The release was inspected separately to ensure it does not contain `.git`, local browser output, Oracle downloads, archives, `node_modules`, generated test builds, or nested release files.

## Parallel prototype verification

- Terrain Challenge: 14/14 tests; 14-file syntax gate passed.
- Bridge Generator 2D: 21/21 tests; standalone build passed; 29/29 deterministic fixture files passed.
- Bridge To Bricks: 11/11 tests; five-fixture benchmark passed.
- Structural Solver: 15/15 tests; browser build passed.
- Train Rapier: 14/14 tests; build passed; hybrid/dynamic acceptance fixtures passed; 20 repeated reset cycles stable.

Two pre-existing Windows verification defects were corrected: URL pathname decoding in the terrain syntax helper and CRLF normalization in the generator fixture checker.

## Browser acceptance

The isolated checkpoint was served on `http://127.0.0.1:8770/` because port 8769 was already owned by another process and was not terminated without proof of ownership.

- Page title and MAIN_DEMO identity: passed.
- UR10 V2 and calibrated real gripper reported ready: passed.
- Scene fog: `null`.
- Desktop player movement: 44.401 mm from one 120 ms `W` input.
- Camera-only movement preserved world revision: passed.
- PLAYER/ORBIT buttons changed the active camera mode: passed.
- Human pickup, 90-degree rotate, preview, and target placement used the shared controller/board: passed.
- Rotation and preview preserved world revision: passed.
- Accepted placement advanced world revision, produced `snapped` state, and credited the human: passed.
- TEST LOCK rejected a player pickup with `test_mode_locked`: passed.
- 430x900 mobile layout exposed movement, rotate, and pick/place controls: passed.
- 1440x900 desktop layout: passed.
- Final console: 0 errors, 0 warnings.

Local screenshots (intentionally ignored by Git):

- `output/playwright/main-demo-desktop-final.png`
- `output/playwright/main-demo-mobile.png`

## WebMCP boundary

- Tool schemas, registration behavior, cancellation forwarding, and production handlers: covered by the 85-test root suite.
- Page-side native registration in ordinary Chromium: unavailable because `document.modelContext` is absent.
- Native agent enumeration/execution/cancellation: pending a WebMCP-enabled secure challenge browser; it was not faked.

## Dependency note

No global dependency was installed. The clean worktree initially lacked the Bridge Generator's declared `ajv@8.20.0`. A secure npm install was blocked by the PC certificate chain and TLS verification was not disabled. The existing matching project-local dependency from the clean integration checkout was reused only in ignored `node_modules`; package manifests and lockfiles did not change.
