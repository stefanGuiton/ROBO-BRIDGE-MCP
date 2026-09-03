# Explicit accelerated simulation — 2026-09-03

Branch: `codex/p0-downstream-integration-prep`. Base checkpoint: `0a23db03a7a350a726f4be41e826d9bd66e8af8d`. This implementation is included in the subsequent user-requested publication checkpoint; see the commit containing this update / PR #6 head for the exact SHA. No PR retarget or merge; PR #5 untouched.

Latest user feedback: **visual check worked**, followed by an explicit push request. This is user-reported visual acceptance, not automated comprehensive visual certification. No additional tests were run for publication; Oracle will review later.

Authority: user-approved `D:/Downloads/CODEX_FULL_DEMO_FIRST_DEFER_COLLISIONS.md`. Single agent. Normal collision/release/retreat work is deferred. **VISUAL: USER-VERIFY PENDING**; no screenshots. The user subsequently requested that automated mouse/camera investigation stop too; those experimental test-script edits were removed.

## Implemented

- Existing `build_next_parts` accepts optional `executionMode: "robot" | "simulated_fast_forward"`; omission stays `robot`, count stays 1..5, total surface stays 27 tools.
- Fast mode selects dependency-ready pending targets from the current frozen BuildPlan, validates current identity and PartRegistry/source compatibility, activates/reassigns from the same shared inventory, then calls the existing PlacementAuthority/BuildBoard commit seam through the controller that owns live source state.
- No robot motion, collision suppression, altered IK/workspace limits, alternate board, fabricated Train result or Mission completion setter. Final-pose placement validation remains enabled. Fast mode is **not** robot-executed or motion-collision verified.
- Accepted targets/events and controller source records label `simulated_fast_forward`. Construction progress reports separate Human, robot and accelerated counts. Cancellation is checked between parts; reset cancels active work before clearing authorities.
- Mission/Train completion guards are unchanged. The explicit headless hero provider now performs an incomplete test, completes the remaining exact targets, tests the real accepted board, and resets. Final hero commands use the existing mission tool definition callbacks, not a new registrar.
- Headless gate uses Chrome's normal GPU backend on Windows; `ROBO_BRIDGE_SOFTWARE_GL=1` retains software rendering. Full-plan provider timeout is bounded at 10 minutes (previous small-build timeout was 3 minutes). User-forbidden screenshots are explicitly marked skipped/pending, not visually accepted.

## Verified so far

- Current plan `bp_9453b510`, checksum `9453b510`, registry `pr_5491033f`, 276 required parts.
- New full-plan test: 276 unique shared sources, all targets accepted through PlacementAuthority, no motion calls; bounded count, stale revision, cancellation, dependency and human takeover checks pass.
- Exact normal-path regression at the known 183/276 release pose still reports collision against supporting arch `c.0.0`: **fails closed**. No collision repair is claimed.
- GPU-backed headless smoke hero: 1 Human-adapter placement, 3 actual UR10 simulator placements, 272 explicitly accelerated placements; accepted 276, required 276, correct 276, incorrect 0. Early `TRAIN_FELL` returns to the same BUILD mission; final `CROSSED` produces `COMPLETE`; reset produces a new mission ID. Zero console errors/warnings.
- Human-adapter acceptance is not a mouse-driven Player acceptance claim. The separate mouse/camera test timed out; the user owns visual/manual Player inspection now.
- Supported Chrome 148 native registration: 27 tools, native navigator.modelContext, facade absent in ordinary mode, zero console errors/warnings. This proves registration, not an external-agent native invocation.
- Final `npm run verify`: PASS, **372/372 JavaScript**, reliability PASS, 156 JS / 4 Python syntax files and repository checks PASS.
- `npm run hero:1`: full mixed-mode journey PASS (1/1). Aggregate wrapper: 66 PASS / 1 FAIL / 3 SKIPPED; sole failure is the dirty tracked worktree gate, not a runtime failure.
- `npm run webmcp:audit`: 65 PASS / 1 FAIL / 3 SKIPPED; sole failure is the same dirty worktree gate.
- Full submission gate completed: **73 PASS / 1 FAIL / 3 SKIPPED**. All runtime/regression checks pass; sole failure is dirty tracked worktree. Visual checks explicitly pending/skipped.
- **User stopped further tests for immediate visual inspection and later Oracle review.** `hero:3` stopped after first flagship PASS; 3/3 is not established. Do not restart automatically.

## Evidence

- `artifacts/submission-evidence/fast-forward-smoke/submission-gate-report.json`
- `artifacts/submission-evidence/fast-forward-webmcp-audit/submission-gate-report.json`
- `artifacts/submission-evidence/hero-1/submission-gate-report.json`
- `artifacts/submission-evidence/fast-forward-gate/submission-gate-report.json`
- `output/playwright/fast-forward-native/acceptance.json`
- First CPU-rendered attempt timed out at 180 seconds; retained in `artifacts/submission-evidence/submission-gate-report.json`. It is not a successful run.

The WebMCP audit's functional checks pass; aggregate exit remains FAIL on the truthful dirty-tracked-worktree release gate. Preserve the user's two Blender edits and all assets/imports. Do not hide that release gate or infer physical 276-part robot acceptance from mixed-mode success.
