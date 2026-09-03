import { prepareBridgeBuild, createBridgeBuildSession } from './bridge-build-session.js';
import { partBounds, boundsOverlap } from '../bricks/part-spec.js';
import { createTerrainTravelPolicy } from '../robot/terrain-travel-policy.js';

export function machineTerrainBoxes(challenge) {
  return (challenge?.getCollisionProxy().machine.proxies ?? []).map(box => ({ id: box.id,
    min: { xMm: box.min.x, yMm: box.min.y, zMm: box.min.z },
    max: { xMm: box.max.x, yMm: box.max.y, zMm: box.max.z } }));
}

export function physicalBuildReport(prepared, { tableZMm = 0, obstacles = [] } = {}) {
  const bounds = prepared.normalisedBuild.placements.map(p => ({ placementId: p.placementId, ...partBounds(p) }));
  return { ...prepared.reachability,
    physicalBoundsMm: { min: Object.fromEntries(['xMm', 'yMm', 'zMm'].map(a => [a, Math.min(...bounds.map(b => b.min[a]))])),
      max: Object.fromEntries(['xMm', 'yMm', 'zMm'].map(a => [a, Math.max(...bounds.map(b => b.max[a]))])) },
    invalidTargets: bounds.flatMap(b => b.min.zMm < tableZMm - 0.1 ? [{ placementId: b.placementId, obstacle: 'table' }]
      : obstacles.filter(o => boundsOverlap(b, o)).map(o => ({ placementId: b.placementId, obstacle: o.id }))),
    collisionModel: 'deterministic-part-proxies; existing link capsules; not calibrated visual-link/table fidelity'
  };
}

export function createConstructionService({ bridgeHost, challenge, buildBoard, controller, placementAuthority, placementCoordinator, cycleRunner, onPrepared = () => {} }) {
  let session = null, unlock = null, restore = null, busy = false, resetting = false, activeRun = null;
  const revision = expected => { if (!Number.isSafeInteger(expected) || expected !== controller.worldRevision) throw new Error('stale_world_revision'); };
  const idle = () => { if (busy || resetting || controller.operationState !== 'idle' || controller.pendingMoveCount > 0 || controller.operationBlocked() || controller.getBricks().some(b => b.heldBy)) throw new Error('operation_in_progress'); };
  const prepare = () => prepareBridgeBuild({ host: bridgeHost, workspace: controller.workspace });
  const report = prepared => physicalBuildReport(prepared, { tableZMm: controller.layout.tableZMm, obstacles: machineTerrainBoxes(challenge) });
  const restoreIdleState = () => {
    if (restore) {
      const changed = controller.setBricks(restore.bricks);
      if (!changed.ok) throw Object.assign(new Error(changed.reason), { code: changed.reason });
      buildBoard.loadBlueprint(restore.blueprint, { expectedWorldRevision: controller.worldRevision });
      controller.layout = restore.layout;
      placementCoordinator.travelPolicy = restore.travelPolicy;
    }
    unlock?.(); unlock = null; session = null; restore = null;
    placementAuthority.constructionObstacles = [];
    onPrepared(null);
  };
  async function reset({ expectedWorldRevision } = {}) {
    revision(expectedWorldRevision);
    if (resetting) throw new Error('operation_in_progress');
    resetting = true;
    try {
      session?.cancelBuild('bridge_build_reset');
      cycleRunner.cancel('bridge_build_reset');
      if (activeRun) { try { await activeRun; } catch { /* cancellation */ } }
      // Controller owns cancellation of unrelated motion, idle fencing, held
      // part release and board reset. Never clear the board before it is idle.
      await controller.reset({ bricks: restore?.bricks ?? controller.getBricks() });
      session?.dispose();
      placementCoordinator.invalidateStream('bridge_build_reset');
      restoreIdleState();
      return { ok: true, worldRevision: controller.worldRevision };
    } finally { resetting = false; }
  }
  return Object.freeze({
    get preparedBuild() { return session?.preparedBuild ?? null; },
    getBuildProgress() { return session?.getBuildProgress() ?? { status: 'design', completed: 0 }; },
    getBuildState() { return session?.getBuildState() ?? { started: false, status: 'design' }; },
    getPhysicalReport() { return report(session?.preparedBuild ?? prepare()); },
    startBuild({ expectedWorldRevision, signal } = {}) {
      revision(expectedWorldRevision); idle();
      if (signal?.aborted) throw new Error('aborted');
      if (session) throw new Error('reset_required');
      if (buildBoard.progress().filled || buildBoard.getPlacements().length) throw new Error('clear_existing_build_before_start');
      const prepared = prepare(), physical = report(prepared);
      if (physical.invalidTargets.length) throw Object.assign(new Error('invalid_physical_targets'), { details: physical });
      const travelPolicy = createTerrainTravelPolicy(challenge?.getTerrainTravelPlane?.(), prepared.normalisedBuild.placements, controller.workspace);
      unlock = bridgeHost.lockConstruction(prepared.frozenPlan.planId);
      restore = { blueprint: { blueprintId: buildBoard.blueprintId, targets: buildBoard.getTargets() }, bricks: controller.getBricks(), layout: controller.layout, travelPolicy: placementCoordinator.travelPolicy };
      try {
        placementCoordinator.invalidateStream('bridge_build_start');
        placementCoordinator.travelPolicy = travelPolicy;
        controller.setBricks([]);
        buildBoard.loadBlueprint({ blueprintId: prepared.frozenPlan.planId, targets: prepared.targetSet.targets }, { expectedWorldRevision: controller.worldRevision });
        const obstacles = machineTerrainBoxes(challenge);
        controller.layout = { ...restore.layout, obstacles: [...restore.layout.obstacles, ...obstacles.map(o => ({ id: o.id,
          position: Object.fromEntries(['xMm', 'yMm', 'zMm'].map(a => [a, (o.min[a] + o.max[a]) / 2])),
          bounds: Object.fromEntries(['xMm', 'yMm', 'zMm'].map(a => [a, o.max[a] - o.min[a]])) }))] };
        placementAuthority.constructionTableZMm = controller.layout.tableZMm;
        placementAuthority.constructionObstacles = obstacles;
        session = createBridgeBuildSession({ preparedBuild: prepared, bridgeHost, buildBoard, controller, placementCoordinator, cycleRunner });
        const result = session.startBuild();
        onPrepared(prepared);
        return result;
      } catch (error) {
        // Startup is synchronous/idle: closure-safe rollback also works when
        // startBuild was called as a detached callback.
        session?.dispose();
        buildBoard.reset();
        restoreIdleState();
        throw error;
      }
    },
    planNext({ count = 1, expectedWorldRevision } = {}) {
      revision(expectedWorldRevision); idle();
      if (!session) throw new Error('build_not_started');
      return session.planNext({ count });
    },
    async buildNextParts(count = 1, { expectedWorldRevision, signal, ...options } = {}) {
      revision(expectedWorldRevision); idle();
      if (!session) throw new Error('build_not_started');
      if (signal?.aborted) throw new Error('aborted');
      busy = true;
      try { activeRun = session.buildNextParts(count, { ...options, signal }); return await activeRun; }
      finally { busy = false; activeRun = null; }
    },
    cancelBuild({ expectedWorldRevision } = {}) {
      revision(expectedWorldRevision);
      return session?.cancelBuild() ?? { ok: true };
    },
    reset
  });
}
