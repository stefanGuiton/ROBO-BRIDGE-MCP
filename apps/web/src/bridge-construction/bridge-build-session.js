'use strict';

import {
  freezeBridgePlan
} from '../bridge-core/index.js';
import {
  createBridgeBuildBoardTargets,
  createBridgePlacementQueueEntries,
  createNormalisedBridgeConstruction,
  createReachabilityReport
} from './bridge-build-adapter.js';
import { getBridgeBuildProgress, acceptedPlacementMap } from './bridge-build-progress.js';
import { freezeBridgeConstructionPlan } from './bridge-freeze.js';
import { createBridgePartInventory, allocateFeederSources } from './bridge-part-inventory.js';
import { createBridgePartRegistry } from './part-registry.js';
import { createBridgeSourceResolver } from './bridge-source-resolver.js';
import { cloneFrozen, deepFreeze, hashRecord, invariant } from './internal.js';
import { partBounds } from '../bricks/part-spec.js';

function planSnapshot(host) {
  invariant(host?.ready && host.buildPlan?.schemaVersion === '4.6', 'BUILDPLAN_UNAVAILABLE', 'The authoritative BridgeHost must be ready.');
  return {
    bridgeSpec: host.settings,
    buildPlan: host.buildPlan,
    challenge: host.challenge ?? null
  };
}

function sameIdSet(expected, actual) {
  if (expected.length !== actual.length) return false;
  const set = new Set(actual);
  return expected.every((id) => set.has(id));
}

export function prepareBridgeBuild({
  host,
  worldTransform = host?.worldTransform,
  workspace,
  strictHero = true
} = {}) {
  const source = planSnapshot(host);
  const provisional = freezeBridgePlan({
    bridgeSpec: source.bridgeSpec,
    buildPlan: source.buildPlan,
    worldTransform,
    challenge: source.challenge
  });
  const registry = createBridgePartRegistry({ buildPlan: provisional.buildPlan, worldTransform: provisional.worldTransform, strictHero });
  const provisionalNormalised = createNormalisedBridgeConstruction({ frozenPlan: provisional, registry, workspace });
  const frozenPlan = freezeBridgeConstructionPlan({
    bridgeSpec: source.bridgeSpec,
    buildPlan: source.buildPlan,
    worldTransform,
    challenge: source.challenge,
    requiredPlacementIds: provisionalNormalised.placements.map((placement) => placement.placementId),
    partRegistry: registry
  });
  const normalisedBuild = createNormalisedBridgeConstruction({ frozenPlan, registry, workspace });
  const targetSet = createBridgeBuildBoardTargets(normalisedBuild);
  const inventory = createBridgePartInventory({ normalisedBuild });
  const reachability = createReachabilityReport(normalisedBuild);
  const preparationHash = hashRecord({
    planId: frozenPlan.planId,
    designChecksum: frozenPlan.designChecksum,
    freezeChecksum: frozenPlan.freezeChecksum,
    partRegistryHash: registry.hash,
    targetIds: targetSet.targets.map((target) => target.targetId),
    inventoryCount: inventory.count
  }, 'prep_');
  return Object.freeze({
    schemaVersion: 'robo-bridge.prepared-build.v1',
    preparationHash,
    frozenPlan,
    registry,
    normalisedBuild,
    targetSet,
    inventory,
    reachability,
    heroBom: cloneFrozen(source.buildPlan.billOfMaterials)
  });
}

export function assertPreparedBuildCurrent(preparedBuild, host) {
  invariant(preparedBuild?.schemaVersion === 'robo-bridge.prepared-build.v1', 'BUILDPLAN_UNAVAILABLE', 'A prepared bridge build is required.');
  const active = planSnapshot(host).buildPlan;
  invariant(JSON.stringify(host.worldTransform) === JSON.stringify(preparedBuild.frozenPlan.worldTransform), 'STALE_DESIGN_REVISION', 'The prepared world transform is stale.');
  invariant(active.planId === preparedBuild.frozenPlan.planId, 'STALE_DESIGN_REVISION', 'The prepared plan ID is stale.', {
    preparedPlanId: preparedBuild.frozenPlan.planId,
    activePlanId: active.planId
  });
  invariant(active.designChecksum === preparedBuild.frozenPlan.designChecksum, 'STALE_DESIGN_REVISION', 'The prepared design checksum is stale.', {
    preparedDesignChecksum: preparedBuild.frozenPlan.designChecksum,
    activeDesignChecksum: active.designChecksum
  });
  invariant(active.designRevision === preparedBuild.frozenPlan.designRevision, 'STALE_DESIGN_REVISION', 'The prepared design revision is stale.', {
    preparedDesignRevision: preparedBuild.frozenPlan.designRevision,
    activeDesignRevision: active.designRevision
  });
  return true;
}

function assertAuthorityGraph({ buildBoard, controller, placementCoordinator, cycleRunner }) {
  invariant(buildBoard && typeof buildBoard.getTargets === 'function' && typeof buildBoard.reset === 'function', 'INVALID_SETTINGS', 'The existing BuildBoard is required.');
  invariant(controller && typeof controller.getState === 'function' && typeof controller.getBricks === 'function', 'INVALID_SETTINGS', 'The existing RobotController is required.');
  invariant(placementCoordinator && typeof placementCoordinator.planQueue === 'function', 'INVALID_SETTINGS', 'The existing placement coordinator is required.');
  invariant(cycleRunner && typeof cycleRunner.run === 'function' && typeof cycleRunner.cancel === 'function', 'INVALID_SETTINGS', 'The existing PlannedPlacementCycleRunner is required.');
  if (controller.revisionClock && buildBoard.revisionClock) {
    invariant(controller.revisionClock === buildBoard.revisionClock, 'INVALID_SETTINGS', 'BuildBoard and RobotController must share the same RevisionClock.');
  }
  if ('controller' in placementCoordinator) {
    invariant(placementCoordinator.controller === controller, 'INVALID_SETTINGS', 'The placement coordinator must use the supplied RobotController.');
  }
  if (placementCoordinator.placementAuthority?.board) {
    invariant(placementCoordinator.placementAuthority.board === buildBoard, 'INVALID_SETTINGS', 'The placement coordinator must use the supplied BuildBoard through PlacementAuthority.');
  }
  if ('coordinator' in cycleRunner) {
    invariant(cycleRunner.coordinator === placementCoordinator, 'INVALID_SETTINGS', 'The cycle runner must use the supplied placement coordinator.');
  }
  if ('controller' in cycleRunner) {
    invariant(cycleRunner.controller === controller, 'INVALID_SETTINGS', 'The cycle runner must use the supplied RobotController.');
  }
}

function assertBoardTargets(preparedBuild, buildBoard) {
  const expected = preparedBuild.targetSet.targets.map((target) => target.targetId);
  const actual = buildBoard.getTargets().map((target) => target.targetId ?? target.id);
  invariant(sameIdSet(expected, actual), 'STALE_DESIGN_REVISION', 'BuildBoard targets do not match the frozen bridge plan.', {
    expectedCount: expected.length,
    actualCount: actual.length
  });
  if (buildBoard.blueprintId !== undefined) {
    invariant(buildBoard.blueprintId === preparedBuild.frozenPlan.planId, 'STALE_DESIGN_REVISION', 'BuildBoard blueprintId does not match the frozen bridge plan.', {
      expected: preparedBuild.frozenPlan.planId,
      actual: buildBoard.blueprintId
    });
  }
}

function activateSources({ placements, controller, inventory }) {
  if (typeof controller.addLooseBricks !== 'function') return { ok: true, added: [], skipped: true };
  const existing = new Set(controller.getBricks().map((brick) => brick.id));
  const needed = new Map();
  for (const placement of placements) needed.set(placement.compatibilityKey, (needed.get(placement.compatibilityKey) ?? 0) + 1);
  const additions = [];
  for (const [key, count] of needed) {
    const live = controller.getBricks().filter((brick) => brick.colour === key && !brick.heldBy && !brick.snapped && !brick.placedTargetId && !brick.placementType && brick.graspable !== false && brick.reachability?.reachable !== false).length;
    const missing = Math.max(0, count + 1 - live);
    if (!missing) continue;
    const candidates = inventory.compatibleSources(key).filter((source) => source.robotEligible && !existing.has(source.sourceId)).slice(0, missing);
    additions.push(...candidates);
  }
  const bounded = allocateFeederSources(additions, controller.getBricks());
  if (!bounded.length) return { ok: true, added: [], skipped: false };
  const result = controller.addLooseBricks(bounded, { actor: 'bridge-source-feeder' });
  invariant(result?.ok, 'OPERATION_IN_PROGRESS', 'RobotController rejected bridge source activation.', result ?? {});
  return { ok: true, added: bounded.map((brick) => brick.id), skipped: false };
}

function eligibleBatch(preparedBuild, buildBoard, count) {
  const accepted = acceptedPlacementMap(buildBoard);
  const selected = [];
  const selectedIds = new Set();
  const structurePlacementIds = preparedBuild.normalisedBuild.placements
    .filter((placement) => placement.partClass !== 'TRACK_SEGMENT')
    .map((placement) => placement.placementId);
  const structureComplete = structurePlacementIds.every((placementId) => accepted.has(placementId));
  // Build low exposed surfaces before installing tall arches. Sorting only by
  // arch origin installed a crown over neighbouring unfinished masonry, making
  // the empty gripper's retreat collide despite non-overlapping final parts.
  const accessOrder = [...preparedBuild.normalisedBuild.placements].sort((a, b) =>
    partBounds(a).max.zMm - partBounds(b).max.zMm || a.placementId.localeCompare(b.placementId));
  for (const placement of accessOrder) {
    if (selected.length >= count) break;
    if (!placement.robotTarget.reachable || accepted.has(placement.placementId)) continue;
    if (placement.requiresStructureComplete && !structureComplete) continue;
    const dependenciesReady = placement.dependencyIds.every((dependencyId) => accepted.has(dependencyId) || selectedIds.has(dependencyId));
    if (!dependenciesReady) continue;
    selected.push(placement);
    selectedIds.add(placement.placementId);
  }
  return { accepted, selected };
}

export function createBridgeBuildSession({
  preparedBuild,
  bridgeHost = null,
  buildBoard,
  controller,
  placementCoordinator,
  cycleRunner,
  cycleTimeMs = 1000,
  physicalSpeedMmS = 650
} = {}) {
  invariant(preparedBuild?.schemaVersion === 'robo-bridge.prepared-build.v1', 'BUILDPLAN_UNAVAILABLE', 'A prepared bridge build is required.');
  assertAuthorityGraph({ buildBoard, controller, placementCoordinator, cycleRunner });
  assertBoardTargets(preparedBuild, buildBoard);
  const sourceResolver = createBridgeSourceResolver({ controller, inventory: preparedBuild.inventory });
  let started = false;
  let disposed = false;
  let batchSequence = 0;
  let lastPlan = null;
  let lastExecution = null;

  const requireLive = () => invariant(!disposed, 'OPERATION_IN_PROGRESS', 'The bridge build session is disposed.');
  const requireStarted = () => {
    requireLive();
    invariant(started, 'OPERATION_IN_PROGRESS', 'Start the bridge build before execution.');
  };

  function startBuild(expected = {}) {
    requireLive();
    if (bridgeHost) assertPreparedBuildCurrent(preparedBuild, bridgeHost);
    const frozen = preparedBuild.frozenPlan;
    for (const [key, value] of Object.entries({
      planId: expected.planId,
      designChecksum: expected.designChecksum,
      designRevision: expected.designRevision,
      partRegistryHash: expected.partRegistryHash
    })) {
      if (value === undefined) continue;
      const actual = key === 'partRegistryHash' ? frozen.partRegistryHash : frozen[key];
      invariant(value === actual, 'STALE_DESIGN_REVISION', `The requested ${key} does not match the frozen build.`, { expected: actual, received: value });
    }
    assertBoardTargets(preparedBuild, buildBoard);
    if (!controller.getBricks().some((brick) => brick.bridgePart)) {
      const initial = preparedBuild.inventory.createInitialActiveBatch({ perCompatibilityKey: 1, maximumSources: 12, robotOnly: false });
      if (initial.length && typeof controller.addLooseBricks === 'function') {
        const result = controller.addLooseBricks(initial, { actor: 'bridge-source-feeder' });
        invariant(result?.ok, 'OPERATION_IN_PROGRESS', 'RobotController rejected initial bridge sources.', result ?? {});
      }
    }
    started = true;
    return getBuildState();
  }

  function getBuildProgress() {
    requireLive();
    return getBridgeBuildProgress({ buildBoard, normalisedBuild: preparedBuild.normalisedBuild });
  }

  function refillSources({ count = 6, excludedBounds = [] } = {}) {
    requireStarted();
    invariant(Number.isSafeInteger(count) && count >= 1 && count <= 12, 'INVALID_SETTINGS', 'Refill count must be 1..12.');
    if (bridgeHost) assertPreparedBuildCurrent(preparedBuild, bridgeHost);
    const accepted = acceptedPlacementMap(buildBoard), live = controller.getBricks();
    const existing = new Set(live.map(b => b.id));
    const pending = preparedBuild.normalisedBuild.placements.filter(p => !accepted.has(p.placementId));
    const candidates = [], keys = [...new Set(pending.map(p => p.compatibilityKey))].sort();
    // Round-robin current required classes; activate unused identities from the
    // same inventory. Never manufacture targets or duplicate source IDs.
    for (let index = 0; candidates.length < count; index++) {
      let found = false;
      for (const key of keys) {
        const source = preparedBuild.inventory.compatibleSources(key).filter(s => !existing.has(s.sourceId))[index];
        if (source) { candidates.push(source); found = true; }
        if (candidates.length === count) break;
      }
      if (!found) break;
    }
    const bridgeExclusion = preparedBuild.normalisedBuild.placements.map(p => {
      const box = partBounds(p);
      // Reserve the whole bridge/track vertical retreat corridor, not just solids.
      return { min: { ...box.min, zMm: -1e6 }, max: { ...box.max, zMm: 1e6 } };
    });
    const additions = allocateFeederSources(candidates, live, undefined, {
      excludedBounds: [...bridgeExclusion, ...excludedBounds], tableBounds: controller.layout.tableBounds, tableZMm: controller.layout.tableZMm
    });
    if (!additions.length) return { ok: true, added: [], count: 0, reason: pending.length ? 'feeder_full_or_supply_exhausted' : 'build_complete', worldRevision: controller.worldRevision };
    const result = controller.addLooseBricks(additions, { actor: 'bridge-source-feeder' });
    invariant(result.ok, 'OPERATION_IN_PROGRESS', 'Finish the current operation before refilling.', result);
    return { ok: true, added: additions.map(b => b.id), count: additions.length, worldRevision: controller.worldRevision };
  }

  function getBuildState() {
    requireLive();
    return deepFreeze({
      schemaVersion: 'robo-bridge.build-session-state.v1',
      started,
      disposed,
      planId: preparedBuild.frozenPlan.planId,
      designChecksum: preparedBuild.frozenPlan.designChecksum,
      designRevision: preparedBuild.frozenPlan.designRevision,
      freezeChecksum: preparedBuild.frozenPlan.freezeChecksum,
      partRegistryRevision: preparedBuild.registry.revision,
      partRegistryHash: preparedBuild.registry.hash,
      progress: getBuildProgress(),
      coordinator: typeof placementCoordinator.getState === 'function' ? placementCoordinator.getState() : null,
      runner: typeof cycleRunner.getState === 'function' ? cycleRunner.getState() : null,
      lastPlan,
      lastExecution
    });
  }

  function planNext({ count = 1 } = {}) {
    requireStarted();
    invariant(Number.isSafeInteger(count) && count >= 1 && count <= 5, 'INVALID_SETTINGS', 'count must be from 1 to 5.');
    if (bridgeHost) assertPreparedBuildCurrent(preparedBuild, bridgeHost);
    const eligible = eligibleBatch(preparedBuild, buildBoard, count);
    const { accepted } = eligible;
    let selected = eligible.selected;
    if (!selected.length) {
      lastPlan = deepFreeze({ ok: false, reason: getBuildProgress().remaining === 0 ? 'build_complete' : 'no_agent_eligible_placement', selectedCount: 0 });
      return lastPlan;
    }
    const activation = activateSources({ placements: selected, controller, inventory: preparedBuild.inventory });
    // Admit only targets with distinct physical sources. A finite feeder may
    // supply fewer than count; the next bounded batch refills vacated slots.
    const sourceIds = new Map(), used = new Set(), admitted = new Set();
    selected = selected.filter(placement => {
      if (!placement.dependencyIds.every(id => accepted.has(id) || admitted.has(id))) return false;
      const live = sourceResolver.compatibleLiveSources(placement).filter(brick => !used.has(brick.id));
      const source = live.find(brick => brick.bridgePart?.dedicatedPlacementId === placement.placementId) ?? live[0];
      if (!source) return false;
      sourceIds.set(placement.placementId, source.id); used.add(source.id); admitted.add(placement.placementId);
      return true;
    });
    if (!selected.length) return { ok: false, reason: 'source_unavailable', recoveryAction: 'Clear space in the shared source feeder and retry build_next_parts.' };
    const queueEntries = createBridgePlacementQueueEntries(selected, {
      acceptedPlacementIds: new Set(accepted.keys()),
      resolveBrickId: (placement) => sourceIds.get(placement.placementId)
    });
    invariant(queueEntries.every((entry) => entry.brickId), 'UNSUPPORTED_PART', 'No compatible active source exists for one or more selected placements.', {
      placements: queueEntries.filter((entry) => !entry.brickId).map((entry) => entry.placementId)
    });
    const streamId = `bridge.${preparedBuild.frozenPlan.designChecksum}.b${++batchSequence}`;
    const worldRevision = controller.getState().worldRevision;
    const result = placementCoordinator.planQueue(queueEntries, {
      expectedWorldRevision: worldRevision,
      streamId,
      mode: 'replace',
      finalChunk: true,
      cycleTimeMs
    });
    invariant(result?.ok !== false, 'INVALID_SETTINGS', 'The existing placement coordinator rejected the bridge queue.', result ?? {});
    lastPlan = deepFreeze({
      ok: true,
      streamId,
      selectedCount: selected.length,
      placementIds: selected.map((placement) => placement.placementId),
      sourceIds: queueEntries.map((entry) => entry.brickId),
      worldRevision,
      activation,
      coordinatorState: result
    });
    return lastPlan;
  }

  async function buildNextParts(count = 1, options = {}) {
    requireStarted();
    invariant(Number.isSafeInteger(count) && count >= 1 && count <= 5, 'INVALID_SETTINGS', 'count must be from 1 to 5.');
    const planned = planNext({ count });
    if (!planned.ok) return planned;
    const result = await cycleRunner.run({
      cycleTimeMs: options.cycleTimeMs ?? cycleTimeMs,
      physicalSpeedMmS: options.physicalSpeedMmS ?? physicalSpeedMmS,
      maximumPlacements: planned.selectedCount,
      signal: options.signal ?? null
    });
    lastExecution = deepFreeze(result);
    return deepFreeze({
      ...result,
      requestedCount: count,
      plannedCount: planned.selectedCount,
      progress: getBuildProgress()
    });
  }

  function cancelBuild(reason = 'bridge_build_cancelled') {
    requireLive();
    const runner = cycleRunner.cancel(reason);
    const coordinator = typeof placementCoordinator.cancel === 'function' ? placementCoordinator.cancel() : null;
    return deepFreeze({ ok: true, runner, coordinator, progress: getBuildProgress() });
  }

  function reset({ resetSources = true } = {}) {
    requireLive();
    cancelBuild('bridge_build_reset');
    if (typeof placementCoordinator.invalidateStream === 'function') placementCoordinator.invalidateStream('bridge_build_reset');
    const boardState = buildBoard.reset();
    if (resetSources && typeof controller.setBricks === 'function') {
      const sources = preparedBuild.inventory.createInitialActiveBatch({ perCompatibilityKey: 1, maximumSources: 12, robotOnly: false });
      const result = controller.setBricks(sources);
      invariant(result?.ok, 'OPERATION_IN_PROGRESS', 'RobotController rejected bridge source reset.', result ?? {});
    }
    started = false;
    lastPlan = null;
    lastExecution = null;
    return deepFreeze({ ok: true, boardState, state: getBuildState() });
  }

  function dispose() {
    if (disposed) return { ok: true, disposed: true, idempotent: true };
    cancelBuild('bridge_build_disposed');
    disposed = true;
    started = false;
    return { ok: true, disposed: true, idempotent: false };
  }

  return Object.freeze({
    preparedBuild,
    sourceResolver,
    startBuild,
    getBuildState,
    getBuildProgress,
    refillSources,
    planNext,
    buildNextParts,
    cancelBuild,
    reset,
    dispose
  });
}
