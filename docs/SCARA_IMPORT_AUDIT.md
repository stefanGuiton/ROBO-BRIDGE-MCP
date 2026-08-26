# SCARA-SIM import audit

Date: 2026-08-26

## Reference identity and safety status

- Reference checkout: `D:\SCARA-Simulator`.
- Observed branch: `codex/phase1-benchy-lab`.
- Observed HEAD: `692aababa15822812532f1df35d4c09dad6b73e5` (`docs: record browser control retry checkpoint`).
- The branch is 22 commits ahead of `origin/codex/phase1-benchy-lab`.
- The checkout contains extensive tracked and untracked user changes. This audit treats the current worktree as observational evidence only.
- No branch change, install, test, edit, commit, network operation, hardware access, or command-producing action was performed in SCARA-SIM.
- No RepRapFirmware source may be copied into ROBO-SIM-MCP.

## Component decisions

| Capability | Reference source | Reusable? | Adaptation and provenance | Copy now? |
|---|---|---:|---|---:|
| Locked SCARA dimensions and proportions | `Main_Simulator/index.html`; generated profile | Yes | Reuse measured dimensions and compare clean procedural geometry. Current ROBO-SIM-MCP already uses 340.313 mm and 249.960 mm links. Pin any further visual extraction to a clean reviewed commit. | No |
| Procedural V8 robot geometry | `Main_Simulator/index.html` | With adaptation | Large monolithic private file with current uncommitted changes. Extract only independently reviewed visual improvements into existing render modules; do not transplant the page. | Wait |
| Machined aluminium PBR material recipe | `Main_Simulator/index.html` | Yes, conceptually | `MeshPhysicalMaterial`, anisotropy, micro bump texture, Neutral tone mapping, and PMREM are generic Three.js techniques. Existing foundation already implements a clean variant. Any numeric copying needs provenance review against the pinned source. | No |
| HDR/PMREM environment | `Main_Simulator/index.html`; graphics research | Yes | The technique is safe. HDR assets require separate redistribution-rights verification; prefer procedural `RoomEnvironment` or independently licensed assets. | Technique only |
| Photo-booth lighting | `apps/benchy-render-lab/demo/js/photo-booth.js` | Yes | The Benchy lab is derived from `xyz-tools/gcode-preview` at frozen commit `49aa449...` under MIT. Adapt the RectArea/softbox arrangement and retain required notices. The current worktree has later uncommitted changes, so copy only after a clean diff review. | Wait |
| Camera orbit/pan/fit | `Main_Simulator/index.html`; `apps/benchy-render-lab/src/scene-manager.ts` | Yes | Reuse behaviour and acceptance expectations. ROBO-SIM-MCP already has OrbitControls and a fit action; inspect runtime before changing. | No |
| Pointer picking and XY/Z dragging | `Main_Simulator/index.html` | Yes, conceptually | Reuse interaction semantics, invisible hit target, drag-plane mapping, Shift/Z behaviour, and rejection feedback. Keep every accepted move routed through ROBO-SIM-MCP `RobotController`. | After baseline |
| Path preview | `Main_Simulator/index.html`; V8 adapter | Yes, conceptually | Preserve isolated preview state and rejected-point reporting. ROBO-SIM-MCP already previews without mutating accepted state. | No |
| Fail-closed adapter and single commit point | `Main_Simulator/kinematics/rrf-scara-v8-adapter.js`; `Kinematics/src/v8-adapter/rrf-scara-v8-adapter.js` | Yes, conceptually | Strong reference semantics: immutable accepted snapshot, renderer hook before commit, structured rejection with unchanged render state, isolated preview branch. Reimplement tests/semantics in the existing clean controller; do not copy RRF-derived implementation blindly. | Tests first |
| RRF-compatible FK/IK, branch continuity, limits, workspace | `Kinematics/src/scara-core/**`; `Kinematics/tests/**` | Behavioural reference only | The TypeScript core is documented as a behavioural implementation informed by inspected GPLv3 RRF source, not a legal clean-room implementation. ROBO-SIM-MCP should retain its independent analytic solver and add independently authored edge-case tests. | No source copy |
| RepRapFirmware source/archive | `Kinematics/reference/**`; `Duet_ReprapFirmware/**` | No | GPLv3 reference material with exact upstream commit not proven. Explicitly excluded from this project. | Exclude |
| Scene-generic external object seam | `apps/benchy-render-lab/src/scene-manager.ts` | Yes | MIT-originated add/remove/clear caller-owned object boundary. ROBO-SIM-MCP already separates workcell objects from robot rendering; adopt only if a future generic scene manager needs it. | Defer |
| Renderer capability seam | `apps/benchy-render-lab/src/rendering/renderer-backend.ts`; renderer policy history | Yes | Useful fail-closed startup/capability reporting pattern. WebGL2 remains the proven local backend; WebGPU is a future gate. | Defer until required |
| Graphics research recommendations | `docs/research/SCARA-SIM-Photoreal-120-FPS-Web-Graphics-Research.md` | Yes as research | Use PBR Neutral, PMREM, soft lighting, contact depth, fixed-camera comparisons, and measured frame timing. Do not claim 120 FPS or final WebGPU from research alone. | Apply as acceptance guidance |

## Immediate import decision

No SCARA-SIM source is copied during foundation qualification. The current ROBO-SIM-MCP already contains independent implementations of the highest-priority geometry, controls, controller semantics, PBR materials, lighting, and path preview. First qualify those in the real browser. Then make only evidence-backed, file-level adaptations from a clean pinned SCARA-SIM revision.

## Licence decision

- RepRapFirmware source and archives: `EXCLUDE`.
- SCARA-SIM behavioural kinematics implementation: reference for tests and behaviour only; no source copy in this pass.
- Benchy renderer/photo-booth work: potentially reusable under MIT with attribution, but current uncommitted changes must be separated from the frozen upstream and reviewed before copying.
- HDR files: `DEFER` until source and redistribution rights are documented.

