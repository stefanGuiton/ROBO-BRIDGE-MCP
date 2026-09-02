# Acceptance Matrix

| Area | Current checkpoint | Final integrated checkpoint |
|---|---|---|
| Source | Required baseline is an ancestor; tracked worktree is clean | Same |
| Build | Release package builds | Same |
| Static | Gate files and catalogue parse | Same |
| Unit | Existing suites pass | Same, with updated totals |
| Browser | `MAIN_DEMO` loads; runtime and animation become ready | Same |
| Bridge | Aqueduct, plan ID, checksum, hologram identity, atomic mutation, stale and invalid rejection | Same |
| WebMCP | Unique catalogue, valid schemas, execute functions, one owner signal, cancellation, lifecycle, JSON output | Same, with final catalogue |
| Annotations | Suspicious hints are reported | Findings are resolved or accepted by release owner |
| Response size | Size, bytes, truncation, and paging are measured; hard limit is enforced | Normal mission results target about 1,500 characters |
| Reset | 50 current-runtime resets, no detected listener, timer, scene, state, or registration leak | Integrated reset contract also passes |
| Construction | `NOT_AVAILABLE` when absent | Frozen plan, stable placement IDs, shared BuildBoard, human and Codex counts, reassignment, revisions, cancellation |
| Train failure | `NOT_AVAILABLE` when absent | Genuine `TRAIN_FELL` from unsupported authoritative support state |
| Train success | `NOT_AVAILABLE` when absent | Genuine `CROSSED` on the same test path |
| Mission | `NOT_AVAILABLE` when absent | `DESIGN → BUILD → TEST → BUILD → TEST → COMPLETE → RESET`; only `CROSSED` permits `COMPLETE` |
| Terrain | `NOT_AVAILABLE` when absent | Curated EASY terrain and aligned ENTRY/EXIT |
| Hero loop | `NOT_AVAILABLE` when required services are absent | Authority-preserving completion of the flagship request |
| Evidence | Current real states only | All available real states only |

## Current bridge assertions

The browser suite checks:

- `BridgeHost` is ready.
- Initial family is `aqueduct`.
- The active plan ID and checksum exist.
- The exact hologram exists and is visible.
- Hologram plan identity equals host plan identity.
- A valid partial patch changes the design revision, plan ID, checksum, group identity, and screenshot.
- Omitted parameters do not change.
- Stale revision, invalid value, and unknown property requests reject.
- A rejected or aborted mutation does not change the active plan.
- The browser has no blocking console, exception, rejection, or key resource error.

## Blocking policy

Any `FAIL` is blocking. A required `NOT_AVAILABLE` is blocking. In the `final` profile, every `NOT_AVAILABLE` is blocking.
