# ROBO BRIDGE MCP Submission Gate V1

This package adds one automated release gate for `MAIN_DEMO`.

## Main command

```bash
npm run submission:gate
```

The command runs:

1. source and static checks;
2. the release build;
3. all existing JavaScript, WebMCP, robot, player, compiler, and reliability suites;
4. a real Chromium browser session;
5. bridge design and hologram acceptance;
6. WebMCP catalogue, schema, cancellation, lifecycle, annotation, and response-size audits;
7. repeated reset checks;
8. conditional Construction, Train, Mission, Terrain, adversarial, and hero-loop tests;
9. deterministic evidence and final reports.

## Status rules

- `PASS`: The assertion ran and passed.
- `FAIL`: The assertion ran and failed, or a present production service has no acceptance contract.
- `NOT_AVAILABLE`: A future production subsystem is not present.
- `SKIPPED_WITH_REASON`: The report records a non-blocking review item or an explicit skip.

The default `auto` profile does not fail only because future services are absent. It never changes an absent service to `PASS`.

The final profile is strict:

```bash
npm run release:evidence
```

In this profile, all future hero-loop services must be present and pass.

## Output

The default directory is:

```text
artifacts/submission-evidence/
```

Key files:

```text
submission-gate-report.json
submission-gate-report.md
01-load.png
02-bridge-before-update.png
03-bridge-after-update.png
12-reset.png
final-runtime.html
runtime-metadata.json
console-log.json
webmcp-browser-audit.json
logs/
```

The gate creates only screenshots for real states. It does not create future-state screenshots when those states are not available.

## Browser requirement

Use a Chromium-compatible browser. Set an explicit path when automatic discovery does not find it:

```bash
ROBO_BRIDGE_BROWSER=/path/to/chromium npm run submission:gate
```

The browser runner uses the Chrome DevTools Protocol directly. It does not add Playwright or another npm dependency.

## Important limit

The browser gate injects a capture-compatible `document.modelContext` before application code runs. This tests the real production registration path and executes the registered production tools. It does not claim that the browser itself has native WebMCP support. Do one final manual run in the required WebMCP-enabled browser before submission.
