import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { makeBrick, BRICK_SPEC } from '../../apps/web/src/bricks/brick-spec.js';
import { detectMoreBricksContact, getMoreBricksButtonAnchor, createMoreBricksButton } from '../../apps/web/src/workcell/more-bricks-button.js';
import { createV8WorkcellProfile } from '../../apps/web/src/workcell/v8-workcell-profile.js';
import { PLAYER_FALLBACK_SETTINGS } from '../../apps/web/src/player/player-settings.js';
import { makeReachableV8Spawn } from '../../apps/web/src/player/v8-spawn.js';
import { RobotController } from '../../apps/web/src/robot/controller.js';
import { RevisionClock } from '../../apps/web/src/state/revision-clock.js';

const supplied = JSON.parse(await readFile(new URL('../../apps/web/config/player/LOGO_ROBO_PLAYER_SETTINGS.json', import.meta.url), 'utf8'));
const settings = { ...PLAYER_FALLBACK_SETTINGS, ...supplied };

function makeHarness({ onPress = () => undefined, refill = null } = {}) {
  const harnessSettings = { ...settings };
  const profile = createV8WorkcellProfile(harnessSettings);
  const revisionClock = new RevisionClock();
  const controller = new RobotController({
    revisionClock,
    workspace: profile.workspace,
    layout: profile.layout,
    timeScale: 0,
    bricks: []
  });
  let refillSequence = 0;
  const refillCalls = [];
  const refillCallback = refill ?? ((input) => {
    refillCalls.push({ ...input, signal: input.signal ?? null });
    const occupied = controller.getBricks();
    const generated = makeReachableV8Spawn(harnessSettings, profile, {
      idPrefix: 'button-test-refill',
      startIndex: occupied.length,
      count: 1,
      occupied,
      colours: ['blue'],
      yawRad: 0,
      seed: (harnessSettings.seed ^ (++refillSequence * 0x9e3779b9)) >>> 0
    });
    assert.equal(generated.ok, true, generated.reason);
    const added = controller.addLooseBricks(generated.records, {
      actor: input.actor,
      operationToken: input.operationToken
    });
    assert.equal(added.ok, true, JSON.stringify(added));
    return {
      ...added,
      spawnedIds: added.bricks.map((brick) => brick.id)
    };
  });
  return {
    settings: harnessSettings,
    profile,
    controller,
    revisionClock,
    refillCalls,
    button: createMoreBricksButton({
      controller,
      settings: harnessSettings,
      profile,
      refill: refillCallback,
      onPress
    })
  };
}

test('MORE BRICKS anchor is shared, measured, and reachable in the current V8 frame', () => {
  const profile = createV8WorkcellProfile(settings);
  const anchor = getMoreBricksButtonAnchor(settings, profile);
  assert.equal(anchor.id, 'MAIN_DEMO_V8_MORE_BRICKS_BUTTON');
  assert.deepEqual(anchor.pose, { xMm: 260, yMm: 430, zMm: 12.5, yawRad: 0 });
  assert.deepEqual(anchor.tableLocalPose, { xMm: -460, yMm: 400, zMm: 1212.5, yawRad: 0 });
  assert.equal(anchor.radiusMm, 50);
  assert.equal(anchor.heightMm, 24);
  assert.equal(anchor.reserveRadiusMm, 70);
  assert.deepEqual(anchor.pressNormal, { x: 0, y: 0, z: 1 });
  assert.equal(anchor.safeApproachZMm, 250);
  assert.equal(anchor.contactTcp.zMm, 26.5);
  assert.equal(anchor.pressedTcp.zMm, 21.5);
  assert.equal(anchor.pressedTcp.zMm < anchor.contactTcp.zMm, true);
});

test('button contact proof is deterministic and reports exact measured geometry', () => {
  const profile = createV8WorkcellProfile(settings);
  const anchor = getMoreBricksButtonAnchor(settings, profile);
  const detected = detectMoreBricksContact(anchor, anchor.contactTcp, anchor.pressedTcp);
  assert.equal(detected.contactDetected, true);
  assert.equal(detected.ok, true);
  assert.equal(detected.precontactMatches, true);
  assert.equal(detected.pressedMatches, true);
  assert.equal(detected.lateralErrorMm, 0);
  assert.equal(detected.descentMm, anchor.pressDepthMm);
  assert.equal(detected.normalDescent, true);
  const invalid = detectMoreBricksContact(anchor, anchor.contactTcp, {
    ...anchor.pressedTcp,
    xMm: anchor.pressedTcp.xMm + anchor.positionToleranceMm * 2
  });
  assert.equal(invalid.contactDetected, false);
  assert.equal(invalid.reason, 'pressed_pose_mismatch');
});

test('MORE BRICKS service resolves settings at request time and rejects an anchor change mid-press', async () => {
  const h = makeHarness();
  const initial = h.button.getAnchor();
  h.settings.tableYawDeg = 45;
  const updated = h.button.getAnchor();
  assert.notDeepEqual(updated.tableLocalPose, initial.tableLocalPose);

  let callbackHarness;
  callbackHarness = makeHarness({
    onPress: () => {
      callbackHarness.settings.tableYawDeg = 45;
      return { ok: true, detected: true };
    }
  });
  const result = await callbackHarness.button.tool.execute({ expectedWorldRevision: callbackHarness.controller.worldRevision });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stale_state');
  assert.equal(result.pressesCompleted, 1);
  assert.equal(result.partialPresses, 1);
  assert.equal(callbackHarness.refillCalls.length, 0);
  assert.equal(result.worldRevision, result.worldRevisionAfter);
});

test('request_more_bricks physically executes two real TCP presses and refills shared inventory', async () => {
  const pressEvents = [];
  const h = makeHarness({
    onPress: (event) => {
      pressEvents.push(event);
      return { ok: true, detected: true };
    }
  });
  const before = h.controller.worldRevision;
  const result = await h.button.tool.execute({ expectedWorldRevision: before });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.pressesRequested, 2);
  assert.equal(result.pressesCompleted, 2);
  assert.equal(result.partialPresses, 0);
  assert.equal(result.spawnedDelta, 2);
  assert.equal(result.spawnedIds.length, 2);
  assert.equal(result.inventoryBefore.total, 0);
  assert.equal(result.inventoryAfter.total, 2);
  assert.equal(h.refillCalls.length, 2);
  assert.equal(pressEvents.length, 2);
  assert.deepEqual(pressEvents.map((event) => event.index), [1, 2]);
  assert.deepEqual(h.refillCalls.map((call) => call.actor), ['agent', 'agent']);
  assert.ok(h.refillCalls.every((call) => call.operationToken), 'both refills must run under the exclusive button operation');
  assert.ok(pressEvents.every((event) => Math.abs(event.tcp.xMm - 260) <= 1 && Math.abs(event.tcp.yMm - 430) <= 1));
  assert.ok(pressEvents.every((event) => Math.abs(event.tcp.zMm - 21.5) <= 1));
  assert.ok(result.pressResults.every((press) => press.contactDetected && press.contactEvidence?.contactDetected));
  assert.ok(result.worldRevisionAfter > result.worldRevisionBefore);
  assert.equal(result.worldRevision, result.worldRevisionAfter);
  assert.equal(h.controller.operationState, 'idle');
  assert.equal(h.controller.operationBlocked(), false, 'exclusive operation must be released');

  const human = makeHarness();
  const humanResult = await human.button.activateHuman({ expectedWorldRevision: human.controller.worldRevision });
  assert.equal(humanResult.ok, true, JSON.stringify(humanResult));
  assert.equal(humanResult.actor, 'human');
  assert.equal(humanResult.pressesRequested, 1);
  assert.equal(humanResult.pressesCompleted, 1);
  assert.equal(human.refillCalls.length, 1);
  assert.equal(human.refillCalls[0].actor, 'human');
});

test('request_more_bricks does not refill when the press contact callback rejects', async () => {
  const h = makeHarness({ onPress: () => false });
  const before = h.controller.worldRevision;
  const result = await h.button.tool.execute({ expectedWorldRevision: before });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'button_contact_failed');
  assert.equal(result.pressesCompleted, 0);
  assert.equal(result.partialPresses, 0);
  assert.equal(result.spawnedDelta, 0);
  assert.equal(result.retreatRequired, true);
  assert.match(result.retreatInstruction, /lift vertically/);
  assert.equal(h.button.getState().lastResult.retreatRequired, true);
  assert.ok(result.currentTcp.zMm < 25, 'a failed press must not schedule a retreat move');
  assert.equal(h.refillCalls.length, 0);
  assert.equal(h.controller.getBricks().length, 0);
  assert.equal(h.controller.operationState, 'idle');
  assert.equal(h.controller.operationBlocked(), false);
});

test('request_more_bricks rejects stale revisions before moving the robot', async () => {
  const h = makeHarness();
  const before = h.controller.worldRevision;
  const result = await h.button.tool.execute({ expectedWorldRevision: before + 1 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stale_state');
  assert.equal(result.pressesRequested, 2);
  assert.equal(result.pressesCompleted, 0);
  assert.equal(h.controller.worldRevision, before);
  assert.equal(h.refillCalls.length, 0);
});

test('request_more_bricks cancellation after a completed press never invokes refill and releases exclusivity', async () => {
  const abort = new AbortController();
  let presses = 0;
  const h = makeHarness({
    onPress: () => {
      presses += 1;
      abort.abort('test-cancel');
      return { ok: true, detected: true };
    }
  });
  const result = await h.button.tool.execute({ expectedWorldRevision: h.controller.worldRevision }, { signal: abort.signal });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'cancelled');
  assert.equal(presses, 1);
  assert.equal(result.pressesCompleted, 1, 'the first physical press completed before cancellation');
  assert.equal(result.partialPresses, 1);
  assert.equal(result.retreatRequired, true);
  assert.match(result.retreatInstruction, /lift vertically/);
  assert.equal(h.button.getState().lastResult.retreatRequired, true);
  assert.ok(result.currentTcp.zMm < 25, 'cancellation must not schedule a post-abort retreat move');
  assert.equal(h.refillCalls.length, 0);
  assert.equal(h.controller.getBricks().length, 0);
  assert.equal(h.controller.operationState, 'idle');
  assert.equal(h.controller.operationBlocked(), false);
});

test('request_more_bricks preserves a compatible ninety-degree tool yaw after a prior safe placement', async () => {
  const h = makeHarness();
  const routed = await h.controller.moveTool({
    xMm: 768,
    yMm: 30,
    zMm: 250,
    yawRad: Math.PI / 2,
    speedMmS: 500,
    expectedWorldRevision: h.controller.worldRevision
  });
  assert.equal(routed.ok, true, JSON.stringify(routed));
  const result = await h.button.tool.execute({ expectedWorldRevision: h.controller.worldRevision });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.pressResults.map((press) => press.toolYawRad), [Math.PI / 2, Math.PI / 2]);
  assert.equal(result.retreatRequired, false);
});

test('request_more_bricks refuses a non-empty or closed robot gripper', async () => {
  const h = makeHarness();
  const tcp = h.controller.getState().tcp;
  const brick = makeBrick({
    id: 'held-for-button-test',
    colour: 'blue',
    xMm: tcp.xMm,
    yMm: tcp.yMm,
    zMm: tcp.zMm - BRICK_SPEC.capture.tcpAboveCentreMm,
    yawRad: -Math.PI / 2
  });
  assert.equal(h.controller.setBricks([brick]).ok, true);
  const latched = await h.controller.latch({ expectedWorldRevision: h.controller.worldRevision });
  assert.equal(latched.ok, true, JSON.stringify(latched));
  const result = await h.button.tool.execute({ expectedWorldRevision: h.controller.worldRevision });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'gripper_not_empty');
  assert.equal(result.pressesCompleted, 0);
  assert.equal(h.refillCalls.length, 0);
});
