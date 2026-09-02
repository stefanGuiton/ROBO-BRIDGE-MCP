import { readFile } from 'node:fs/promises';
import { createBridgeHost } from '../../apps/web/src/bridge-core/index.js';
import { MAIN_DEMO_BRIDGE_INITIAL_SETTINGS } from '../../apps/web/src/bridge/main-demo-bridge.js';
import { createChallengeService } from '../../apps/web/src/challenge/challenge-service.js';
import { createEasyBridgeChallenge } from '../../apps/web/src/challenge/main-demo-easy.js';
import { prepareBridgeBuild } from '../../apps/web/src/bridge-construction/bridge-build-session.js';
import { createConstructionService, physicalBuildReport } from '../../apps/web/src/bridge-construction/construction-service.js';
import { BuildBoard } from '../../apps/web/src/bricks/build-board.js';
import { PlacementAuthority } from '../../apps/web/src/bricks/placement-authority.js';
import { RobotController } from '../../apps/web/src/robot/controller.js';
import { PlacementLookaheadCoordinator } from '../../apps/web/src/robot/placement-lookahead.js';
import { PlannedPlacementCycleRunner } from '../../apps/web/src/robot/placement-cycle-runner.js';
import { RevisionClock } from '../../apps/web/src/state/revision-clock.js';
import { ConnectionGraph } from '../../apps/web/src/player/connection-graph.js';
import { PlacementIntentEngine } from '../../apps/web/src/player/placement-intent.js';
import { PLAYER_FALLBACK_SETTINGS } from '../../apps/web/src/player/player-settings.js';
import { createV8WorkcellProfile } from '../../apps/web/src/workcell/v8-workcell-profile.js';

export async function constructionHarness() {
  const settings = { ...PLAYER_FALLBACK_SETTINGS, ...JSON.parse(await readFile(new URL('../../apps/web/config/player/LOGO_ROBO_PLAYER_SETTINGS.json', import.meta.url), 'utf8')) };
  const profile = createV8WorkcellProfile(settings), clock = new RevisionClock();
  const board = new BuildBoard([], { revisionClock: clock });
  const controller = new RobotController({ board, bricks: [], revisionClock: clock, workspace: profile.workspace, layout: profile.layout, timeScale: 0 });
  const graph = new ConnectionGraph(settings), engine = new PlacementIntentEngine(settings, board, graph);
  const authority = new PlacementAuthority({ board, graph, placementEngine: engine, settings, getBricks: () => controller.getBricks(), profile });
  controller.setPlacementAuthority(authority);
  const coordinator = new PlacementLookaheadCoordinator({ controller, placementAuthority: authority, workcellProfile: profile });
  const runner = new PlannedPlacementCycleRunner({ controller, coordinator });
  const challenge = createChallengeService({ displayOffset: { x: -170, z: 4 }, challengeYawDeg: -90 });
  const host = await createBridgeHost({ initialSettings: MAIN_DEMO_BRIDGE_INITIAL_SETTINGS, challenge: createEasyBridgeChallenge(challenge), challengePolicy: 'locked', compilerOptions: { preferWorker: false } });
  const initial = prepareBridgeBuild({ host, workspace: controller.workspace });
  const elevation = Math.max(0, 4 - physicalBuildReport(initial).physicalBoundsMm.min.zMm);
  challenge.setBuildElevation(elevation);
  await host.applySettingsBatch(host.settings, host.designRevision, { challenge: createEasyBridgeChallenge(challenge) });
  const service = createConstructionService({ bridgeHost: host, challenge, buildBoard: board, controller, placementAuthority: authority, placementCoordinator: coordinator, cycleRunner: runner });
  return { host, board, controller, authority, coordinator, runner, service, challenge, profile, initial, elevation };
}
