# ROBO BRIDGE MCP — USER MINI PLAN

**Date:** 2026-09-03  
**Deadline:** **21:00 BST**  
**Goal:** Get a valid submission live, recorded and submitted. Do not spend time on optional engineering first.

---

## 1. Decide the exact final tower

Current PR #7 candidate:

```text
commit 29953f01d994b9b877a7871e6c2aeda2dee3d77e
14/14 focused tests PASS
PR #7 is NOT merged
```

Important: PR #7 currently uses a **10-level / 20-brick** alternating tower, while our earlier final handoff specified:

```text
6 layers
2 bricks per layer
12 placements
```

Do not record until Codex confirms which exact tower specification is final and tests that same prompt.

Preferred handoff prompt unless explicitly changed:

```text
Build a tower six layers tall using two red bricks per layer.
```

---

## 2. Make the Human blue-brick moment reliable

The colour fix looks good: the latest blue pickups stayed blue.

The latest Human placement was off-plan and blocked the 20-target tower at:

```text
6 / 20
```

For the video, do **not** place the blue brick arbitrarily.

Use a clearly indicated valid pending slot and the correct orientation.

Required result:

```text
blue brick -> ADOPTED
robot skips duplicate
robot continues
build completes
```

We do not need a general arbitrary off-plan replanner for the submission.

---

## 3. Review and merge PR #7 only when ready

Before merge, confirm:

```text
final tower count/spec is correct
Human valid-slot interjection works
pickup colours stay correct
no unrelated changes
no blocking console regression
```

Then merge the bounded fix and note the exact final `main` SHA.

---

## 4. Run the final Simple demo test

Test the exact final release in the external WebMCP browser:

```text
1. Place one red brick.
2. Build the chosen wall.
3. Build the final agreed tower.
4. Insert the blue Human brick into the known compatible slot.
5. Confirm ADOPTED and no duplicate.
6. Ask: "Move 50% faster."
```

Expected speed change:

```text
2000 ms -> about 1333 ms
```

Also confirm:

```text
28 WebMCP tools
no blocking console errors
```

If this passes, stop changing the Simple demo.

---

## 5. Deploy the real app

Cloudflare Git deployment is already proven.

Use the existing project:

```text
robo-bridge-mcp-git
https://robo-bridge-mcp-git.pages.dev
```

Do not delete or modify the old `robo-bridge-mcp` project.

Change only:

```text
Build output directory:
cloudflare-smoke
->
apps/web
```

Keep:

```text
Repository: stefanGuiton/ROBO-BRIDGE-MCP
Branch: main
Root: /
```

---

## 6. Check the public site

Check:

```text
page loads
canvas renders
Terrain 7 loads
textures/assets load
controls work
no blocking console errors
WebMCP tools are available where supported
```

If possible, run one small real WebMCP action on the public site.

---

## 7. Record the video

Target:

```text
2:20-2:40
maximum: under 3:00
```

Recommended order:

```text
1. one red brick
2. wall
3. final tower
4. Human blue brick -> ADOPTED
5. "Move 50% faster"
6. short shared-world/WebMCP explanation
7. brief Bridge/Terrain/Viaduct view if stable
8. close
```

Start with the working app. Do not show setup/login/loading.

---

## 8. Upload and submit

Upload the final video to YouTube as public and confirm audio/playback.

Have ready:

```text
public app URL
GitHub repository link
public YouTube URL
project description
WebMCP explanation
safe simulation claims
```

Submit **well before 21:00 BST**.

---

# Do not spend time on these before submission

```text
Bridge retreat collision
arbitrary off-plan Human replanning
Aqueduct
new terrain
new physics
renderer rewrite
trees/grass
reflection systems
new path planner
physical robot work
extra dashboards
major refactors
perfect visual polish
new Cloudflare projects
```

---

# One rule

```text
GET A VALID SUBMISSION FIRST.
POLISH ONLY AFTER IT IS SUBMITTED.
```
