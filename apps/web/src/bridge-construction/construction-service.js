import { prepareBridgeBuild, createBridgeBuildSession } from './bridge-build-session.js';
import { partBounds, boundsOverlap } from '../bricks/part-spec.js';

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
  let session = null, unlock = null, restore = null, busy = false;
  const revision = expected => { if (!Number.isSafeInteger(expected) || expected !== controller.worldRevision) throw new Error('stale_world_revision'); };
  const idle = () => { if (busy || controller.operationState !== 'idle' || controller.pendingMoveCount > 0 || controller.operationBlocked() || controller.getBricks().some(b => b.heldBy)) throw new Error('operation_in_progress'); };
  const prepare = () => prepareBridgeBuild({ host: bridgeHost, workspace: controller.workspace });
  const report = prepared => physicalBuildReport(prepared, { tableZMm: controller.layout.tableZMm, obstacles: machineTerrainBoxes(challenge) });
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
      unlock = bridgeHost.lockConstruction(prepared.frozenPlan.planId);
      restore = { blueprint: { blueprintId: buildBoard.blueprintId, targets: buildBoard.getTargets() }, bricks: controller.getBricks(), layout: controller.layout };
      try {
        placementCoordinator.invalidateStream('bridge_build_start');
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
        this.reset({ expectedWorldRevision: controller.worldRevision });
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
      try { return await session.buildNextParts(count, { ...options, signal }); }
      finally { busy = false; }
    },
    cancelBuild({ expectedWorldRevision } = {}) {
      revision(expectedWorldRevision);
      return session?.cancelBuild() ?? { ok: true };
    },
    reset({ expectedWorldRevision } = {}) {
      revision(expectedWorldRevision);
      if (busy) throw new Error('cancel_and_await_execution_before_reset');
      session?.dispose();
      placementCoordinator.invalidateStream('bridge_build_reset');
      if (restore) {
        buildBoard.reset(); controller.setBricks(restore.bricks);
        buildBoard.loadBlueprint(restore.blueprint, { expectedWorldRevision: controller.worldRevision });
        controller.layout = restore.layout;
      }
      unlock?.(); unlock = null; session = null; restore = null;
      placementAuthority.constructionObstacles = [];
      onPrepared(null);
      return { ok: true, worldRevision: controller.worldRevision };
    }
  });
}
