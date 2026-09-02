'use strict';

import { createRouteFrame } from '../../apps/web/src/train/route-frame.js';
import {
  createFixtureBuildPlan,
  createFixtureWorldTransform,
  fixturePlacementId,
  fixtureTrackPlacementId
} from './train-fixture.js';

const clone = (value) => structuredClone(value);

export function createIntegrationPlan() {
  return createFixtureBuildPlan();
}

export function createIntegrationTransform({ yawDeg = 0, xMm = 100, yMm = -50, zMm = 20, scale = 1, id = null } = {}) {
  return {
    id: id ?? `fixture.${yawDeg}.${xMm}.${yMm}.${zMm}.${scale}`,
    translationMm: { xMm, yMm, zMm },
    yawDeg,
    scale
  };
}

export function listPlanPlacementRecords(plan) {
  const records = [];
  for (const placement of plan.geometry.masterSlice.placements || []) {
    for (let sliceIndex = 0; sliceIndex < plan.geometry.sliceArray.count; sliceIndex += 1) {
      records.push({
        placementId: fixturePlacementId(plan, placement.basePlacementId, sliceIndex),
        partClass: 'STANDARD_BRICK',
        partType: placement.partType,
        definitionId: null,
        registryKey: `STANDARD_BRICK:${placement.partType}`,
        gridX: placement.gridX,
        gridY: placement.gridY,
        sliceIndex
      });
    }
  }
  const custom = plan.geometry.masterSlice.customPlacements || [];
  for (let masterIndex = 0; masterIndex < custom.length; masterIndex += 1) {
    const placement = custom[masterIndex];
    const repeat = placement.repeatAcrossSlices !== false;
    const count = repeat ? plan.geometry.sliceArray.count : 1;
    for (let instanceIndex = 0; instanceIndex < count; instanceIndex += 1) {
      const sliceIndex = repeat ? instanceIndex : -1;
      const suffix = repeat ? sliceIndex : 't';
      records.push({
        placementId: `${plan.planId}.c.${masterIndex}.${suffix}`,
        partClass: placement.partClass,
        partType: placement.partClass,
        definitionId: placement.definitionId,
        registryKey: `${placement.partClass}:${placement.definitionId}`,
        gridX: null,
        gridY: null,
        sliceIndex,
        trackIndex: placement.trackIndex ?? null
      });
    }
  }
  return records.sort((left, right) => left.placementId.localeCompare(right.placementId));
}

export function listPlanPlacementIds(plan) {
  return listPlanPlacementRecords(plan).map((record) => record.placementId);
}

export function createPartRegistryFixture(plan, { revision = 'bridge-part-registry.p0.v1', hash = 'pr_fixture_train_adapter_v1' } = {}) {
  const records = [];
  const seen = new Set();
  for (const placement of listPlanPlacementRecords(plan)) {
    if (seen.has(placement.registryKey)) continue;
    seen.add(placement.registryKey);
    records.push({
      registryKey: placement.registryKey,
      revision,
      partClass: placement.partClass,
      partType: placement.partType,
      definitionId: placement.definitionId
    });
  }
  return Object.freeze({
    revision,
    hash,
    size: records.length,
    records: clone(records),
    list() { return clone(records); },
    get(registryKey) { return clone(records.find((record) => record.registryKey === registryKey) ?? null); }
  });
}

export function createConstructionFixture(plan, transform = createFixtureWorldTransform(0), registry = createPartRegistryFixture(plan)) {
  const placementRecords = listPlanPlacementRecords(plan);
  const requiredPlacementIds = placementRecords.map((record) => record.placementId);
  const normalisedBuild = {
    schemaVersion: 'robo-bridge.normalised-construction.v1',
    planId: plan.planId,
    designChecksum: plan.designChecksum,
    designRevision: plan.designRevision,
    partRegistryRevision: registry.revision,
    partRegistryHash: registry.hash,
    placements: placementRecords.map((record) => ({
      placementId: record.placementId,
      constructionPlacementId: record.placementId,
      streamPlacementId: record.placementId,
      targetId: record.placementId,
      registryKey: record.registryKey,
      partClass: record.partClass,
      partType: record.partType,
      definitionId: record.definitionId
    }))
  };
  const targetSet = {
    schemaVersion: 'robo-bridge.buildboard-targets.v1',
    blueprintId: plan.planId,
    planId: plan.planId,
    designChecksum: plan.designChecksum,
    designRevision: plan.designRevision,
    partRegistryRevision: registry.revision,
    partRegistryHash: registry.hash,
    targets: placementRecords.map((record) => ({
      id: record.placementId,
      targetId: record.placementId,
      placementId: record.placementId,
      registryKey: record.registryKey,
      partClass: record.partClass,
      partType: record.partType,
      definitionId: record.definitionId
    }))
  };
  const frozenPlan = {
    schemaVersion: 'robo-bridge.frozen-construction-plan.v1',
    buildPlan: plan,
    planId: plan.planId,
    designChecksum: plan.designChecksum,
    designRevision: plan.designRevision,
    worldTransform: clone(transform),
    requiredPlacementIds,
    partRegistryRevision: registry.revision,
    partRegistryHash: registry.hash,
    freezeChecksum: 'freeze_fixture_train_adapter_v1'
  };
  return { frozenPlan, normalisedBuild, targetSet, registry, requiredPlacementIds };
}

function acceptedRecord(record, supportedColumns, includeTrack, gridMinX) {
  if (record.partClass === 'TRACK_SEGMENT') return includeTrack;
  return record.gridX < gridMinX + supportedColumns;
}

export function createBuildBoardFixture(plan, {
  supportedColumns = plan.geometry.grid.width,
  includeTrack = false,
  worldRevision = 1,
  blueprintId = plan.planId,
  designChecksum = plan.designChecksum,
  omitLastTarget = false,
  addUnknownAccepted = false,
  includeExplicitAcceptedIds = true
} = {}) {
  const records = listPlanPlacementRecords(plan);
  if (omitLastTarget) records.pop();
  const acceptedPlacementIds = [];
  const targets = records.map((record, index) => {
    const accepted = acceptedRecord(record, supportedColumns, includeTrack, Number(plan.geometry.grid.gridMinX ?? 0));
    if (accepted) acceptedPlacementIds.push(record.placementId);
    return {
      id: record.placementId,
      targetId: record.placementId,
      placementId: record.placementId,
      occupiedBy: accepted ? `brick_${index}` : null,
      placedBrickId: accepted ? `brick_${index}` : null,
      correctness: accepted,
      status: accepted ? 'correct' : 'unfilled'
    };
  });
  if (addUnknownAccepted) acceptedPlacementIds.push('unknown.plan.placement');
  const board = {
    schemaVersion: 'fixture-live-buildboard.v1',
    blueprintId,
    designChecksum,
    worldRevision,
    targets,
    freePlacements: [],
    getTargets() { return clone(targets); },
    getPlacements() { return []; }
  };
  if (includeExplicitAcceptedIds) board.acceptedPlacementIds = [...acceptedPlacementIds];
  return board;
}

export function createChallengeServiceFixture({
  plan,
  transform,
  routeMethod = 'getTrackRoute',
  includeBridgeTransform = true,
  routeOffset = {},
  routeLengthOffsetMm = 0,
  collisionBoxes = [],
  floorOffsetMm = -140,
  presetId = 'FIXTURE'
} = {}) {
  const frame = createRouteFrame({ frozenBuildPlan: plan, worldTransform: transform });
  const offset = {
    xMm: Number(routeOffset.xMm ?? 0),
    yMm: Number(routeOffset.yMm ?? 0),
    zMm: Number(routeOffset.zMm ?? 0)
  };
  const start = {
    x: frame.startMachineMm.xMm + offset.xMm,
    y: frame.startMachineMm.yMm + offset.yMm,
    z: frame.startMachineMm.zMm + offset.zMm
  };
  const end = {
    x: frame.endMachineMm.xMm + offset.xMm,
    y: frame.endMachineMm.yMm + offset.yMm,
    z: frame.endMachineMm.zMm + offset.zMm
  };
  const route = {
    schemaVersion: 'fixture-track-route.v1',
    id: `route.${presetId}`,
    coordinateFrame: 'machine-mm-rad',
    start,
    end,
    direction: { ...frame.forward },
    lengthMm: frame.lengthMm + routeLengthOffsetMm,
    deckZMm: start.z,
    segments: [{ id: 'bridge-crossing', start, end, supportedBy: 'BuildBoard-derived support map' }]
  };
  const entry = { coordinateFrame: 'machine-mm-rad', position: start };
  const exit = { coordinateFrame: 'machine-mm-rad', position: end };
  const collisionProxy = {
    schemaVersion: 'robo-bridge.challenge-collision.v1',
    machine: {
      coordinateFrame: 'machine-mm-rad',
      floorZMm: frame.trackTopMachineZMm + floorOffsetMm,
      proxies: clone(collisionBoxes)
    }
  };
  const service = {
    getState() {
      return {
        presetId,
        coordinateFrame: { id: 'machine-mm-rad' },
        trackRoute: clone(route),
        entry: clone(entry),
        exit: clone(exit),
        bridgeTransform: includeBridgeTransform ? clone(transform) : null
      };
    },
    getEntry() { return clone(entry); },
    getExit() { return clone(exit); },
    getCollisionProxy() { return clone(collisionProxy); }
  };
  service[routeMethod] = () => clone(route);
  if (includeBridgeTransform) service.getBridgeTransform = () => clone(transform);
  return { service: Object.freeze(service), route, frame, collisionProxy };
}

export function createFullIntegrationFixture(options = {}) {
  const plan = options.plan ?? createIntegrationPlan();
  const transform = options.transform ?? createIntegrationTransform(options.transformOptions);
  const construction = createConstructionFixture(plan, transform, options.registry ?? createPartRegistryFixture(plan));
  const board = options.board ?? createBuildBoardFixture(plan, options.boardOptions);
  const challenge = createChallengeServiceFixture({ plan, transform, ...(options.challengeOptions || {}) });
  return { plan, transform, construction, board, challenge };
}

export { fixturePlacementId, fixtureTrackPlacementId };
