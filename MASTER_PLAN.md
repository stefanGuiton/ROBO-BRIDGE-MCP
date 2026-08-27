# LOGO ROBO Master Plan v2.0

**Repository:** `stefanGuiton/LOGO-ROBO-MCP`
**Challenge product:** **LOGO ROBO**  
**Date:** 2026-08-27  
**Status:** Authoritative challenge plan. This document supersedes ROBO-SIM-MCP Master Plan v1.0.  
**Purpose:** Build a polished WebMCP game where a human and an AI agent share a browser robotics workspace and build images from generic 2×4 construction bricks.  
**Official submission deadline:** 2026-09-03 at 13:00 PDT / 21:00 BST.  
**Internal submission target:** 2026-09-03 at 18:00 BST.  
**Internal code freeze:** 2026-09-02 at 18:00 BST.

---

## 1. Executive summary

LOGO ROBO is a browser game and robotics demonstration for the 2026 OpenAI WebMCP Challenge.

A user selects or uploads an image. The app compiles the image into a physical brick blueprint. The user and an AI agent then build the image in the same simulated workspace.

The AI does not receive joint commands and does not receive a high-level `place_brick()` tool. It controls a six-axis UR10-class industrial robot through a very small Cartesian interface:

```text
move_tool(x, y, z, speed)
latch()
unlatch()
```

The browser owns robot inverse kinematics, joint limits, motion interpolation, collision checks, speed limits, and accepted state.

The AI also does not need OpenCV. The simulator already knows the 3D world. A simulator-native camera system projects visible bricks into camera space and returns bounded structured observations with 2D boxes, colours, IDs, and XYZ positions. The same observation drives the visible green detection overlays that judges see.

The core agent loop is:

```text
observe -> choose -> move -> latch -> verify -> move -> unlatch -> verify -> repeat
```

The two main modes are:

1. **Co-Build** — the human and AI build one image together.
2. **Race** — the human and AI build separate copies and compete.

Co-Build is the main WebMCP story because it directly demonstrates a human, an agent, and a web app sharing one live state. Race is the high-energy game and video hook.

The challenge build uses generic unbranded construction bricks. It must not depend on LEGO branding or other third-party marks.

---

## 2. Challenge strategy

### 2.1 Official challenge fit

The official challenge asks for a WebMCP-powered web app that explores an open web where humans and agents can interact, collaborate, and create together.

LOGO ROBO maps directly to that goal:

- the human acts through normal browser interaction;
- the agent acts through WebMCP;
- both act on the same live 3D world;
- both create the same physical image;
- the page exposes structured client-side abilities that are difficult to use reliably through clicks and pixels alone.

### 2.2 Judging criteria

The official Stage Two criteria are equally weighted:

1. WebMCP Leverage.
2. Execution.
3. Potential Impact.
4. Creativity & Ambition.

The project must be designed so each criterion is obvious in the first minute of the video and the first screen of the repository.

### 2.3 Judging may use AI

The official rules permit automated AI-driven analysis.

Therefore the repository and submission must be easy for both a human judge and an automated reviewer to understand.

The project must not rely on a judge inferring why it is a strong WebMCP use case.

### 2.4 Stage One pass condition

The project must clearly be a working WebMCP project, not a generic robot demo with WebMCP added at the end.

The first screen of the README and the first 30 seconds of the video must show:

- WebMCP;
- agent control;
- shared human/agent state;
- visible agent observation;
- real browser interaction.

### 2.5 Product story

The challenge story is:

> Give a human and an AI agent the same creative task. The human uses direct manipulation. The agent uses WebMCP to perceive the same workspace and control a robot through primitive Cartesian actions. They can work together or race. The world changes after every action, so the agent must observe, act, and verify in a loop.

### 2.6 Technology story

The game is the demonstration.

The underlying technology is:

> A browser-native human-agent robotics interface where an AI agent can perceive and manipulate a live 3D workspace through structured WebMCP tools while sharing state with a human.

This makes the project relevant to:

- robot programming;
- digital twins;
- manufacturing;
- training;
- warehouse manipulation;
- remote robotics;
- human-robot collaboration.

---

## 3. Product definition

### 3.1 Product name

**LOGO ROBO**

The local project directory remains `ROBO-SIM-MCP`; the private repository is now named `LOGO-ROBO-MCP`.

### 3.2 Public terminology

Use:

- construction brick;
- 2×4 brick;
- studded brick;
- six-axis industrial robot;
- UR10-class or UR10-compatible kinematics only when technically useful.

Do not place third-party logos on the robot, bricks, UI, video, or project artwork unless permission is confirmed.

### 3.3 Product promise

Turn an image into a brick build, then let a human and an AI create it together in a live robot workspace.

### 3.4 Primary modes

#### Co-Build

One board. One target. Human and agent work on it together.

#### Race

Two boards. Same target. Human and agent compete.

### 3.5 Secondary modes

- Agent Solo — useful for reliability tests and demonstrations.
- Human Solo — useful as a baseline and tutorial.

These are not required for the first submission candidate.

---

## 4. Core design principles

### 4.1 WebMCP is primitive, not magical

Do not expose:

```text
place_brick(targetId)
build_logo()
pick_brick(objectId)
execute_plan()
```

The agent must perform the manipulation loop itself.

### 4.2 The agent controls Cartesian position only

The challenge interface exposes X, Y, Z and speed.

The agent does not send six joint angles.

The robot controller converts accepted Cartesian motion into joint motion.

### 4.3 Fixed tool orientation for challenge v1

The challenge tool points down.

The agent does not control roll, pitch, or yaw.

All must-have challenge bricks are supplied in one canonical orientation.

This keeps the WebMCP action space small and reliable.

### 4.4 One accepted world

The renderer, human controls, WebMCP tools, game rules, scoring, and perception all read the same accepted world state.

No subsystem maintains a private copy of the robot or bricks.

### 4.5 Observe after state changes

The agent should not assume the world stayed unchanged.

After a latch, release, human action, collision, or failed motion, the agent should observe again.

### 4.6 Visible action, not hidden reasoning

The UI can show:

- OBSERVE;
- TARGET;
- MOVE;
- LATCH;
- VERIFY;
- PLACE;
- RECOVER.

Do not present hidden chain-of-thought.

Show tool calls, selected objects, coordinates, paths, and results.

### 4.7 Reliability before simulation purity

The challenge must be repeatable.

Use deterministic capture and board snapping where needed.

High-fidelity contact physics is valuable only if it does not reduce reliability.

### 4.8 Challenge first

The must-have submission is one polished creative experience.

A generic robot simulator remains a post-challenge direction.

---

## 5. Core experience

### 5.1 Start screen

The user sees:

- LOGO ROBO title;
- Co-Build;
- Race;
- a small built-in challenge gallery;
- Upload Image;
- brick budget;
- colour palette;
- difficulty for Race.

### 5.2 Compile screen

The app shows:

- source image;
- brick preview;
- logical grid;
- estimated brick count;
- colour inventory;
- physical board size;
- Compile / Start.

### 5.3 Build screen

The user sees:

- hero 3D workcell;
- six-axis robot;
- mixed brick tray;
- build board;
- target preview;
- progress;
- timer;
- agent camera panel;
- current agent action;
- WebMCP connected state.

### 5.4 Completion screen

Show:

- final image;
- completion time;
- accuracy;
- human bricks placed;
- agent bricks placed;
- retries;
- robot travel distance;
- result card suitable for a screenshot.

Race adds:

- winner;
- time difference;
- difficulty / robot speed cap.

---

## 6. System architecture

```text
                         INPUT IMAGE
                              |
                              v
                    +-------------------+
                    |   LogoCompiler    |
                    +-------------------+
                              |
                              v
                    immutable Blueprint
                              |
               +--------------+--------------+
               |                             |
               v                             v
        BrickInventory                  BuildBoard
               |                             |
               +--------------+--------------+
                              |
                              v
                     Authoritative World
       +----------------------+----------------------+
       |                      |                      |
       v                      v                      v
 Human direct control   RobotController       CameraPerception
                              |                      |
                              v                      v
                         UR10 IK/motion         observations
                              ^                      |
                              |                      v
                              +------ WebMCP <--- AI agent
                              |
                              v
                       latch / release
                              |
                              v
                        Build scoring
```

### 6.1 Browser owns

- image compilation;
- blueprint;
- brick inventory;
- board state;
- game state;
- robot accepted Cartesian state;
- derived joint state;
- motion;
- cameras;
- perception;
- rendering;
- human input;
- WebMCP registration;
- scoring;
- deterministic latch and snap rules.

### 6.2 Optional physics service owns

Only optional high-fidelity validation or dynamic physics that cannot run reliably in the browser.

The public challenge path must not fail if this service is unavailable.

### 6.3 No server requirement for the core game

Image processing must happen in the browser.

Core WebMCP tools must call client-side application logic.

A static hosted app should remain a valid deployment target.

---

## 7. Authoritative state model

### 7.1 `BlueprintState`

Immutable during a round.

Contains:

- blueprint ID;
- source dimensions;
- logical grid dimensions;
- palette;
- target slots;
- brick counts;
- board transform;
- compile settings.

### 7.2 `WorldState`

Contains:

- world revision;
- all physical brick poses;
- robot state;
- latch state;
- placed state;
- claims;
- active mode;
- timer.

### 7.3 `RobotState`

Contains:

- accepted TCP XYZ;
- fixed TCP orientation;
- derived joint angles;
- requested speed;
- applied speed;
- speed limit;
- moving flag;
- held brick ID or null;
- robot revision.

### 7.4 `BrickState`

Contains:

- ID;
- colour;
- type;
- position;
- yaw;
- source tray;
- held state;
- placed target ID or null;
- dynamic / snapped state.

### 7.5 `TargetState`

Contains:

- target ID;
- grid cells;
- colour;
- world pose;
- orientation;
- placed brick ID or null;
- claim owner;
- correctness.

### 7.6 Revision rule

Every physical state change increments `worldRevision`.

Every robot accepted-state change increments `robotRevision`.

Observation responses include the revision they describe.

---

## 8. Brick standard

### 8.1 Challenge brick

Use one generic unbranded **2×4 studded construction brick**.

No text or third-party logo on studs.

### 8.2 Logical pixel model

One physical 2×4 brick has a 2:1 footprint.

For image compilation, model it as two adjacent square logical cells:

```text
+---------+---------+
| cell A  | cell B  |
+---------+---------+
```

A useful mental model is that each logical square represents a 2×2-stud area.

One physical brick always covers two adjacent logical cells and has one colour.

### 8.3 Challenge v1 orientation

For reliability, all must-have bricks are horizontal.

The logical grid width must be even.

Pairs are:

```text
(0,1), (2,3), (4,5) ...
```

This means no wrist yaw control is required.

### 8.4 Future orientation mode

Stretch work can allow horizontal and vertical bricks.

That becomes a true weighted domino-tiling problem.

Do not make this a must-have unless fixed-orientation compilation already works.

### 8.5 Brick budget

The compiler must support a maximum brick count.

Suggested presets:

- Quick: 24-40 bricks.
- Standard: 40-80 bricks.
- Detailed: 80-128 bricks.
- Experimental: above 128.

The demo target should usually need about 30-50 bricks so it can complete quickly.

---

## 9. Logo compiler architecture

### 9.1 Goal

Convert a normal image into an exact physical blueprint that the game, user, robot, scoring, and perception can all use.

### 9.2 Input

Challenge v1 accepts:

- PNG;
- JPEG;
- WebP.

Preferred challenge images have:

- simple shapes;
- clear colour regions;
- transparent backgrounds.

All processing is local in the browser.

### 9.3 Pipeline

```text
decode image
    |
crop / fit
    |
alpha/background handling
    |
choose logical grid resolution
    |
sample brick-sized regions
    |
map colour to allowed palette
    |
remove optional background
    |
enforce brick budget
    |
generate target slots
    |
generate inventory
    |
render preview
    |
emit Blueprint
```

### 9.4 Image fit

Support:

- contain;
- cover;
- centre.

Default: contain.

Preserve image aspect ratio.

### 9.5 Background handling

Challenge v1:

- preserve alpha when provided;
- transparent regions become empty board;
- for non-alpha images, keep the full image unless the user selects one background colour to ignore.

Do not add complex automatic background removal before the core loop works.

### 9.6 Resolution selection

The compiler chooses the highest grid resolution that:

- fits the physical board;
- uses an even grid width;
- stays inside the selected brick budget;
- preserves the source aspect ratio.

The compiler can search candidate grid sizes and choose the lowest visual error under the budget.

### 9.7 Sampling

Each physical brick target corresponds to one 2-cell horizontal region.

Sample the source pixels covered by that region.

Calculate one representative colour for the whole physical brick.

### 9.8 Colour error

Use perceptual colour distance.

Preferred implementation: OKLab.

Do not use raw Euclidean RGB distance as the only colour metric.

### 9.9 Palette

Challenge default:

- black;
- white;
- red;
- blue;
- yellow;
- green.

The palette is configurable.

Each palette entry has:

- canonical ID;
- display name;
- sRGB;
- OKLab;
- material parameters.

### 9.10 Optional dithering

Dithering is a stretch feature.

First optimize clean solid-colour logos.

### 9.11 Compiler objective

For candidate blueprint `B`:

```text
cost(B) =
    perceptualImageError
  + brickCountPenalty
  + emptyMaskPenalty
  + invalidGeometryPenalty
```

The challenge compiler does not need an ML model.

### 9.12 Compiler determinism

Same image + same settings + same compiler version must produce the same blueprint.

### 9.13 Blueprint preview

Before starting the round show:

- compiled brick image;
- source image;
- brick count;
- per-colour count.

This is important evidence that the build was generated live.

---

## 10. Blueprint schema

A target record should be similar to:

```json
{
  "targetId": "t_027",
  "colour": "white",
  "gridRow": 6,
  "gridCol": 4,
  "cells": [[6, 4], [6, 5]],
  "worldXmm": 128,
  "worldYmm": 96,
  "worldZmm": 8,
  "yawDeg": 0,
  "status": "unfilled",
  "claim": null
}
```

### 10.1 Blueprint invariants

- no target overlap;
- every target covers exactly two logical cells;
- all targets are inside the board;
- each target uses one allowed colour;
- total target count is at or below the brick budget;
- all challenge-v1 target yaw values are zero;
- generated inventory contains enough bricks.

### 10.2 Reference order

The compiler may generate a deterministic reference placement order for:

- tests;
- benchmark timing;
- demo fallback;
- scoring analysis.

The AI must not be forced to follow it.

The agent should choose its own order.

---

## 11. Brick inventory

### 11.1 Inventory generation

Generate at least the exact number of bricks required by the blueprint.

### 11.2 Challenge tray

Use a shallow mixed tray next to the robot.

Bricks can have:

- randomized XY position;
- small position jitter;
- mixed colours;
- canonical yaw;
- non-overlapping spawn positions.

This looks visually natural while keeping every brick pickable.

### 11.3 Decoy bricks

Race or advanced mode can add 10-20% decoy bricks.

Do not enable decoys in the first reliability build.

### 11.4 Inventory reset

A round seed controls starting positions.

Reset with the same seed must reproduce the same tray.

### 11.5 Inventory correctness

The game must never create a target for which no compatible brick is available unless the mode intentionally tests recovery.

---

## 12. Build board

### 12.1 Board role

The board is the physical target canvas.

### 12.2 Target mapping

Each blueprint target has an exact board-space pose.

### 12.3 Ghost guide

The human can see a faint target guide.

Options:

- subtle cell outlines;
- faint coloured ghost bricks;
- full target image at low opacity.

Default should be readable but not visually dominant.

### 12.4 Snap rule

When a released brick is close enough to a valid target:

- position within tolerance;
- correct canonical orientation;
- compatible colour if strict mode is enabled;

the board can snap it to the exact target pose.

This stands in for stud engagement and makes the game reliable.

### 12.5 Incorrect placement

If a brick is released outside snap tolerance:

- it stays unsnapped;
- scoring does not count it;
- the agent can observe and recover it.

### 12.6 Occupancy

Only one brick can own one target.

Claims do not equal occupancy.

---

## 13. Robot architecture

### 13.1 Challenge robot

Use a six-axis UR10-class arm.

Internally use a `UR10Adapter`.

Public visuals must be unbranded unless asset and trademark rights are confirmed.

### 13.2 Agent control contract

The agent does not control joints.

It controls the tool centre point.

Core command:

```text
move_tool(xMm, yMm, zMm, speedMmS)
```

### 13.3 Tool orientation

Fixed downward quaternion.

This is a challenge invariant.

### 13.4 Internal controller

`CartesianRobotController` owns:

- accepted TCP pose;
- IK;
- joint limits;
- branch continuity;
- interpolation;
- speed cap;
- collision checks;
- cancellation;
- accepted joint state.

### 13.5 IK

For each sampled TCP point:

1. solve IK;
2. remove invalid joint solutions;
3. select the solution nearest the prior accepted joints;
4. reject discontinuous or unsafe branches;
5. update only after validation.

### 13.6 Agent never needs joint knowledge

Joint angles can be shown in a developer panel, but WebMCP must not expose a `set_joints` or `move_joint` action.

### 13.7 Workspace

Use a deliberately bounded workcell.

The tray and board must sit inside a well-conditioned region of the robot workspace.

Avoid near-singular and max-reach areas.

---

## 14. Cartesian motion

### 14.1 Move semantics

`move_tool` means:

> Move the accepted tool position from its current XYZ to the requested XYZ on a straight Cartesian segment at or below the requested speed.

### 14.2 Speed

The round defines `maxTcpSpeedMmS`.

The agent requests a speed at or below this cap.

Invalid speed is rejected or clamped with the applied value reported. Choose one behaviour and test it consistently.

Preferred: reject values above the cap so the agent clearly learns the rule.

### 14.3 Difficulty

Race difficulty primarily changes the agent speed cap.

Do not silently reduce perception quality.

Example values must be tuned by play testing.

Suggested starting candidates:

- Easy: 250 mm/s.
- Normal: 500 mm/s.
- Hard: 900 mm/s.

These are simulation game values, not real-robot safety guidance.

### 14.4 Motion profile

Renderer motion should use:

- bounded acceleration;
- smooth ease or trapezoidal profile;
- no teleporting;
- exact final accepted pose.

### 14.5 Collision

Validate the sampled path before or during execution.

Reject or stop on:

- table collision;
- tray wall collision;
- board collision outside intended approach;
- placed-brick collision;
- robot self-collision if implemented and stable.

### 14.6 Fail-closed rule

Invalid motion cannot change the accepted final pose beyond the last safe point.

Return an exact reason.

### 14.7 Cancellation

WebMCP execution must support cancellation through the tool execution signal where supported.

Stop at the last accepted pose.

---

## 15. Latch system

### 15.1 End effector

Use a compact top-down latch or vacuum-style pickup head.

### 15.2 `latch()`

Latch succeeds only when:

- no brick is already held;
- a graspable brick is inside capture XY tolerance;
- tool height is inside capture Z tolerance;
- the brick is not snapped to the board unless removal is allowed.

### 15.3 Latch result

Return:

- success;
- brick ID;
- colour;
- capture offset;
- world revision;
- failure reason when needed.

### 15.4 Held brick

Challenge must-have:

- brick follows the tool with a stable attachment;
- collisions still include the held brick.

Should-have:

- small spring/damper wobble for physical character.

### 15.5 `unlatch()`

Release the brick.

Then:

1. test target snap;
2. snap if valid;
3. otherwise leave it as a free object;
4. update world revision;
5. return placement result.

### 15.6 Verification

The agent must call an observation or build-state tool after release rather than assume success.

---

## 16. Simulator-native camera perception

### 16.1 Decision

Do not use OpenCV for the challenge.

The simulator already has exact object geometry and camera transforms.

### 16.2 Purpose

Give the agent a structured equivalent of looking at the tray and build board.

### 16.3 Cameras

Must-have:

- `tray_camera`;
- `canvas_camera`.

Stretch:

- wrist camera;
- cinematic agent camera.

### 16.4 Observation generation

For each candidate physical object:

1. get its world-space oriented bounds;
2. project bound corners through the chosen camera;
3. calculate a 2D pixel bounding box;
4. reject objects outside the frustum;
5. run a simple centre ray or visibility test when required;
6. return only visible detections.

### 16.5 Detection record

Example:

```json
{
  "objectId": "brick_042",
  "type": "brick",
  "colour": "white",
  "bboxPx": [412, 263, 486, 301],
  "centrePx": [449, 282],
  "worldXmm": 482,
  "worldYmm": -173,
  "worldZmm": 41,
  "yawDeg": 0,
  "visible": true
}
```

### 16.6 Observation filters

`observe_camera` can accept optional bounded filters such as:

- colour;
- type;
- maximum results.

This keeps tool output small.

### 16.7 No x-ray perception

Do not return hidden objects as visible.

If visibility testing is not complete, label the limitation.

### 16.8 Green-box judge overlay

The exact observation model drives the UI overlay.

When the agent issues a movement toward an observed brick, the UI can match the requested XYZ to the nearest visible detection and mark it as the active target.

Show:

- green box;
- brick colour;
- object ID;
- XYZ.

When moving toward a board target, highlight the target slot.

This visual layer is derived from tool activity. It is not a separate high-level robot command.

### 16.9 Observation truth

The structured observation and the visible overlay must come from the same snapshot and revision.

---

## 17. Agent manipulation loop

The expected agent loop is:

```text
1. get build state
2. choose one unfilled target
3. claim target if Co-Build
4. observe tray
5. select a compatible visible brick
6. move above brick
7. move down
8. latch
9. verify held brick
10. lift
11. observe canvas
12. move above target
13. move down
14. unlatch
15. observe canvas / build state
16. verify target
17. repeat
```

### 17.1 Recovery cases

The agent must be able to recover from:

- latch miss;
- human takes the selected brick;
- target becomes occupied;
- movement collision;
- brick released outside snap area;
- wrong brick held;
- stale claim;
- state revision changes.

### 17.2 Strong demo recovery

Best Co-Build demonstration:

1. agent observes and starts for one white brick;
2. human moves or takes that brick;
3. agent reaches the old location and latch fails or re-observes first;
4. agent observes the tray again;
5. agent chooses another compatible brick;
6. build continues.

This visibly proves the loop is live.

---

## 18. Human interaction

### 18.1 Human does not need to control the robot

The human manipulates bricks directly with mouse or pointer controls.

This gives each participant a native interface:

- human: direct visual manipulation;
- agent: structured WebMCP robotics.

### 18.2 Brick grab

Click / press a brick to grab it.

### 18.3 Move

Drag it in the work plane.

Use a simple depth or lift gesture for vertical movement when needed.

### 18.4 Place

Release near a valid target to snap.

### 18.5 Physics feel

Should-have:

- small inertial lag;
- wobble;
- collisions;
- ability to drop a brick.

Stretch:

- throw bricks.

### 18.6 Camera

Support:

- orbit;
- pan;
- zoom;
- top-down build camera;
- reset / fit.

Human control must remain usable if WebMCP is unavailable.

---

## 19. Co-Build mode

### 19.1 Role

This is the primary challenge mode.

### 19.2 Shared board

Human and agent modify one target board.

### 19.3 Target claims

A target can be:

- unclaimed;
- human;
- agent.

A claim is coordination metadata, not a lock.

### 19.4 Agent claim tool

The agent can call `claim_target(targetId)`.

The target then gets an agent visual marker.

### 19.5 Human claims

The human can click or drag-select targets or regions to claim them.

### 19.6 Suggested collaboration patterns

The human can tell the agent through ChatGPT or Codex:

- “You do the left side.”
- “You do all white bricks.”
- “Take the top half.”
- “Finish the remaining targets.”
- “Fix anything I missed.”

### 19.7 Conflict handling

If both act on the same target:

- physical occupancy wins;
- claims update;
- the other participant must re-plan.

### 19.8 Contribution metrics

Track:

- human placements;
- agent placements;
- shared completion time;
- corrections;
- number of replans.

### 19.9 Success

The round ends when all required targets are correct.

---

## 20. Race mode

### 20.1 Role

Race is the high-energy game and video/share hook.

### 20.2 Layout

Use two build boards:

- HUMAN;
- AI.

Each has the same compiled blueprint.

### 20.3 Inventory

Each competitor gets enough matching bricks.

The agent uses the robot tray.

The human gets an equivalent direct-manipulation supply.

### 20.4 Timer

Start both at the same event.

### 20.5 Win rule

Correctness comes first.

A participant must reach the required accuracy threshold before time determines the winner.

Preferred challenge rule:

- 100% target occupancy and colour correctness;
- lowest valid completion time wins.

### 20.6 Difficulty

Adjust only explicit game parameters, primarily robot TCP speed cap.

Show the active cap in the UI.

### 20.7 Race fairness

Do not claim that direct human manipulation and robot manipulation are physically equivalent.

Treat Race as a game mode, not a scientific benchmark.

---

## 21. WebMCP architecture

### 21.1 API

Use the current imperative API:

```js
document.modelContext.registerTool(...)
```

### 21.2 Core rule

WebMCP tools call the same browser application methods used by the rest of the app.

Do not build a second hidden robot implementation for WebMCP.

### 21.3 Tool count

Use a small tool set.

Target: six core tools, with one optional collaboration tool.

### 21.4 Must-have tools

1. `get_build_state`
2. `observe_camera`
3. `move_tool`
4. `latch`
5. `unlatch`
6. `claim_target` in Co-Build

### 21.5 No joint tool

There must be no public WebMCP tool that sends robot joint commands.

### 21.6 No high-level placement tool

There must be no public WebMCP tool that places a brick for the agent.

### 21.7 Progressive enhancement

If WebMCP is not available:

- show a clear status;
- keep the game manually usable;
- do not crash.

### 21.8 Tool lifecycle

Register the core tools when the game runtime is ready.

If mode-specific registration is proven reliable, register `claim_target` only in Co-Build.

Otherwise keep it registered and return `wrong_mode` outside Co-Build.

Reliability wins over clever dynamic registration.

---

## 22. Exact WebMCP tool contracts

### 22.1 `get_build_state`

**Purpose:** Read the target, progress, claims, robot summary, and remaining work.

Suggested input:

```json
{
  "status": "unfilled",
  "colour": "white",
  "limit": 20
}
```

All fields optional and bounded.

Output should include:

- mode;
- world revision;
- blueprint ID;
- progress;
- requested target subset;
- held brick;
- robot speed limit.

Read-only.

### 22.2 `observe_camera`

**Purpose:** Get current simulator-native visual observations.

Input:

```json
{
  "cameraId": "tray_camera",
  "colour": "white",
  "limit": 20
}
```

Output:

- camera ID;
- snapshot revision;
- image width / height;
- visible detections;
- XYZ for each detection;
- bounded result count.

Read-only for world state.

The UI may update the camera overlay from this observation.

### 22.3 `move_tool`

**Purpose:** Move the robot TCP.

Input:

```json
{
  "xMm": 480,
  "yMm": -170,
  "zMm": 120,
  "speedMmS": 500
}
```

Output:

- accepted;
- requested target;
- final TCP;
- applied speed;
- duration;
- world / robot revision;
- rejection reason.

Mutating.

### 22.4 `latch`

**Purpose:** Attach one compatible brick at the current tool pose.

Input: empty object.

Output:

- success;
- held brick;
- capture offset;
- revision;
- failure reason.

Mutating.

### 22.5 `unlatch`

**Purpose:** Release the held brick.

Input: empty object.

Output:

- success;
- released brick;
- final pose;
- snapped target ID or null;
- placement correctness;
- revision.

Mutating.

### 22.6 `claim_target`

**Purpose:** Coordinate work in Co-Build.

Input:

```json
{
  "targetId": "t_027"
}
```

Output:

- accepted;
- target ID;
- current claim owner;
- target state;
- revision.

Mutating game coordination state, not robot state.

### 22.7 Optional tool

Only add `release_claim` if automatic claim release is not enough.

Do not add convenience tools until the core set passes real agent tests.

---

## 23. Tool design quality

### 23.1 Descriptions

Tool descriptions must state:

- what the tool changes;
- what it does not change;
- important limits;
- when to observe again.

### 23.2 Schemas

Use:

- finite numeric ranges;
- enums;
- maximum lengths;
- maximum result counts;
- clear required fields.

### 23.3 Outputs

Keep outputs structured and compact.

Avoid prose dumps.

### 23.4 Errors

Use stable machine-readable reason codes, for example:

- `outside_workspace`;
- `speed_limit`;
- `ik_failed`;
- `collision`;
- `no_brick_in_capture`;
- `already_holding`;
- `not_holding`;
- `target_occupied`;
- `wrong_mode`;
- `stale_state`;
- `cancelled`.

### 23.5 Agent test prompts

Test at least:

- “Build the remaining white targets.”
- “Work with me. I will do the left side; you do the right.”
- “Race me.”
- “Recover if the brick you selected moves.”
- “Finish the logo without touching my claimed targets.”

---

## 24. Intent visualizer

### 24.1 Goal

Make agent actions obvious to a judge.

### 24.2 Tray overlay

Show:

- camera view;
- detected boxes;
- selected / approached brick in green;
- colour;
- object ID;
- XYZ.

### 24.3 Canvas overlay

Show:

- unfilled target;
- agent claim;
- target XYZ;
- successful placement.

### 24.4 Motion path

Show a subtle line from current TCP to requested XYZ.

States:

- blue: requested;
- green: accepted;
- red: rejected.

### 24.5 Activity strip

Show recent tool events, for example:

```text
OBSERVE tray_camera
TARGET brick_042 WHITE
MOVE 482,-173,120
LATCH brick_042
MOVE canvas
UNLATCH -> t_027 PASS
VERIFY 63%
```

This is action history, not model chain-of-thought.

---

## 25. Physics and interaction

### 25.1 Challenge authority

Core placement correctness is owned by deterministic browser rules.

Do not make the public demo depend on a remote physics server.

### 25.2 Must-have physical behaviour

- held brick moves with tool;
- held brick participates in collision checks;
- release outside target can fail;
- board snap occurs only inside tolerance;
- placed bricks become stable board objects.

### 25.3 Should-have physical behaviour

- spring/damper held-brick wobble;
- free brick gravity;
- brick collisions;
- tray-wall collision;
- dropped bricks settle.

### 25.4 Optional browser physics

If a real-time browser physics engine is added, it must not become a second source of truth.

The world adapter must own the final accepted pose.

### 25.5 Existing Newton work

The existing Newton service and protocol are reusable research assets from v1.

For LOGO ROBO challenge v2:

- keep them isolated;
- use them only if they improve the submission without slowing the core build;
- do not block Co-Build, Race, WebMCP, or deployment on Newton.

### 25.6 Snap honesty

Document the board snap as an intentional connection model for stud engagement.

Do not claim full stud/contact simulation if it is not implemented.

---

## 26. Robot collision model

### 26.1 Minimum

Check tool and held-brick swept bounds against:

- table;
- tray walls;
- board;
- placed bricks.

### 26.2 Preferred

Add conservative capsules / boxes for robot links.

### 26.3 Fail-safe

False-positive conservative rejection is better than visible penetration.

### 26.4 Approach zones

Allow deliberate downward approach inside a target or pickup zone.

Do not make the board itself an unconditional collision plane.

---

## 27. Rendering and brick graphics

### 27.1 Visual goal

Photorealistic or AAA-style product visualization, while preserving frame rate.

### 27.2 Brick asset

Build one high-quality generic 2×4 brick.

Recommended production path:

1. create or refine the brick in Blender;
2. use rounded edges and physically plausible dimensions;
3. bake stable texture detail where useful;
4. export GLB;
5. instance it in the browser;
6. vary colour through approved material parameters.

### 27.3 Brick material

Target:

- glossy injection-moulded plastic;
- subtle roughness;
- soft edge highlights;
- strong contact shadows;
- restrained subsurface/transmission approximation if stable;
- no trademark geometry.

### 27.4 Instancing

Use instancing for repeated bricks.

Do not create a heavy unique mesh/material graph for every brick.

### 27.5 Robot material

Use clean industrial metal and painted surfaces.

Remove third-party logos from public visuals unless permitted.

### 27.6 Lighting

Use:

- environment reflection;
- large area key;
- fill;
- rim;
- contact shadow;
- neutral studio / industrial environment.

### 27.7 Camera

Primary hero camera should keep:

- tray;
- board;
- robot;
- active brick;

readable at the same time.

### 27.8 Performance

Must-have:

- 60 FPS on target challenge PC during normal gameplay.

Preferred:

- 90-120 FPS when the scene is simple enough.

Do not sacrifice reliability for unstable effects.

---

## 28. Camera design

### 28.1 Main camera

Three-quarter workcell view.

### 28.2 Build camera

Top-down board view.

### 28.3 Agent tray camera

Top or high-angle view over brick tray.

### 28.4 Agent canvas camera

Top-down or near-top-down view of built result.

### 28.5 Picture-in-picture

Show agent camera as a small panel during agent operation.

### 28.6 Camera director

Should-have:

- smooth focus on selected brick;
- focus on latch;
- focus on placement;
- return to hero view.

Do not use hard camera changes that make manual control difficult.

---

## 29. UI

### 29.1 Main HUD

Show only:

- mode;
- timer;
- progress;
- human / AI contribution;
- WebMCP status;
- agent speed cap.

### 29.2 Agent panel

Show:

- active camera;
- current action;
- selected brick / target;
- last tool result.

### 29.3 Compiler panel

Show:

- source;
- preview;
- brick count;
- palette.

### 29.4 Race panel

Show:

- HUMAN progress;
- AI progress;
- time;
- winner state.

### 29.5 Error language

Errors must be short and exact.

Examples:

- No brick under latch.
- Target occupied.
- Robot target unreachable.
- Speed exceeds round limit.
- Path blocked by placed brick.

---

## 30. Voice and sound

### 30.1 Voice concept

Stretch feature: give LOGO ROBO an original short robot voice.

Do not imitate Rocky, JARVIS, or another recognizable protected character voice.

### 30.2 TTS candidate

Pocket TTS is a good candidate because it supports low-latency streaming and local/client-side use.

Before shipping:

- verify model and voice asset licences;
- include required attribution;
- use an original permitted voice;
- do not clone a recognizable actor or character voice.

### 30.3 Voice content

Only speak short action summaries:

- “White brick.”
- “Got it.”
- “Target clear.”
- “Placed.”
- “Replanning.”

### 30.4 Priority

Voice is never allowed to delay the core WebMCP loop.

---

## 31. Scoring

### 31.1 Correctness

A target is correct when:

- occupied by one brick;
- correct colour;
- correct snap target.

### 31.2 Progress

```text
progress = correctTargets / totalTargets
```

### 31.3 Race result

First competitor to required correctness wins.

Tie-break:

1. completion time;
2. fewer corrections;
3. fewer invalid placements.

### 31.4 Co-Build result

Show collaboration metrics, not a winner:

- total time;
- human contribution;
- AI contribution;
- corrections;
- replans.

### 31.5 Optional efficiency metrics

- robot travel distance;
- latch attempts;
- failed moves;
- average pick-place time.

Do not overload the public UI.

---

## 32. Reliability requirements

### 32.1 Deterministic reset

Same mode + blueprint + seed must reproduce:

- target;
- brick supply;
- tray positions;
- robot start;
- timer state.

### 32.2 Agent-loop reliability

Submission candidate target:

- at least 19/20 successful Agent Solo rounds on the demo blueprint;
- at least 19/20 successful Co-Build scripted interference tests.

Preferred:

- 49/50.

### 32.3 No hidden repair

Do not silently teleport the robot after a failed call.

Do not silently mark a target correct when physical state disagrees.

### 32.4 Bounded recovery

A failed latch or release must return control to the agent quickly.

---

## 33. Test strategy

### 33.1 Logo compiler tests

Test:

- image decode;
- alpha handling;
- aspect ratio;
- even logical width;
- brick budget;
- deterministic output;
- palette mapping;
- no target overlap;
- inventory count.

Use small checked-in test images created for the project.

### 33.2 Colour tests

Test:

- exact palette colours map to themselves;
- perceptually close colours map as expected;
- transparent pixels do not create bricks.

### 33.3 UR10 controller tests

Test:

- known reachable poses;
- known unreachable poses;
- joint-limit rejection;
- IK continuity;
- straight TCP motion;
- speed cap;
- cancellation;
- fail-closed state.

### 33.4 Latch tests

Test:

- correct capture;
- miss;
- already holding;
- release;
- snap;
- release outside target;
- target occupied.

### 33.5 Perception tests

Test:

- world-to-screen projection;
- bounding boxes;
- frustum rejection;
- camera selection;
- filtering;
- observation revision;
- UI overlay uses same data.

### 33.6 WebMCP tests

Test:

- expected tools register;
- no joint-control tool exists;
- no high-level place/build tool exists;
- schemas are bounded;
- invalid inputs fail clearly;
- outputs remain compact;
- same controller state is used by human and agent paths.

### 33.7 Co-Build tests

Test:

- human claim;
- agent claim;
- conflicting claim;
- human places agent target;
- agent re-observes;
- world revision changes.

### 33.8 Race tests

Test:

- both boards use same blueprint;
- independent occupancy;
- same start event;
- correct winner;
- speed cap displayed and enforced.

### 33.9 Browser tests

Test:

- clean boot;
- no console errors;
- upload;
- compile;
- start round;
- human drag;
- agent movement;
- camera overlays;
- reset;
- completion screen.

### 33.10 Visual regression

Capture fixed views:

- start;
- compiler;
- hero workcell;
- agent tray camera;
- green target box;
- latch macro;
- co-build halfway;
- race;
- final logo.

---

## 34. WebMCP judge strategy

### 34.1 WebMCP Leverage

Make it obvious that WebMCP gives an agent abilities that pixel clicking alone would make slow and unreliable:

- structured camera observation;
- exact Cartesian robot movement;
- latch control;
- shared build state;
- collaboration claims.

### 34.2 Execution

Show a complete game:

```text
image -> compile -> build -> recover -> finish -> score
```

Not only a robot arm moving one object.

### 34.3 Potential Impact

Explain that the same pattern can control:

- browser robot twins;
- factories;
- lab automation;
- training cells;
- warehouse workcells.

The project demonstrates a general interaction model through a simple game.

### 34.4 Creativity & Ambition

The key creative combination is:

- generative image-to-brick planning;
- real-time 3D robotics;
- shared human-agent creation;
- WebMCP;
- visible perception;
- race mode.

### 34.5 Automated-review optimization

Root documentation must use exact challenge terms.

Create before submission:

- `README.md`;
- `JUDGING.md`;
- `WEBMCP.md`;
- `ARCHITECTURE.md`;
- `PREEXISTING_WORK.md`;
- `DEMO_SCRIPT.md`;
- `THIRD_PARTY_NOTICES.md`.

`JUDGING.md` should have four headings with the exact official judging criterion names.

---

## 35. Repository architecture target

```text
ROBO-SIM-MCP/
  MASTER_PLAN.md
  README.md
  JUDGING.md
  WEBMCP.md
  ARCHITECTURE.md
  PREEXISTING_WORK.md
  THIRD_PARTY_NOTICES.md
  DEMO_SCRIPT.md
  LICENSE

  apps/
    web/
      index.html
      styles.css
      src/
        main.js

        core/
          world-state.js
          revisions.js

        logo/
          image-loader.js
          palette.js
          compiler.js
          blueprint.js

        bricks/
          brick-spec.js
          inventory.js
          build-board.js
          snap.js

        robot/
          ur10-adapter.js
          ik.js
          cartesian-controller.js
          motion-profile.js
          latch.js

        perception/
          camera-rig.js
          projection.js
          observations.js
          intent-overlay.js

        game/
          round-controller.js
          co-build.js
          race.js
          claims.js
          scoring.js
          difficulty.js

        render/
          scene.js
          robot-renderer.js
          brick-renderer.js
          materials.js
          cameras.js

        webmcp/
          register-tools.js
          schemas.js
          results.js

        ui/
          hud.js
          compiler-panel.js
          agent-panel.js
          scoreboard.js

        audio/
          voice-events.js

  tests/
    js/
    browser/

  evidence/
    RELIABILITY.md
    WEBMCP_TRANSCRIPT.md
    screenshots/

  physics/
    newton-service/     # optional / existing research path
```

Do not reorganize the entire repository in one large change if it risks breaking the working foundation.

Migrate by vertical slices.

---

## 36. Provenance and pre-existing work

### 36.1 Official requirement

Because the project existed before the submission period, clearly separate pre-existing work from new challenge work.

The official rules state that pre-existing projects are evaluated only on work added during the submission period and require clear evidence of meaningful WebMCP extension.

### 36.2 Pre-existing examples

Record as pre-existing where applicable:

- SCARA-SIM concepts;
- rendering work;
- prior robot controls;
- current ROBO-SIM-MCP foundation;
- Newton service foundation;
- any UR10 assets or loader work created before 2026-08-25.

### 36.3 New challenge work

Clearly date challenge work such as:

- LOGO ROBO product redesign;
- logo compiler;
- brick blueprint;
- Co-Build;
- Race;
- new WebMCP tools;
- simulator-native perception;
- UR10 Cartesian WebMCP control;
- latch loop;
- judge overlays;
- challenge deployment.

### 36.4 Evidence

Use:

- Git commits;
- dated documents;
- screenshots;
- test evidence.

Keep `PREEXISTING_WORK.md` current.

---

## 37. Licensing and trademarks

### 37.1 Project licence

Current repository uses Apache License 2.0.

Keep an open-source licence visible in the public repository.

### 37.2 Construction bricks

Use a project-owned generic brick model.

Do not emboss LEGO or another third-party mark.

### 37.3 Robot

Use only assets with confirmed redistribution rights.

Remove manufacturer logos from submission visuals unless permission is confirmed.

### 37.4 Submission video

The official rules say the demo video must not include third-party trademarks or copyrighted material unless permission exists.

Use:

- LOGO ROBO branding;
- original project artwork;
- original or properly licensed audio;
- unbranded robot and bricks.

### 37.5 Uploaded images

The public app can let a user upload their own image.

The official submission demo must use an image the project is allowed to show.

### 37.6 TTS

If Pocket TTS is used, include all required code/model/voice attribution and licence notices.

---

## 38. Deployment

### 38.1 Requirement

Provide a working live URL accessible through ChatGPT’s in-app browser or Google Chrome with WebMCP enabled.

### 38.2 Preferred architecture

Static-first deployment.

Core round must run without an external backend.

### 38.3 Hosting

Cloudflare Pages is a strong default if already available.

Vercel, Netlify, Render, or another reliable host is acceptable.

### 38.4 HTTPS

Required for public deployment.

### 38.5 Authentication

Avoid authentication for the challenge build unless required.

Judges should reach the demo immediately.

### 38.6 Asset loading

Bundle or host all required project assets reliably.

Do not depend on private repository URLs.

### 38.7 Fallback

If optional TTS or physics services fail:

- show them as unavailable;
- continue the core game.

---

## 39. Performance targets

### 39.1 Boot

- first useful frame under 4 seconds on target PC;
- preferred under 2 seconds after cache.

### 39.2 Rendering

- must: >=60 FPS in normal challenge scene;
- preferred: >=90 FPS on target desktop;
- stretch: 120 FPS.

### 39.3 WebMCP

- read observation response target: <100 ms;
- build-state response target: <50 ms;
- move acceptance start: immediate after validation;
- no long unbounded JSON responses.

### 39.4 Compiler

For challenge-sized images:

- target compile time under 250 ms;
- preferred under 100 ms.

### 39.5 Reset

- deterministic reset under 500 ms.

---

## 40. Submission requirements

The official rules currently require:

- registration during the registration period;
- completed Devpost submission;
- working live URL;
- WebMCP-powered project;
- text description explaining WebMCP fit, UX improvement, human-agent ability, and implementation;
- public source repository;
- all needed source/assets/instructions;
- visible open-source licence;
- public YouTube demonstration video;
- video under 3 minutes;
- audio explaining the project and WebMCP use;
- pre-existing-work documentation when applicable.

Judges may choose not to test the live project and may judge from description, images, and video alone.

Therefore the video and repository must tell the complete story.

### 40.1 Registration

Register before the end.

Create a draft submission early.

Drafts can be edited before the submission deadline.

### 40.2 Deadline

Treat **2026-09-03 13:00 PDT / 21:00 BST** as the binding deadline.

Internal target remains 18:00 BST.

---

## 41. Demo video plan

Target length: 2:35-2:50.

### 0:00-0:10 — Hook

Show:

- source image;
- instant brick compilation;
- human and robot beside one board.

Narration:

> Upload an image. LOGO ROBO turns it into a physical brick challenge that a human and an AI agent can build together.

### 0:10-0:25 — Why WebMCP

Show the agent camera with structured boxes.

Show WebMCP tool names briefly:

- observe;
- move;
- latch;
- unlatch.

Narration:

> The agent does not click pixels and it does not get a build button. WebMCP gives it simulator-native perception and primitive Cartesian robot control.

### 0:25-0:55 — First pick

Show:

- `observe_camera`;
- white brick box turns green;
- XYZ;
- robot moves above it;
- latch;
- lift.

### 0:55-1:20 — Co-Build

Human places another brick while robot is moving.

Show both contributions on the same board.

Narration:

> We are changing the same live world at the same time.

### 1:20-1:45 — Recovery

Human moves or takes the brick the agent intended to use.

Agent observes again and chooses another.

This is a major proof that the sequence is not prerecorded.

### 1:45-2:10 — Finish

Use fast but readable cuts.

Show the image complete.

### 2:10-2:30 — Race

Very short Race clip:

- HUMAN vs AI;
- speed cap;
- progress bars.

### 2:30-2:45 — Impact

Show one architecture view or concise caption:

> The same WebMCP pattern can drive browser robot twins for training, manufacturing, and automation.

Close with:

- live app;
- open-source repo;
- LOGO ROBO.

---

## 42. Implementation phases

## P0 — Plan and challenge reset

**Status:** Now.

### Objective

Make LOGO ROBO v2 authoritative.

### Tasks

- replace v1 master plan;
- keep repo history;
- mark old SCARA-first challenge scope obsolete;
- update product name;
- update provenance plan.

### Acceptance

- `MASTER_PLAN.md` describes LOGO ROBO only as the active challenge target.

---

## P1 — Preserve and qualify current foundation

### Objective

Do not break useful existing work while changing the product.

### Tasks

- run current browser build;
- record what works;
- identify reusable renderer, state, camera, and controller code;
- isolate SCARA-specific code;
- identify UR10 work already available;
- preserve tests.

### Acceptance

- working baseline commit is known;
- reusable code is listed;
- no blind rewrite.

---

## P2 — UR10 Cartesian control

### Objective

Get the six-axis robot moving from XYZ commands only.

### Tasks

- load unbranded UR10-class visual;
- implement / integrate IK;
- fixed downward TCP orientation;
- set tray and board inside safe workspace;
- implement `move_tool`;
- add speed cap;
- add path sampling;
- add cancellation;
- add fail-closed errors.

### Acceptance

- 1000 random valid challenge-workspace XYZ targets complete without discontinuity;
- known invalid targets fail;
- no WebMCP joint command exists.

---

## P3 — Brick, latch, and board

### Objective

Complete one manual robot pick and place.

### Tasks

- production brick asset;
- mixed tray;
- latch capture;
- held brick;
- board target;
- release;
- snap;
- correctness.

### Acceptance

- one selected brick can be picked from tray and placed into one exact target at least 49/50 times in deterministic test conditions.

---

## P4 — Logo compiler

**Status:** Compiler foundation integrated; browser upload and controller bridge pending.

### Objective

Turn an image into a live blueprint.

### Tasks

- local image decode;
- alpha;
- aspect fit;
- brick budget;
- palette;
- OKLab mapping;
- fixed horizontal pairing;
- blueprint output;
- inventory output;
- preview.

### Acceptance

- built-in reference images compile deterministically;
- no overlap;
- budget respected;
- preview matches blueprint.

---

## P5 — Simulator-native perception

### Objective

Make tray and board observable to the agent.

### Tasks

- tray camera;
- canvas camera;
- projection;
- bounding boxes;
- visibility;
- XYZ;
- filters;
- green overlay;
- revision.

### Acceptance

- every visible test brick has the correct box and XYZ within defined tolerance;
- hidden/out-of-frustum objects are not returned as visible;
- overlay and tool output use the same snapshot.

---

## P6 — WebMCP primitive loop

**Status:** Oracle 1 primitive manipulation surface integrated; generated-build loop pending.

### Objective

Agent can build one brick by itself.

### Tasks

- register tools;
- test schemas;
- observe tray;
- move;
- latch;
- observe canvas;
- release;
- verify.

### Acceptance

One natural-language task causes the agent to complete a full pick/place without a high-level placement tool.

---

## P7 — Co-Build

**Status:** Deterministic Co-Build state model integrated; browser/controller bridge pending.

### Objective

Human and agent build the same blueprint together.

### Tasks

- shared claims;
- human direct brick drag;
- contribution tracking;
- state revision;
- conflict handling;
- agent recovery after human interference.

### Acceptance

- both can place valid bricks during one round;
- no duplicate occupancy;
- agent can recover after one human state change.

---

## P8 — Race

**Status:** Deterministic Race state model integrated; browser game surface pending.

### Objective

Add the game hook.

### Tasks

- mirrored targets;
- timer;
- human supply;
- AI supply;
- progress;
- correctness;
- speed difficulty;
- result card.

### Acceptance

- both sides start together;
- winner calculation is deterministic;
- speed cap is enforced.

---

## P9 — Physics feel and graphics

### Objective

Make the demo memorable.

### Tasks

- brick material;
- robot material;
- lighting;
- contact shadows;
- held-brick wobble;
- optional browser dynamics;
- camera director;
- clean UI.

### Acceptance

- >=60 FPS;
- no visual feature reduces loop reliability;
- fixed screenshots look submission-ready.

---

## P10 — Judge package

### Objective

Make the submission easy to score.

### Tasks

- README;
- JUDGING;
- WEBMCP;
- ARCHITECTURE;
- PREEXISTING_WORK;
- third-party notices;
- exact run instructions;
- reliability evidence;
- screenshots.

### Acceptance

A reviewer can understand the project, WebMCP value, challenge-new work, and how to run it without reading source first.

---

## P11 — Deployment and reliability

### Objective

Public, repeatable build.

### Tasks

- deploy;
- clean-browser test;
- WebMCP test;
- 20+ complete runs;
- fix tool selection;
- fix stale state;
- freeze assets;
- check licences.

### Acceptance

- public link works;
- >=19/20 demo rounds;
- no fatal console errors.

---

## P12 — Video and submit

### Objective

Deliver before internal deadline.

### Tasks

- rehearse 3-minute script;
- record;
- edit;
- verify no third-party marks/music;
- upload public YouTube video;
- complete Devpost draft;
- test links incognito;
- submit;
- save confirmation.

---

## 43. Day-by-day schedule

## 2026-08-27

- make this v2 plan authoritative;
- qualify current repo;
- start UR10 Cartesian controller;
- decide reusable vs obsolete SCARA modules.

**Exit:** LOGO ROBO architecture is locked and first UR10 path is known.

## 2026-08-28

- register for the challenge;
- create/save Devpost draft;
- complete UR10 XYZ control;
- complete latch;
- register core WebMCP movement tools.

**Exit:** Agent can move tool and latch one test brick.

## 2026-08-29

- implement logo compiler;
- implement blueprint/inventory;
- production brick renderer;
- compile built-in test logos.

**Exit:** image -> blueprint -> visible board works.

## 2026-08-30

- implement camera perception;
- green-box overlay;
- complete one agent pick/place loop;
- begin Co-Build.

**Exit:** agent observes, picks, places, and verifies one generated target.

## 2026-08-31

- complete Co-Build;
- add recovery;
- build Race;
- deploy first public candidate.

**Exit:** public Co-Build round works.

## 2026-09-01

- reliability;
- graphics polish;
- judge documentation;
- submission draft text;
- optional original TTS only if core is already stable.

**Exit:** submission candidate passes repeated runs.

## 2026-09-02

- code freeze at 18:00 BST;
- full licence and trademark review;
- final screenshots;
- record and edit video;
- upload YouTube;
- final Devpost content.

**Exit:** no new features after freeze.

## 2026-09-03

- final incognito test;
- final WebMCP test;
- submit by 18:00 BST internal target;
- save confirmation.

Official deadline: 21:00 BST.

---

## 44. Risk register

| Risk | Impact | Mitigation | Fallback |
|---|---|---|---|
| UR10 IK becomes unstable | Critical | Bound workspace; fixed tool orientation; continuity tests | Simplify workspace and poses |
| Robot asset licence is unclear | High | Use project-owned or clearly licensed mesh; remove marks | Procedural generic six-axis arm |
| Brick trademark risk | High | Generic unbranded 2×4 construction brick | Simplify stud design |
| Compiler produces poor logos | High | Brick budget presets; simple palette; preview before start | Use curated challenge images |
| Too many bricks make demo slow | High | 30-50 brick demo budget | Smaller generated target |
| Agent chooses wrong tools | High | Six small tools; strong descriptions; repeated tests | Reduce tool set further |
| Agent gets stale scene | High | Revisioned observations; verify after actions | Force re-observation on failure |
| OpenCV/perception scope explodes | High | Simulator-native projection only | Return semantic camera list without occlusion |
| Human and agent fight same target | Medium | Claims; occupancy truth; replan | Disable claims and use region split |
| Latch physics is unreliable | Critical | Deterministic capture tolerance | Rigid attachment |
| Board connection is unreliable | Critical | Deterministic snap tolerance | Larger challenge snap tolerance |
| Real-time physics reduces FPS | Medium | Add only after core loop | Deterministic movement only |
| Newton hosting fails | Low for v2 | Do not make it core | Disable Newton |
| WebMCP API changes | High | Isolate registration module | Patch one module |
| Third-party mark appears in video | Critical | Unbranded assets; final frame audit | Replace asset before recording |
| Pocket TTS delays build | Medium | Stretch only | No voice |
| Automated judge misses value | High | JUDGING.md and exact rubric language | Strong first README screen |
| Public deployment fails | Critical | Static-first design; deploy Aug 31 | Alternate static host |
| Deadline slip | Critical | Freeze Sep 2; submit 18:00 Sep 3 | Cut Race/voice before core |

---

## 45. Must, should, stretch

### 45.1 Must

- LOGO ROBO branding;
- generic 2×4 brick;
- image-to-brick compiler;
- brick budget;
- deterministic blueprint;
- mixed brick tray;
- build board;
- UR10-class six-axis arm;
- XYZ + speed control only;
- fixed tool orientation;
- latch;
- unlatch;
- simulator-native tray camera;
- simulator-native canvas camera;
- green detection / target overlay;
- core WebMCP tools;
- one complete agent pick/place loop;
- Co-Build;
- human direct manipulation;
- shared state;
- recovery after state change;
- final scoring;
- public app;
- public repo;
- open-source licence;
- pre-existing-work documentation;
- <3 minute public demo video.

### 45.2 Should

- Race;
- 30-50 brick live logo;
- 19/20 reliability;
- held-brick wobble;
- strong PBR brick material;
- cinematic camera;
- agent activity strip;
- decoy bricks;
- result card;
- `JUDGING.md`;
- `WEBMCP.md`;
- deployed static-only core.

### 45.3 Stretch

- original Pocket TTS robot voice;
- real-time full brick dynamics;
- throwing;
- vertical brick orientation;
- weighted domino tiling;
- automatic wrist yaw;
- wrist camera;
- multi-colour dithering;
- very high-detail 128+ brick builds;
- Newton contact validation;
- multiple robot models.

---

## 46. Explicit non-goals for challenge

Do not spend challenge time on:

- physical robot control;
- ROS control;
- Duet;
- printer G-code;
- real robot safety;
- calibration;
- reinforcement learning;
- large robot catalogue;
- arbitrary URDF import;
- path tracing;
- OpenCV;
- general-purpose computer vision;
- automatic background segmentation;
- photoreal contact simulation of every stud;
- unrestricted six-DOF WebMCP robot control;
- joint-command WebMCP tools;
- multi-user networking.

---

## 47. Definition of Done

LOGO ROBO challenge v2 is done when:

1. A clean public URL loads.
2. A user can select or upload an allowed image.
3. The image compiles to a deterministic 2×4-brick blueprint.
4. The preview shows brick count and colours.
5. The round spawns the correct inventory.
6. The build board matches the blueprint.
7. The six-axis robot loads and looks polished.
8. The agent has no joint-control tool.
9. The agent can move only through XYZ + bounded speed.
10. The agent can latch and unlatch.
11. `observe_camera` reports camera-space boxes and world XYZ.
12. The visible agent overlay matches the observation.
13. The agent can choose a brick from the tray.
14. The robot can pick that brick.
15. The agent can inspect the canvas.
16. The robot can place the brick into a generated target.
17. The agent verifies the result.
18. The same loop can repeat.
19. A human can place bricks directly.
20. Human and agent can Co-Build one shared target.
21. A human state change can force agent re-observation and recovery.
22. Race works if included in the submission candidate.
23. The game reaches a correct completion state.
24. Reset is deterministic.
25. The demo flow passes at least 19/20 runs.
26. The project remains >=60 FPS on the target PC.
27. The public repository contains all required source and instructions.
28. Apache-2.0 remains visible.
29. Pre-existing work is clearly documented.
30. Public visuals contain no unapproved third-party marks.
31. The video is public on YouTube and under 3 minutes.
32. The video explains how WebMCP is used.
33. `JUDGING.md` maps directly to all four official criteria.
34. All final links work in a clean browser.
35. The submission is confirmed before the internal deadline.

---

## 48. Immediate next implementation task

### Task: bridge the deterministic compiler to the authoritative robot runtime

The Oracle 1 hard-coded manipulation slice and the Oracle 2 compiler/game foundation now exist as separate tested boundaries. Connect them through one explicit adapter before adding a larger generated-build scenario:

1. define the coordinate transform from the compiler's centred board limits to the Oracle 1 workcell;
2. create a generated round from `Blueprint` targets and seeded inventory;
3. render inventory and board targets from the same immutable Blueprint/build snapshot;
4. adapt `BuildBoard` placement results to the controller-facing `BoardAdapter` without duplicating occupancy truth;
5. route manual brick dragging and WebMCP observation/action calls through the same controller and build state;
6. expose read-only compiler/build state and bounded compiler actions through the existing primitive WebMCP seam;
7. test unreachable, occupied, wrong-colour, and collision failures as structured replanning signals;
8. run the browser compiler lab and generated pick/place loop in a supported browser context.

### Acceptance

- no joint command or high-level `place_brick` command is exposed;
- one Blueprint, one inventory, one build board, and one authoritative robot controller drive rendering, manual controls, WebMCP, and scoring;
- compiler preview and physical target map agree after the coordinate transform;
- invalid motion and failed placement preserve accepted state and return structured reasons;
- the browser-generated round passes the focused manual and agent workflows without fatal console errors.

---

## 49. Authoritative decisions summary

These decisions are locked unless a test proves they must change:

1. Product name is **LOGO ROBO**.
2. Co-Build is the primary WebMCP mode.
3. Race is the primary game/showcase mode.
4. The challenge uses generic unbranded 2×4 construction bricks.
5. The agent controls XYZ + speed, latch, and unlatch.
6. The agent never sends robot joints.
7. Tool orientation is fixed downward for challenge v1.
8. Challenge-v1 bricks use one canonical yaw.
9. The compiler starts with fixed horizontal 2-cell brick pairing.
10. Image processing is local and deterministic.
11. Palette mapping uses perceptual colour distance.
12. The simulator provides camera-native observations; no OpenCV is required.
13. The agent must observe, act, and verify in a loop.
14. WebMCP does not expose high-level place/build commands.
15. The same state drives the renderer, tools, perception, and scoring.
16. Deterministic latch and snap rules are allowed for challenge reliability.
17. Newton is optional, not a core dependency.
18. Public core should be static-host friendly.
19. Public video uses project-owned branding and assets.
20. Repository documentation is designed for both human and automated judging.

---

## 50. Official references

Verify these again before final submission:

- WebMCP Challenge rules: `https://webmcp.devpost.com/rules`
- WebMCP proposal / reference implementation: `https://github.com/webmachinelearning/webmcp`
- WebMCP imperative API: `document.modelContext.registerTool(...)`

The official challenge rules and challenge website are the source of truth for eligibility, deadlines, judging, and submission requirements.
