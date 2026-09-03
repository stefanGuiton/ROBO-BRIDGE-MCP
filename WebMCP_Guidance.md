# Fast WebMCP demo guidance

## First priority: pick and place

For an ordinary brick request, **pick the requested colour and place it**.
Do not open Settings, review rendering options, retune motion, inspect unrelated
subsystems, or re-read the full guidance on each cue. Reuse the valid connection,
known geometry and agreed cycle setting. Read only the live state needed to
select an available source, avoid occupied destinations and obtain the exact
revision; plan once, start immediately, then verify completion.

Settings are outside this path unless the user explicitly requests a change or
a concrete execution failure requires investigation. Speed comes from removing
unnecessary agent work, not skipping runtime safety checks.

## Goal and evidence boundary

Target **under four seconds of agent thinking before the first dispatch**.
This is a target, not a measured achievement or a guarantee of cue-to-motion time.
Tool transport, planning acknowledgement, motion and final verification take
additional time. Never label a timer started inside a tool call as total thinking
time or cue-to-start time.

Use this as the short operational companion to
[SIMPLE_WEBMCP_HERO.md](docs/SIMPLE_WEBMCP_HERO.md), which contains the full
simulation, motion, refill and acceptance contracts. No physical hardware.

## Decision map

```text
User cue
  |
  +-- Interpret once
  |     Single brick -> blue unless specified; one free mat location
  |     Wall         -> default 3 wide x 4 high x 1 deep; red
  |     Tower        -> default 2 x 2 footprint, 5 layers; red
  |                     TWO flat bricks per layer, alternate pairs by 90 degrees
  |     Explicit dimensions/colour always override defaults
  |
  +-- Reuse live tab + WebMCP handle
  |     Missing/stale? -> documented reconnection only; no guessed APIs
  |
  +-- Fresh bounded inventory/revision read
  |     Preserve Human work; exclude held/placed sources
  |
  +-- Generate ordinary placement records; PLAN ONCE
  |     Exact revision, stable IDs, strict colour, support dependencies
  |
  +-- Enough reachable loose sources?
  |     No -> legitimate request_more_bricks within feeder capacity
  |     Yes -----------------------------------------------+
  |                                                        |
  +-- START ONE CONTINUOUS STREAM <-------------------------+
  |     Sequential execution; runtime guards remain enabled
  |
  +-- Bounded completion wait -> one final status read
        Complete -> verify satisfied count and actual brick IDs; report
        Waiting source -> replenish; resume SAME plan
        Conflict/stale revision -> inspect exception; adapt safely
        Timeout -> inspect current state; do not blindly restart
```

## Correct browser connection

After selecting the requested existing tab through the documented browser API:

```js
const webmcp = await tab.capabilities.get('webmcp');
const demoTools = await webmcp.fetchTools();
// If no current notification lists the tools, inspect demoTools.description().
// Call only tools advertised by this page.
```

Reuse these handles while the document remains valid. Do not rediscover the
browser, reload, reset the JavaScript session, or fetch the catalogue on every
cue. A reload/reset invalidates assumptions about plans, inventory and revisions.
If a handle becomes stale, reconnect using the documented capability API.

**Do not use `tab.webmcp.listTools()` or `tab.mcp.listTools()`.** Those interfaces
were incorrect and caused avoidable delay in the single-brick demonstration.

## Batch the fast path

Use one host invocation for fresh read, plan, and start, awaiting mutations
sequentially. This is orchestration of existing tools, not a new build shortcut.
Normalize tool results immediately: this browser returned JSON strings.

```js
const decode = value => typeof value === 'string' ? JSON.parse(value) : value;
const call = async (name, input) => {
  const result = decode(await demoTools.call(name, input));
  if (!result || result.ok !== true) {
    throw new Error(JSON.stringify({ tool: name, result }));
  }
  return result;
};

// `placements`, `streamId`, and requested `cycleTimeMs` are prepared host-side
// from the cue and verified current geometry. Do not hardcode a stale revision.
const scene = await call('get_scene_state', { type: 'brick', limit: 20 });
// Check relevant loose/unheld/reachable inventory. Page if required, binding
// later pages to the first revision. Preserve existing work and occupied cells.
const plan = await call('plan_placement_queue', {
  streamId, mode: 'replace', finalChunk: true,
  placements, cycleTimeMs, expectedWorldRevision: scene.worldRevision
});
// Happy path shown: if supply is short, refill before starting and use the
// latest exact revision returned by the successful refill/read instead.
const started = await call('control_placement_stream', {
  action: 'start', cycleTimeMs,
  maximumPlacements: placements.length,
  expectedWorldRevision: plan.worldRevision
});
```

Never test `.ok` on an unparsed JSON string: the previous attempt silently
skipped start because `result.ok` was undefined. A successful start response
means execution was accepted, **not completed**.

For plans within the advertised 50-placement batch limit, do not insert model
turns between planning and starting, or between individual bricks. Wait using a
bounded status/visible-completion check suitable for expected duration, then read
`get_placement_stream_status` once for final verification. Check execution idle,
the requested satisfied count, unique actual source IDs and successful placement
records. Read robot/board state if the returned evidence leaves those facts unclear.

## Timing and safety

- Normal cycle default stays 2000 ms. Use the requested fast-demo target of
  1000 ms when explicitly configured; do not lower the minimum.
- Preserve validated motion limits, bounded playback, cancellation, exact
  revisions, source reassignment and runtime Human adoption.
- Never take bricks out of an existing Human structure to satisfy feeder demand.
- Do not pre-plan or pre-place before the cue to disguise latency. Preparing the
  browser connection is fine; preparing scene state needs user authorization.
- Do not reset or create extra test bricks merely to rehearse without permission.
- If measuring, retain a host-side record before the first await: dispatch,
  plan acknowledgement, start dispatch, start acknowledgement, completion
  observation and verified completion. These are distinct timings.
- Report actual durations/overruns when available. Never infer motion timing
  from the cycle setting or claim the four-second thinking target was met
  without a cue timestamp and a dispatch timestamp.

## Keep the spoken demo short

One short acknowledgement, direct tool dispatch, one short verified completion.
Resolve routine unspecified dimensions with the defaults above. Ask only when
missing authority or a material ambiguity prevents safe completion.

This guide documents an improved process; repeated sub-four-second performance
has **not** yet been demonstrated. No runtime code changes are made by this guide.
