'use strict';

import { deepFreeze, invariant, normaliseActor } from './internal.js';

export function getBridgeBuildProgress({ buildBoard, normalisedBuild } = {}) {
  invariant(buildBoard && typeof buildBoard.getTargets === 'function', 'INVALID_SETTINGS', 'The existing BuildBoard is required.');
  invariant(Array.isArray(normalisedBuild?.placements), 'INVALID_SETTINGS', 'A normalised bridge construction is required.');
  const targets = new Map(buildBoard.getTargets().map((target) => [target.targetId ?? target.id, target]));
  const byPartClass = {};
  const byActor = { human: 0, agent: 0, unknown: 0 };
  let completed = 0;
  for (const placement of normalisedBuild.placements) {
    const target = targets.get(placement.placementId);
    const accepted = Boolean(target?.occupiedBy && target?.correctness !== false);
    if (!byPartClass[placement.partClass]) byPartClass[placement.partClass] = { total: 0, completed: 0 };
    byPartClass[placement.partClass].total += 1;
    if (!accepted) continue;
    completed += 1;
    byPartClass[placement.partClass].completed += 1;
    const actor = normaliseActor(target.completedBy);
    byActor[actor ?? 'unknown'] += 1;
  }
  const total = normalisedBuild.placements.length;
  return deepFreeze({
    schemaVersion: 'robo-bridge.build-progress.v1',
    planId: normalisedBuild.planId,
    designChecksum: normalisedBuild.designChecksum,
    worldRevision: buildBoard.worldRevision,
    completed,
    remaining: Math.max(0, total - completed),
    total,
    fraction: total ? completed / total : 1,
    percent: total ? completed / total * 100 : 100,
    status: completed === total ? 'complete' : completed ? 'building' : 'ready',
    contributions: byActor,
    byPartClass
  });
}

export function acceptedPlacementMap(buildBoard) {
  const result = new Map();
  for (const target of buildBoard.getTargets()) {
    if (target.occupiedBy && target.correctness !== false) {
      result.set(target.targetId ?? target.id, target.occupiedBy);
    }
  }
  return result;
}
