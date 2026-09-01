# Acceptance Report

## Decision

**PASS for drop-in integration evaluation, with two stated limits.**

The modular service, validation, V4.6 adapter, five WebMCP tools, self-contained demo, and browser flows passed.
Native WebMCP was not available in the VM browser.
GPU performance was not available in the VM.

No GitHub branch, pull request, remote setting, or remote file was changed.

## Input integrity

- Authoritative V4.6 HTML SHA-256: `c5c302df9d28fab8f946a95bbff7d3210cf9116b68e3e6af8629b37c3d288d5c`
- The copied reference HTML has the same SHA-256.
- The standalone builder makes bounded seam changes around this reference. It does not replace the compiler.

## Architecture accepted

The package uses this control path:

1. Public BridgeSpec validation and mapping.
2. `BridgeDesignService`.
3. V4.6 host adapter.
4. Candidate compile.
5. Exact revision check.
6. Atomic commit to the V4.6 state.
7. Authoritative BuildPlan 4.6 creation.
8. Renderer update from the same compiler result.

There is no tool for each slider.
There is no fixed aqueduct or viaduct script command.
There is no agent-generated brick-transform plan.

## Tools accepted

| Tool | Mutation | Result |
|---|---:|---|
| `get_bridge_design` | No | Current family, public spec, revision, checksum, plan summary, ENTRY/EXIT, and optional limits |
| `get_bridge_capabilities` | No | Public names, types, bounds, enums, and patch rules |
| `update_bridge_design` | Yes | Atomic partial patch and compile |
| `get_bridge_build_plan` | No | Bounded summary, BOM, anchors, placements, or definitions |
| `reset_bridge_design` | Yes | Tested family preset and compile |

All tool schemas use `additionalProperties: false`.
Read-only tools use `readOnlyHint: true`.
Mutation tools use exact revision checks.

## Automated tests

### Node service and package tests

- Result: **21 passed, 0 failed**
- Covered: public mapping, family defaults, bounds, unknown values, non-finite values, cross-field checks, scenarios A–F, revisions, no partial mutation, bounded pages, tool annotations, registration, package factory, self-contained output, input hash, and anti-scripting checks.

### Browser acceptance

- Browser: Chromium
- Renderer: ANGLE over Mesa llvmpipe software rendering
- Viewport: 1440 × 900
- Result: **PASS**
- Browser console errors: **0**
- Page errors: **0**
- WebGL context loss: **No**
- Authoritative V4.6 self-tests: **all passed**
- Full final BuildPlan: **validated against the supplied V4.6 JSON schema**
- Direct self-contained `file://` open: **passed with zero external requests**

### Natural-language intent scenarios

The browser test sent the structured intent that an agent produces from each user request.

| Scenario | Result |
|---|---|
| A: Aqueduct 10 top, 6 middle, 3 bottom | Passed; revision 2; checksum `ec86eb58`; 1,298 physical parts |
| B: Change only top to 8 and bottom to 4 | Passed; middle stayed 6; revision 3; checksum `884198dc`; 1,388 parts |
| C: Switch to viaduct | Passed; tested 6-arch viaduct preset applied; revision 4; checksum `9b8eb388` |
| D: 5 viaduct arches and wider openings | Passed; ratio 0.9; revision 5; checksum `99e13df4`; 2,388 parts |
| E: Stale design revision | Rejected with `STALE_DESIGN_REVISION`; state unchanged |
| F: Arch count 99 | Rejected with `OUT_OF_RANGE`; state unchanged |

Additional browser checks passed:

- pre-cancelled mutation returned `CANCELLED`;
- in-flight candidate compile returned `CANCELLED` before commit;
- a concurrent mutation returned `OPERATION_IN_PROGRESS`;
- unknown tool input returned `INVALID_PARAMETER`;
- track modules stayed in the BuildPlan;
- track and custom arch draw calls stayed active;
- same-family updates did not change materials;
- read-only calls did not increment revision.

## Visual checks

The screenshots show the actual V4.6 renderer and the actual committed BuildPlan geometry.

### Initial aqueduct: 8 / 6 / 5

![Initial aqueduct](screenshots/01_aqueduct_initial_8_6_5.png)

### Scenario A: 10 / 6 / 3

![Aqueduct 10 6 3](screenshots/02_aqueduct_10_6_3.png)

### Scenario B: 8 / 6 / 4

![Aqueduct 8 6 4](screenshots/03_aqueduct_8_6_4.png)

### Scenario C: six-arch viaduct preset

![Viaduct six arches](screenshots/04_viaduct_preset_6_arches.png)

### Scenario D: five wider viaduct openings

![Viaduct five wider openings](screenshots/05_viaduct_5_wide_openings.png)

Automated pixel checks also confirmed a visible geometry change for each requested update.
The track remained visible at the top of both families.
No unexpected same-family material change was found.

## Performance evidence

The measured tool duration includes validation, candidate compilation, atomic commit, BuildPlan creation, and renderer update.

| Update | Tool duration | V4.6 compiler duration |
|---|---:|---:|
| Scenario A | 114.7 ms | 35.4 ms |
| Scenario B | 119.6 ms | 29.2 ms |
| Scenario C | 194.7 ms | 41.9 ms |
| Scenario D | 155.3 ms | 37.9 ms |

Registered-tool contract harness result sizes:

- `get_bridge_design`: 2,526 characters
- bounded placement page: 6,296 characters
- maximum configured registered result: 16,000 characters

Software-rendered orbit sample after recompilation:

- 45 rendered frames;
- average 18.7 frames/s;
- median frame interval 50.0 ms;
- p95 frame interval 66.8 ms;
- no context loss.

This frame result is not GPU acceptance.
The VM had no GPU access.
Run the same test on the target MAIN_DEMO GPU before release acceptance.

## Native WebMCP status

The stock VM browser did not supply `document.modelContext.registerTool`.
The page returned:

```json
{
  "ok": false,
  "reason": "native_webmcp_unavailable"
}
```

A registration contract harness supplied the same API shape and verified:

- five tools registered;
- strict schemas and annotations were present;
- registered handlers returned bounded JSON strings;
- no registration console error occurred.

This harness is not native WebMCP proof.

## Limits

1. Native WebMCP acceptance remains open because the VM browser had no native implementation.
2. Hardware-GPU frame performance remains open because the VM used software rendering.
3. The package does not parse natural language. Codex or another agent must convert the user request into the public structured patch.
4. Physical robot construction is outside this task. The package preserves the BuildPlan needed for later construction.
