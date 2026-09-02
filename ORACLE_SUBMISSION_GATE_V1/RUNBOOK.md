# Submission Gate Runbook

## Normal integration check

From the repository root:

```bash
npm run submission:gate
```

Read these first:

```text
artifacts/submission-evidence/submission-gate-report.md
artifacts/submission-evidence/submission-gate-report.json
```

The default `auto` profile passes the current checkpoint when current tests pass and future services are correctly reported as `NOT_AVAILABLE`.

## Fast check

```bash
npm run submission:smoke
```

This runs the focused gate unit suite, WebMCP regression, browser bridge checks, three reset cycles, and one conditional hero attempt.

## WebMCP audit only

```bash
npm run webmcp:audit
```

Output:

```text
artifacts/submission-evidence/webmcp-audit/
```

## Reliability

```bash
npm run hero:1
npm run hero:3
npm run hero:10
```

These commands do not fake missing services. They report `NOT_AVAILABLE` until all production hero services exist.

## Final strict release gate

After Construction, Train, Mission, and Terrain integration:

```bash
npm run release:evidence
```

This runs ten flagship attempts and 50 reset cycles. In the `final` profile, unavailable future tests are blocking.

## After each production integration

1. Merge or cherry-pick the QA gate branch into the integration branch.
2. Do not replace the existing `RevisionClock`, `BuildBoard`, `PlacementAuthority`, `RobotController`, `BridgeHost`, TrainService, or MissionService.
3. Expose the acceptance facade from the integrated runtime.
4. Update `tools/submission/catalogues.json` when the final WebMCP tool set changes.
5. Run `npm run submission:gate`.
6. Fix every `FAIL`.
7. Confirm each expected service changes from `NOT_AVAILABLE` to `PASS`.
8. Run `npm run release:evidence`.
9. Inspect screenshots, console evidence, the response-size table, and the annotation table.
10. Run one final manual journey in the WebMCP-enabled browser and workbench.

## Useful environment variables

```text
ROBO_BRIDGE_BROWSER
SUBMISSION_PROFILE
SUBMISSION_TOOL_CATALOGUE
SUBMISSION_HERO_ATTEMPTS
SUBMISSION_RESET_CYCLES
SUBMISSION_EVIDENCE_DIR
```

Example:

```bash
ROBO_BRIDGE_BROWSER=/usr/bin/chromium SUBMISSION_PROFILE=final npm run submission:gate
```
