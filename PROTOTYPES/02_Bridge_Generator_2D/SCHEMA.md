# Schema notes

This prototype freezes the design boundary as:

```text
ChallengeState + BridgeSpec -> validate -> deterministic generator -> BridgeGraph2D
```

The JSON Schemas in `schemas/` are the serialisation contracts. Runtime validation additionally checks relationships that JSON Schema cannot express conveniently: ENTRY-to-EXIT span, deck corridor elevation, vehicle clearance, terrain foundations, member endpoints and cable anchors.

## BridgeSpec

`BridgeSpec` is parameter-only. It contains no raw node, member or cable coordinates. The absolute names `trussHeight`, `archRise`, `towerHeight`, `cableSag` and `hangerSpacing` are prototype-friendly equivalents of the ratios/intervals described in `MASTER_PLAN.md`; a later adapter can convert them without changing the generator boundary.

Unknown properties are rejected with `INVALID_PARAMETER_RANGE`.

## BridgeGraph2D

All nine families produce the same top-level arrays:

- `nodes`: stable integer ID, x/y elevation coordinate, role and support type;
- `members`: stable integer ID, endpoint node IDs, role, member class and capacity class;
- `cables`: analytic cable samples and deterministic hanger targets, with no cable physics;
- `metadata`: family, span, revision, generator version and deterministic checksum.

The box family adds an optional `side` field to nodes/members while retaining the common contract. The suspension family adds cable-specific optional fields declared in the schema.

## Error codes

The validation report always uses codes, never text alone:

`SPAN_INVALID`, `DECK_OUTSIDE_CORRIDOR`, `VEHICLE_CLEARANCE`, `PIER_NO_FOUNDATION`, `UNSUPPORTED_MEMBER`, `INVALID_PARAMETER_RANGE`, `INVALID_CABLE_ANCHOR`.

Human-readable messages supplement those codes for the interface.
