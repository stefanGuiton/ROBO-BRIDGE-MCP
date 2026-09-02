'use strict';

import {
  checksumHex,
  cloneValue,
  compareIdSets,
  deepFreezePlain,
  invariant,
  sortedUniqueIds,
  unwrapFrozenPlan
} from './internal.js';

function placementId(value, label) {
  const candidates = [value?.placementId, value?.constructionPlacementId, value?.streamPlacementId, value?.targetId, value?.id]
    .filter((item) => item !== undefined && item !== null)
    .map(String);
  invariant(candidates.length > 0 && candidates[0], 'PLACEMENT_IDENTITY_MISSING', `${label} has no placement ID.`);
  invariant(candidates.every((id) => id === candidates[0]), 'PLACEMENT_IDENTITY_MISMATCH', `${label} contains different placement IDs.`, {
    ids: candidates
  });
  return candidates[0];
}

function sourceIds(source, label) {
  if (!source) return null;
  if (Array.isArray(source)) return sortedUniqueIds(source, label);
  const records = source.placements ?? source.entries ?? source.targets;
  if (!Array.isArray(records)) return null;
  return sortedUniqueIds(records.map((record, index) => placementId(record, `${label}[${index}]`)), label);
}

function identityFields(source = {}) {
  return {
    planId: source.planId ?? source.blueprintId ?? null,
    designChecksum: source.designChecksum ?? null,
    designRevision: source.designRevision ?? null,
    partRegistryRevision: source.partRegistryRevision ?? null,
    partRegistryHash: source.partRegistryHash ?? null
  };
}

function assertPlanIdentity(source, label, plan) {
  if (!source) return;
  const identity = identityFields(source);
  invariant(!identity.planId || identity.planId === plan.planId, 'STALE_CONSTRUCTION_IDENTITY', `${label} has a different plan ID.`, {
    expected: plan.planId,
    received: identity.planId
  });
  invariant(!identity.designChecksum || identity.designChecksum === plan.designChecksum,
    'STALE_CONSTRUCTION_IDENTITY', `${label} has a different design checksum.`, {
      expected: plan.designChecksum,
      received: identity.designChecksum
    });
  invariant(identity.designRevision === null || identity.designRevision === undefined || identity.designRevision === plan.designRevision,
    'STALE_CONSTRUCTION_IDENTITY', `${label} has a different design revision.`, {
      expected: plan.designRevision,
      received: identity.designRevision
    });
}

function registryRecords(partRegistry) {
  if (typeof partRegistry?.list === 'function') return partRegistry.list();
  if (Array.isArray(partRegistry?.records)) return cloneValue(partRegistry.records);
  if (Array.isArray(partRegistry?.identity?.records)) return cloneValue(partRegistry.identity.records);
  return [];
}

function validateRegistry({ partRegistry, expectedRevision, expectedHash, normalisedBuild, requirePartRegistry }) {
  if (!partRegistry) {
    invariant(!requirePartRegistry, 'PART_REGISTRY_REQUIRED', 'The frozen Construction identity requires PartRegistry.', {
      expectedRevision,
      expectedHash
    });
    return null;
  }
  invariant(partRegistry.revision && partRegistry.hash, 'PART_REGISTRY_INVALID', 'PartRegistry must expose revision and hash.');
  invariant(!expectedRevision || partRegistry.revision === expectedRevision, 'STALE_PART_REGISTRY', 'PartRegistry revision does not match the frozen Construction plan.', {
    expected: expectedRevision,
    received: partRegistry.revision
  });
  invariant(!expectedHash || partRegistry.hash === expectedHash, 'STALE_PART_REGISTRY', 'PartRegistry hash does not match the frozen Construction plan.', {
    expected: expectedHash,
    received: partRegistry.hash
  });
  const records = registryRecords(partRegistry);
  if (normalisedBuild?.placements?.length && records.length) {
    const keys = new Set(records.map((record) => record.registryKey).filter(Boolean));
    const missingKeys = [...new Set(normalisedBuild.placements.map((record) => record.registryKey).filter(Boolean))]
      .filter((key) => !keys.has(key)).sort();
    invariant(missingKeys.length === 0, 'PART_REGISTRY_INCOMPATIBLE', 'PartRegistry does not contain all Construction registry keys.', {
      missingKeys: missingKeys.slice(0, 12),
      missingCount: missingKeys.length
    });
  }
  return {
    revision: partRegistry.revision,
    hash: partRegistry.hash,
    recordCount: Number(partRegistry.size ?? records.length),
    verified: true
  };
}

export function validatePlacementIdentityCompatibility({
  frozenPlan,
  normalisedBuild = null,
  targetSet = null,
  expectedPlacementIds = null,
  partRegistry = null,
  requirePartRegistry
} = {}) {
  const { buildPlan, frozenEnvelope } = unwrapFrozenPlan(frozenPlan);
  assertPlanIdentity(frozenEnvelope, 'Frozen Construction plan', buildPlan);
  assertPlanIdentity(normalisedBuild, 'Normalised Construction', buildPlan);
  assertPlanIdentity(targetSet, 'BuildBoard target set', buildPlan);

  const candidates = [];
  const frozenIds = sourceIds(frozenEnvelope?.requiredPlacementIds, 'frozen requiredPlacementIds');
  const buildIds = sourceIds(normalisedBuild, 'normalised Construction placements');
  const targetIds = sourceIds(targetSet, 'BuildBoard targets');
  const explicitIds = sourceIds(expectedPlacementIds, 'expected placement IDs');
  if (frozenIds) candidates.push(['frozenPlan.requiredPlacementIds', frozenIds]);
  if (buildIds) candidates.push(['normalisedBuild.placements', buildIds]);
  if (targetIds) candidates.push(['targetSet.targets', targetIds]);
  if (explicitIds) candidates.push(['expectedPlacementIds', explicitIds]);
  invariant(candidates.length > 0, 'PLACEMENT_IDENTITY_MISSING', 'Construction must supply required placement IDs, normalised placements, or BuildBoard targets.');

  const [authoritySource, authorityIds] = candidates[0];
  for (const [source, ids] of candidates.slice(1)) {
    const comparison = compareIdSets(authorityIds, ids);
    invariant(comparison.matches, 'PLACEMENT_IDENTITY_MISMATCH', `${source} does not match ${authoritySource}.`, {
      missing: comparison.missing.slice(0, 12),
      unexpected: comparison.unexpected.slice(0, 12),
      missingCount: comparison.missing.length,
      unexpectedCount: comparison.unexpected.length
    });
  }

  const envelopeIdentity = identityFields(frozenEnvelope || {});
  const buildIdentity = identityFields(normalisedBuild || {});
  const targetIdentity = identityFields(targetSet || {});
  const expectedRevision = envelopeIdentity.partRegistryRevision || buildIdentity.partRegistryRevision || targetIdentity.partRegistryRevision;
  const expectedHash = envelopeIdentity.partRegistryHash || buildIdentity.partRegistryHash || targetIdentity.partRegistryHash;
  const registry = validateRegistry({
    partRegistry,
    expectedRevision,
    expectedHash,
    normalisedBuild,
    requirePartRegistry: requirePartRegistry ?? Boolean(expectedRevision || expectedHash)
  });

  return deepFreezePlain({
    schemaVersion: 'robo-bridge.train-placement-identity.v1',
    planId: buildPlan.planId,
    designChecksum: buildPlan.designChecksum,
    designRevision: buildPlan.designRevision,
    freezeChecksum: frozenEnvelope?.freezeChecksum ?? null,
    placementCount: authorityIds.length,
    placementIds: authorityIds,
    placementChecksum: checksumHex(authorityIds),
    authoritySource,
    checkedSources: candidates.map(([source, ids]) => ({ source, count: ids.length, checksum: checksumHex(ids) })),
    partRegistry: registry
  });
}

function acceptedTarget(target) {
  if (!target || typeof target !== 'object') return false;
  if (target.accepted === true || target.state === 'accepted') return true;
  const occupied = Boolean(target.occupiedBy ?? target.placedBrickId ?? target.brickId);
  if (target.correctness === true && occupied) return true;
  if ((target.status === 'correct' || target.status === 'accepted') && occupied) return true;
  return false;
}

function boardData(source) {
  const targets = typeof source?.getTargets === 'function'
    ? source.getTargets()
    : cloneValue(source?.targets ?? source?.buildState?.targets ?? []);
  const freePlacements = typeof source?.getPlacements === 'function'
    ? source.getPlacements()
    : cloneValue(source?.freePlacements ?? source?.placements ?? source?.buildState?.freePlacements ?? []);
  const blueprintId = source?.blueprintId ?? source?.planId ?? source?.buildState?.blueprintId ?? null;
  const designChecksum = source?.designChecksum ?? source?.buildState?.designChecksum ?? null;
  const worldRevision = Number(source?.worldRevision ?? source?.buildState?.worldRevision);
  return { targets, freePlacements, blueprintId, designChecksum, worldRevision };
}

export function createAuthoritativeBuildBoardSnapshot({
  frozenPlan,
  buildBoard = null,
  buildBoardSnapshot = null,
  normalisedBuild = null,
  targetSet = null,
  expectedPlacementIds = null,
  partRegistry = null,
  requirePartRegistry,
  allowIdOnlySnapshot = false
} = {}) {
  const source = buildBoard ?? buildBoardSnapshot;
  invariant(source && typeof source === 'object', 'BUILD_BOARD_REQUIRED', 'An authoritative BuildBoard or BuildBoard snapshot is required.');
  const { buildPlan } = unwrapFrozenPlan(frozenPlan);
  const identity = validatePlacementIdentityCompatibility({
    frozenPlan,
    normalisedBuild,
    targetSet,
    expectedPlacementIds,
    partRegistry,
    requirePartRegistry
  });
  const board = boardData(source);
  invariant(board.blueprintId, 'BUILD_BOARD_IDENTITY_MISSING', 'BuildBoard must expose blueprintId.');
  invariant(board.blueprintId === buildPlan.planId, 'STALE_BUILD_BOARD_PLAN', 'BuildBoard belongs to a different frozen plan.', {
    expected: buildPlan.planId,
    received: board.blueprintId
  });
  invariant(!board.designChecksum || board.designChecksum === buildPlan.designChecksum,
    'STALE_BUILD_BOARD_CHECKSUM', 'BuildBoard design checksum does not match the frozen plan.', {
      expected: buildPlan.designChecksum,
      received: board.designChecksum
    });
  invariant(Number.isSafeInteger(board.worldRevision) && board.worldRevision >= 0,
    'BUILD_BOARD_REVISION_INVALID', 'BuildBoard worldRevision must be a non-negative safe integer.', {
      worldRevision: board.worldRevision
    });

  const hasTargets = Array.isArray(board.targets) && board.targets.length > 0;
  invariant(hasTargets || allowIdOnlySnapshot, 'BUILD_BOARD_TARGETS_REQUIRED', 'BuildBoard snapshot must contain the complete target set.');
  const targetIds = hasTargets
    ? sortedUniqueIds(board.targets.map((target, index) => placementId(target, `BuildBoard target[${index}]`)), 'BuildBoard target IDs')
    : [];
  if (hasTargets) {
    const comparison = compareIdSets(identity.placementIds, targetIds);
    invariant(comparison.matches, 'STALE_BUILD_BOARD_TARGETS', 'BuildBoard target set does not match the frozen Construction identity.', {
      missing: comparison.missing.slice(0, 12),
      unexpected: comparison.unexpected.slice(0, 12),
      missingCount: comparison.missing.length,
      unexpectedCount: comparison.unexpected.length
    });
  }

  const derivedAccepted = hasTargets
    ? board.targets.filter(acceptedTarget).map((target, index) => placementId(target, `accepted BuildBoard target[${index}]`))
    : [];
  for (const record of board.freePlacements || []) {
    if (record?.accepted !== true) continue;
    const id = record.placementId ?? record.targetId;
    if (id) derivedAccepted.push(String(id));
  }
  const explicitAccepted = source.acceptedPlacementIds instanceof Set
    ? [...source.acceptedPlacementIds].map(String)
    : Array.isArray(source.acceptedPlacementIds) ? source.acceptedPlacementIds.map(String) : null;
  if (hasTargets && explicitAccepted) {
    const comparison = compareIdSets([...new Set(derivedAccepted)].sort(), [...new Set(explicitAccepted)].sort());
    invariant(comparison.matches, 'BUILD_BOARD_ACCEPTED_STATE_CONFLICT', 'BuildBoard targets and acceptedPlacementIds disagree.', {
      missingFromExplicit: comparison.missing.slice(0, 12),
      unexpectedExplicit: comparison.unexpected.slice(0, 12)
    });
  }
  const acceptedIds = sortedUniqueIds(
    hasTargets ? [...new Set(derivedAccepted)] : [...new Set(explicitAccepted || [])],
    'accepted BuildBoard placement IDs'
  );
  const unknownAccepted = acceptedIds.filter((id) => !identity.placementIds.includes(id));
  invariant(unknownAccepted.length === 0, 'BUILD_BOARD_UNKNOWN_ACCEPTED_PLACEMENT', 'BuildBoard accepts placements outside the frozen plan.', {
    unknownAccepted: unknownAccepted.slice(0, 12),
    unknownCount: unknownAccepted.length
  });

  return deepFreezePlain({
    schemaVersion: 'robo-bridge.accepted-buildboard-snapshot.v1',
    blueprintId: buildPlan.planId,
    planId: buildPlan.planId,
    designChecksum: buildPlan.designChecksum,
    designRevision: buildPlan.designRevision,
    freezeChecksum: identity.freezeChecksum,
    partRegistryRevision: identity.partRegistry?.revision ?? null,
    partRegistryHash: identity.partRegistry?.hash ?? null,
    worldRevision: board.worldRevision,
    acceptedPlacementIds: acceptedIds,
    acceptedChecksum: checksumHex(acceptedIds),
    targetCount: hasTargets ? targetIds.length : identity.placementCount,
    targetChecksum: hasTargets ? checksumHex(targetIds) : identity.placementChecksum,
    requiredPlacementCount: identity.placementCount,
    placementIdentityChecksum: identity.placementChecksum,
    identityVerified: true,
    source: typeof source.getTargets === 'function' ? 'BuildBoard.getTargets' : 'immutable-BuildBoard-snapshot'
  });
}
