# Codex instructions for LOGO ROBO

## Read first

1. `MASTER_PLAN.md`
2. `README.md`
3. `PREEXISTING_WORK.md`
4. `evidence/FOUNDATION_STATUS.md`
5. `docs/NEWTON_NEXT_TASK.md`

## Architecture rules

- The robot controller owns accepted browser robot state. The current default vertical slice is UR10-class LOGO ROBO; the retained SCARA controller remains a separate foundation path.
- Manual controls and WebMCP tools must call the same controller.
- Rendering must not own kinematic truth.
- Invalid motion must keep the last accepted pose.
- Trajectory preview must not mutate accepted state.
- Physics success must be measured, not asserted.
- Newton must not duplicate or silently replace browser kinematics.
- Do not add real-robot, Duet, or ROS control during the challenge MVP.
- Do not include RepRapFirmware source.

## Verification

Run:

```bash
python scripts/verify.py
```

A change is not complete until relevant tests pass and `evidence/foundation-verification.json` is updated.

## Challenge scope

Must-have work wins over generic robot support, WebGPU migration, path tracing, or broad platform work.
