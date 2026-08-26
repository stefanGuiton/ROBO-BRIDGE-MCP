# ROBO-SIM-MCP Master Plan v1.0

**Project:** ROBO-SIM-MCP  
**Date:** 2026-08-26  
**Purpose:** Build an agent-native browser robot simulator for the 2026 OpenAI WebMCP Challenge, then grow it into a general robot simulation platform.  
**Official challenge deadline:** 2026-09-03 at 13:00 PT, which is 21:00 BST.  
**Internal submission deadline:** 2026-09-03 at 18:00 BST.  
**Internal code freeze:** 2026-09-02 at 18:00 BST.

---

## 1. Executive summary

ROBO-SIM-MCP is a browser robot workcell where a human and an AI agent use the same robot, scene, controls, trajectories, and physics results.

The first release will use one SCARA robot. It will perform pick-and-place tasks with a two-finger gripper. The scene will contain coloured cubes, matching bins, and an obstacle. The human can move the end effector directly. A WebMCP agent can inspect the same state and call the same controller.

The primary demonstration is:

> Put the red cube into the red bin and the blue cube into the blue bin. Avoid the yellow obstacle.

The agent must inspect the scene, create a path, validate the path, check grasp physics, execute the path, and verify the final object state. The demo must also show one failed action and a successful recovery.

The challenge build will reuse the best concepts from the private SCARA-SIM project:

- exact SCARA dimensions;
- direct XY and Z manipulation;
- fail-closed movement;
- structured robot state;
- path preview;
- PBR metal materials;
- HDR-style environment lighting;
- strong camera controls;
- a high-quality industrial visual style.

The challenge build will not include RepRapFirmware source, Duet control, real-machine configuration, G-code printing, Electron packaging, path tracing, or a broad robot catalogue.

### Decision

**GO WITH CONDITIONS.**

The project is a strong WebMCP entry if these conditions are met:

1. The browser build works reliably on the target PC by 2026-08-27.
2. WebMCP tool discovery and execution work in a supported browser by 2026-08-28.
3. The physics service returns stable collision and grasp results by 2026-08-30.
4. A public deployment works without local installation by 2026-09-01.
5. The demo is frozen and recorded by 2026-09-02.

---

## 2. Product definition

### 2.1 Product name

**ROBO-SIM-MCP**

Challenge subtitle:

**A shared robot workcell for humans and AI agents**

### 2.2 Product promise

A user can control a robot by direct manipulation. An AI agent can control the same robot through structured WebMCP tools. Both parties see the same accepted state. Physics determines whether the manipulation succeeds.

### 2.3 Primary user

The primary challenge user is a technical person who wants an AI agent to help plan and validate robot manipulation.

Post-challenge users can include:

- robotics students;
- automation engineers;
- researchers;
- system integrators;
- robot-learning developers;
- digital-twin teams.

### 2.4 Primary task

One SCARA robot moves simple objects between known locations.

The task must include:

- scene inspection;
- reachability;
- trajectory planning;
- collision validation;
- gripper control;
- grasp validation;
- object movement;
- release;
- final-state verification.

### 2.5 Success statement

The user gives one natural-language goal. The agent uses WebMCP tools. The browser shows each planned and executed step. The final scene state proves task success.

---

## 3. Challenge strategy

### 3.1 Why WebMCP is central

WebMCP must not be an added control layer. It must be the main structured interface between the agent and the workcell.

Without WebMCP, a browser agent would need to:

- infer object meaning from pixels;
- click controls;
- drag a 3D object accurately;
- read small coordinate values;
- infer whether a path is safe;
- infer whether a grasp worked.

With WebMCP, the agent can:

- read exact structured scene state;
- read exact robot state;
- check reachability;
- create a path;
- request physics validation;
- execute only an accepted path;
- inspect a structured result.

This is a material increase in accuracy, speed, and reliability.

### 3.2 Judging strategy

The entry must score well in four areas:

#### WebMCP leverage

The tools must expose abilities that are difficult to use through normal browser clicking.

#### Technical execution

The state, motion, physics, and rendering systems must agree. Failures must be clear and safe.

#### Impact

The project must show a practical use for agent-assisted robotics and digital twins.

#### Creativity and presentation

The workcell must look premium. The agent must recover from a physical failure. The demo must be easy to understand.

### 3.3 Challenge story

The strongest story is:

> A human and an AI share one robot workcell. The human can move the robot. The agent can inspect the same world, plan a task, simulate it, recover from failure, and complete it. Physics, not narration, determines success.

### 3.4 Minimum successful submission

The minimum acceptable submission includes:

- public source repository;
- live public web app;
- WebMCP tools visible to a supported agent;
- one SCARA robot;
- one gripper;
- one cube;
- one destination bin;
- one obstacle;
- path preview;
- collision rejection;
- deterministic grasp validation;
- successful execution;
- public demo video;
- clear pre-existing-work record.

### 3.5 A-tier submission

The preferred submission adds:

- real Newton contact and object dynamics;
- two coloured sorting tasks;
- deliberate grasp failure and recovery;
- smooth product-quality graphics;
- hosted physics with no local installation;
- a concise and reliable three-minute demo.

---

## 4. Existing SCARA-SIM evidence

This section separates observed evidence from proposals.

### 4.1 Observed facts

The private SCARA-SIM project has these challenge-relevant assets:

- a Three.js SCARA simulator;
- exact proximal length `340.313 mm`;
- exact distal length `249.960 mm`;
- maximum reach `590.273 mm`;
- direct toolhead XY dragging;
- direct Z dragging;
- orbit, pan, fit, play, and path controls;
- browser-visible joint and Cartesian values;
- PBR metal materials;
- environment reflections;
- PBR Neutral tone mapping;
- shadows and post-processing controls;
- quality profiles;
- a generated browser kinematics bundle;
- a fail-closed adapter;
- structured accepted and rejected motion results;
- isolated path preview;
- deterministic kinematics tests;
- evidence that the active branch had 132/132 kinematics tests and 10,500 parity samples with zero logical-step mismatches;
- a scene-generic rendering seam;
- photo-booth lighting work.

### 4.2 Observed limits

The inspected project also records these limits:

- final WebGPU rendering is not complete;
- measured 120 FPS acceptance is not complete;
- final photoreal appearance is not complete;
- the real-machine configuration is not proven;
- the active profile is provisional;
- browser test stability had environmental issues in some runs;
- the complete private repository could not be cloned inside the build VM for this ZIP.

### 4.3 Engineering inference

The existing SCARA-SIM interaction and state patterns are a strong foundation for a WebMCP robot workcell.

The most valuable reusable concepts are:

- one accepted-state controller;
- direct Cartesian manipulation;
- last-valid-pose behaviour;
- structured motion rejection;
- separate rendering and kinematics;
- path preview on an isolated state;
- premium PBR presentation.

### 4.4 Future proposal

ROBO-SIM-MCP will use a clean public-safe implementation. It will preserve the useful architecture without including private or GPL source.

---

## 5. Reuse matrix

| SCARA-SIM asset | ROBO-SIM-MCP use | Decision | Challenge priority |
|---|---|---|---|
| Exact SCARA link dimensions | Robot geometry and IK | Reuse | Must |
| Procedural SCARA visual design | Hero robot | Adapt | Must |
| Direct XY drag | Human manipulation | Reuse concept | Must |
| Z drag | Human manipulation | Reuse concept | Must |
| Fail-closed adapter pattern | Shared robot controller | Rebuild cleanly | Must |
| Path preview | Proposed and validated paths | Adapt | Must |
| Structured debug API | WebMCP controller API | Replace with typed application API | Must |
| PBR materials | Premium appearance | Adapt | Must |
| HDR/PMREM | Environment lighting | Adapt | Must |
| Photo-booth lights | Workcell lighting | Adapt | Should |
| SSAO/FXAA/MSAA controls | Visual quality | Use if stable | Should |
| WebGPU seam | Future renderer | Preserve boundary only | Stretch |
| G-code renderer | Printing | Exclude | Non-goal |
| Duet connector | Real hardware | Exclude | Non-goal |
| RRF source archives | Reference | Do not publish | Prohibited |
| Electron host | Desktop packaging | Exclude | Non-goal |

---

## 6. Product principles

### 6.1 One accepted robot state

The robot controller owns accepted joint, Cartesian, gripper, and operation state.

### 6.2 Shared human and agent control

Manual controls and WebMCP tools call the same controller methods.

### 6.3 Rendering is not robot truth

Three.js receives accepted state. It does not decide whether a target is valid.

### 6.4 Physics success is measured

A grasp succeeds only when the physics backend reports success.

### 6.5 Fail closed

Invalid, unreachable, cancelled, or colliding actions keep the last accepted state.

### 6.6 Preview is isolated

Trajectory preview must not change the accepted robot or scene state.

### 6.7 Small tools

WebMCP tools must be focused, composable, and easy for an agent to understand.

### 6.8 Challenge scope first

A reliable SCARA demo is more important than broad robot support.

### 6.9 Public-safe source

No private configuration, GPL source, credentials, or unverified assets can enter the public repository.

### 6.10 Honest capability labels

The project must not describe fallback physics as Newton. It must not describe WebGL2 as final WebGPU. It must not describe an untested grasp as physically proven.

---

## 7. User experience

### 7.1 Initial scene

The user sees:

- one SCARA robot;
- one two-finger gripper;
- one dark industrial table;
- one red cube;
- one blue cube;
- one red bin;
- one blue bin;
- one yellow obstacle;
- a clean status panel;
- task controls;
- a small operation log.

### 7.2 Manual interaction

The user can:

- orbit the camera;
- pan the camera;
- fit the scene;
- drag the gripper in XY;
- hold Shift or drag vertically for Z;
- open and close the gripper;
- preview a path;
- validate physics;
- execute a task;
- reset the scene.

### 7.3 Agent interaction

The agent can:

- inspect the scene;
- inspect the robot;
- check one target;
- move the end effector;
- set the gripper;
- plan pick-and-place;
- validate the current path;
- execute the accepted path;
- reset the workcell.

### 7.4 Visible agent reasoning state

The UI must show:

- proposed path;
- validated path;
- rejected path;
- current operation;
- collision result;
- grasp result;
- final task result.

### 7.5 Failure and recovery

The demo must include one failure, such as:

- a low path through the obstacle;
- an offset grasp;
- an unreachable target.

The agent must receive a structured failure and create a corrected plan.

---

## 8. Human-agent interaction model

### 8.1 Shared state contract

Both control routes call one application API:

```text
Human pointer / UI ─┐
                    ├─> RobotController ─> accepted state ─> renderer
WebMCP tools ───────┘
```

### 8.2 State revision

Each accepted robot or scene change increments a revision.

A plan records the robot revision used to create it.

Execution is refused if the robot state changed after planning.

### 8.3 Manual override

A manual robot move cancels the current plan and physics result.

### 8.4 Agent cancellation

Long WebMCP operations use `AbortSignal`.

A cancelled path stops at the last accepted pose.

### 8.5 No hidden agent state

The agent must not maintain a separate robot model that can diverge from the page.

---

## 9. System architecture

```text
ChatGPT / browser agent
          │
          ▼
       WebMCP
          │
          ▼
ROBO-SIM-MCP browser application
 ┌─────────────────────────────────────────────┐
 │ Structured SceneState                       │
 │ Shared RobotController                      │
 │ SCARA FK/IK and limits                      │
 │ Trajectory planner and preview              │
 │ Three.js renderer and human controls        │
 │ PhysicsClient                               │
 └───────────────────┬─────────────────────────┘
                     │ HTTP POST
                     ▼
Physics service
 ┌─────────────────────────────────────────────┐
 │ Stable request/response protocol            │
 │ Deterministic fallback                      │
 │ Newton adapter                              │
 │ Collision, contact, grasp, object dynamics  │
 └─────────────────────────────────────────────┘
```

### 9.1 Main process boundaries

#### Browser

Owns:

- accepted robot state;
- semantic scene state;
- path planning;
- rendering;
- manual interaction;
- WebMCP registration;
- playback.

#### Physics service

Owns:

- collision validation;
- grasp validation;
- object attachment and release physics;
- final object state;
- physics diagnostics.

#### Newton

Newton is an implementation inside the physics service. It is not a browser dependency.

---

## 10. Browser architecture

### 10.1 Current foundation modules

```text
apps/web/src/
  main.js
  core/
    scara.js
    robot-controller.js
    scene-state.js
    trajectory.js
  render/
    robot.js
    workcell.js
    scene.js
  physics/
    client.js
  webmcp/
    register-tools.js
  ui/
    panel.js
```

### 10.2 Browser boot sequence

1. Create `RobotController`.
2. Create `SceneState`.
3. Create `PhysicsClient`.
4. Create Three.js scene.
5. Bind renderer to robot and scene state.
6. Bind human controls.
7. Bind UI.
8. Register WebMCP tools.
9. Check physics health.
10. Expose a read-only debug surface for tests.

### 10.3 Browser failure behaviour

If Three.js fails to load, show a visible error.

If WebMCP is unavailable, keep manual controls working.

If the physics service is unavailable, show the deterministic fallback label.

If execution is not validated, refuse it.

---

## 11. Robot abstraction

### 11.1 Required challenge abstraction

The challenge needs one small interface:

```text
RobotController
  getState()
  getWorkspace()
  moveEndEffector(target)
  setJointTargets(joints)
  setGripper(openFraction)
  previewTrajectory(waypoints)
  executeTrajectory(waypoints, options)
  reset()
```

### 11.2 Future abstraction

After the challenge, extract:

```text
RobotAdapter
  metadata
  jointDefinitions
  endEffectors
  forwardKinematics()
  inverseKinematics()
  validateTarget()
  validateJoints()
  sampleWorkspace()
```

Future adapters:

- `ScaraAdapter`;
- `PandaAdapter`;
- `UR10Adapter`;
- `UrdfAdapter`.

### 11.3 Generic-now boundary

Generic now:

- robot state schema;
- trajectory schema;
- scene schema;
- physics protocol;
- WebMCP result format.

SCARA-specific now:

- kinematics;
- visual model;
- direct manipulation mapping;
- joint limits;
- tool frame.

This boundary prevents over-engineering.

---

## 12. SCARA architecture

### 12.1 Locked challenge geometry

- Link 1: `340.313 mm`.
- Link 2: `249.960 mm`.
- Maximum reach: `590.273 mm`.
- Z range: `0–525 mm` for the simulation profile.

### 12.2 Kinematics

Use analytic two-link SCARA FK and IK.

For one Cartesian target, calculate both elbow branches. Remove branches outside limits. Select the branch nearest the current accepted joints.

### 12.3 Fail-closed rules

Reject:

- non-finite input;
- target outside radial workspace;
- Z outside range;
- no real IK solution;
- joint-limit violation;
- invalid trajectory waypoint;
- changed state after planning;
- unvalidated execution.

### 12.4 Last-valid pose

On rejection:

- do not change accepted state;
- return the requested target;
- return a reason;
- return diagnostics;
- keep the visible pose equal to accepted state.

### 12.5 Difference from private RRF work

The public challenge code uses a clean analytic core. It does not include RepRapFirmware code. It does not claim real-machine parity.

---

## 13. Manipulation and gripper

### 13.1 Gripper design

Use a parallel two-finger gripper.

Components:

- wrist flange;
- compact dark housing;
- two machined-metal fingers;
- rubber contact pads;
- invisible selection volume.

### 13.2 Opening range

Foundation visual range:

- closed width: approximately `8 mm`;
- open width: approximately `46 mm`.

The final value must match the challenge cube and Newton collider dimensions.

### 13.3 Manual control

Buttons:

- Open gripper.
- Close gripper.

The gripper can also be controlled by WebMCP.

### 13.4 Physics representation

First Newton task:

- one kinematic palm body;
- two kinematic finger bodies;
- simple box colliders;
- high-friction pad colliders;
- one dynamic cube.

### 13.5 Grasp success criteria

Newton target criteria:

- finger contacts on opposite cube sides;
- sufficient normal force;
- cube remains between fingers during lift;
- cube vertical displacement exceeds a minimum lift threshold;
- cube does not slip beyond tolerance.

Fallback criteria:

- gripper closes within a distance threshold;
- opening width is compatible with object size;
- path has no obstacle collision;
- release occurs inside destination bounds.

The UI must label the active backend.

### 13.6 Grasp failure criteria

- gripper closes too far from the object;
- object is too large;
- object slips during lift;
- collision blocks the approach;
- release occurs outside the destination.

---

## 14. Scene model

### 14.1 Scene object schema

Each object has:

- `id`;
- `label`;
- `type`;
- `semanticRole`;
- `position`;
- `size`;
- `colour`;
- `massKg`;
- `friction`;
- `movable`;
- `graspable`;
- `heldBy`;
- optional destination rules.

### 14.2 Required scene objects

- red cube;
- blue cube;
- red bin;
- blue bin;
- yellow obstacle;
- table;
- floor.

### 14.3 Agent-readable state

The agent reads object semantics from `get_scene_state`.

It must not need image recognition to identify the red cube or destination bin.

### 14.4 Scene revision

Each object change increments the scene revision.

### 14.5 Reset

Reset returns all objects and the robot to a deterministic starting state.

---

## 15. WebMCP architecture

### 15.1 API choice

Use the current imperative API:

```text
document.modelContext.registerTool()
```

Do not use deprecated `navigator.modelContext` patterns.

### 15.2 Progressive enhancement

The app must remain usable when WebMCP is unavailable.

### 15.3 Secure context

The public app must use HTTPS.

Local development can use supported localhost behaviour.

### 15.4 Tool lifecycle

Register tools at application start.

Use an `AbortController` for tool unregistration during development or hot reload.

### 15.5 Tool annotations

Use:

- `readOnlyHint: true` for state and analysis tools;
- `readOnlyHint: false` for movement and reset tools;
- `untrustedContentHint: false` for internal structured simulator state.

### 15.6 Character budgets

Keep:

- tool names under 30 characters;
- parameter names under 30 characters;
- descriptions under 500 characters;
- parameter descriptions under 150 characters;
- each output under approximately 1,500 characters.

### 15.7 Agent safety

Do not expose cross-origin tools unless required and reviewed.

Do not return arbitrary page content.

Do not accept oversized arrays through WebMCP.

Use specific IDs and bounded numeric fields.

---

## 16. Exact WebMCP tool specification

The foundation registers nine tools.

### 16.1 `get_scene_state`

**Purpose:** Return the structured workcell.

**Input:** Empty object.

**Output:** Scene revision and object summaries.

**Read-only:** Yes.

**Newton required:** No.

**Failure:** Scene unavailable.

### 16.2 `get_robot_state`

**Purpose:** Return joints, Cartesian state, gripper, workspace, and mode.

**Input:** Empty object.

**Output:** Current accepted robot state.

**Read-only:** Yes.

**Newton required:** No.

### 16.3 `analyse_reachability`

**Purpose:** Check one Cartesian target without movement.

**Input:**

```json
{
  "xMm": 300,
  "yMm": 100,
  "zMm": 180
}
```

**Output:** Reachable flag, candidate joints, branch, or reason.

**Read-only:** Yes.

**Newton required:** No.

**Failure reasons:** Non-finite input, outside workspace, Z limit, joint limits.

### 16.4 `move_end_effector`

**Purpose:** Move the shared robot to one valid target.

**Input:** `xMm`, `yMm`, `zMm`.

**Output:** Accepted state or fail-closed rejection.

**Read-only:** No.

**Newton required:** No for direct free-space movement.

**Safety:** Invalid movement preserves accepted state.

### 16.5 `set_gripper`

**Purpose:** Set opening from `0` to `1`.

**Input:**

```json
{ "openFraction": 0 }
```

**Read-only:** No.

**Newton required:** No for visual state. Yes for grasp success.

### 16.6 `plan_pick_and_place`

**Purpose:** Create and display a waypoint plan.

**Input:** `objectId`, `destinationId`.

**Output:** Plan ID, waypoints, or rejection.

**Read-only:** No, because it changes visible plan state.

**Newton required:** No.

**Safety:** Plan preview does not move the robot.

### 16.7 `simulate_trajectory`

**Purpose:** Validate the current plan.

**Input:** Empty object.

**Output:** Backend, collision result, grasp result, events, warnings.

**Read-only:** Yes for accepted robot and scene state.

**Newton required:** Preferred. Fallback allowed.

**Cancellation:** Use execution `AbortSignal`.

### 16.8 `execute_trajectory`

**Purpose:** Execute the current validated plan.

**Input:** Empty object.

**Output:** Completed task or exact refusal reason.

**Read-only:** No.

**Preconditions:** Current plan exists, validation passed, robot revision unchanged.

**Cancellation:** Use execution `AbortSignal`.

### 16.9 `reset_workcell`

**Purpose:** Reset all deterministic state.

**Input:** Empty object.

**Read-only:** No.

**Newton required:** No.

### 16.10 Tool changes before submission

Do not add more tools until the nine-tool set passes agent testing.

Remove a tool if agents frequently choose it incorrectly.

---

## 17. Trajectory system

### 17.1 Waypoint schema

Each Cartesian waypoint can contain:

- `xMm`;
- `yMm`;
- `zMm`;
- `phase`;
- `gripperOpenFraction`;
- `objectId`.

### 17.2 Pick-and-place phases

- start;
- approach above;
- approach grasp;
- close gripper;
- lift;
- transfer;
- lower;
- release;
- retreat.

### 17.3 Planning

The browser creates a simple clearance path.

The first planner is deterministic. It uses a safe Z height and straight Cartesian segments.

### 17.4 Preview validation

For each waypoint:

- solve IK using the previous preview joints;
- preserve branch continuity;
- reject the first invalid point;
- do not change accepted state.

### 17.5 Dense sampling

The browser samples each segment before physics validation.

Foundation value: 18 samples per segment.

### 17.6 Playback

The browser interpolates the validated waypoints with `requestAnimationFrame`.

### 17.7 Timing

Challenge motion should look controlled and clear, not maximally fast.

Target segment duration: `350–600 ms`.

### 17.8 Future motion

Post-challenge work can add:

- trapezoidal velocity;
- jerk-limited motion;
- spline paths;
- time-optimal planning;
- collision-aware replanning;
- dynamic obstacles.

---

## 18. Newton physics architecture

### 18.1 Decision

Newton is the preferred physics backend for the final A-tier challenge entry.

Newton is not required for the browser to start. The deterministic backend remains as a fallback and test oracle.

### 18.2 First Newton integration

Do not build the complete SCARA articulation first.

Use the browser-validated SCARA trajectory to drive a kinematic gripper proxy in Newton.

This reduces risk and proves the most important challenge physics:

- collision;
- finger contact;
- friction;
- lifting;
- slipping;
- release;
- gravity settlement.

### 18.3 Newton scene

- fixed table body;
- fixed obstacle body;
- fixed destination bin colliders;
- dynamic cube body;
- kinematic palm;
- two kinematic fingers;
- gravity;
- material friction;
- contact solver.

### 18.4 Trajectory input

The service receives dense end-effector points and gripper opening values.

Newton advances the kinematic gripper through those frames.

### 18.5 Result extraction

Return:

- collisions;
- contact events;
- grasp success;
- maximum slip;
- object lift height;
- final object pose;
- destination containment;
- solver timing;
- backend/version data.

### 18.6 Complete articulation later

After the first contact demo passes, add the SCARA links as articulated bodies only if time remains.

### 18.7 Determinism

Use deterministic options where available.

Run at least 20 repeated trials. Record success rate and final-pose variation.

### 18.8 Newton failure rule

If Newton cannot produce a stable result after three bounded tuning attempts, keep the deterministic backend for submission. Do not risk the entire entry.

---

## 19. Browser/Newton protocol

### 19.1 Transport decision

Use **HTTP POST** for challenge simulation.

Reason:

- complete trajectories are small;
- simulation can run faster than playback;
- one request has one result;
- retries and timeouts are simple;
- deployment is easier;
- no continuous connection is required.

WebSocket streaming is a post-challenge option.

### 19.2 Endpoints

- `GET /health`
- `POST /v1/simulate/trajectory`

### 19.3 Request limits

- maximum 20,000 trajectory points;
- bounded object count;
- bounded string lengths;
- finite numeric values;
- known task types.

### 19.4 Timeout

Foundation browser timeout: `12 seconds`.

Challenge target: physics result in less than `2 seconds` for one task.

### 19.5 Cancellation

Abort browser fetch on agent cancellation.

The service should later accept a request ID for server-side cancellation if simulation becomes long.

### 19.6 Health response

Health must state:

- active backend;
- Newton availability;
- Newton integration readiness;
- deterministic status;
- service version.

### 19.7 Honest fallback

A fallback result must contain:

```text
backend: deterministic-physics-fallback
```

It must not claim Newton.

---

## 20. Rendering architecture

### 20.1 Challenge renderer decision

Use **Three.js WebGL2** for the challenge.

Reason:

- the private SCARA-SIM reference already uses it;
- it is stable;
- it supports strong PBR output;
- it avoids a late WebGPU migration risk.

### 20.2 WebGPU strategy

Keep a renderer boundary and capability probe. Do not make WebGPU a challenge dependency.

### 20.3 Visual foundation

- Three.js `0.185.0`;
- sRGB output;
- PBR Neutral tone mapping;
- physical metal materials;
- environment reflections;
- large soft key, fill, and rim lights;
- separate shadow light;
- high-resolution shadows;
- neutral dark industrial workcell;
- smooth camera controls.

### 20.4 Quality modes

#### Performance

- pixel ratio `1`;
- 1024 shadow map;
- no expensive optional effects.

#### Balanced

- pixel ratio up to `1.5`;
- 2048 shadow map.

#### Cinematic

- pixel ratio up to `2`;
- 4096 shadow map.

### 20.5 Challenge visual target

Use the phrase:

**AAA-style industrial product visualisation**

Do not claim final AAA production rendering until performance and visual acceptance are measured.

### 20.6 Visual priorities

1. Robot silhouette and proportions.
2. Metal response.
3. Contact shadows.
4. Clear object colours.
5. Smooth motion.
6. Readable path colours.
7. Clean UI.

### 20.7 Effects to exclude

Do not add:

- path tracing;
- depth of field;
- bloom by default;
- chromatic aberration;
- heavy screen-space reflections;
- unstable custom shaders.

---

## 21. UI and visual language

### 21.1 Path colours

- blue: proposed;
- green: physics validated;
- red: collision or invalid;
- amber: warning or stale plan.

### 21.2 Object state

- selected object: subtle glow;
- held object: visible under gripper;
- destination: clear bin colour;
- obstacle: yellow.

### 21.3 Operation state

Show:

- current robot mode;
- physics backend;
- WebMCP registration count;
- current plan state;
- operation log.

### 21.4 Error display

Errors must name the cause:

- outside workspace;
- collision;
- grasp failed;
- no plan;
- plan not validated;
- robot state changed;
- physics unavailable;
- execution cancelled.

### 21.5 UI discipline

Keep panels small. Do not cover the robot. Do not show development diagnostics in the public demo.

---

## 22. State ownership and consistency rules

| State | Owner | Readers | Writers |
|---|---|---|---|
| Accepted SCARA joints | RobotController | UI, renderer, WebMCP | RobotController only |
| Accepted Cartesian pose | RobotController | UI, renderer, WebMCP | Derived by RobotController |
| Gripper command state | RobotController | UI, renderer, physics request | RobotController only |
| Scene semantic state | SceneState | UI, renderer, WebMCP, physics request | SceneState only |
| Proposed path | Planner state | renderer, physics request | planner only |
| Physics result | Physics result state | UI, executor, WebMCP | physics client only |
| Visual transforms | Three.js renderer | user | renderer only from accepted state |

### 22.1 Consistency invariant

At every visible frame:

```text
visible robot pose = RobotController accepted pose
```

### 22.2 Plan freshness invariant

```text
plan.createdFromRobotRevision = current robot revision
```

Execution must fail when this is false.

### 22.3 Physics invariant

```text
execution allowed only when lastSimulation.ok = true
```

### 22.4 Object invariant

An object can have only one `heldBy` owner.

---

## 23. Safety and fail-closed rules

- Simulation only.
- No Duet connection.
- No ROS command bridge during the challenge.
- No physical robot movement.
- Reject non-finite values.
- Reject unknown object IDs.
- Reject unknown destination IDs.
- Reject oversized WebMCP input.
- Reject stale plans.
- Reject unvalidated execution.
- Preserve accepted state after failure.
- Stop on cancellation.
- Keep tools same-origin by default.
- Do not expose private data through tool outputs.
- Keep tool outputs concise.
- Mark fallback physics clearly.

---

## 24. Repository structure

```text
ROBO-SIM-MCP/
  MASTER_PLAN.md
  README.md
  PREEXISTING_WORK.md
  AGENTS.md
  LICENSE
  THIRD_PARTY_NOTICES.md
  apps/
    web/
      index.html
      styles.css
      src/
        main.js
        core/
        render/
        physics/
        webmcp/
        ui/
  physics/
    newton-service/
      app/
        main.py
        models.py
        service.py
        fallback_backend.py
        newton_backend.py
      tests/
      requirements.txt
      requirements-newton.txt
  tests/
    js/
  scripts/
    serve_web.py
    run_foundation.py
    check_newton.py
    verify.py
  docs/
    PROTOCOL.md
    NEWTON_NEXT_TASK.md
  evidence/
    FOUNDATION_STATUS.md
    foundation-verification.json
  third_party/
```

### 24.1 Future packages

Do not split into many packages during the challenge unless file size becomes a real problem.

Post-challenge structure can add:

- `packages/robot-core`;
- `packages/scene-core`;
- `packages/trajectory-core`;
- `packages/webmcp`;
- `packages/renderer`.

---

## 25. Public extraction and provenance plan

### 25.1 Decision

Create a new public repository from this clean standalone foundation.

Do not make the private SCARA-SIM repository public.

### 25.2 Target-PC extraction review

On the user's PC:

1. Open private SCARA-SIM at the pinned branch.
2. Compare V8 geometry and material code with `apps/web/src/render/robot.js`.
3. Copy only user-owned, public-safe improvements.
4. Record every copied file or section in `PREEXISTING_WORK.md`.
5. Exclude RRF source and archives.
6. Verify HDRI redistribution rights.
7. Verify model and texture rights.
8. Run a secret and private-path scan.

### 25.3 Challenge provenance

For each public file derived from old work, record:

- source path;
- source SHA;
- original date;
- challenge modifications;
- licence basis.

### 25.4 Clean-history option

Create the public repository with one first commit containing:

- this foundation;
- provenance documents;
- no private Git history.

### 25.5 Evidence tags

Use tags:

- `pre-challenge-baseline`;
- `challenge-submission`.

---

## 26. Licensing

### 26.1 Project licence

Use **Apache License 2.0**.

Reason:

- permissive;
- compatible with Newton integration;
- includes a patent grant;
- suitable for research and commercial use.

### 26.2 Three.js

Three.js is MIT licensed. Retain its licence if vendored.

### 26.3 Newton

Newton is Apache-2.0. Keep it as a dependency. Do not copy its source unless required.

### 26.4 RepRapFirmware

Do not include RepRapFirmware source in the public repository.

### 26.5 HDRI and assets

Use only assets with explicit redistribution rights.

For the challenge, a procedural RoomEnvironment is safer than an uncertain HDRI.

### 26.6 Brand names

Use NVIDIA, Newton, OpenAI, Chrome, and other names only to describe compatibility. Do not imply sponsorship or endorsement beyond official challenge participation.

---

## 27. Testing strategy

### 27.1 JavaScript unit tests

Test:

- link lengths;
- workspace;
- FK;
- IK round trip;
- branch selection;
- unreachable target;
- non-finite input;
- Z limits;
- fail-closed controller;
- preview state isolation;
- scene revisions;
- waypoint phases.

### 27.2 WebMCP tests

Test:

- nine tools register;
- schemas are valid;
- names and descriptions meet budgets;
- read-only hints are correct;
- outputs remain bounded;
- invalid IDs return clear errors;
- cancellation stops execution;
- manual and agent operations use the same state.

### 27.3 Browser integration tests

Test:

- scene boots;
- robot is visible;
- camera orbit works;
- XY drag changes X/Y;
- Z drag changes Z;
- invalid drag holds pose;
- gripper opens and closes;
- plan appears blue;
- validated plan turns green;
- collision plan turns red;
- execute moves the object;
- reset restores state;
- console has no errors.

### 27.4 Physics fallback tests

Test:

- safe pick-and-place passes;
- low path collides;
- offset grasp fails;
- final object settles in bin;
- health reports backend honestly.

### 27.5 Newton tests

Add:

- safe grasp repeatability;
- slip failure;
- obstacle collision;
- release and gravity settlement;
- final position tolerance;
- GPU and CPU modes where practical.

### 27.6 Deployment tests

Test from a clean browser:

- HTTPS;
- Three.js loads;
- physics health;
- CORS;
- WebMCP tool visibility;
- complete task;
- mobile layout is not broken;
- demo URL works without authentication.

### 27.7 Visual regression

Capture fixed views:

- hero front three-quarter;
- rear three-quarter;
- top workcell;
- gripper macro;
- path validation view;
- completed task view.

### 27.8 Current foundation verification

The supplied foundation has:

- 12 JavaScript and WebMCP-contract tests passing;
- 5 Python tests passing.

Browser and Newton runtime tests remain open.

---

## 28. Challenge acceptance criteria

### 28.1 Must pass

- Public repository exists.
- Public live URL works.
- WebMCP tools are discoverable.
- `get_scene_state` returns structured objects.
- `get_robot_state` returns accepted state.
- Human XY and Z manipulation works.
- Agent movement changes the same state.
- Unreachable target fails closed.
- Proposed path is visible.
- Collision is detected.
- Grasp result is structured.
- Validated path executes.
- Object ends in destination.
- Reset works.
- Demo video is under the rule limit.
- Provenance is clear.
- No private or prohibited source is public.

### 28.2 Preferred pass

- Newton is active.
- Failure and recovery are visible.
- Two objects are sorted.
- Physics returns in less than 2 seconds.
- Browser remains at 60 FPS or more during playback.
- No console errors.

---

## 29. Performance targets

### 29.1 Browser

- first visible frame: less than 4 seconds on target PC;
- steady playback: at least 60 FPS;
- preferred playback: 90 FPS or more on RTX 4070 Ti;
- no frame over 100 ms during normal task playback;
- no unbounded allocations per frame.

### 29.2 WebMCP

- read-only tool response: less than 100 ms;
- planning response: less than 250 ms;
- tool output: less than 1,500 characters;
- registration: nine tools without error.

### 29.3 Physics

- fallback validation: less than 100 ms;
- Newton target: less than 2 seconds;
- request timeout: 12 seconds;
- repeated demo success: at least 19/20 trials.

### 29.4 Deployment

- static web assets: compressed;
- no large unused source archive;
- no runtime dependency on the private repository.

---

## 30. Deployment architecture

### 30.1 Web app

Deploy the static web app to one challenge-compatible host.

Possible static hosts include Vercel, Netlify, or Cloudflare Pages. Select one after a fast deployment test.

### 30.2 Physics service

Deploy the FastAPI service separately.

Required properties:

- HTTPS;
- CORS limited to the web-app origin;
- health endpoint;
- stable cold start;
- enough CPU or NVIDIA GPU resources;
- request timeout above simulation time;
- no authentication for the public fixed demo, unless simple and reliable.

### 30.3 Newton hosting decision gate

By 2026-08-31, choose one:

1. Hosted NVIDIA GPU service.
2. Hosted CPU Newton service if performance is sufficient.
3. Hosted deterministic fallback for public judges, with Newton shown in the recorded demo and clearly labelled.

Option 3 is weaker but safer than a broken public service.

### 30.4 Local development

- web: `127.0.0.1:8769`;
- physics: `127.0.0.1:8001`.

### 30.5 CORS

Development allows only local origins.

Production allows only the deployed web origin.

---

## 31. Demo plan

Target video length: approximately 2 minutes 35 seconds. Keep a safety margin below the rule limit.

### 0:00–0:10 — Hook

Show the workcell and title:

> One robot. Shared by a human and an AI agent.

### 0:10–0:25 — Human control

Drag the gripper in XY and Z. Open and close it.

Show live coordinates.

### 0:25–0:40 — WebMCP state

Ask the agent to inspect the scene and robot.

Show calls to:

- `get_scene_state`;
- `get_robot_state`.

### 0:40–1:00 — Plan

Ask:

> Put the red cube into the red bin. Avoid the yellow obstacle.

Show `plan_pick_and_place` and the blue path.

### 1:00–1:18 — Failure

Use or request an unsafe low path.

Show:

- red path;
- collision result;
- obstacle ID;
- no robot state change.

### 1:18–1:35 — Recovery

The agent raises the clearance and validates again.

Show green path and physics PASS.

### 1:35–2:05 — Execute

Show:

- approach;
- gripper close;
- cube lift;
- transfer;
- release;
- gravity settlement.

### 2:05–2:20 — Verify

Agent calls `get_scene_state` again.

Show the red cube inside the red bin.

### 2:20–2:35 — Close

Show:

- WebMCP tool count;
- Newton or active physics backend;
- public repository and live app names.

Do not spend time on code architecture.

---

## 32. Submission requirements

Before submission, confirm the current official rules.

Expected items:

- challenge registration;
- public repository;
- open-source licence;
- public live application;
- short public demo video;
- product description;
- technology description;
- WebMCP explanation;
- pre-existing-work disclosure;
- team details;
- required sponsor fields.

Treat the official challenge page and binding rules as the source of truth.

Submit before the internal deadline.

---

## 33. Detailed phased implementation plan

## P0 — Foundation and provenance

**Status:** In progress; initial foundation built.

### Objective

Create a public-safe standalone system with one accepted robot state, WebMCP tools, and a physics protocol.

### Delivered in this ZIP

- project structure;
- clean SCARA FK/IK;
- fail-closed controller;
- workcell scene;
- gripper visual;
- planner;
- nine WebMCP tools;
- physics API;
- deterministic backend;
- Newton boundary;
- tests;
- master plan.

### Open tasks

- run browser on target PC;
- compare visuals with private SCARA-SIM;
- update provenance;
- create public repository.

### Acceptance

- all current tests pass;
- browser boots;
- no private source is included.

### Stop condition

Do not start broad feature work until the target-PC browser run passes.

---

## P1 — Target-PC browser qualification

### Objective

Prove the foundation works on Windows and the target GPU.

### Tasks

- extract ZIP;
- run setup;
- start both services;
- verify Three.js loading;
- verify manual XY/Z drag;
- verify gripper;
- verify red and blue plans;
- verify fallback physics;
- capture fixed screenshots;
- record GPU, browser, frame rate, and console.

### Deliverables

- browser evidence;
- issue list;
- updated status document.

### Acceptance

- no boot error;
- no console error;
- manual controls work;
- plan → validate → execute works once.

### Stop condition

If the browser does not boot, fix it before Newton work.

---

## P2 — SCARA visual and control adaptation

### Objective

Bring the strongest public-safe SCARA-SIM graphics and manipulation details into the challenge app.

### Tasks

- compare V8 geometry;
- compare camera and lighting;
- compare metal materials;
- compare selection volume and pointer behaviour;
- improve gripper integration;
- add clear path and target markers;
- remove printer-specific UI;
- keep one source of kinematic truth.

### Acceptance

- hero robot looks polished;
- pointer control feels reliable;
- no kinematic duplicate exists;
- provenance table is complete.

### Stop condition

Do not copy RRF or uncertain third-party assets.

---

## P3 — WebMCP qualification

### Objective

Prove an agent can use the nine tools.

### Tasks

- use a supported Chrome/WebMCP setup;
- inspect registered tools;
- run each tool locally;
- test descriptions and schemas;
- test invalid input;
- test cancellation;
- test shared state after manual movement;
- shorten confusing output;
- record a tool transcript.

### Acceptance

- nine tools register;
- agent selects correct tools for three test prompts;
- no duplicate or stale state;
- outputs stay within budget.

### Stop condition

Remove or merge any tool that agents misuse repeatedly.

---

## P4 — Newton contact foundation

### Objective

Replace one fallback pick-and-place case with real Newton object physics.

### Tasks

- create a Python 3.10-3.12 environment;
- install Newton and Warp;
- record versions and device;
- create fixed table, bin, and obstacle;
- create one dynamic cube;
- create kinematic gripper proxy;
- drive gripper from request trajectory;
- tune collision and friction;
- detect grasp, lift, slip, release, and settlement;
- keep the existing API response schema;
- add tests.

### Acceptance

- safe grasp succeeds;
- offset grasp fails;
- low path collides;
- final cube pose is returned;
- repeated result is stable.

### Stop condition

After three failed tuning attempts, retain fallback and continue challenge work.

---

## P5 — Full pick-and-place integration

### Objective

Connect WebMCP, planner, physics, playback, and final-state verification.

### Tasks

- plan red task;
- validate;
- execute;
- update scene;
- verify final state;
- repeat for blue task;
- add one failure and recovery route;
- add clear operation states.

### Acceptance

- complete task works from an agent prompt;
- failed task does not move the accepted scene;
- corrected task succeeds;
- final scene state matches the physics result.

---

## P6 — Visual polish

### Objective

Make the workcell look submission-ready.

### Tasks

- tune camera;
- tune light sizes and intensities;
- tune metal roughness;
- improve bin and obstacle materials;
- add subtle target glow;
- improve path colours;
- improve gripper macro view;
- remove unnecessary UI;
- measure performance.

### Acceptance

- fixed hero view is clear;
- object colours are unambiguous;
- 60 FPS minimum on target PC;
- no visual effect blocks reliability.

---

## P7 — Deployment

### Objective

Provide one public URL that works without local installation.

### Tasks

- deploy static app;
- deploy physics service;
- configure CORS;
- configure HTTPS;
- test cold start;
- test physics timeout;
- add public health display;
- test from a clean machine/network.

### Acceptance

- public URL loads;
- tools register;
- physics works or fallback works;
- one complete task passes.

### Stop condition

If GPU hosting is unstable, use the reliable fallback for the public app and show Newton in the recorded demo with clear labels.

---

## P8 — Reliability and evidence

### Objective

Make the demo repeatable.

### Tasks

- run 20 complete trials;
- record success rate;
- run browser tests;
- run tool tests;
- run physics tests;
- scan source and assets;
- verify licence files;
- verify provenance;
- capture screenshots;
- freeze dependency versions.

### Acceptance

- at least 19/20 complete trials;
- all required tests pass;
- no secrets or private paths;
- no licence blocker.

---

## P9 — Video and submission

### Objective

Record and submit before the internal deadline.

### Tasks

- prepare deterministic scene;
- rehearse script;
- record clean video;
- add concise captions;
- upload public video;
- complete challenge form;
- verify all links in an incognito browser;
- submit;
- save submission evidence.

### Acceptance

- video is within limit;
- live app works;
- public repo works;
- form is submitted;
- confirmation is saved.

---

## 34. Day-by-day schedule

## 2026-08-26 — Foundation day

- Complete this master plan.
- Build standalone foundation.
- Add WebMCP tools.
- Add physics service and tests.
- Deliver ZIP.

**Exit:** Foundation ZIP exists and automated core tests pass.

## 2026-08-27 — Windows and visual qualification

- Run ZIP on target PC.
- Fix browser boot.
- Compare private SCARA-SIM V8 visuals and controls.
- Improve geometry and gripper.
- Capture first hero evidence.
- Create public repository after provenance review.

**Exit:** Browser and fallback task work locally.

## 2026-08-28 — WebMCP qualification

- Enable current WebMCP environment.
- Inspect nine tools.
- Run agent prompts.
- Fix schemas and outputs.
- Test shared manual/agent state.

**Exit:** Agent can inspect, plan, and move the robot.

## 2026-08-29 — Newton integration

- Install Newton.
- Implement kinematic gripper proxy scene.
- Validate one cube grasp.
- Add collision and slip tests.

**Exit:** One Newton test case passes, or the stop condition selects fallback.

## 2026-08-30 — Complete manipulation loop

- Integrate physics result with playback.
- Add release and final-state update.
- Add deliberate failure and recovery.
- Test red and blue tasks.

**Exit:** Complete agent task works locally.

## 2026-08-31 — Deployment and office-hours feedback

- Deploy web app.
- Deploy physics service.
- Test public WebMCP.
- Use challenge office hours to verify assumptions.
- Resolve deployment blockers.

**Exit:** Public URL works.

## 2026-09-01 — Polish and reliability

- Tune graphics.
- Improve UI.
- Run repeated trials.
- Fix tool-selection errors.
- Complete provenance and licence review.

**Exit:** Submission candidate passes 10 repeated trials.

## 2026-09-02 — Freeze and record

- Code freeze at 18:00 BST.
- Run full verification.
- Record final video.
- Upload video.
- Prepare submission text.

**Exit:** All submission assets are ready.

## 2026-09-03 — Submit

- Run incognito link test.
- Submit by 18:00 BST.
- Keep a three-hour margin before the 21:00 BST official deadline.
- Save confirmation.

---

## 35. Risk register

| Risk | Likelihood | Impact | Mitigation | Fallback |
|---|---:|---:|---|---|
| Browser foundation does not boot | Medium | Critical | Run on target PC first; visible boot error; pin Three.js | Use local vendored Three.js from verified source |
| WebMCP API changes | Medium | High | Use current `document.modelContext`; isolate registration module | Update one module; keep manual app usable |
| ChatGPT does not select tools well | Medium | High | Small tool set; clear descriptions; test prompts | Remove confusing tools and use fewer tools |
| Newton install fails | Medium | High | Dedicated Python version; follow current docs; bounded task | Use tested deterministic backend |
| Newton grasp is unstable | High | High | Simple cube and box fingers; measured tuning; 20 trials | Record fallback demo or simplify grasp |
| GPU hosting is unavailable | Medium | High | Test provider early; small scene; CPU test | Public fallback service; local Newton in video |
| Physics latency is high | Medium | Medium | Simulate complete path once; no 60 Hz network stream | Lower samples; fallback validator |
| Robot and scene states diverge | Medium | Critical | One controller; revisions; execution preconditions | Reset workcell and refuse stale plan |
| Manual move makes plan stale | High | Medium | Manual move clears plan and result | Require replanning |
| Collision model misses robot links | Medium | Medium | Newton link proxies later; clear foundation limits | End-effector clearance only, labelled |
| Public repo leaks private source | Low | Critical | Clean repository; provenance review; secret scan | Delay public import of uncertain files |
| RepRapFirmware licensing problem | Low | Critical | Do not include RRF source | Use clean analytic SCARA core |
| Asset licence is unclear | Medium | High | Procedural geometry and RoomEnvironment | Remove uncertain asset |
| WebGPU work distracts team | High | Medium | WebGL2 is locked for challenge | Post-challenge WebGPU phase |
| Generic robot abstraction delays MVP | High | High | SCARA-first; small interface | Delete unused abstraction |
| Visual polish reduces stability | Medium | High | Add effects only after full loop passes | Disable optional effects |
| Public physics CORS fails | Medium | High | One allowed origin; health test | Same-origin proxy or fallback |
| Demo fails during recording | Medium | Critical | Deterministic reset; rehearse; local backup | Record in segments and edit cleanly |
| Deadline misunderstanding | Low | Critical | Treat 13:00 PT as binding; internal 18:00 BST | Submit earlier |
| Challenge provenance is unclear | Medium | High | Maintain `PREEXISTING_WORK.md` from first commit | Remove disputed pre-existing feature claim |

---

## 36. Must, should, and stretch scope

### Must have

- SCARA browser workcell;
- direct XY and Z drag;
- two-finger gripper;
- structured scene state;
- exact robot state;
- nine or fewer effective WebMCP tools;
- plan preview;
- fail-closed reachability;
- physics API;
- collision rejection;
- grasp result;
- path execution;
- final-state verification;
- public repository;
- public app;
- demo video;
- provenance.

### Should have

- Newton active;
- two coloured tasks;
- failure and recovery;
- premium lighting;
- hosted physics;
- repeated reliability evidence;
- fixed camera shots.

### Stretch

- complete SCARA articulation in Newton;
- robot link collision;
- object dragging;
- ghost robot poses;
- WebGPU renderer;
- Panda or UR10 preset;
- arbitrary URDF;
- WebSocket streaming.

---

## 37. Explicit non-goals

The challenge build will not include:

- physical robot control;
- Duet connection;
- ROS 2 control;
- G-code printing;
- slicer functions;
- real-machine calibration;
- real-machine safety certification;
- full RRF parity;
- Electron desktop packaging;
- macOS packaging;
- mobile robot support;
- reinforcement learning;
- path tracing;
- large robot catalogue;
- full CAD import;
- multi-user collaboration.

---

## 38. Post-challenge roadmap

### R1 — Complete Newton SCARA articulation

- articulated links;
- joint drives;
- link collisions;
- torque and force data;
- contact-rich manipulation.

### R2 — Generic robot adapters

- Panda;
- UR10;
- generic URDF;
- USD import.

### R3 — Workcell systems

- conveyors;
- cameras;
- sensors;
- force/torque sensors;
- suction grippers;
- tool changers;
- multiple robots.

### R4 — Planning and optimisation

- collision-aware planning;
- motion optimisation;
- time-optimal paths;
- task sequencing;
- multi-object sorting.

### R5 — Robot learning

- batch Newton worlds;
- domain randomisation;
- synthetic data;
- reinforcement learning;
- imitation learning;
- policy evaluation.

### R6 — Digital twins

- live telemetry;
- ROS 2 bridge;
- Duet provider for SCARA printing;
- simulation-to-real comparison;
- calibration;
- replay.

### R7 — Platform

- account projects;
- cloud simulation jobs;
- shareable scenes;
- collaborative review;
- plugin robot library;
- commercial hosting.

---

## 39. Definition of Done

ROBO-SIM-MCP challenge v1 is done when:

1. The public URL loads in a clean supported browser.
2. The workcell looks polished and understandable.
3. A human can move the SCARA in XY and Z.
4. A human can open and close the gripper.
5. The agent can discover the WebMCP tools.
6. The agent can inspect the scene and robot.
7. An unreachable request fails closed.
8. A proposed path is blue.
9. A colliding path is red and is not executed.
10. A valid physics result turns the path green.
11. The robot grasps and moves a cube.
12. The cube is released into the correct bin.
13. Final scene state confirms success.
14. Reset restores the deterministic start.
15. The complete demo passes at least 19 of 20 trials.
16. The source is public and licensed.
17. Pre-existing work is disclosed.
18. No private or prohibited source is present.
19. The video and submission form are complete.
20. Submission confirmation is saved before the internal deadline.

---

## 40. Exact first implementation task on the target PC

### Task: qualify the supplied foundation and create the first evidence checkpoint

1. Extract the ZIP to a new folder.
2. Run `SETUP_WINDOWS.bat`.
3. Run `START_WINDOWS.bat`.
4. Open `http://127.0.0.1:8769`.
5. Confirm the SCARA, cubes, bins, obstacle, and UI are visible.
6. Drag the gripper in XY.
7. Hold Shift and drag vertically for Z.
8. Plan the red cube task.
9. Validate physics.
10. Execute the task.
11. Reset the workcell.
12. Open browser console and record errors or warnings.
13. Record GPU, browser version, frame rate, and screenshots.
14. Run `python scripts/verify.py`.
15. Update `evidence/FOUNDATION_STATUS.md` with observed results.
16. Stop. Do not start Newton integration until this checkpoint passes.

### Acceptance

- setup exits successfully;
- 12 JavaScript tests pass;
- 5 Python tests pass;
- browser boots;
- manual XY/Z controls work;
- plan, validate, execute, and reset work;
- no fatal console error;
- evidence is saved.

### Final verdict

**GO WITH CONDITIONS.**

The foundation is strong enough to continue. The next critical proof is a real target-PC browser run. Newton comes after that proof.
