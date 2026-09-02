# WebMCP Audit

## Catalogue policy

The catalogue is in:

```text
tools/submission/catalogues.json
```

Profiles:

- `minimum`: at least the current 19 production tools;
- `current`: exactly 19 tools at this checkpoint;
- `final`: at least the required current set, plus integrated tools when the catalogue is updated.

This avoids a permanent hard-coded count of 19.

## Registration checks

For every registered tool, the gate checks:

- unique name;
- object input schema;
- schema structure and required-property references;
- execute function;
- annotations;
- one registration owner signal;
- cancellation before execution;
- lifecycle status update;
- valid JSON output;
- no duplicate registration owner.

## Known annotation finding

`plan_placement_queue` changes logical placement-stream and ghost state. Its current `readOnlyHint: true` is high risk.

Recommendation:

```text
Set readOnlyHint to false.
Review destructiveHint and idempotentHint for all mutation tools.
```

The QA branch reports this finding. It does not change production annotations because that change belongs to the owning runtime integration.

## Response-size checks

The report records:

```text
tool
scenario
characters
bytes
truncated
pageable
severity
```

Thresholds:

- target: 1,500 characters for normal mission-level results;
- hard gate: 16,000 characters.

Existing low-level output can be larger than 1,500 characters when it stays below the hard gate. The report marks it `OVERSIZED`. It does not perform a broad response rewrite.

## Native-browser final check

The automated browser uses an injected compatible capture interface so it can inspect the production registration path in standard Chromium. It does not replace the final manual acceptance in the WebMCP-enabled browser and workbench.
