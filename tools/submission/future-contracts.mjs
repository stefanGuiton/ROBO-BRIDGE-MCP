'use strict';

function uniqueStrings(value) {
  return Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === 'string' && item.length > 0))] : [];
}

function covers(required, supported) {
  const available = new Set(uniqueStrings(supported));
  return uniqueStrings(required).every((item) => available.has(item));
}

function sharedAuthority(evidence, directFlag, sharedId, humanId, codexId) {
  if (evidence?.[directFlag] === true) return true;
  const shared = evidence?.[sharedId];
  return Boolean(shared && evidence?.[humanId] === shared && evidence?.[codexId] === shared);
}

export function validateConstruction(evidence) {
  const errors = [];
  if (!evidence || typeof evidence !== 'object') return ['evidence is not an object'];
  if (!evidence.frozenPlanId) errors.push('frozenPlanId is missing');
  if (!evidence.frozenChecksum) errors.push('frozenChecksum is missing');
  if (!Array.isArray(evidence.requiredPlacementIds) || !evidence.requiredPlacementIds.length) errors.push('requiredPlacementIds is empty');
  if (!Array.isArray(evidence.buildBoardTargetIds)) errors.push('buildBoardTargetIds is missing');
  if (Array.isArray(evidence.requiredPlacementIds) && Array.isArray(evidence.buildBoardTargetIds)) {
    const required = [...evidence.requiredPlacementIds].sort();
    const targets = [...evidence.buildBoardTargetIds].sort();
    if (JSON.stringify(required) !== JSON.stringify(targets)) errors.push('BuildBoard target IDs do not match required placement IDs');
  }

  const registryShared = sharedAuthority(evidence, 'sharedPartRegistry', 'partRegistryId', 'humanPartRegistryId', 'codexPartRegistryId');
  const inventoryShared = sharedAuthority(evidence, 'sharedInventory', 'inventoryId', 'humanInventoryId', 'codexInventoryId');
  if (!registryShared) errors.push('human and Codex do not use one shared PartRegistry');
  if (!inventoryShared) errors.push('human and Codex do not use one shared inventory');

  const heroPartClasses = uniqueStrings(evidence.heroPartClasses);
  const humanClasses = evidence.actorPartClasses?.human ?? evidence.humanSupportedPartClasses;
  const codexClasses = evidence.actorPartClasses?.codex ?? evidence.codexSupportedPartClasses;
  const classCoverage = evidence.bothActorsCanUseEveryHeroPartClass === true
    || (heroPartClasses.length > 0 && covers(heroPartClasses, humanClasses) && covers(heroPartClasses, codexClasses));
  if (!heroPartClasses.length) errors.push('heroPartClasses is empty');
  if (!classCoverage) errors.push('both actors cannot use every hero part class');

  for (const [key, message] of [
    ['humanPlacementAccepted', 'human placement was not accepted'],
    ['codexPlacementAccepted', 'Codex placement was not accepted'],
    ['sameBuildBoard', 'human and Codex placements are not on one BuildBoard'],
    ['sourceReassignmentWorked', 'source reassignment did not work'],
    ['humanTakeoverWorked', 'human takeover did not work'],
    ['worldRevisionAuthoritative', 'world revision was not authoritative'],
    ['cancellationWorked', 'cancellation did not work'],
    ['resetWorked', 'construction reset did not work']
  ]) if (evidence[key] !== true) errors.push(message);
  if (!Number.isFinite(evidence.humanContributionCount) || evidence.humanContributionCount <= 0) errors.push('human contribution count did not increment');
  if (!Number.isFinite(evidence.codexContributionCount) || evidence.codexContributionCount <= 0) errors.push('Codex contribution count did not increment');
  return errors;
}

export function validateSourceReassignment(evidence) {
  const errors = [];
  if (!evidence || typeof evidence !== 'object') return ['evidence is not an object'];
  if (!evidence.originalSourceId) errors.push('originalSourceId is missing');
  if (!evidence.replacementSourceId) errors.push('replacementSourceId is missing');
  if (evidence.originalSourceId && evidence.originalSourceId === evidence.replacementSourceId) errors.push('replacement source did not change');
  if (!evidence.placementId) errors.push('placementId is missing');
  if (!Array.isArray(evidence.worldRevisions) || evidence.worldRevisions.length < 2) errors.push('world revision evidence is missing');
  if (evidence.finalAcceptedTarget !== true) errors.push('final target was not accepted');
  if (evidence.missionReset === true) errors.push('mission reset during reassignment');
  return errors;
}

export function validateTrainFailure(evidence) {
  const errors = [];
  if (!evidence || typeof evidence !== 'object') return ['evidence is not an object'];
  if (evidence.outcome !== 'TRAIN_FELL') errors.push('outcome is not TRAIN_FELL');
  if (evidence.firstUnsupportedSegment === null || evidence.firstUnsupportedSegment === undefined) errors.push('first unsupported segment is missing');
  if (evidence.supportSource !== 'AUTHORITATIVE_BUILD_BOARD_SNAPSHOT') errors.push('support did not come from the authoritative BuildBoard snapshot');
  if (evidence.hardcodedFailurePosition === true) errors.push('failure used a hardcoded position');
  if (evidence.resetClean !== true) errors.push('train did not reset cleanly');
  return errors;
}

export function validateTrainSuccess(evidence) {
  const errors = [];
  if (!evidence || typeof evidence !== 'object') return ['evidence is not an object'];
  if (evidence.outcome !== 'CROSSED') errors.push('outcome is not CROSSED');
  if (evidence.reachedExit !== true) errors.push('train did not reach exit');
  if (evidence.routeFullySupported !== true) errors.push('support route was not fully supported');
  if (evidence.supportSource !== 'AUTHORITATIVE_BUILD_BOARD_SNAPSHOT') errors.push('support did not come from the authoritative BuildBoard snapshot');
  if (evidence.directCompletionFlagUsed === true) errors.push('a direct completion flag was used');
  return errors;
}

export function validateMission(evidence) {
  const errors = [];
  if (!evidence || typeof evidence !== 'object') return ['evidence is not an object'];
  const required = ['DESIGN', 'BUILD', 'TEST', 'BUILD', 'TEST', 'COMPLETE', 'RESET'];
  let cursor = 0;
  for (const phase of evidence.phaseHistory ?? []) if (cursor < required.length && phase === required[cursor]) cursor += 1;
  if (cursor !== required.length) errors.push('phase history does not include DESIGN→BUILD→TEST→BUILD→TEST→COMPLETE→RESET');
  if (evidence.firstTestOutcome !== 'TRAIN_FELL') errors.push('first TEST did not produce TRAIN_FELL');
  if (evidence.finalTrainOutcome !== 'CROSSED') errors.push('final TEST did not produce CROSSED');
  if (evidence.completePrecededByCrossed !== true) errors.push('COMPLETE was not gated by CROSSED');
  if (evidence.nonCrossedOutcomeProducedComplete === true) errors.push('a non-CROSSED outcome produced COMPLETE');
  if (evidence.resetPhase !== 'DESIGN') errors.push('reset did not return to DESIGN');
  if (!evidence.previousMissionId || !evidence.newMissionId || evidence.previousMissionId === evidence.newMissionId) errors.push('reset did not create a new missionId');
  return errors;
}

// Kept as a reusable package contract. Current EASY coverage is now direct and is not provider-gated.
export function validateTerrain(evidence) {
  const errors = [];
  if (!evidence || typeof evidence !== 'object') return ['evidence is not an object'];
  if (evidence.easyTerrainAvailable !== true) errors.push('curated EASY terrain is not available');
  if (evidence.entryExitAligned !== true) errors.push('terrain ENTRY and EXIT are not aligned with the bridge challenge');
  return errors;
}

export function validateHero(evidence) {
  const errors = [];
  if (!evidence || typeof evidence !== 'object') return ['evidence is not an object'];
  if (evidence.phase !== 'COMPLETE') errors.push('phase is not COMPLETE');
  if (evidence.trainOutcome !== 'CROSSED') errors.push('train outcome is not CROSSED');
  if (!evidence.frozenPlanId) errors.push('frozenPlanId is missing');
  if (!evidence.frozenChecksum) errors.push('frozenChecksum is missing');
  if (evidence.testedPlanId !== evidence.frozenPlanId) errors.push('testedPlanId does not equal frozenPlanId');
  if (evidence.testedChecksum !== evidence.frozenChecksum) errors.push('testedChecksum does not equal frozenChecksum');
  if (evidence.supportSource !== 'AUTHORITATIVE_BUILD_BOARD_SNAPSHOT') errors.push('support source is not the authoritative BuildBoard snapshot');
  if (evidence.robotIdle !== true) errors.push('robot is not idle');
  if (evidence.gripperEmpty !== true) errors.push('gripper is not empty');
  if ('incorrectPlacements' in evidence && evidence.incorrectPlacements !== 0) errors.push('incorrect placements are not zero');
  if (evidence.requiredStructureComplete !== true) errors.push('accepted required structure is incomplete');
  return errors;
}

export function validateAdversarial(evidence) {
  const errors = [];
  if (!evidence || typeof evidence !== 'object') return ['evidence is not an object'];
  if (evidence.rejected !== true) errors.push('request was not rejected');
  if (evidence.authorityPreserved !== true) errors.push('authoritative state was not preserved');
  if (evidence.expectedReasonMatched !== true) errors.push('rejection reason did not match');
  return errors;
}

export function validateIntegratedReset(evidence) {
  const errors = [];
  if (!evidence || typeof evidence !== 'object') return ['evidence is not an object'];
  for (const [key, message] of [
    ['listenersStable', 'listeners grew'],
    ['timersStable', 'timers grew'],
    ['trainBodiesStable', 'train bodies leaked'],
    ['couplersStable', 'couplers leaked'],
    ['sceneObjectsStable', 'scene objects leaked'],
    ['placementStreamsCleared', 'placement streams were not cleared'],
    ['claimsCleared', 'claims were not cleared'],
    ['missionEventsCleared', 'mission events were not cleared'],
    ['stalePlanIdentityCleared', 'stale plan identity remained'],
    ['webMcpRegistrationsStable', 'WebMCP registration duplicated']
  ]) if (evidence[key] !== true) errors.push(message);
  return errors;
}
