// Explicit real-runtime diagnostic, not a complete Level 3 acceptance gate.
// Native tools mutate only this isolated browser's simulator. Evidence opt-in.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ChromiumSession } from '../tools/submission/cdp-browser.mjs';

const writeEvidence = process.argv.includes('--write-evidence');
const output = path.resolve(process.env.ROBO_LEVEL3_OUTPUT ?? 'output/playwright/level3-train-diagnostic');
const url = process.env.ROBO_LEVEL3_URL ?? 'http://127.0.0.1:8774/?demo=train&level=3';
const report = { purpose: 'Current production TCP Train diagnostic; NOT full crossing acceptance',
  url, startedAt: new Date().toISOString(), checks: [], screenshots: [], diagnosticCompleted: false };
if (writeEvidence) await mkdir(output, { recursive: true });
const browser = await ChromiumSession.launch({ viewport: [1440, 900], args: ['--enable-experimental-web-platform-features'] });
const evaluate = (fn, argument = null, options = {}) => browser.evaluate(`(${fn.toString()})(${JSON.stringify(argument)})`, options);
async function nativeCall(name, input = {}) {
  const result = await evaluate(({ name, input }) => {
    const testing = document.modelContextTesting ?? navigator.modelContextTesting;
    if (!testing?.executeTool) throw new Error('Native WebMCP unavailable');
    return testing.executeTool(name, JSON.stringify(input));
  }, { name, input }, { timeoutMs: 120_000 });
  return typeof result === 'string' ? JSON.parse(result) : result;
}
const sessionInput = state => ({ expectedMissionId: state.missionId,
  expectedMissionRevision: state.revisions.missionRevision, expectedWorldRevision: state.revisions.worldRevision });
async function capture(name) {
  if (!writeEvidence) return;
  const file = path.join(output, `${name}.png`);
  await browser.screenshot(file); report.screenshots.push(file);
}
async function snapshot() {
  return evaluate(async () => {
    const r = window.__ROBO_BRIDGE__, train = r.train.getDetailedSnapshot();
    return { mission: await r.mission.getMissionState({ detail: 'detail' }), train,
      board: r.board.progress(), robot: r.robotController.getState(), pendingMoves: r.robotController.pendingMoveCount,
      pusher: r.train.getSubsystem()?.pusherAdapter.getSnapshot(), terrain: r.train.getTerrainDiagnostics(),
      statsText: document.querySelector('[data-level3-results]')?.textContent ?? null };
  });
}
try {
  report.browser = browser.version.product;
  await browser.navigate(url);
  await browser.waitFor(`document.documentElement.dataset.runtimeReady === 'true'`, { timeoutMs: 90_000 });
  report.nativeTools = await evaluate(async () => (await (document.modelContextTesting ?? navigator.modelContextTesting).listTools()).map(t => t.name));
  assert.equal(new Set(report.nativeTools).size, 31);
  const design = await nativeCall('get_bridge_design');
  const before = await nativeCall('get_mission_state');
  assert.equal(before.ok, true);
  report.freeze = await nativeCall('start_bridge_build', { ...sessionInput(before), expectedDesignRevision: design.designRevision });
  assert.equal(report.freeze.ok, true, JSON.stringify(report.freeze));
  report.initial = await snapshot();
  assert.equal(report.initial.train.motion.mode, 'tcp_contact');
  assert.equal(report.initial.terrain.fallbackFloor, false);
  assert.equal(report.initial.terrain.waterIsSupport, false);
  report.debugVisibility = await evaluate(() => {
    const r = window.__ROBO_BRIDGE__, subsystem = r.train.getSubsystem();
    const revision = r.robotController.worldRevision;
    const mesh = () => subsystem.renderer.root.getObjectByName('PUSH_POSITION_BLOCK_PLACEHOLDER');
    subsystem.service.setPusherVisible(false);
    const hidden = mesh()?.visible === false;
    subsystem.service.setPusherVisible(true);
    return { hidden, restored: mesh()?.visible === true, worldRevisionUnchanged: r.robotController.worldRevision === revision };
  });
  assert.deepEqual(report.debugVisibility, { hidden: true, restored: true, worldRevisionUnchanged: true });
  await evaluate(async () => {
    const r = window.__ROBO_BRIDGE__, start = r.challenge.getEntry().position, end = r.challenge.getExit().position;
    const { toolOrientationForYaw } = await import('/src/robot/gripper-definition.js');
    const focus = r.renderer.machineRoot.localToWorld(r.renderer.camera.position.clone().set((start.x + end.x) / 2 - 90, start.y, start.z));
    r.renderer.player.setEnabled(false); r.renderer.focus.copy(focus);
    const offset = [520, -780, 450]; r.renderer.yaw = Math.atan2(offset[1], offset[0]);
    r.renderer.pitch = Math.atan2(offset[2], Math.hypot(offset[0], offset[1])); r.renderer.radius = Math.hypot(...offset);
    r.renderer.updateCamera(); r.renderer.render();
    const observations = window.__level3Diagnostic = { frames: 0, robotSamples: 0,
      maximumPositionErrorMm: 0, maximumOrientationErrorRad: 0,
      maximumRenderedPositionErrorMm: 0, maximumRenderedOrientationErrorRad: 0,
      maximumDeclaredColliderPositionErrorMm: 0, maximumDeclaredColliderOrientationErrorRad: 0,
      robotMotionSamples: [], samples: [] };
    const rotationError = (a, b) => {
      const dot = ['x', 'y', 'z', 'w'].reduce((sum, key) => sum + a[key] * b[key], 0);
      const lengths = Math.hypot(a.x, a.y, a.z, a.w) * Math.hypot(b.x, b.y, b.z, b.w);
      return 2 * Math.acos(Math.min(1, Math.abs(dot / lengths)));
    };
    const expectedRotation = robot => {
      const m = toolOrientationForYaw(robot.toolYawRad, r.robotController.definition.fixedToolOrientation);
      return r.renderer.camera.quaternion.clone().setFromRotationMatrix(r.renderer.machineRoot.matrix.clone().set(
        m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1));
    };
    const recordPose = (robot, pose) => {
      const tcp = robot.tcp;
      observations.maximumPositionErrorMm = Math.max(observations.maximumPositionErrorMm,
        Math.hypot(tcp.xMm - pose.positionMm.xMm, tcp.yMm - pose.positionMm.yMm, tcp.zMm - pose.positionMm.zMm));
      observations.maximumOrientationErrorRad = Math.max(observations.maximumOrientationErrorRad,
        rotationError(expectedRotation(robot), pose.rotationQuaternion));
    };
    window.__level3RobotUnsubscribe = r.robotController.subscribe(event => {
      if (event.type !== 'motion_sample') return;
      observations.robotSamples += 1;
      const sample = r.train.getSubsystem().pusherAdapter.getSample();
      recordPose(event.state, sample);
      if (observations.robotMotionSamples.length < 256) observations.robotMotionSamples.push({
        tcp: event.state.tcp, yawRad: event.state.toolYawRad,
        sampleIndex: event.sampleIndex, sampleCount: event.sampleCount,
        sampleTimeSeconds: sample.sampleTimeSeconds, observedTimeSeconds: sample.observedTimeSeconds,
        sequence: sample.sequence, playbackMultiplier: event.state.simulationPlaybackMultiplier
      });
    });
    window.__level3Unsubscribe = r.renderer.addFrameListener(() => {
      const train = r.train.getDetailedSnapshot(), robot = r.robotController.getState();
      if (!train) return;
      const tcp = robot.tcp;
      observations.frames += 1;
      recordPose(robot, train.pusher.pose);
      const mesh = r.train.getSubsystem().renderer.root.getObjectByName('PUSH_POSITION_BLOCK_PLACEHOLDER');
      mesh.updateWorldMatrix(true, false);
      const renderedPosition = r.renderer.machineRoot.worldToLocal(mesh.getWorldPosition(r.renderer.camera.position.clone()));
      const renderedRotation = r.renderer.machineRoot.getWorldQuaternion(r.renderer.camera.quaternion.clone()).invert()
        .multiply(mesh.getWorldQuaternion(r.renderer.camera.quaternion.clone()));
      observations.maximumRenderedPositionErrorMm = Math.max(observations.maximumRenderedPositionErrorMm,
        Math.hypot(tcp.xMm - renderedPosition.x, tcp.yMm - renderedPosition.y, tcp.zMm - renderedPosition.z));
      observations.maximumRenderedOrientationErrorRad = Math.max(observations.maximumRenderedOrientationErrorRad,
        rotationError(expectedRotation(robot), renderedRotation));
      // This is the declared current collider frame, not proof that a lagging
      // physics substep already consumed it. Retain lastStepCollider separately.
      const frame = train.routeFrame, collider = train.pusher.collider;
      const machinePosition = ['x', 'y', 'z'].map(axis => frame.originMm[axis + 'Mm']
        + frame.forward[axis] * collider.position.x + frame.up[axis] * collider.position.y + frame.right[axis] * collider.position.z);
      const colliderRotation = r.renderer.camera.quaternion.clone().copy(frame.routeQuaternion)
        .multiply(r.renderer.camera.quaternion.clone().copy(collider.rotation));
      observations.maximumDeclaredColliderPositionErrorMm = Math.max(observations.maximumDeclaredColliderPositionErrorMm,
        Math.hypot(tcp.xMm - machinePosition[0], tcp.yMm - machinePosition[1], tcp.zMm - machinePosition[2]));
      observations.maximumDeclaredColliderOrientationErrorRad = Math.max(observations.maximumDeclaredColliderOrientationErrorRad,
        rotationError(expectedRotation(robot), colliderRotation));
      if (observations.frames % 12 === 0 && observations.samples.length < 300) observations.samples.push({
        state: train.state, tcp, worldRevision: robot.worldRevision, train: train.poses ?? train.bodies,
        physics: train.counts, motion: train.motion, pusher: train.pusher.pose,
        lastStepCollider: train.physicalContact?.lastStepCollider, sampling: train.physicalContact?.sampling ?? null });
    });
    return true;
  });
  await capture('00-current-train-and-tcp-pusher');
  const mission = await nativeCall('get_mission_state');
  const pending = nativeCall('test_bridge', sessionInput(mission));
  await new Promise(resolve => setTimeout(resolve, 1200));
  await capture('01-tcp-test-in-progress');
  report.test = await pending;
  await new Promise(resolve => setTimeout(resolve, 550));
  report.final = await snapshot();
  report.readCosts = await evaluate(async () => {
    const r = window.__ROBO_BRIDGE__, costs = {};
    for (const [name, read] of Object.entries({ trainSnapshot: () => r.train.getDetailedSnapshot(),
      pusherSnapshot: () => r.train.getSubsystem().pusherAdapter.getSnapshot(),
      constructionProgress: () => r.construction.getBuildProgress(),
      missionState: () => r.mission.getMissionState({ detail: 'detail', eventLimit: 1 }) })) {
      const start = performance.now(); for (let i = 0; i < 5; i++) await read();
      costs[name] = (performance.now() - start) / 5;
    }
    return costs;
  });
  report.observations = await evaluate(() => {
    window.__level3Unsubscribe?.(); window.__level3RobotUnsubscribe?.(); return window.__level3Diagnostic;
  });
  await capture('02-current-train-result');
  assert.equal(report.final.pendingMoves, 0);
  assert.equal(report.final.robot.operationState, 'idle');
  assert.equal(report.final.pusher.running, false);
  assert.equal(report.observations.maximumPositionErrorMm, 0);
  assert.ok(report.observations.robotSamples > 0, 'Observe real controller samples, not only idle frames');
  assert.ok(report.observations.frames > 0, 'Observe actual rendered frames; initialized zero errors are not evidence');
  for (const key of ['maximumOrientationErrorRad', 'maximumRenderedPositionErrorMm', 'maximumRenderedOrientationErrorRad',
    'maximumDeclaredColliderPositionErrorMm', 'maximumDeclaredColliderOrientationErrorRad']) {
    assert.ok(Number.isFinite(report.observations[key]) && report.observations[key] <= 1e-6,
      `${key}: ${report.observations[key]}`);
  }
  assert.equal(report.final.mission.missionId, before.missionId);
  assert.notEqual(report.final.mission.phase, 'COMPLETE', 'An empty board must not complete');
  for (const kind of ['errors', 'warnings', 'exceptions']) assert.equal(browser.console[kind].length, 0, `Browser ${kind}`);
  report.checks = [
    { name: '31 unique native tools', pass: true },
    { name: 'TCP origin/orientation on real robot samples and rendered frames', pass: true },
    { name: 'current declared collider frame matches TCP; historical solver frame reported separately when available', pass: true },
    { name: 'debug visibility preserves world revision', pass: true },
    { name: 'robot cleanup and same Mission identity', pass: true },
    { name: 'empty board never completes', pass: true },
    { name: 'console errors/warnings/exceptions', pass: true },
    { name: 'full physical push/fall/repair/crossing acceptance', status: 'NOT_TESTED_BY_THIS_DIAGNOSTIC' }
  ];
  report.diagnosticCompleted = true;
  console.log(JSON.stringify({ diagnosticCompleted: true, test: report.test, train: report.final.train.result,
    pusher: report.final.pusher.motion, alignmentErrorMm: report.observations.maximumPositionErrorMm }));
} catch (error) {
  report.error = { message: error.message, stack: error.stack };
  try { report.final = await snapshot(); await capture('99-diagnostic-failure'); } catch {}
  console.error(error); process.exitCode = 1;
} finally {
  try {
    const observations = await evaluate(() => {
      window.__level3Unsubscribe?.(); window.__level3RobotUnsubscribe?.(); return window.__level3Diagnostic ?? null;
    });
    if (observations) report.observations = observations;
  } catch (error) { report.observationCleanupError = error.message; }
  report.console = browser.console;
  try {
    if (writeEvidence) await writeFile(path.join(output, 'diagnostic.json'), JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
}
