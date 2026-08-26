# Baseline verification

Date: 2026-08-26

This record captures the transferred foundation before project-local dependency setup or source changes.

## Environment observed

- Node: `v22.19.0`.
- npm/npx: `10.9.3`.
- System Python selected by `python`: `3.13.7`.
- Available Python launchers also include Python 3.11 and 3.10.
- Project-local `.venv`: not present at baseline.

## Transfer integrity

- `evidence/release-manifest.json`: 49/49 listed files present with matching SHA-256 hashes.
- Source files were promoted from the verified extracted snapshot into `D:\ROBO-SIM-MCP`.
- Generated `.pytest_cache` content was not treated as source and was not required for promotion.

## Exact unchanged test results

### JavaScript

Command:

```text
node --test tests/js/scara.test.js tests/js/controller.test.js tests/js/webmcp.test.js
```

Result: environment-blocked, exit `1`.

- The Node test runner attempted to spawn each test file and received `spawn EPERM`.
- Reported totals: 3 file-level failures, 0 executed test assertions.
- This is consistent with the previously observed Windows sandbox process-spawn restriction; it is not evidence of an assertion regression.

### Python

Command:

```text
python -m pytest physics/newton-service/tests -q
```

Result: dependency-blocked during collection, exit `1`.

- `fastapi` was missing while collecting `test_api.py`.
- `pydantic` was missing while collecting `test_fallback.py`.
- No test assertions ran.

## Baseline decision

`PARTIAL`: transfer integrity is proven, while executable tests require the project-local environment. No architecture change is justified by these failures. The next step is to create the local Python environment from the inspected setup requirements and rerun the exact suites.

