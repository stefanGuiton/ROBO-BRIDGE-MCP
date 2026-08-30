# Gameplay tuning

These values create predictable bridge-game behaviour. They do not represent calibrated engineering units.

| Control | Default | Effect |
| --- | ---: | --- |
| Unsupported length `k` | `0.8` | Strength of capacity loss with support distance. |
| Reference length `L0` | `3` | Distance scale used by unsupported-length decay. |
| Exponent `p` | `1.8` | Makes long unsupported sections weaken non-linearly. |
| Failure threshold | `1.0` | TEST fails members strictly above this utilisation. |
| Difficulty multiplier | `1.0` | Divides all current effective capacities. |
| Cascade limit | `64` | Hard termination guard. |
| Disconnected-load multiplier | `3.0` | Penalises loaded components with no support path. |

## Fixture calibration at 48 t

The deterministic acceptance suite locks the important relationships rather than exact pseudo-force values:

- short two-support beam remains below failure;
- short cantilever survives at the end of its route;
- long cantilever fails and redistributes load progressively;
- the right arm of the T loses effective capacity member-by-member with support distance;
- moving the T load from the leg to the far tip increases maximum utilisation by more than 3×;
- removing the centre pier raises demand on both neighbouring deck spans;
- incomplete critical connectivity produces `ROUTE_LOST`;
- Warren, Pratt, and Howe share one graph/solver contract.

## How to tune safely

1. Change one relationship at a time in `DEFAULT_TUNING`.
2. Run `npm test`.
3. Use BUILD warnings to inspect the full gradient without applying damage.
4. Run TEST to check the failed-member sequence, not only the first failure.
5. Re-run `npm run benchmark` after algorithmic changes.

Prefer fixture capacities for family-specific balance. Change `k`, `L0`, or `p` only when the global long-span curve is wrong.

The T fixture is the primary visual tuning gauge: near the vertical leg must stay green while farther horizontal members move through stressed and critical states.
