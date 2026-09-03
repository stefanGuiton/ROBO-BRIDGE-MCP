import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  STATUS,
  auditResponseSize,
  auditToolDefinitions,
  blockingTests,
  deriveOverallStatus,
  extractLastJsonObject,
  makeTest,
  parseTapSummary,
  percentile,
  summarizeTests
} from '../../tools/submission/core.mjs';
import {
  inspectEasyRuntime,
  inspectExactHologramIdentity,
  sameChallengeCalibration
} from '../../tools/submission/current-contracts.mjs';
import {
  validateAdversarial,
  validateConstruction,
  validateHero,
  validateIntegratedReset,
  validateMission,
  validateSourceReassignment,
  validateTerrain,
  validateTrainFailure,
  validateTrainSuccess
} from '../../tools/submission/browser-suite.mjs';

test('submission states keep unavailable future work separate from pass', () => {
  const tests = [
    makeTest({ id: 'a', area: 'STATIC', status: STATUS.PASS }),
    makeTest({ id: 'b', area: 'HERO LOOP', status: STATUS.NOT_AVAILABLE, required: false, reason: 'MISSING' }),
    makeTest({ id: 'c', area: 'EVIDENCE', status: STATUS.SKIPPED_WITH_REASON, required: false, reason: 'EXPLICIT_ONLY' })
  ];
  assert.deepEqual(summarizeTests(tests), {
    PASS: 1,
    FAIL: 0,
    NOT_AVAILABLE: 1,
    SKIPPED_WITH_REASON: 1,
    total: 3
  });
  assert.equal(deriveOverallStatus(tests), STATUS.PASS);
  tests[1].required = true;
  assert.equal(deriveOverallStatus(tests), STATUS.FAIL);
  assert.equal(blockingTests(tests).length, 1);
});

test('tool catalogues keep 19 configurable instead of permanent', async () => {
  const catalogues = JSON.parse(await readFile(new URL('../../tools/submission/catalogues.json', import.meta.url), 'utf8'));
  assert.equal(catalogues.minimum.minimum, 19);
  assert.equal(catalogues.current.minimum, 19);
  assert.equal(catalogues.current.exact, 19);
  assert.equal(catalogues.final.exact, undefined);
  assert.equal(catalogues.final.targetApprox, 31);
  assert.equal(new Set(catalogues.final.requiredNames).size, 31);
  for (const name of ['request_more_bricks', 'get_scene_settings', 'update_scene_settings']) {
    assert.ok(catalogues.final.requiredNames.includes(name));
  }
  assert.ok(catalogues.final.requiredNames.includes('get_bridge_build_plan'));
});

test('tool audit detects duplicates, invalid schema, missing execute and annotation risk', () => {
  const tools = [
    {
      name: 'plan_placement_queue',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute() {}
    },
    {
      name: 'plan_placement_queue',
      inputSchema: { type: 'object', properties: {}, required: ['missing'] },
      annotations: {}
    }
  ];
  const audit = auditToolDefinitions(tools, { minimum: 2, requiredNames: ['plan_placement_queue'] });
  assert.equal(audit.ok, false);
  assert.deepEqual(audit.duplicateNames, ['plan_placement_queue']);
  assert.ok(audit.invalid.some((item) => item.issues.includes('EXECUTE_MISSING')));
  assert.ok(audit.invalid.some((item) => item.issues.some((issue) => issue.includes('MISSING_PROPERTY'))));
  assert.equal(audit.annotations[0].risk, 'HIGH');
  const resolved = auditToolDefinitions([{ ...tools[0], annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false } }], { minimum: 1 });
  assert.equal(resolved.annotations[0].risk, 'LOW');
});

test('response-size audit reports characters, bytes, truncation and paging', () => {
  const result = auditResponseSize({
    tool: 'example',
    scenario: 'normal',
    value: { ok: true, truncated: true, nextCursor: 10, text: '£'.repeat(1_600) }
  });
  assert.ok(result.characters > 1_500);
  assert.ok(result.bytes > result.characters);
  assert.equal(result.truncated, true);
  assert.equal(result.pageable, true);
  assert.equal(result.severity, 'OVERSIZED');
});

test('TAP, JSON and percentile helpers are deterministic', () => {
  const tap = parseTapSummary('TAP version 13\n# tests 12\n# pass 11\n# fail 1\n');
  assert.equal(tap.tests, 12);
  assert.equal(tap.pass, 11);
  assert.equal(tap.fail, 1);
  assert.deepEqual(extractLastJsonObject('noise\n{"a":1}\n'), { a: 1 });
  assert.equal(percentile([10, 20, 30, 40], 0.95), 40);
});

test('construction and source reassignment contracts require shared authority evidence', () => {
  const construction = {
    frozenPlanId: 'plan-1',
    frozenChecksum: 'sum-1',
    requiredPlacementIds: ['p1', 'p2'],
    buildBoardTargetIds: ['p2', 'p1'],
    humanPlacementAccepted: true,
    codexPlacementAccepted: true,
    sameBuildBoard: true,
    sharedPartRegistry: true,
    sharedInventory: true,
    heroPartClasses: ['STANDARD_BRICK', 'CUSTOM_ARCH', 'TRACK_SEGMENT'],
    actorPartClasses: {
      human: ['STANDARD_BRICK', 'CUSTOM_ARCH', 'TRACK_SEGMENT'],
      codex: ['TRACK_SEGMENT', 'STANDARD_BRICK', 'CUSTOM_ARCH']
    },
    humanContributionCount: 1,
    codexContributionCount: 1,
    sourceReassignmentWorked: true,
    humanTakeoverWorked: true,
    worldRevisionAuthoritative: true,
    cancellationWorked: true,
    resetWorked: true
  };
  assert.deepEqual(validateConstruction(construction), []);
  assert.ok(validateConstruction({ ...construction, sameBuildBoard: false }).length > 0);
  const reassignment = {
    originalSourceId: 'source-a',
    replacementSourceId: 'source-b',
    placementId: 'placement-1',
    worldRevisions: [8, 9, 10],
    finalAcceptedTarget: true,
    missionReset: false
  };
  assert.deepEqual(validateSourceReassignment(reassignment), []);
  assert.ok(validateSourceReassignment({ ...reassignment, replacementSourceId: 'source-a' }).length > 0);
});

test('train contracts distinguish genuine failure from supported crossing', () => {
  assert.deepEqual(validateTrainFailure({
    outcome: 'TRAIN_FELL',
    firstUnsupportedSegment: 4,
    supportSource: 'AUTHORITATIVE_BUILD_BOARD_SNAPSHOT',
    hardcodedFailurePosition: false,
    resetClean: true
  }), []);
  assert.deepEqual(validateTrainSuccess({
    outcome: 'CROSSED',
    reachedExit: true,
    routeFullySupported: true,
    supportSource: 'AUTHORITATIVE_BUILD_BOARD_SNAPSHOT',
    directCompletionFlagUsed: false
  }), []);
  assert.ok(validateTrainSuccess({ outcome: 'CROSSED', reachedExit: true, routeFullySupported: false }).length > 0);
});

test('mission and hero contracts gate COMPLETE on CROSSED and frozen identity', () => {
  assert.deepEqual(validateMission({
    phaseHistory: ['DESIGN', 'BUILD', 'TEST', 'BUILD', 'TEST', 'COMPLETE', 'RESET'],
    firstTestOutcome: 'TRAIN_FELL',
    finalTrainOutcome: 'CROSSED',
    completePrecededByCrossed: true,
    nonCrossedOutcomeProducedComplete: false,
    resetPhase: 'DESIGN',
    previousMissionId: 'mission-1',
    newMissionId: 'mission-2'
  }), []);
  const hero = {
    phase: 'COMPLETE',
    trainOutcome: 'CROSSED',
    frozenPlanId: 'plan-1',
    testedPlanId: 'plan-1',
    frozenChecksum: 'sum-1',
    testedChecksum: 'sum-1',
    supportSource: 'AUTHORITATIVE_BUILD_BOARD_SNAPSHOT',
    robotIdle: true,
    gripperEmpty: true,
    incorrectPlacements: 0,
    requiredStructureComplete: true
  };
  assert.deepEqual(validateHero(hero), []);
  assert.ok(validateHero({ ...hero, trainOutcome: 'TRAIN_FELL' }).length > 0);
});

test('terrain, adversarial and integrated reset contracts fail closed', () => {
  assert.deepEqual(validateTerrain({ easyTerrainAvailable: true, entryExitAligned: true }), []);
  assert.deepEqual(validateAdversarial({ rejected: true, authorityPreserved: true, expectedReasonMatched: true }), []);
  assert.deepEqual(validateIntegratedReset({
    listenersStable: true,
    timersStable: true,
    trainBodiesStable: true,
    couplersStable: true,
    sceneObjectsStable: true,
    placementStreamsCleared: true,
    claimsCleared: true,
    missionEventsCleared: true,
    stalePlanIdentityCleared: true,
    webMcpRegistrationsStable: true
  }), []);
  assert.ok(validateAdversarial({ rejected: true, authorityPreserved: false, expectedReasonMatched: true }).length > 0);
});


function currentSnapshotFixture() {
  const worldTransform = {
    id: 'derived-transform',
    translationMm: { xMm: 411.25, yMm: -27.5, zMm: 9.75 },
    yawRad: 0.73,
    scale: 2,
    sourceFrame: 'bridge-local',
    targetFrame: 'machine'
  };
  const entry = { position: { x: 17, y: -80, z: 61 } };
  const exit = { position: { x: 17, y: 45, z: 61 } };
  const route = {
    start: { ...entry.position },
    end: { ...exit.position },
    direction: { x: 0, y: 1, z: 0 },
    lengthMm: 125,
    deckZMm: 61,
    segments: [{ id: 'crossing', start: { ...entry.position }, end: { ...exit.position } }]
  };
  const sourceTransform = {
    localEntry: { x: 0, y: 0, z: 0 },
    localExit: { x: 0, y: 125, z: 0 },
    spanMm: 125,
    roadYmm: 44
  };
  const bridgeChallenge = {
    id: 'terrain-easy-derived',
    entry: { x: 0, y: 0, z: 0 },
    exit: { x: 0, y: 62.5, z: 0 },
    span: 62.5,
    roadY: 22,
    worldTransform
  };
  return {
    designRevision: 4,
    planId: 'plan-arbitrary',
    designChecksum: 'checksum-arbitrary',
    hostReady: true,
    hostCompileState: { ready: true, planId: 'plan-arbitrary', designChecksum: 'checksum-arbitrary' },
    host: {
      challenge: { id: bridgeChallenge.id },
      worldTransform,
      buildPlan: { planId: 'plan-arbitrary', designChecksum: 'checksum-arbitrary', designRevision: 4, totalPhysicalParts: 7 }
    },
    challenge: {
      present: true,
      api: {
        getActiveChallenge: true,
        getBridgeTransform: true,
        getEntry: true,
        getExit: true,
        getTrainRoute: true,
        getCollisionProxy: true
      },
      active: {
        presetId: 'EASY',
        loaded: true,
        terrainMetrics: { meshCount: 1, triangleCount: 77, bytes: 4096 },
        terrainAsset: { repoPath: 'arbitrary.glb', packagePath: 'assets/arbitrary.glb', sha256: 'abc' },
        terrainTransform: { position: { x: 1, y: 2, z: 3 }, scale: { x: 4, y: 5, z: 6 } },
        entry,
        exit,
        trackRoute: route,
        bridgeTransform: sourceTransform
      },
      entry,
      exit,
      trainRoute: route,
      bridgeTransform: worldTransform,
      bridgeChallenge,
      collisionProxy: { proxies: [{ id: 'bank-a' }] },
      terrain: { present: true, attachedToScene: true, visible: true, childCount: 1 }
    },
    hologramSource: { planId: 'plan-arbitrary', designChecksum: 'checksum-arbitrary', designRevision: 4 },
    hologramSummary: { totalPhysicalCount: 7 },
    hologramPage: { totalAvailable: 7, truncated: false },
    hologramWorldTransform: worldTransform,
    hologramPlacementCount: 7,
    hologramVisible: true,
    hologramChildCount: 3,
    hologramGroupUuid: 'uuid-arbitrary'
  };
}

test('current EASY contract uses relational checks and exact shared identity', () => {
  const snapshot = currentSnapshotFixture();
  const easy = inspectEasyRuntime(snapshot);
  assert.ok(Object.values(easy.checks).every(Boolean), JSON.stringify(easy, null, 2));
  const exact = inspectExactHologramIdentity(snapshot);
  assert.ok(Object.values(exact.checks).every(Boolean), JSON.stringify(exact, null, 2));
  assert.equal(sameChallengeCalibration(snapshot, structuredClone(snapshot)), true);
  const changed = structuredClone(snapshot);
  changed.challenge.entry.position.y += 1;
  assert.equal(sameChallengeCalibration(snapshot, changed), false);
});

test('current EASY contract fails when route or derived transform diverges', () => {
  const routeMismatch = currentSnapshotFixture();
  routeMismatch.challenge.trainRoute.end.y += 3;
  assert.equal(inspectEasyRuntime(routeMismatch).checks.routeInternallyConsistent, false);
  const transformMismatch = currentSnapshotFixture();
  transformMismatch.host.worldTransform = structuredClone(transformMismatch.host.worldTransform);
  transformMismatch.host.worldTransform.translationMm.xMm += 1;
  assert.equal(inspectEasyRuntime(transformMismatch).checks.bridgeTransformDerived, false);
});
