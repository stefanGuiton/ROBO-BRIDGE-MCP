# Acceptance report

## Decision

**Package result: PASS for isolated production-core delivery.**

**MAIN_DEMO integration result: NOT TESTED.**

The package is ready for independent review and later MAIN_DEMO integration. It must not be marked as integrated submission acceptance.

## Source basis

Repository:

`stefanGuiton/ROBO-BRIDGE-MCP`

Latest `main` HEAD inspected:

`b66cc07c7be7c9743338611edc794d5805d2066f`

Completed WebMCP checkpoint inspected:

- branch: `oracle/webmcp-bridge-design-v1`
- head: `59a3d1458f7edfab074f6d0dfddd6e18fd0bf848`

Supplied input SHA-256 values:

| Input | SHA-256 |
|---|---|
| V4.6 ZIP | `0b17af1c721a30655495b7ab7e1d997275be1f7ae71254dda35aac6624cfb139` |
| V4.6 HTML | `c5c302df9d28fab8f946a95bbff7d3210cf9116b68e3e6af8629b37c3d288d5c` |
| WebMCP V1 ZIP | `18e6ff01b1d0fcbf62e2a5795459bd7f7573294bb41ad1eb7312303759b71b84` |

Direct Git clone was blocked by VM DNS policy. The authenticated GitHub connector was used to read the exact repository commit and branch files. No remote write was made.

## Architecture acceptance

Passed:

- compiler logic has no DOM slider dependency;
- compiler logic has no WebGL or Three.js dependency;
- renderer is an external consumer;
- procedural terrain is not in production source;
- support height is an injected deterministic data interface;
- no `BuildBoard` import or construction;
- no `PlacementAuthority` import or construction;
- no `RobotController` import or construction;
- no V4.6 `BuildExecutionEngine` in production source;
- one explicit rigid transform handles all bridge data;
- BuildPlan 4.6 stays authoritative;
- atomic host mutations compile a candidate before commit;
- cancellation, stale revisions, and failed candidates do not change active state;
- the completed WebMCP V1 package uses the host without redesign.

## V4.6 equivalence

Two accepted plans were compiled with the extracted core and the test-only V4.6 reference support sampler.

| Case | Result | Plan | Checksum | Parts |
|---|---|---|---|---:|
| Aqueduct default | exact parsed JSON match | `bp_4eef097f` | `4eef097f` | 1,286 |
| Viaduct, 5 arches, ratio 0.9 | exact parsed JSON match | `bp_99e13df4` | `99e13df4` | 2,388 |

The generated and reference normalized JSON SHA-256 values match for both cases. See `evidence/equivalence-results.json`.

The extracted V4.6 compiler section has this source hash:

`dc09246a2cce320ad35e1501234ff6189a780dc7123275461260a72d4467b1a1`

## Automated tests

Command:

```bash
npm test
```

Result:

- tests: 39;
- passed: 39;
- failed: 0;
- skipped: 0.

Coverage includes:

- exact V4.6 plan equivalence;
- five fixtures compiled ten times each;
- parameter mutation isolation;
- family switching;
- strict settings validation;
- challenge input validation;
- world transform and inverse consistency;
- hologram and construction mapping;
- bounded pages;
- BuildBoard target mapping;
- custom geometry generation;
- Three.js instancing contract and disposal;
- Worker compile and Worker cancellation;
- atomic host commit;
- stale revision rejection;
- invalid candidate rejection;
- concurrent mutation rejection;
- freeze contract;
- static no-duplicate-authority checks;
- all five existing WebMCP bridge-design tools.

## JSON Schema acceptance

Command:

```bash
npm run test:schema
```

Result:

- default aqueduct reference: valid;
- five-wide viaduct reference: valid;
- schema failures: 0.

Schema:

`schemas/ROBO_BRIDGE_BuildPlan_V4_6.schema.json`

## Browser and visual acceptance

Command:

```bash
npm run test:browser
```

Chromium used SwiftShader. VM policy blocked localhost and file navigation. The test loaded the self-contained HTML with `page.set_content()`. It did not emulate native WebMCP.

Passed views:

1. default aqueduct;
2. aqueduct 10 / 6 / 3;
3. aqueduct 8 / 6 / 4;
4. default viaduct;
5. viaduct with five wide openings;
6. transform at X 505, Y -120, Z 45, yaw 35 degrees, scale 0.8.

Checks passed:

- family switching;
- parameter changes produced visible image changes;
- BuildPlan physical count matched hologram count;
- custom arches were present;
- track modules were present;
- track was above the deck datum;
- aqueduct arch colour matched aqueduct body masonry;
- viaduct arch colour matched viaduct body masonry;
- ENTRY and EXIT transformed correctly;
- all screenshots were non-blank;
- console errors: 0;
- page errors: 0.

Screenshot RMS differences were all above the acceptance threshold:

- aqueduct default vs 10 / 6 / 3: 41.396;
- aqueduct 10 / 6 / 3 vs 8 / 6 / 4: 36.896;
- aqueduct vs viaduct: 51.377;
- viaduct default vs five-wide: 34.106.

See `screenshots/` and `evidence/browser-acceptance-results.json`.

## Performance

Node v22.16.0, Linux x64, inline compiler, 12 samples per fixture:

| Fixture | Parts | BuildPlan | Compile mean / p95 | Hologram mean / p95 | Construction mean / p95 |
|---|---:|---:|---:|---:|---:|
| Aqueduct default | 1,286 | 154.0 KiB | 26.42 / 40.00 ms | 32.73 / 56.12 ms | 29.65 / 40.55 ms |
| Aqueduct 10 / 6 / 3 | 1,298 | 153.9 KiB | 24.11 / 31.37 ms | 24.69 / 32.10 ms | 25.36 / 29.62 ms |
| Aqueduct 8 / 6 / 4 | 1,388 | 161.6 KiB | 24.29 / 39.26 ms | 28.02 / 35.03 ms | 29.29 / 38.86 ms |
| Viaduct default | 3,417 | 298.5 KiB | 40.69 / 51.42 ms | 42.38 / 52.50 ms | 50.23 / 76.44 ms |
| Viaduct five-wide | 2,388 | 218.4 KiB | 30.11 / 41.84 ms | 29.36 / 31.92 ms | 32.40 / 44.69 ms |

Thirty repeated default-viaduct compiles with explicit garbage collection had:

- heap range: 9.88 to 10.81 MiB;
- heap slope: -5.26 KiB per compile;
- RSS change: 0.15 MiB.

No increasing memory trend was found in this test.

The standalone Canvas evidence renderer drew 34,164 to 60,756 triangles. SwiftShader frame time was 101.6 to 181.9 ms, with a mean of 127.857 ms. This does not meet a 120 FPS production target. It is not the production renderer. The package includes a Three.js instancing adapter for MAIN_DEMO. Real MAIN_DEMO GPU frame acceptance remains required.

## Family fixtures

| Fixture | Checksum | Physical parts | Physical arches | Track modules |
|---|---|---:|---:|---:|
| `aqueduct_default` | `4eef097f` | 1,286 | 57 | 14 |
| `aqueduct_10_6_3` | `ec86eb58` | 1,298 | 57 | 14 |
| `aqueduct_8_6_4` | `884198dc` | 1,388 | 54 | 14 |
| `viaduct_default` | `9b8eb388` | 3,417 | 18 | 12 |
| `viaduct_5_wide` | `99e13df4` | 2,388 | 15 | 12 |

## Limits

The following items are not proven by this package:

- integration into `apps/web`;
- real Three.js rendering in current MAIN_DEMO;
- 120 FPS with production GPU rendering;
- source inventory for every V4.6 standard and custom part;
- custom-part grasp, collision, and placement acceptance;
- final tan and grey material-name mapping;
- BuildBoard reset and mission-state wiring;
- native WebMCP registration in the final secure browser;
- plan-derived train support;
- full DESIGN, BUILD, TEST, COMPLETE mission acceptance.

The current MAIN_DEMO placement system is built around the existing physical brick. It must be extended for V4.6 standard sizes, custom arches, and track modules. The supplied adapter fails closed until the integration owner confirms this support.

## Git boundary

No GitHub branch, pull request, commit, setting, or remote file was created or changed.
