# ROBO BRIDGE MCP — USER MINI PLAN

**Date:** 2026-09-03  
**Deadline:** **21:00 BST**  
**Goal:** Get a valid submission live, recorded and submitted. Do not spend time on optional engineering first.

---

## 1. Finish the final tower

Confirm the final Simple Bricks tower is:

```text
2 bricks per layer
6 layers
12 total placements
```

Use this exact request:

```text
Build a tower six layers tall using two red bricks per layer.
```

Pass condition:

```text
12/12
```

Also check that a compatible Human blue brick becomes `ADOPTED`, the robot does not place a duplicate, and the build continues.

---

## 2. Run the final Simple demo test

Test these in the external WebMCP browser:

```text
1. Place one red brick.
2. Build a 3 by 3 wall.
3. Build the 12-brick tower.
4. Insert the blue Human brick during the tower.
5. Ask: "Move 50% faster."
```

Expected speed change:

```text
2000 ms -> about 1333 ms
```

If these work, stop changing the Simple demo.

---

## 3. Freeze the release

Before deployment, confirm:

```text
Simple mode works
28 WebMCP tools register
one brick works
wall works
12-target tower works
blue brick ADOPTED works
speed change works
no blocking console errors
```

Do not return to Bridge collision work.

---

## 4. Deploy the real app

Use the existing Cloudflare project:

```text
robo-bridge-mcp-git
```

Do not delete or change the old `robo-bridge-mcp` project.

In the working Git-connected project, change only:

```text
Build output directory
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

## 5. Check the public site

Open:

```text
https://robo-bridge-mcp-git.pages.dev
```

Check:

```text
page loads
canvas renders
Terrain 7 loads
textures load
controls work
no blocking console errors
WebMCP tools are available in the supported browser
```

Then run one small live WebMCP test on the public site if possible.

---

## 6. Record the video

Target:

```text
2:20-2:40
maximum: under 3:00
```

Recommended order:

```text
0:00  place one red brick
0:10  build 3x3 wall
0:40  build 6-layer tower, 2 bricks per layer
      insert Human blue brick -> ADOPTED
1:15  "Move 50% faster"
1:30  explain shared world / WebMCP / BuildBoard
1:55  briefly show Bridge mode and Viaduct
2:20  close
```

Start with the working demo. Do not use a long title screen or setup sequence.

---

## 7. Upload and submit

Upload the final video to YouTube as public.

Then complete the submission form with:

```text
project name
description
WebMCP explanation
GitHub repository
live Cloudflare URL
public YouTube URL
```

Submit **well before 21:00 BST**.

---

# Do not spend time on these before submission

```text
Bridge retreat collision
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
