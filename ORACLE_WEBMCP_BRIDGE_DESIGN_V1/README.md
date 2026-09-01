# ORACLE WebMCP Bridge Design V1

This package adds a small WebMCP design surface to the authoritative ROBO BRIDGE V4.6 two-family compiler.

The agent changes a structured `BridgeSpec`.
The V4.6 compiler still calculates the exact geometry, parts, track, BOM, checksum, and BuildPlan.
The package does not ask the agent to calculate brick transforms.

## Main deliverables

- `demo/ROBO_BRIDGE_WebMCP_Conversational_Designer_V1.html` is a self-contained browser demo.
- `src/` contains the renderer-independent service, validation, V4.6 adapter, and WebMCP tools.
- `tests/` contains service, schema, package, and browser acceptance tests.
- `INTEGRATION_GUIDE.md` gives the exact MAIN_DEMO integration method.
- `ACCEPTANCE_REPORT.md` records the test evidence and limits.
- `samples/` contains actual tool calls and results.

## WebMCP tools

1. `get_bridge_design`
2. `get_bridge_capabilities`
3. `update_bridge_design`
4. `get_bridge_build_plan`
5. `reset_bridge_design`

`update_bridge_design` accepts a partial patch and an exact `expectedDesignRevision`.
The update compiles before commit.
A failed, stale, or cancelled compile does not change the active design.

## Design boundary

This checkpoint is isolated for review. It is not integrated into MAIN_DEMO.
Do not create a second bridge state authority when integrating it later.
The V4.6 compiler and BuildPlan remain authoritative.

## Review checkpoint

Branch: `oracle/webmcp-bridge-design-v1`
Base: `main` at `b66cc07c7be7c9743338611edc794d5805d2066f`

No merge or pull request is part of this checkpoint.
