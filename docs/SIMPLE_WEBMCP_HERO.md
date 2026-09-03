# SIMPLE WebMCP hero — current release truth

Updated: 2026-09-03

## Recording contract

Use this exact request:

> Build a tower six layers tall using two red bricks per layer.

The required result is:

- 2 bricks in each layer.
- 6 layers.
- 12 placement targets.
- Alternating 0-degree and 90-degree layer orientation.
- One fixed 32 mm by 32 mm tower footprint.

The implementation uses `createSimpleStructurePlan`, ordinary placement records, `plan_placement_queue`, and the existing placement stream. It does not add a `build_tower` tool. The generic planner can still make the optional 10-layer, 20-target tower.

## Guided Human contribution

Plan the tower before the robot stream starts. The SIMPLE panel then shows one dependency-ready pending slot that is not the robot's first slot. It shows:

- Placement ID.
- Layer and slot.
- X, Y, and Z position.
- Required yaw.

Place one compatible blue brick in this exact slot. Use the normal valid placement preview. Do not use an off-plan position.

The required state sequence is:

1. Human pickup changes `worldRevision`.
2. Human placement changes `worldRevision` again.
3. The pending target becomes `ADOPTED`.
4. `actor` is `human`.
5. `actualBrickId` is the blue brick ID.
6. The adopted target leaves the robot queue.
7. The robot places the other 11 targets.
8. Dependencies continue to the top layer.
9. Final status is 12 of 12 satisfied: 1 `ADOPTED` and 11 `COMPLETED`.

This is a guided valid-slot contribution. General arbitrary off-plan replanning is not implemented or claimed.

## Preserved architecture and limits

The release keeps one existing `BuildBoard`, `RobotController`, `RevisionClock`, placement coordinator, and cycle runner. It keeps 28 registered WebMCP tools. It adds no second execution authority.

Placement legality is unchanged. Strict `colour` still rejects a wrong robot source. The recording plan uses red as the preferred robot source while allowing the valid Human blue contribution to satisfy the guided geometric target.

The simulator cadence is:

- Normal: 2000 ms.
- 50 percent faster: approximately 1333 ms.
- Hard minimum: 1000 ms.

Pickup colour fixes remain active. A held or Human-preview blue brick stays blue. Robot proposal status colours remain separate.

## Validation

Run:

```text
node --test --test-concurrency=1 tests/js/simple-webmcp-hero.test.js tests/js/held-brick-colour.test.js tests/js/player-pickup-audit.test.js
npm run simple:browser
```

The focused checks cover one red brick, the current 3-by-4 wall, the final 12-target tower, alternating orientation, guided Human adoption, no duplicate, dependency continuation, final completion, the optional 20-target capability, pickup colours, cadence, reset behaviour, and tool registration. The browser check uses the native Chrome WebMCP testing path and requires zero console errors and zero console warnings.

Use PR #7 and its latest branch audit for the exact candidate SHA and final results. Do not use the older 10-level off-plan insertion run as evidence for the recording tower.

## Boundaries

This document covers the SIMPLE simulation hero only. It does not claim physical UR10 readiness. It does not cover Bridge retreat collision, Aqueduct, Terrain, train physics, or a general Human off-plan replanner.
