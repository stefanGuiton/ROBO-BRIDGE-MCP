import {
  capture,
  delay,
  errorCode,
  passFail,
  safeArray,
  stripDeckOverhang,
  waitForIdle,
  bridgeSnapshot,
  evaluate
} from './browser-support.mjs';
import {
  STATUS,
  auditResponseSize,
  auditToolDefinitions,
  makeTest
} from './core.mjs';
import {
  inspectEasyRuntime,
  inspectExactHologramIdentity,
  sameChallengeCalibration
} from './current-contracts.mjs';

const CURRENT_SCREENSHOTS = Object.freeze({
  load: '01-load.png',
  before: '02-bridge-before-update.png',
  after: '03-bridge-after-update.png',
  reset: '12-reset.png'
});

export async function runCurrentAcceptance({
  browser,
  evidenceDirectory,
  screenshots,
  tests,
  catalogue,
  resetCycles,
  initialWebMcp
}) {
  let webmcp = initialWebMcp;
  const catalogueName = initialWebMcp?.catalogueName ?? 'minimum';
  const loadShot = await capture(browser, evidenceDirectory, CURRENT_SCREENSHOTS.load, screenshots);
  const before = await bridgeSnapshot(browser);
  const easy = inspectEasyRuntime(before);
  tests.push(passFail({ id: 'challenge.service_present', area: 'BROWSER', condition: easy.checks.servicePresent, details: easy }));
  tests.push(passFail({ id: 'challenge.easy_active', area: 'BROWSER', condition: easy.checks.easyActive, details: easy }));
  tests.push(passFail({ id: 'challenge.terrain_loaded', area: 'BROWSER', condition: easy.checks.terrainLoaded, details: easy }));
  tests.push(passFail({ id: 'challenge.entry_exit_present', area: 'BROWSER', condition: easy.checks.entryExitPresent, details: easy }));
  tests.push(passFail({ id: 'challenge.train_route_present', area: 'BROWSER', condition: easy.checks.trainRoutePresent, details: easy }));
  tests.push(passFail({ id: 'challenge.route_internal_consistency', area: 'BROWSER', condition: easy.checks.routeInternallyConsistent, details: easy }));
  tests.push(passFail({ id: 'challenge.bridge_transform_derived', area: 'BROWSER', condition: easy.checks.bridgeTransformDerived, details: easy }));
  tests.push(passFail({ id: 'bridge.host_exists', area: 'BROWSER', condition: before.hostReady, details: before }));
  tests.push(passFail({ id: 'bridge.initial_family_aqueduct', area: 'BROWSER', condition: before.family === 'aqueduct', details: before }));
  tests.push(passFail({ id: 'bridge.initial_plan_identity', area: 'BROWSER', condition: Boolean(before.planId && before.designChecksum), details: before }));
  tests.push(passFail({ id: 'bridge.hologram_exists', area: 'BROWSER', condition: before.hologramVisible && before.hologramPlacementCount > 0, details: before }));
  tests.push(passFail({ id: 'bridge.hologram_plan_matches_host', area: 'BROWSER', condition: before.hologramSource?.planId === before.planId, details: before }));
  tests.push(passFail({ id: 'bridge.hologram_checksum_matches_host', area: 'BROWSER', condition: before.hologramSource?.designChecksum === before.designChecksum, details: before }));
  const exactBefore = inspectExactHologramIdentity(before);
  tests.push(passFail({
    id: 'bridge.exact_hologram_host_identity',
    area: 'BROWSER',
    condition: Object.values(exactBefore.checks).every(Boolean),
    details: exactBefore
  }));
  const beforeShot = await capture(browser, evidenceDirectory, CURRENT_SCREENSHOTS.before, screenshots);

  const currentOverhang = Number(before.bridgeSpec?.common?.deckOverhang ?? 5);
  const nextOverhang = currentOverhang <= 24 ? currentOverhang + 5 : currentOverhang - 5;
  const mutationStarted = performance.now();
  const mutation = await evaluate(browser, `async (input) => window.__ROBO_BRIDGE__.bridgeDesign.invoke('update_bridge_design', {
    expectedDesignRevision: input.revision,
    patch: { common: { deckOverhang: input.value } }
  })`, { revision: before.designRevision, value: nextOverhang });
  await browser.waitFor(`window.__ROBO_BRIDGE__?.bridgeHologram?.source?.designRevision > ${Number(before.designRevision)}`, { timeoutMs: 120_000, intervalMs: 100 });
  await waitForIdle(browser);
  await delay(300);
  const after = await bridgeSnapshot(browser);
  const mutationDuration = performance.now() - mutationStarted;
  const afterShot = await capture(browser, evidenceDirectory, CURRENT_SCREENSHOTS.after, screenshots);
  tests.push(passFail({ id: 'bridge.mutation_accepted', area: 'BROWSER', condition: mutation?.ok === true, details: { mutation, before, after }, durationMs: mutationDuration }));
  tests.push(passFail({ id: 'bridge.mutation_changes_revision', area: 'BROWSER', condition: after.designRevision > before.designRevision, details: { before: before.designRevision, after: after.designRevision } }));
  tests.push(passFail({ id: 'bridge.mutation_changes_plan_id', area: 'BROWSER', condition: after.planId !== before.planId, details: { before: before.planId, after: after.planId } }));
  tests.push(passFail({ id: 'bridge.mutation_changes_checksum', area: 'BROWSER', condition: after.designChecksum !== before.designChecksum, details: { before: before.designChecksum, after: after.designChecksum } }));
  tests.push(passFail({
    id: 'bridge.mutation_changes_hologram_state',
    area: 'BROWSER',
    condition: after.hologramGroupUuid !== before.hologramGroupUuid && after.hologramSource?.planId === after.planId && after.planId !== before.planId,
    details: { beforeGroup: before.hologramGroupUuid, afterGroup: after.hologramGroupUuid, beforeImage: beforeShot.sha256, afterImage: afterShot.sha256 }
  }));
  tests.push(makeTest({ id: 'bridge.visual_inspection', area: 'BROWSER', status: STATUS.SKIPPED_WITH_REASON,
    required: false, reason: 'USER-VERIFY PENDING: user owns visual inspection under the time-critical addendum.' }));
  tests.push(passFail({ id: 'bridge.partial_patch_preserves_omitted_parameters', area: 'BROWSER', condition: JSON.stringify(stripDeckOverhang(before.bridgeSpec)) === JSON.stringify(stripDeckOverhang(after.bridgeSpec)), details: { before: before.bridgeSpec, after: after.bridgeSpec } }));
  tests.push(passFail({ id: 'bridge.hologram_follows_mutated_plan', area: 'BROWSER', condition: after.hologramSource?.planId === after.planId && after.hologramSource?.designChecksum === after.designChecksum, details: after }));
  const exactAfter = inspectExactHologramIdentity(after);
  tests.push(passFail({
    id: 'bridge.mutated_exact_hologram_host_identity',
    area: 'BROWSER',
    condition: Object.values(exactAfter.checks).every(Boolean),
    details: exactAfter
  }));

  const committedIdentity = { designRevision: after.designRevision, planId: after.planId, designChecksum: after.designChecksum };
  const stale = await evaluate(browser, `async (input) => window.__ROBO_BRIDGE__.bridgeDesign.invoke('update_bridge_design', {
    expectedDesignRevision: input.revision,
    patch: { common: { deckOverhang: input.value } }
  })`, { revision: before.designRevision, value: currentOverhang });
  tests.push(passFail({ id: 'bridge.stale_design_revision_rejects', area: 'BROWSER', condition: stale?.ok === false && errorCode(stale) === 'STALE_DESIGN_REVISION', details: stale }));

  const invalid = await evaluate(browser, `async (revision) => window.__ROBO_BRIDGE__.bridgeDesign.invoke('update_bridge_design', {
    expectedDesignRevision: revision,
    patch: { aqueduct: { bottomArchCount: 99 } }
  })`, after.designRevision);
  tests.push(passFail({ id: 'bridge.invalid_parameter_rejects', area: 'BROWSER', condition: invalid?.ok === false && ['OUT_OF_RANGE', 'INVALID_PARAMETER'].includes(errorCode(invalid)), details: invalid }));

  const unknown = await evaluate(browser, `async (revision) => window.__ROBO_BRIDGE__.bridgeDesign.invoke('update_bridge_design', {
    expectedDesignRevision: revision,
    patch: { common: { unexpectedProperty: 1 } }
  })`, after.designRevision);
  tests.push(passFail({ id: 'bridge.unknown_parameter_rejects', area: 'BROWSER', condition: unknown?.ok === false && errorCode(unknown) === 'INVALID_PARAMETER', details: unknown }));

  const afterRejects = await bridgeSnapshot(browser);
  tests.push(passFail({
    id: 'bridge.rejected_mutation_preserves_active_plan',
    area: 'BROWSER',
    condition: afterRejects.designRevision === committedIdentity.designRevision && afterRejects.planId === committedIdentity.planId && afterRejects.designChecksum === committedIdentity.designChecksum,
    details: { committedIdentity, afterRejects }
  }));

  const aborted = await evaluate(browser, `async (input) => window.__ROBO_BRIDGE_QA__.invoke('update_bridge_design', {
    expectedDesignRevision: input.revision,
    patch: { common: { deckOverhang: input.value } }
  }, { aborted: true })`, { revision: after.designRevision, value: currentOverhang });
  const afterAbort = await bridgeSnapshot(browser);
  tests.push(passFail({
    id: 'bridge.aborted_mutation_rejects_without_commit',
    area: 'WEBMCP',
    condition: errorCode(aborted?.parsed) === 'CANCELLED' || errorCode(aborted?.parsed) === 'cancelled',
    details: { aborted, afterAbort }
  }));
  tests.push(passFail({
    id: 'bridge.aborted_mutation_preserves_active_plan',
    area: 'WEBMCP',
    condition: afterAbort.planId === committedIdentity.planId && afterAbort.designChecksum === committedIdentity.designChecksum,
    details: { committedIdentity, afterAbort }
  }));

  const registrations = await evaluate(browser, `() => window.__ROBO_BRIDGE_QA__.registrations`);
  const toolAudit = auditToolDefinitions(registrations, catalogue);
  webmcp = {
    catalogueName,
    toolCount: toolAudit.toolCount,
    expectedMinimum: toolAudit.expectedMinimum,
    expectedExact: toolAudit.expectedExact,
    expectedTargetApprox: toolAudit.expectedTargetApprox,
    targetDelta: toolAudit.targetDelta,
    toolNames: toolAudit.names,
    duplicateNames: toolAudit.duplicateNames,
    invalidTools: toolAudit.invalid,
    missingRequiredNames: toolAudit.missingRequiredNames,
    annotationAudit: toolAudit.annotations,
    responseSizes: [],
    cancellation: null,
    ownerSignals: []
  };
  tests.push(passFail({ id: 'webmcp.registration_catalogue', area: 'WEBMCP', condition: toolAudit.ok, details: toolAudit }));
  const annotationFindings = toolAudit.annotations.filter((item) => ['HIGH', 'MEDIUM'].includes(item.risk));
  tests.push(makeTest({
    id: 'webmcp.annotation_review',
    area: 'WEBMCP',
    status: annotationFindings.length ? STATUS.SKIPPED_WITH_REASON : STATUS.PASS,
    required: false,
    reason: annotationFindings.length ? 'SUSPICIOUS_ANNOTATION_REQUIRES_REVIEW' : null,
    details: { findings: annotationFindings }
  }));

  const ownerSignals = await evaluate(browser, `() => window.__ROBO_BRIDGE_QA__.ownerSignals`);
  const duplicateRegistrations = await evaluate(browser, `() => window.__ROBO_BRIDGE_QA__.duplicateRegistrations`);
  const uniqueOwnerSignals = [...new Set(ownerSignals)];
  webmcp.ownerSignals = ownerSignals;
  tests.push(passFail({
    id: 'webmcp.single_registration_owner',
    area: 'WEBMCP',
    condition: uniqueOwnerSignals.length === 1 && ownerSignals.length === registrations.length && duplicateRegistrations.length === 0,
    details: { ownerSignals, uniqueOwnerSignals, duplicateRegistrations }
  }));

  const cancellation = await evaluate(browser, `async (names) => {
    const results = [];
    for (const name of names) results.push({ name, result: await window.__ROBO_BRIDGE_QA__.invoke(name, {}, { aborted: true }) });
    return results;
  }`, registrations.map((item) => item.name));
  const cancellationFailures = cancellation.filter((item) => {
    const code = errorCode(item.result?.parsed);
    return item.result?.threw || !['cancelled', 'CANCELLED'].includes(code);
  });
  webmcp.cancellation = { checked: cancellation.length, failures: cancellationFailures };
  tests.push(passFail({ id: 'webmcp.cancellation_signal_all_tools', area: 'WEBMCP', condition: cancellationFailures.length === 0, details: webmcp.cancellation }));

  const unknownToolInput = await evaluate(browser, `async () => window.__ROBO_BRIDGE_QA__.invoke('get_bridge_design', { unexpectedProperty: true })`);
  tests.push(passFail({ id: 'adversarial.invalid_tool_unknown_property', area: 'WEBMCP', condition: unknownToolInput?.parsed?.ok === false && errorCode(unknownToolInput.parsed) === 'INVALID_PARAMETER', details: unknownToolInput }));

  const scenarios = {
    get_scene_state: { input: { limit: 2 }, scenario: 'normal-bounded-read' },
    get_build_state: { input: { limit: 2 }, scenario: 'normal-bounded-read' },
    get_robot_state: { input: {}, scenario: 'normal-read' },
    get_workspace: { input: {}, scenario: 'normal-read' },
    observe_camera: { input: { cameraId: 'tray_camera', type: 'brick', limit: 2 }, scenario: 'normal-bounded-read' },
    get_placement_stream_status: { input: { streamId: 'submission-gate-missing', limit: 1 }, scenario: 'bounded-missing-stream' },
    get_bridge_design: { input: { includeCapabilities: false }, scenario: 'normal-summary' },
    get_bridge_capabilities: { input: { family: 'aqueduct' }, scenario: 'normal-capabilities' },
    get_bridge_build_plan: { input: { detail: 'summary' }, scenario: 'normal-summary' }
  };
  const responseSizes = [];
  const invalidJson = [];
  for (const registration of registrations) {
    const scenario = scenarios[registration.name];
    const invocation = scenario
      ? await evaluate(browser, `async (input) => window.__ROBO_BRIDGE_QA__.invoke(input.name, input.payload)`, { name: registration.name, payload: scenario.input })
      : await evaluate(browser, `async (name) => window.__ROBO_BRIDGE_QA__.invoke(name, {}, { aborted: true })`, registration.name);
    const raw = invocation?.rawText ?? JSON.stringify(invocation);
    const audit = auditResponseSize({ tool: registration.name, scenario: scenario?.scenario ?? 'cancelled-no-mutation', value: raw });
    responseSizes.push(audit);
    if (!audit.validJson) invalidJson.push({ tool: registration.name, invocation });
  }
  webmcp.responseSizes = responseSizes;
  tests.push(passFail({ id: 'webmcp.output_valid_json', area: 'WEBMCP', condition: invalidJson.length === 0, details: { invalidJson } }));
  const hardLimitFailures = responseSizes.filter((item) => item.severity === 'BLOCKING');
  tests.push(passFail({ id: 'webmcp.response_size_hard_limit', area: 'WEBMCP', condition: hardLimitFailures.length === 0, details: { hardLimitFailures, oversized: responseSizes.filter((item) => item.severity === 'OVERSIZED') } }));

  await evaluate(browser, `async () => window.__ROBO_BRIDGE_QA__.invoke('get_workspace', {})`);
  await browser.waitFor(`document.querySelector('[data-tool="get_workspace"]')?.dataset?.status === 'succeeded'`, { timeoutMs: 30_000, intervalMs: 50 });
  tests.push(passFail({ id: 'webmcp.lifecycle_status_updates', area: 'WEBMCP', condition: true }));

  const frames = await evaluate(browser, `async () => {
    const values = [];
    for (let index = 0; index < 3; index += 1) values.push(await new Promise((resolve) => requestAnimationFrame(resolve)));
    return values;
  }`);
  tests.push(passFail({ id: 'browser.animation_not_stalled', area: 'BROWSER', condition: frames.length === 3 && frames[0] < frames[1] && frames[1] < frames[2], details: { frames } }));

  let currentRobot = await evaluate(browser, `() => window.__ROBO_BRIDGE__.getRobotState()`);
  if (Number(currentRobot.worldRevision) === 0) {
    await evaluate(browser, `async () => window.__ROBO_BRIDGE__.actions.resetScene()`);
    await waitForIdle(browser);
    currentRobot = await evaluate(browser, `() => window.__ROBO_BRIDGE__.getRobotState()`);
  }
  const workspace = await evaluate(browser, `() => window.__ROBO_BRIDGE__.getWorkspace()`);
  const tcp = currentRobot.tcp;
  const staleWorldInput = {
    xMm: tcp.xMm,
    yMm: tcp.yMm,
    zMm: Math.min(Number(workspace.zMaxMm ?? tcp.zMm), Number(tcp.zMm) + 1),
    speedMmS: 50,
    expectedWorldRevision: Math.max(0, Number(currentRobot.worldRevision) - 1)
  };
  const staleWorld = await evaluate(browser, `async (input) => window.__ROBO_BRIDGE_QA__.invoke('move_tool', input)`, staleWorldInput);
  const afterStaleRobot = await evaluate(browser, `() => window.__ROBO_BRIDGE__.getRobotState()`);
  tests.push(passFail({
    id: 'adversarial.stale_world_revision',
    area: 'WEBMCP',
    condition: staleWorld?.parsed?.ok === false && afterStaleRobot.worldRevision === currentRobot.worldRevision && afterStaleRobot.moving === false,
    details: { input: staleWorldInput, result: staleWorld, before: currentRobot, after: afterStaleRobot }
  }));

  const designReset = await evaluate(browser, `async (revision) => window.__ROBO_BRIDGE__.bridgeDesign.invoke('reset_bridge_design', {
    expectedDesignRevision: revision
  })`, afterAbort.designRevision);
  if (designReset?.ok === true) {
    await browser.waitFor(`window.__ROBO_BRIDGE__?.bridgeHologram?.source?.designRevision > ${Number(afterAbort.designRevision)}`, { timeoutMs: 120_000, intervalMs: 100 });
  }
  await waitForIdle(browser);
  await delay(300);
  const designResetSnapshot = await bridgeSnapshot(browser);
  const designBaselineRestored = designReset?.ok === true
    && designResetSnapshot.planId === before.planId
    && designResetSnapshot.designChecksum === before.designChecksum
    && JSON.stringify(designResetSnapshot.bridgeSpec) === JSON.stringify(before.bridgeSpec);
  tests.push(passFail({
    id: 'reset.bridge_design_baseline_restored',
    area: 'RESET',
    condition: designBaselineRestored,
    details: { result: designReset, before, after: designResetSnapshot }
  }));
  const resetIdentity = inspectExactHologramIdentity(designResetSnapshot);
  tests.push(passFail({
    id: 'reset.exact_hologram_host_identity_restored',
    area: 'RESET',
    condition: Object.values(resetIdentity.checks).every(Boolean),
    details: resetIdentity
  }));

  await evaluate(browser, `async () => window.__ROBO_BRIDGE__.actions.resetScene()`);
  await waitForIdle(browser);
  await delay(700);
  const resetBaseline = await evaluate(browser, `() => window.__ROBO_BRIDGE_QA__.leakSnapshot()`);
  const resetBaselineSnapshot = await bridgeSnapshot(browser);
  const resetEasy = inspectEasyRuntime(resetBaselineSnapshot);
  tests.push(passFail({
    id: 'reset.calibrated_easy_baseline_restored',
    area: 'RESET',
    condition: Object.values(resetEasy.checks).every(Boolean) && sameChallengeCalibration(before, resetBaselineSnapshot),
    details: { checks: resetEasy, initial: before.challenge, reset: resetBaselineSnapshot.challenge }
  }));
  const resetRuns = [];
  const resetStarted = performance.now();
  for (let index = 0; index < resetCycles; index += 1) {
    const cycleStarted = performance.now();
    const result = await evaluate(browser, `async () => window.__ROBO_BRIDGE__.actions.resetScene()`);
    await waitForIdle(browser);
    resetRuns.push({
      run: index + 1,
      ok: result?.ok === true,
      durationMs: Math.round((performance.now() - cycleStarted) * 1000) / 1000,
      worldRevision: result?.robot?.worldRevision ?? null
    });
  }
  await delay(700);
  const resetFinal = await evaluate(browser, `() => window.__ROBO_BRIDGE_QA__.leakSnapshot()`);
  const resetFinalSnapshot = await bridgeSnapshot(browser);
  tests.push(passFail({ id: `reset.repeated_${resetCycles}_cycles`, area: 'RESET', condition: resetRuns.every((item) => item.ok), details: { runs: resetRuns }, durationMs: performance.now() - resetStarted }));
  const stableExact = ['activeIntervals', 'registrationCount', 'sceneObjectCount', 'brickCount', 'targetCount', 'unhandledRejectionCount', 'windowErrorCount'];
  const changedFields = {};
  for (const key of stableExact) if (resetBaseline[key] !== resetFinal[key]) changedFields[key] = { before: resetBaseline[key], after: resetFinal[key] };
  const listenerGrowth = Number(resetFinal.listenerBalance ?? 0) - Number(resetBaseline.listenerBalance ?? 0);
  const timeoutGrowth = Number(resetFinal.activeTimeouts ?? 0) - Number(resetBaseline.activeTimeouts ?? 0);
  if (listenerGrowth > 0) changedFields.listenerBalance = { before: resetBaseline.listenerBalance, after: resetFinal.listenerBalance };
  if (timeoutGrowth > 2) changedFields.activeTimeouts = { before: resetBaseline.activeTimeouts, after: resetFinal.activeTimeouts };
  const bridgeStable = resetFinal.bridge?.planId === resetBaseline.bridge?.planId
    && resetFinal.bridge?.designChecksum === resetBaseline.bridge?.designChecksum
    && resetFinalSnapshot.planId === before.planId
    && resetFinalSnapshot.designChecksum === before.designChecksum;
  const challengeStable = sameChallengeCalibration(before, resetFinalSnapshot);
  const resetClean = Object.keys(changedFields).length === 0
    && safeArray(resetFinal.duplicateRegistrations).length === 0
    && [0, null, undefined].includes(resetFinal.claimCount)
    && [0, null, undefined].includes(resetFinal.placementQueueLength)
    && [0, null, undefined].includes(resetFinal.placementRemaining)
    && resetFinal.robot?.moving === false
    && resetFinal.robot?.heldBrickId === null
    && ['idle', 'ready', null, undefined].includes(resetFinal.robot?.operationState)
    && bridgeStable
    && challengeStable;
  tests.push(passFail({ id: 'reset.no_listener_timer_scene_or_registration_leak', area: 'RESET', condition: resetClean, details: { before: resetBaseline, after: resetFinal, changedFields, bridgeStable, challengeStable } }));
  await capture(browser, evidenceDirectory, CURRENT_SCREENSHOTS.reset, screenshots);

  return { loadShot, beforeShot, afterShot, webmcp };
}
