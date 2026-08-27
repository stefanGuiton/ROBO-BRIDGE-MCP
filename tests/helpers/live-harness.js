import { BuildBoard } from '../../apps/web/src/bricks/build-board.js';
import { compileImageData } from '../../apps/web/src/logo/compiler.js';
import { makePattern } from '../../apps/web/src/logo/patterns.js';
import { challengeBoardLimits, createChallengeInventory, remapBlueprintToChallenge } from '../../apps/web/src/logo/workcell-adapter.js';
import { createLogoRoboRuntime } from '../../apps/web/src/logo/runtime.js';
import { RobotController } from '../../apps/web/src/robot/controller.js';
import { RevisionClock } from '../../apps/web/src/state/revision-clock.js';
import { createRuntimeBridge } from '../../apps/web/src/webmcp/runtime-bridge.js';
import { createLogoRoboToolHandlers } from '../../apps/web/src/webmcp/tool-handlers.js';

export function createLiveHarness({ timeScale = 0, pattern = 'diagonal' } = {}) {
  const source = compileImageData(makePattern(pattern, 64), {
    brickBudget: 6,
    boardLimits: challengeBoardLimits(),
    fitMode: 'contain',
    seed: 173
  }).blueprint;
  const blueprint = remapBlueprintToChallenge(source);
  const makeBricks = () => createChallengeInventory(blueprint);
  const clock = new RevisionClock();
  const board = new BuildBoard(blueprint, { revisionClock: clock, mode: 'co-build' });
  const controller = new RobotController({ board, bricks: makeBricks(), revisionClock: clock, timeScale });
  const runtime = createLogoRoboRuntime({ controller, board, resetBricks: makeBricks });
  const bridge = createRuntimeBridge(runtime);
  const handlers = createLogoRoboToolHandlers({ bridge });
  return { blueprint, board, controller, runtime, bridge, handlers, makeBricks };
}

export async function runToolOnlyRound(handlers) {
  const workspace = await handlers.getWorkspace();
  let state = await handlers.getBuildState({ status: 'unfilled', limit: 20 });
  const results = [];
  while (state.progress.correctTargets < state.progress.totalTargets) {
    const target = state.targets[0];
    let revision = state.worldRevision;
    const claim = await handlers.claimTarget({ targetId: target.id, expectedWorldRevision: revision });
    if (!claim.ok) return { ok: false, stage: 'claim', claim, results };
    revision = claim.worldRevision;
    const observation = await handlers.observeCamera({ cameraId: 'tray_camera', colour: target.colour, type: 'brick', limit: 20 });
    if (!observation.ok) return { ok: false, stage: 'observe', observation, results };
    const brick = observation.detections.find((candidate) => candidate.state === 'free');
    if (!brick?.recommendedTcp) return { ok: false, stage: 'brick', results };
    revision = observation.snapshotRevision;
    const move = async (point, speedMmS) => {
      const result = await handlers.moveTool({ ...point, speedMmS, expectedWorldRevision: revision });
      if (result.ok) revision = result.worldRevision;
      return result;
    };
    for (const [point, speed] of [
      [{ ...brick.recommendedTcp, zMm: workspace.recommendedClearanceZMm }, 500],
      [brick.recommendedTcp, 220]
    ]) {
      const result = await move(point, speed);
      if (!result.ok) return { ok: false, stage: 'pickup-move', result, results };
    }
    const latch = await handlers.latch({ expectedWorldRevision: revision });
    if (!latch.ok) return { ok: false, stage: 'latch', latch, results };
    revision = latch.worldRevision;
    for (const [point, speed] of [
      [{ ...brick.recommendedTcp, zMm: workspace.recommendedClearanceZMm }, 300],
      [workspace.recommendedTransferTcp, 400]
    ]) {
      const result = await move(point, speed);
      if (!result.ok) return { ok: false, stage: 'transfer', result, results };
    }
    const targetTcp = { xMm: target.position.xMm, yMm: target.position.yMm, zMm: target.position.zMm + workspace.graspTcpOffsetMm };
    for (const [point, speed] of [
      [{ ...targetTcp, zMm: workspace.recommendedClearanceZMm }, 350],
      [targetTcp, 180]
    ]) {
      const result = await move(point, speed);
      if (!result.ok) return { ok: false, stage: 'target-move', result, results };
    }
    const release = await handlers.unlatch({ expectedWorldRevision: revision });
    if (!release.ok) return { ok: false, stage: 'release', release, results };
    revision = release.worldRevision;
    for (const [point, speed] of [
      [{ ...targetTcp, zMm: workspace.recommendedClearanceZMm }, 300],
      [workspace.recommendedTransferTcp, 400]
    ]) {
      const result = await move(point, speed);
      if (!result.ok) return { ok: false, stage: 'retreat', result, results };
    }
    state = await handlers.getBuildState({ status: 'unfilled', limit: 20 });
    results.push({ brickId: brick.objectId, targetId: target.id, worldRevision: state.worldRevision });
  }
  return { ok: true, results, state };
}
