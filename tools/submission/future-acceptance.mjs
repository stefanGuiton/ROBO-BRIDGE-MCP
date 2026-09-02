import {
  evaluate,
  passFail,
  providerAcceptance,
  unavailable
} from './browser-support.mjs';
import {
  validateAdversarial,
  validateConstruction,
  validateHero,
  validateIntegratedReset,
  validateMission,
  validateSourceReassignment,
  validateTrainFailure,
  validateTrainSuccess
} from './future-contracts.mjs';
import { STATUS, makeTest, percentile } from './core.mjs';

const HERO_PROMPT = 'Build a valid bridge across the terrain and successfully get the train to the other side.';

export async function runFutureAcceptance({
  browser,
  tests,
  finalRequired,
  providerTimeoutMs,
  resetCycles,
  heroAttempts
}) {
  let futureAvailability = { challenge: false, construction: false, train: false, mission: false, provider: false };
  let heroReliability = { prompt: HERO_PROMPT, attempts: 0, passes: 0, failures: 0, notAvailable: 0, runs: [] };
  futureAvailability = await evaluate(browser, `() => window.__ROBO_BRIDGE_QA__.serviceAvailability()`);
  const construction = await providerAcceptance({
    browser,
    availability: futureAvailability,
    service: 'construction',
    method: 'runConstructionAcceptance',
    argument: { mode: 'submission-gate' },
    validator: validateConstruction,
    id: 'future.construction_authority',
    reason: 'CONSTRUCTION_SERVICE_NOT_PRESENT',
    required: finalRequired,
    timeoutMs: providerTimeoutMs
  });
  tests.push(construction.test);
  process.stdout.write(`[${construction.test.status}] HERO LOOP ${construction.test.id}\n`);
  const reassignment = await providerAcceptance({
    browser,
    availability: futureAvailability,
    service: 'construction',
    method: 'runSourceReassignmentAcceptance',
    argument: { mode: 'submission-gate' },
    validator: validateSourceReassignment,
    id: 'future.source_reassignment',
    reason: 'CONSTRUCTION_SERVICE_NOT_PRESENT',
    required: finalRequired,
    timeoutMs: providerTimeoutMs
  });
  tests.push(reassignment.test);
  process.stdout.write(`[${reassignment.test.status}] HERO LOOP ${reassignment.test.id}\n`);
  const trainFailure = await providerAcceptance({
    browser,
    availability: futureAvailability,
    service: 'train',
    method: 'runTrainFailureAcceptance',
    argument: { mode: 'submission-gate' },
    validator: validateTrainFailure,
    id: 'future.train_failure',
    reason: 'TRAIN_SERVICE_NOT_PRESENT',
    required: finalRequired,
    timeoutMs: providerTimeoutMs
  });
  const trainSuccess = await providerAcceptance({
    browser,
    availability: futureAvailability,
    service: 'train',
    method: 'runTrainSuccessAcceptance',
    argument: { mode: 'submission-gate' },
    validator: validateTrainSuccess,
    id: 'future.train_success',
    reason: 'TRAIN_SERVICE_NOT_PRESENT',
    required: finalRequired,
    timeoutMs: providerTimeoutMs
  });
  tests.push(trainFailure.test, trainSuccess.test);
  process.stdout.write(`[${trainFailure.test.status}] HERO LOOP ${trainFailure.test.id}\n`);
  process.stdout.write(`[${trainSuccess.test.status}] HERO LOOP ${trainSuccess.test.id}\n`);
  const mission = await providerAcceptance({
    browser,
    availability: futureAvailability,
    service: 'mission',
    method: 'runMissionAcceptance',
    argument: { mode: 'submission-gate' },
    validator: validateMission,
    id: 'future.mission_state_machine',
    reason: 'MISSION_SERVICE_NOT_PRESENT',
    required: finalRequired,
    timeoutMs: providerTimeoutMs
  });
  tests.push(mission.test);
  process.stdout.write(`[${mission.test.status}] HERO LOOP ${mission.test.id}\n`);


  const integratedResetAvailable = futureAvailability.construction || futureAvailability.train || futureAvailability.mission;
  if (!integratedResetAvailable) {
    tests.push(unavailable({ id: 'future.integrated_reset_leak', area: 'RESET', reason: 'INTEGRATED_SERVICES_NOT_PRESENT', required: finalRequired }));
  } else if (!futureAvailability.provider) {
    tests.push(makeTest({ id: 'future.integrated_reset_leak', area: 'RESET', status: STATUS.FAIL, required: true, reason: 'SUBMISSION_ACCEPTANCE_PROVIDER_NOT_PRESENT' }));
  } else {
    const integratedReset = await evaluate(browser, `async (input) => window.__ROBO_BRIDGE_QA__.callProvider('runIntegratedResetAcceptance', input, input.timeoutMs)`, { cycles: resetCycles, timeoutMs: providerTimeoutMs }, providerTimeoutMs + 10_000);
    const evidence = integratedReset?.result;
    const errors = integratedReset?.available && !integratedReset?.threw ? validateIntegratedReset(evidence) : ['integrated reset provider failed'];
    tests.push(passFail({ id: 'future.integrated_reset_leak', area: 'RESET', condition: errors.length === 0, required: finalRequired, details: { call: integratedReset, errors, evidence } }));
    process.stdout.write(`[${tests.at(-1).status}] RESET future.integrated_reset_leak\n`);
  }

  const flagshipAvailable = futureAvailability.challenge && futureAvailability.construction && futureAvailability.train && futureAvailability.mission;
  const heroRuns = [];
  const heroDurations = [];
  for (let index = 0; index < heroAttempts; index += 1) {
    const runNumber = index + 1;
    if (!flagshipAvailable) {
      const reason = !futureAvailability.challenge ? 'CHALLENGE_SERVICE_NOT_PRESENT'
        : !futureAvailability.construction ? 'CONSTRUCTION_SERVICE_NOT_PRESENT'
          : !futureAvailability.train ? 'TRAIN_SERVICE_NOT_PRESENT'
            : 'MISSION_SERVICE_NOT_PRESENT';
      const run = { runNumber, status: STATUS.NOT_AVAILABLE, reason, prompt: HERO_PROMPT };
      heroRuns.push(run);
      tests.push(unavailable({ id: `hero.flagship_run_${runNumber}`, area: 'HERO LOOP', reason, required: finalRequired, details: run }));
      continue;
    }
    if (!futureAvailability.provider) {
      const run = { runNumber, status: STATUS.FAIL, reason: 'SUBMISSION_ACCEPTANCE_PROVIDER_NOT_PRESENT', prompt: HERO_PROMPT };
      heroRuns.push(run);
      tests.push(makeTest({ id: `hero.flagship_run_${runNumber}`, area: 'HERO LOOP', status: STATUS.FAIL, required: true, reason: run.reason, details: run }));
      continue;
    }
    const consoleBefore = browser.console.errors.length + browser.console.exceptions.length;
    const runStarted = performance.now();
    const call = await evaluate(browser, `async (input) => window.__ROBO_BRIDGE_QA__.callProvider('runFlagshipJourney', {
      runNumber: input.runNumber,
      prompt: input.prompt
    }, input.timeoutMs)`, { runNumber, prompt: HERO_PROMPT, timeoutMs: providerTimeoutMs }, providerTimeoutMs + 10_000);
    const durationMs = performance.now() - runStarted;
    heroDurations.push(durationMs);
    const evidence = call?.available && !call?.threw ? call.result : null;
    const errors = call?.available && !call?.threw ? validateHero(evidence) : [call?.reason ?? call?.error?.message ?? 'flagship provider failed'];
    const resetResult = evidence?.resetResult ?? await evaluate(browser, `async (timeoutMs) => window.__ROBO_BRIDGE_QA__.resetProvider(timeoutMs)`, providerTimeoutMs, providerTimeoutMs + 10_000);
    const run = {
      runNumber,
      status: errors.length ? STATUS.FAIL : STATUS.PASS,
      reason: errors.length ? 'ACCEPTANCE_ASSERTION_FAILED' : null,
      durationMs: Math.round(durationMs * 1000) / 1000,
      prompt: HERO_PROMPT,
      missionId: evidence?.missionId ?? null,
      planId: evidence?.frozenPlanId ?? null,
      checksum: evidence?.frozenChecksum ?? null,
      placementsRequired: evidence?.placementsRequired ?? null,
      humanPlacements: evidence?.humanPlacements ?? null,
      codexPlacements: evidence?.codexPlacements ?? null,
      failureTestResult: evidence?.failureTestResult ?? null,
      finalTrainResult: evidence?.trainOutcome ?? null,
      resetResult,
      worldRevision: evidence?.worldRevision ?? null,
      consoleErrors: browser.console.errors.length + browser.console.exceptions.length - consoleBefore,
      errors,
      checks: {
        phaseComplete: evidence?.phase === 'COMPLETE',
        trainCrossed: evidence?.trainOutcome === 'CROSSED',
        planIdentityMatched: evidence?.testedPlanId === evidence?.frozenPlanId && evidence?.testedChecksum === evidence?.frozenChecksum
      },
      evidence
    };
    heroRuns.push(run);
    tests.push(passFail({ id: `hero.flagship_run_${runNumber}`, area: 'HERO LOOP', condition: errors.length === 0, required: finalRequired, details: run, durationMs }));
    process.stdout.write(`[${tests.at(-1).status}] HERO LOOP hero.flagship_run_${runNumber}\n`);
  }
  heroReliability = {
    prompt: HERO_PROMPT,
    attempts: heroRuns.length,
    passes: heroRuns.filter((run) => run.status === STATUS.PASS).length,
    failures: heroRuns.filter((run) => run.status === STATUS.FAIL).length,
    notAvailable: heroRuns.filter((run) => run.status === STATUS.NOT_AVAILABLE).length,
    failureCategories: Object.fromEntries([...new Set(heroRuns.filter((run) => run.status !== STATUS.PASS).map((run) => run.reason))].filter(Boolean).map((reason) => [reason, heroRuns.filter((run) => run.reason === reason).length])),
    meanDurationMs: heroDurations.length ? Math.round((heroDurations.reduce((sum, value) => sum + value, 0) / heroDurations.length) * 1000) / 1000 : null,
    p95DurationMs: percentile(heroDurations, 0.95),
    runs: heroRuns
  };

  const adversarialScenarios = [
    ['duplicate_mutation', 'construction'],
    ['robot_busy', 'construction'],
    ['gripper_occupied', 'construction'],
    ['test_before_build', 'mission'],
    ['test_without_frozen_plan', 'mission'],
    ['build_request_during_test', 'mission'],
    ['reset_during_active_operation', 'mission'],
    ['repeated_reset', 'mission'],
    ['source_disappears_during_execution', 'construction']
  ];
  for (const [scenario, service] of adversarialScenarios) {
    const id = `adversarial.${scenario}`;
    if (!futureAvailability[service]) {
      tests.push(unavailable({ id, area: 'HERO LOOP', reason: service === 'construction' ? 'CONSTRUCTION_SERVICE_NOT_PRESENT' : 'MISSION_SERVICE_NOT_PRESENT', required: finalRequired }));
      continue;
    }
    if (!futureAvailability.provider) {
      tests.push(makeTest({ id, area: 'HERO LOOP', status: STATUS.FAIL, required: true, reason: 'SUBMISSION_ACCEPTANCE_PROVIDER_NOT_PRESENT', details: { scenario } }));
      continue;
    }
    const call = await evaluate(browser, `async (input) => window.__ROBO_BRIDGE_QA__.callProvider('runAdversarialScenario', { scenario: input.scenario }, input.timeoutMs)`, { scenario, timeoutMs: providerTimeoutMs }, providerTimeoutMs + 10_000);
    const evidence = call?.result;
    const errors = call?.available && !call?.threw ? validateAdversarial(evidence) : ['adversarial provider failed'];
    tests.push(passFail({ id, area: 'HERO LOOP', condition: errors.length === 0, required: finalRequired, details: { scenario, call, evidence, errors } }));
    process.stdout.write(`[${tests.at(-1).status}] HERO LOOP ${id}\n`);
  }

  return {
    futureAvailability,
    heroReliability,
    trainResult: trainSuccess.evidence ?? trainFailure.evidence ?? null,
    missionResult: mission.evidence ?? null
  };
}
