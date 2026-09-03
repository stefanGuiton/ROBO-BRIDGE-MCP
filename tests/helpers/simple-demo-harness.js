import { readFile } from 'node:fs/promises';
import { BuildBoard } from '../../apps/web/src/bricks/build-board.js';
import { PlacementAuthority } from '../../apps/web/src/bricks/placement-authority.js';
import { createLogoRoboRuntime } from '../../apps/web/src/logo/runtime.js';
import { ConnectionGraph } from '../../apps/web/src/player/connection-graph.js';
import { PlacementIntentEngine } from '../../apps/web/src/player/placement-intent.js';
import { PLAYER_FALLBACK_SETTINGS } from '../../apps/web/src/player/player-settings.js';
import { makeReachableV8Spawn } from '../../apps/web/src/player/v8-spawn.js';
import { RobotController } from '../../apps/web/src/robot/controller.js';
import { PlacementLookaheadCoordinator } from '../../apps/web/src/robot/placement-lookahead.js';
import { PlannedPlacementCycleRunner } from '../../apps/web/src/robot/placement-cycle-runner.js';
import { RevisionClock } from '../../apps/web/src/state/revision-clock.js';
import { createLogoRoboToolHandlers } from '../../apps/web/src/webmcp/tool-handlers.js';
import { createRuntimeBridge } from '../../apps/web/src/webmcp/runtime-bridge.js';
import { getLogoRoboToolDefinitions } from '../../apps/web/src/webmcp/register-tools.js';
import { createPlacementStreamControl } from '../../apps/web/src/webmcp/placement-stream-control.js';
import { createV8WorkcellProfile } from '../../apps/web/src/workcell/v8-workcell-profile.js';
import { SIMPLE_DEMO_COLOURS, SIMPLE_DEMO_CLEARANCE_MM } from '../../apps/web/src/logo/simple-demo-mode.js';
import { FINAL_TOWER_REQUEST } from '../../apps/web/src/logo/simple-human-slot-guide.js';
import { createSimpleStructurePlan, toWebMcpPlacements } from '../../apps/web/src/robot/simple-structure-planner.js';

export { FINAL_TOWER_REQUEST };
export const FINAL_TOWER_SCENARIO = Object.freeze({
  prefix: 'tower', width: 2, height: 6, pattern: 'cross_laminated_tower', request: FINAL_TOWER_REQUEST
});
export const TEN_LAYER_TOWER_SCENARIO = Object.freeze({
  prefix: 'tower-20', width: 2, height: 10, pattern: 'cross_laminated_tower'
});
export const SIMPLE_DEMO_SCENARIOS = Object.freeze([
  Object.freeze({ prefix: 'single', width: 1, depth: 1, height: 1 }),
  Object.freeze({ prefix: 'wall', width: 3, depth: 1, height: 4 }),
  FINAL_TOWER_SCENARIO
]);

export async function simpleHarness({ wait = async () => {} } = {}) {
  const settings = { ...PLAYER_FALLBACK_SETTINGS, ...JSON.parse(await readFile(new URL('../../apps/web/config/player/LOGO_ROBO_PLAYER_SETTINGS.json', import.meta.url))) };
  const profile = createV8WorkcellProfile(settings);
  const generated = makeReachableV8Spawn(settings, profile, { count: SIMPLE_DEMO_COLOURS.length, colours: SIMPLE_DEMO_COLOURS, yawRad: 0 });
  if (!generated.ok) throw new Error(generated.reason);
  const clock = new RevisionClock();
  const board = new BuildBoard([], { revisionClock: clock, mode: 'co-build' });
  const controller = new RobotController({ board, bricks: generated.records, revisionClock: clock, workspace: profile.workspace, layout: profile.layout, timeScale: 0 });
  const graph = new ConnectionGraph(settings), engine = new PlacementIntentEngine(settings, board, graph);
  engine.configureTableFrame({ centre: { xMm: (profile.matBounds.minX + profile.matBounds.maxX) / 2, yMm: (profile.matBounds.minY + profile.matBounds.maxY) / 2 }, yawRad: 0,
    placementSurfaceZMm: profile.placementSurfaceZMm, widthMm: settings.matWidthMm, depthMm: settings.matDepthMm });
  const authority = new PlacementAuthority({ board, graph, placementEngine: engine, settings, getBricks: () => controller.getBricks(), profile });
  controller.setPlacementAuthority(authority);
  const coordinator = new PlacementLookaheadCoordinator({ controller, placementAuthority: authority, workcellProfile: { ...profile, safeClearanceZMm: SIMPLE_DEMO_CLEARANCE_MM } });
  const runner = new PlannedPlacementCycleRunner({ coordinator, controller, wait });
  const control = createPlacementStreamControl({ runner, coordinator, controller });
  const runtime = createLogoRoboRuntime({ controller, board, placementAuthority: authority, fastPlacement: coordinator, workcellProfile: profile });
  const handlers = createLogoRoboToolHandlers({ bridge: createRuntimeBridge(runtime) });
  const tools = [...getLogoRoboToolDefinitions(handlers, controller.getWorkspace()), control.tool];
  const call = (name, input, options) => tools.find(t => t.name === name).execute(input, options);
  return { controller, board, authority, coordinator, runner, control, runtime, call, profile, graph, engine };
}

// Test-generated ordinary stream coordinates, not a production shape shortcut.
export function simplePlacements({ width, depth, height, prefix, pattern }, workspace) {
  if (pattern === 'cross_laminated_tower') {
    const plan = createSimpleStructurePlan({ structure: pattern, width, height, colour: 'red' }, { profile: workspace });
    if (!plan.ok) throw new Error(JSON.stringify(plan.errors));
    // Reuse the established two-brick alternating-layer geometry and connector
    // metadata. This remains an ordinary plan submitted to the generic stream.
    return toWebMcpPlacements(plan).map(p => ({ ...p, colour: null, preferredColour: 'red' }));
  }
  const zone = workspace.buildZone;
  const centreX = Math.round(((zone.minX + zone.maxX) / 2) / 8) * 8;
  const centreY = Math.round(((zone.minY + zone.maxY) / 2 - 6) / 8) * 8 + 6;
  const result = [];
  for (let z = 0; z < height; z++) for (let y = 0; y < depth; y++) for (let x = 0; x < width; x++) {
    const id = layer => `${prefix}.z${layer}.x${x}.y${y}`;
    result.push({ placementId: id(z), colour: null, preferredColour: 'red',
      xMm: centreX + x * 32, yMm: centreY + y * 16, zMm: workspace.placementSurfaceZMm + 4.8 + z * 9.6, yawDeg: 0,
      ...(z ? { supportPlacementId: id(z - 1), dependsOnPlacementIds: [id(z - 1)] } : {}) });
  }
  return result;
}
