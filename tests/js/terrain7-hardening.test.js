import test from 'node:test';
import assert from 'node:assert/strict';
import { constructionHarness } from '../helpers/construction-harness.js';
import { createConstructionService } from '../../apps/web/src/bridge-construction/construction-service.js';
import { captureOffset } from '../../apps/web/src/bricks/part-spec.js';
import { createLiveHarness } from '../helpers/live-harness.js';
import { createRuntimeBridge, machineError, runtimeAvailability } from '../../apps/web/src/webmcp/runtime-bridge.js';
import { createLogoRoboToolHandlers } from '../../apps/web/src/webmcp/tool-handlers.js';
import { capture } from '../../tools/submission/browser-support.mjs';

test('submission evidence does not capture images when the user owns visual inspection', async t => {
  const previous = process.env.ROBO_BRIDGE_CAPTURE_SCREENSHOTS;
  delete process.env.ROBO_BRIDGE_CAPTURE_SCREENSHOTS;
  t.after(() => { if (previous !== undefined) process.env.ROBO_BRIDGE_CAPTURE_SCREENSHOTS = previous; });
  const captures = [];
  const result = await capture({ screenshot: () => { throw new Error('unexpected_screenshot'); } }, 'unused', 'unused.png', captures);
  assert.equal(result.captured, false);
  assert.equal(result.visual, 'USER-VERIFY PENDING');
  assert.deepEqual(captures, []);
});

test('Construction reset cancels unrelated controller motion before resetting board identity', async () => {
  const h = await constructionHarness({ terrain7: true });
  h.service.startBuild({ expectedWorldRevision: h.controller.worldRevision });
  const motion = h.controller.moveTool({ xMm: 670, yMm: 40, zMm: 400, speedMmS: 100, expectedWorldRevision: h.controller.worldRevision }).catch(e => e);
  const reset = await h.service.reset({ expectedWorldRevision: h.controller.worldRevision });
  await motion;
  assert.equal(reset.ok, true);
  assert.equal(h.controller.operationState, 'idle');
  assert.equal(h.controller.heldBrickId, null);
  assert.equal(h.service.preparedBuild, null);
  assert.equal(h.board.getTargets().length, 0);
  const revision = h.controller.worldRevision;
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(h.controller.worldRevision, revision, 'no late motion sample');
  await h.host.applySettingsBatch(h.host.settings, h.host.designRevision);
});

test('Construction reset safely clears a physically latched shared part', async () => {
  const h = await constructionHarness({ terrain7: true });
  h.service.startBuild({ expectedWorldRevision: h.controller.worldRevision });
  const plan = h.service.planNext({ count: 1, expectedWorldRevision: h.controller.worldRevision });
  const source = h.controller.getBricks().find(b => b.id === plan.sourceIds[0]);
  const tcp = { ...source.position, zMm: source.position.zMm + captureOffset(source) };
  for (const point of [{ ...tcp, zMm: 400 }, tcp]) await h.controller.moveTool({ ...point, speedMmS: 420, expectedWorldRevision: h.controller.worldRevision });
  const latched = await h.controller.latch({ expectedWorldRevision: h.controller.worldRevision });
  assert.equal(latched.ok, true, JSON.stringify(latched));
  await h.service.reset({ expectedWorldRevision: h.controller.worldRevision });
  assert.equal(h.controller.heldBrickId, null);
  assert.equal(h.controller.getBricks().some(b => b.heldBy), false);
  assert.equal(h.service.preparedBuild, null);
  assert.equal(h.board.progress().filled, 0);
});

test('detached startBuild rollback restores original authorities after a startup callback failure', async () => {
  const h = await constructionHarness({ terrain7: true });
  const before = h.controller.getBricks();
  const service = createConstructionService({ bridgeHost: h.host, challenge: h.challenge, buildBoard: h.board,
    controller: h.controller, placementAuthority: h.authority, placementCoordinator: h.coordinator, cycleRunner: h.runner,
    onPrepared: prepared => { if (prepared) throw new Error('startup_probe'); } });
  const start = service.startBuild;
  assert.throws(() => start({ expectedWorldRevision: h.controller.worldRevision }), /startup_probe/);
  assert.equal(service.preparedBuild, null);
  assert.deepEqual(h.controller.getBricks(), before);
  assert.equal(h.board.getTargets().length, 0);
  await h.host.applySettingsBatch(h.host.settings, h.host.designRevision);
});

test('known runtime errors retain actionable fields and cannot overwrite the normalized error envelope', async () => {
  const { runtime } = createLiveHarness();
  const bridge = createRuntimeBridge({ ...runtime, robot: { ...runtime.robot, reset: async () => {
    throw Object.assign(new Error('Use mission reset'), { code: 'mission_reset_required', currentPhase: 'BUILD', currentMissionId: 'm1',
      currentRevision: 42, permittedNextActions: ['reset_mission'], recoveryAction: 'Read mission then reset.' });
  } } });
  const error = await bridge.robot.reset({});
  assert.equal(error.code, 'mission_reset_required');
  assert.equal(error.currentPhase, 'BUILD');
  assert.deepEqual(error.permittedNextActions, ['reset_mission']);
  const invalid = machineError('unknown_stack_error', 'private details', { ok: true, reason: 'private details', code: 'private details' });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.reason, 'internal_error');
  assert.equal(invalid.code, 'internal_error');
  assert.ok(!JSON.stringify(invalid).includes('private details'));
  assert.ok(runtimeAvailability({ ...runtime, placement: null }).missing.includes('placement.executeNext'));
});

test('scene inventory pages expose all objects and reject stale continuation without mutation', async () => {
  const { runtime, controller } = createLiveHarness();
  const objects = Array.from({ length: 57 }, (_, i) => ({ id: `brick_${String(i).padStart(3, '0')}`, type: 'brick', colour: 'red' }));
  const bridge = createRuntimeBridge({ ...runtime, world: { ...runtime.world,
    getSnapshotData: () => ({ worldRevision: controller.worldRevision, objects }) } });
  const handlers = createLogoRoboToolHandlers({ bridge });
  const before = controller.worldRevision, seen = [];
  let cursor = 0;
  do {
    const page = await handlers.getSceneState({ cursor, limit: 20, expectedWorldRevision: before });
    assert.equal(page.ok, true);
    seen.push(...page.objects.map(o => o.id));
    cursor = page.nextCursor;
  } while (cursor !== null);
  assert.equal(seen.length, 57);
  assert.equal(new Set(seen).size, 57);
  assert.equal(controller.worldRevision, before);
  const stale = await handlers.getSceneState({ cursor: 20, expectedWorldRevision: before + 1 });
  assert.equal(stale.reason, 'stale_state');
});
