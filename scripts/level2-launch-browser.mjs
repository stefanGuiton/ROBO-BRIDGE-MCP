// Explicit Level 2 acceptance: native WebMCP, one live BuildBoard/controller,
// and a clearly labelled test-only Human actor using normal preview/release.
// No Train is created or exercised. Files are written only with --write-evidence.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ChromiumSession } from '../tools/submission/cdp-browser.mjs';
import { MAIN_DEMO_TERRAIN_ASSET, MAIN_DEMO_TERRAIN_URL } from '../apps/web/src/challenge/terrain-asset.js';

const argv = process.argv.slice(2);
const writeEvidence = argv.includes('--write-evidence');
const allowFallback = !argv.includes('--no-fast-forward-fallback');
const url = process.env.ROBO_LEVEL2_URL ?? 'http://127.0.0.1:8774/?demo=bridge&level=2';
const output = path.resolve(process.env.ROBO_LEVEL2_OUTPUT ?? 'output/playwright/launch-level2');
const cycleTimeMs = 300;
const batchLimit = 5;
const startedAt = Date.now();
const deadline = startedAt + 30 * 60_000;
const report = {
  schemaVersion: 'robo-bridge.level2-browser-acceptance.v1',
  url, browser: null, startedAt: new Date(startedAt).toISOString(),
  ok: false, visual: 'INDEPENDENT IMAGE REVIEW REQUIRED',
  humanActor: 'TEST HUMAN SIMULATOR; normal HumanBuildAdapter; not a real user',
  cycleTimeMs, batchLimit, allowFallback,
  checks: [], screenshots: [], assetResponses: [],
  designChanges: [], batches: [], human: [], refills: [], motionFrames: {},
  fallback: null, final: null, console: null,
  expectedProbeExceptions: []
};
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const parseResult = value => typeof value === 'string' ? JSON.parse(value) : value;
const success = (value, label) => assert.equal(value?.ok, true, `${label}: ${JSON.stringify(value)}`);
function check(name, details = {}) {
  report.checks.push({ name, ...details });
  console.log(JSON.stringify({ check: name, ...details }));
}
async function saveReport() {
  if (!writeEvidence) return;
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'acceptance.json'), JSON.stringify(report, null, 2));
}
const preload = `(() => {
  window.__level2Tools = new Map();
  window.__level2DuplicateTools = [];
  const context = document.modelContext ?? navigator.modelContext;
  if (!context?.registerTool) return;
  const prototype = Object.getPrototypeOf(context);
  const original = prototype.registerTool;
  prototype.registerTool = function(tool, options) {
    if (window.__level2Tools.has(tool.name)) window.__level2DuplicateTools.push(tool.name);
    else window.__level2Tools.set(tool.name, tool);
    return original.call(this, tool, options);
  };
})();`;

const assetPath = MAIN_DEMO_TERRAIN_URL;
report.harnessSha256 = createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
const asset = await readFile(assetPath);
assert.equal(asset.toString('ascii', 0, 4), 'glTF', 'Active terrain must be hydrated GLB, not an LFS pointer');
assert.equal(asset.readUInt32LE(4), 2);
assert.equal(asset.readUInt32LE(8), asset.length);
report.terrainAsset = { bytes: asset.length, sha256: createHash('sha256').update(asset).digest('hex') };
if (writeEvidence) await mkdir(output, { recursive: true });
const browser = await ChromiumSession.launch({
  preloadScript: preload, viewport: [1440, 900],
  args: ['--enable-experimental-web-platform-features']
});
report.browser = browser.version.product;
browser.connection.on('Network.responseReceived', (event, sessionId) => {
  if (sessionId !== browser.sessionId || !/\.glb(?:\?|$)/i.test(event.response?.url ?? '')) return;
  report.assetResponses.push({
    url: event.response.url, status: event.response.status,
    mimeType: event.response.mimeType, fromDiskCache: Boolean(event.response.fromDiskCache)
  });
});
const evaluate = (fn, argument = null, options = {}) => browser.evaluate(
  `(${fn.toString()})(${JSON.stringify(argument)})`, options
);
async function nativeCall(name, input = {}) {
  return parseResult(await evaluate(async ({ name, input }) => {
    const testing = document.modelContextTesting ?? navigator.modelContextTesting;
    if (!testing?.executeTool) throw new Error('native_model_context_testing_unavailable');
    return testing.executeTool(name, JSON.stringify(input));
  }, { name, input }, { timeoutMs: 120_000 }));
}
function sessionInput(mission, extra = {}) {
  success(mission, 'fresh mission read');
  assert.ok(mission.missionId && Number.isSafeInteger(mission.revisions?.worldRevision));
  return {
    expectedMissionId: mission.missionId,
    expectedMissionRevision: mission.revisions.missionRevision,
    expectedWorldRevision: mission.revisions.worldRevision,
    ...extra
  };
}
async function capture(name, dataUrl = undefined) {
  if (!writeEvidence) return null;
  const file = path.join(output, `${name}.png`);
  assert.equal(report.screenshots.includes(file), false, `Evidence capture must not overwrite ${name}`);
  if (dataUrl !== undefined) {
    assert.ok(typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png;base64,'), `${name}: same-frame PNG missing`);
    await writeFile(file, Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64'));
  } else await browser.screenshot(file);
  report.screenshots.push(file);
  return file;
}

async function runtimeSnapshot() {
  return evaluate(() => {
    const r = window.__ROBO_BRIDGE__;
    const before = r.robotController.worldRevision;
    const prepared = r.construction?.preparedBuild;
    const placements = prepared?.normalisedBuild?.placements ?? [];
    const byId = new Map(placements.map(p => [p.placementId, p]));
    const targets = r.board.getTargets().map(t => ({
      id: t.targetId ?? t.id, occupiedBy: t.occupiedBy ?? null,
      correctness: t.correctness, completedBy: t.completedBy ?? null,
      executionMode: t.executionMode ?? null,
      partClass: byId.get(t.targetId ?? t.id)?.partClass ?? t.bridgePart?.partClass ?? null,
      collaboration: byId.get(t.targetId ?? t.id)?.collaboration ?? t.collaboration ?? null
    }));
    const trainObjects = [];
    r.renderer.scene.traverse(object => {
      if (/^(ROBO_BRIDGE_TRAIN|TRAIN_|PUSH_POSITION_BLOCK)/.test(object.name ?? '')) trainObjects.push(object.name);
    });
    const robot = r.robotController.getState();
    return {
      worldRevisionBefore: before, worldRevision: r.robotController.worldRevision,
      mode: r.demoModeControl?.getState?.().mode ?? document.documentElement.dataset.demoMode,
      demoLevel: r.demoLevel ?? document.documentElement.dataset.demoLevel ?? null,
      // The inert Level 3 lifecycle facade may exist in Level 2. It must
      // never have constructed the actual integration/physics/scene root.
      trainFacadePresent: r.train != null,
      trainProtocolAdapterPresent: r.mission?.services?.trainService != null,
      trainState: r.train?.getState?.() ?? { enabled: false, configured: false },
      trainSubsystemPresent: r.train?.getSubsystem?.() != null,
      trainEvidencePresent: r.train?.getEvidence?.() != null,
      trainObjects,
      sameAuthorities: !window.__level2Authorities || (
        r.robotController === window.__level2Authorities.controller
        && r.board === window.__level2Authorities.board
        && r.fastPlacement === window.__level2Authorities.coordinator
        && r.placementCycleRunner === window.__level2Authorities.runner
      ),
      sharedRevisionClock: r.robotController.revisionClock === r.board.revisionClock,
      blueprintId: r.board.blueprintId,
      preparedPlan: prepared ? {
        planId: prepared.frozenPlan.planId, designChecksum: prepared.frozenPlan.designChecksum,
        designRevision: prepared.frozenPlan.designRevision,
        partRegistryHash: prepared.registry.hash,
        requiredIds: placements.map(p => p.placementId)
      } : null,
      progress: r.construction?.getBuildProgress?.() ?? null,
      robot: { moving: robot.moving, operationState: robot.operationState, heldBrickId: robot.heldBrickId, tcp: robot.tcp },
      pendingMoveCount: r.robotController.pendingMoveCount,
      humanHeld: r.humanBuildAdapter.getState().heldBrickId,
      targets
    };
  });
}
function assertNoTrain(snapshot, label) {
  assert.equal(snapshot.mode, 'bridge', `${label}: not Level 2 bridge mode`);
  assert.equal(snapshot.trainState.enabled, false, `${label}: Train lifecycle gate is enabled`);
  assert.equal(snapshot.trainState.configured, false, `${label}: Train integration is configured`);
  assert.equal(snapshot.trainSubsystemPresent, false, `${label}: Train subsystem was initialized`);
  assert.equal(snapshot.trainEvidencePresent, false, `${label}: Train preparation evidence exists`);
  assert.deepEqual(snapshot.trainObjects, [], `${label}: Train scene objects exist`);
  assert.equal(snapshot.sameAuthorities, true, `${label}: authority identity changed`);
  assert.equal(snapshot.sharedRevisionClock, true, `${label}: revision clock split`);
}
function acceptedTargets(snapshot) {
  return snapshot.targets.filter(target => target.occupiedBy && target.correctness === true);
}
function assertBoard(snapshot, expected, label) {
  assertNoTrain(snapshot, label);
  assert.equal(snapshot.worldRevisionBefore, snapshot.worldRevision, `${label}: state read changed revision`);
  assert.equal(snapshot.preparedPlan.planId, expected.planId, `${label}: frozen plan changed`);
  assert.equal(snapshot.preparedPlan.designChecksum, expected.designChecksum, `${label}: frozen checksum changed`);
  assert.equal(snapshot.blueprintId, expected.planId);
  assert.deepEqual(snapshot.preparedPlan.requiredIds.toSorted(), expected.requiredIds.toSorted());
  assert.deepEqual(snapshot.targets.map(t => t.id).toSorted(), expected.requiredIds.toSorted());
  const accepted = acceptedTargets(snapshot);
  assert.equal(new Set(accepted.map(t => t.id)).size, accepted.length, `${label}: duplicate target acceptance`);
  assert.equal(new Set(accepted.map(t => t.occupiedBy)).size, accepted.length, `${label}: shared source accepted twice`);
  assert.equal(snapshot.progress.completed, accepted.length);
  assert.equal(snapshot.progress.total, expected.requiredIds.length);
  assert.equal(snapshot.progress.completed + snapshot.progress.remaining, expected.requiredIds.length);
  assert.equal(snapshot.progress.contributions.unknown, 0, `${label}: unknown actor`);
  assert.equal(snapshot.progress.byExecutionMode.unknown, 0, `${label}: unknown execution mode`);
  return accepted;
}
async function settleFrames(count = 3) {
  await evaluate(count => new Promise(resolve => {
    let remaining = count;
    const sample = () => {
      if (--remaining <= 0) { window.__ROBO_BRIDGE__.renderer.render(); resolve(true); }
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }), count);
}
async function setBridgeCamera({ wide = false } = {}) {
  return evaluate(({ wide }) => {
    const r = window.__ROBO_BRIDGE__;
    const start = r.challenge.getEntry().position;
    const end = r.challenge.getExit().position;
    const local = r.renderer.camera.position.clone().set(
      (start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2 - 55
    );
    const focus = r.renderer.machineRoot.localToWorld(local);
    const offset = wide ? [850, -1150, 680] : [480, -640, 350];
    r.renderer.player.setEnabled(false);
    r.renderer.focus.copy(focus);
    r.renderer.yaw = Math.atan2(offset[1], offset[0]);
    r.renderer.pitch = Math.atan2(offset[2], Math.hypot(offset[0], offset[1]));
    r.renderer.radius = Math.hypot(...offset);
    r.renderer.updateCamera();
    r.renderer.render();
    return { focus: focus.toArray(), camera: r.renderer.camera.position.toArray(), wide };
  }, { wide });
}
async function hologramSnapshot() {
  return evaluate(() => {
    const r = window.__ROBO_BRIDGE__;
    const groups = [];
    r.renderer.machineRoot.traverse(object => {
      if (object.name === 'V46_EXACT_BUILDPLAN_HOLOGRAM') groups.push(object);
    });
    const group = groups[0];
    const colourIds = [], depthIds = [], custom = [];
    group?.traverse(mesh => {
      const ids = mesh.userData?.placementIds;
      if (!Array.isArray(ids)) return;
      const pass = mesh.userData.renderPass;
      (pass === 'depth' ? depthIds : colourIds).push(...ids);
      if (mesh.userData.geometryKind === 'custom-definition') custom.push({
        pass, partClass: mesh.userData.partClass, definitionId: mesh.userData.definitionId,
        placementIds: [...ids], vertexCount: mesh.geometry?.getAttribute('position')?.count ?? null
      });
    });
    return {
      groupCount: groups.length, groupUuid: group?.uuid, visible: group?.visible,
      source: r.bridgeHologram?.source, summary: r.bridgeHologram?.summary,
      snapshotIds: r.bridgeHologram?.placements?.map(p => p.placementId) ?? [],
      colourIds, depthIds, custom, renderStats: group?.userData?.renderStats ?? null,
      boardTargetIds: r.board.getTargets().map(t => t.targetId ?? t.id),
      worldRevision: r.robotController.worldRevision,
      rendererInfo: { render: { ...r.renderer.webgl.info.render }, memory: { ...r.renderer.webgl.info.memory } }
    };
  });
}
function assertHologram(snapshot, design, expectedIds = null) {
  assert.equal(snapshot.groupCount, 1, 'Only one exact current hologram may remain');
  assert.equal(snapshot.visible, true);
  assert.equal(snapshot.source.planId, design.planId);
  assert.equal(snapshot.source.designChecksum, design.designChecksum);
  assert.equal(snapshot.source.designRevision, design.designRevision);
  assert.equal(snapshot.renderStats.mode, 'exact-depth-prepass');
  assert.equal(new Set(snapshot.colourIds).size, snapshot.colourIds.length, 'Duplicate physical hologram instances');
  assert.deepEqual(snapshot.colourIds.toSorted(), snapshot.snapshotIds.toSorted());
  assert.deepEqual(snapshot.depthIds.toSorted(), snapshot.snapshotIds.toSorted());
  if (expectedIds) assert.deepEqual(snapshot.snapshotIds.toSorted(), expectedIds.toSorted());
}
async function patchDesign(patch, name) {
  const before = await nativeCall('get_bridge_design', { includeCapabilities: false });
  success(before, 'read design');
  const oldHologram = await hologramSnapshot();
  const result = await nativeCall('update_bridge_design', { expectedDesignRevision: before.designRevision, patch });
  success(result, `design ${name}`);
  await settleFrames();
  const after = await nativeCall('get_bridge_design', { includeCapabilities: false });
  success(after, 'read changed design');
  const hologram = await hologramSnapshot();
  assertHologram(hologram, after);
  if (result.changed) {
    assert.ok(after.designRevision > before.designRevision);
    assert.notEqual(hologram.groupUuid, oldHologram.groupUuid, 'Changed design retained old hologram object');
    assert.notEqual(after.designChecksum, before.designChecksum, 'Changed geometry retained checksum');
  }
  report.designChanges.push({ name, patch, before: {
    planId: before.planId, designRevision: before.designRevision, designChecksum: before.designChecksum
  }, result, hologram });
  check(`semantic design ${name}`, { planId: after.planId, designRevision: after.designRevision,
    arches: after.bridgeSpec.viaduct.archCount, partCount: after.buildPlanSummary.physicalPartCount });
  return after;
}
async function compareHologramRendering() {
  const identityBefore = await hologramSnapshot();
  const sample = async mode => evaluate(async mode => {
    const r = window.__ROBO_BRIDGE__;
    const group = r.renderer.machineRoot.getObjectByName('V46_EXACT_BUILDPLAN_HOLOGRAM');
    if (mode === 'legacy') {
      const saved = [];
      group.traverse(mesh => {
        if (!mesh.userData?.renderPass) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        saved.push({ mesh, visible: mesh.visible, order: mesh.renderOrder,
          materials: materials.map(material => ({ material, depthTest: material.depthTest, opacity: material.opacity })) });
        if (mesh.userData.renderPass === 'depth') mesh.visible = false;
        else {
          mesh.renderOrder = 3;
          for (const material of materials) { material.depthTest = false; material.opacity = 0.46; }
        }
      });
      window.__level2LegacyStyle = saved;
    } else {
      for (const saved of window.__level2LegacyStyle ?? []) {
        saved.mesh.visible = saved.visible; saved.mesh.renderOrder = saved.order;
        for (const entry of saved.materials) { entry.material.depthTest = entry.depthTest; entry.material.opacity = entry.opacity; }
      }
      window.__level2LegacyStyle = null;
    }
    const frameMs = [];
    let previous = null;
    await new Promise(resolve => {
      const tick = now => {
        if (previous !== null) frameMs.push(now - previous);
        previous = now;
        if (frameMs.length < 30) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    r.renderer.render();
    const sorted = [...frameMs].sort((a, b) => a - b);
    return { mode, samples: frameMs.length,
      meanFrameMs: frameMs.reduce((sum, ms) => sum + ms, 0) / frameMs.length,
      p95FrameMs: sorted[Math.floor((sorted.length - 1) * 0.95)],
      render: { ...r.renderer.webgl.info.render }, memory: { ...r.renderer.webgl.info.memory },
      groupUuid: group.uuid, worldRevision: r.robotController.worldRevision };
  }, mode);
  const before = await sample('legacy');
  await capture('01-hologram-legacy-comparison');
  const after = await sample('exterior');
  await capture('02-hologram-exterior-four-arches');
  const identityAfter = await hologramSnapshot();
  assert.equal(identityAfter.groupUuid, identityBefore.groupUuid);
  assert.equal(before.worldRevision, after.worldRevision, 'Presentation comparison changed the world');
  assert.deepEqual(identityAfter.snapshotIds, identityBefore.snapshotIds);
  check('exact hologram presentation comparison', { before, after,
    statement: 'Measured rendering cost only; no performance improvement claim.' });
}

async function installRobotObserver() {
  return evaluate(async ({ includeImage }) => {
    const THREE = await import('/vendor/three.module.min.js');
    const r = window.__ROBO_BRIDGE__;
    const byId = new Map(r.construction.preparedBuild.normalisedBuild.placements.map(p => [p.placementId, p]));
    const initial = r.robotController.getState().tcp;
    window.__level2Motion = { frames: {}, sampleCount: 0, movingFrames: 0, maxTcpDisplacementMm: 0, archHeldId: null, archHeldTcp: null };
    window.__level2MotionCleanup?.();
    window.__level2MotionCleanup = r.renderer.addFrameListener(() => {
      const motion = window.__level2Motion;
      const robot = r.robotController.getState();
      motion.sampleCount += 1;
      if (robot.moving) motion.movingFrames += 1;
      const displacement = Math.hypot(robot.tcp.xMm - initial.xMm, robot.tcp.yMm - initial.yMm, robot.tcp.zMm - initial.zMm);
      motion.maxTcpDisplacementMm = Math.max(motion.maxTcpDisplacementMm, displacement);
      const save = (phase, details = {}) => {
        if (motion.frames[phase]) return;
        // Render and read the PNG synchronously in the frame which measured
        // this real pose. This never changes controller/board state or the
        // requested motion timing; capture overhead remains in wall timings.
        r.renderer.render();
        const brick = details.brickId ? r.robotController.getBricks().find(b => b.id === details.brickId) : null;
        const body = brick ? r.renderer.brickMeshes.get(brick.id) : null;
        const meshes = [];
        body?.traverse(mesh => {
          if (!mesh.isMesh) return;
          mesh.geometry.computeBoundingBox();
          meshes.push({ visible: mesh.visible, vertexCount: mesh.geometry.getAttribute('position')?.count ?? 0,
            materialIsArray: Array.isArray(mesh.material), groups: mesh.geometry.groups.map(group => ({ ...group })),
            drawable: mesh.visible && (mesh.geometry.getAttribute('position')?.count ?? 0) > 0
              && (!Array.isArray(mesh.material) || mesh.geometry.groups.some(group => group.count > 0 && mesh.material[group.materialIndex]?.visible)),
            localBounds: mesh.geometry.boundingBox ? { min: mesh.geometry.boundingBox.min.toArray(), max: mesh.geometry.boundingBox.max.toArray() } : null,
            worldMatrix: mesh.matrixWorld.toArray() });
        });
        const renderPart = body ? { name: body.name, visible: body.visible, position: body.position.toArray(),
          quaternion: body.quaternion.toArray(), meshes, drawable: body.visible && meshes.some(mesh => mesh.drawable) } : null;
        // Reframe only the presentation for the measured ARCH_B pose. Save and
        // restore the orbit camera in this same callback; no motion is paused,
        // no world object is hidden, and no brick is moved for the picture.
        const savedCamera = brick ? { focus: r.renderer.focus.clone(), yaw: r.renderer.yaw,
          pitch: r.renderer.pitch, radius: r.renderer.radius } : null;
        if (brick) {
          const p = brick.position;
          const focus = r.renderer.machineRoot.localToWorld(new THREE.Vector3(p.xMm, p.yMm, p.zMm));
          const offset = [320, -380, 210];
          r.renderer.focus.copy(focus);
          r.renderer.yaw = Math.atan2(offset[1], offset[0]);
          r.renderer.pitch = Math.atan2(offset[2], Math.hypot(offset[0], offset[1]));
          r.renderer.radius = Math.hypot(...offset);
          r.renderer.updateCamera(); r.renderer.render();
        }
        const camera = { position: r.renderer.camera.position.toArray(), focus: r.renderer.focus.toArray() };
        const dataUrl = includeImage ? r.renderer.canvas.toDataURL('image/png') : null;
        if (savedCamera) {
          r.renderer.focus.copy(savedCamera.focus); r.renderer.yaw = savedCamera.yaw;
          r.renderer.pitch = savedCamera.pitch; r.renderer.radius = savedCamera.radius;
          r.renderer.updateCamera(); r.renderer.render();
        }
        motion.frames[phase] = { phase, tcp: { ...robot.tcp }, moving: robot.moving,
          operationState: robot.operationState, heldBrickId: robot.heldBrickId,
          worldRevision: r.robotController.worldRevision, ...details,
          brick: brick ? { id: brick.id, position: { ...brick.position }, yawRad: brick.yawRad,
            heldBy: brick.heldBy, placedTargetId: brick.placedTargetId, bridgePart: brick.bridgePart } : null,
          renderPart, camera, dataUrl };
      };
      if (robot.moving && displacement > 5) save('robot-moving');
      if (robot.heldBrickId && !motion.frames['arch-carried']) {
        const held = r.robotController.getBricks().find(b => b.id === robot.heldBrickId);
        if (held?.bridgePart?.partClass === 'ARCH_B') {
          if (!motion.archHeldId) { motion.archHeldId = held.id; motion.archHeldTcp = { ...robot.tcp }; }
          save('arch-pickup', { brickId: held.id, partClass: held.bridgePart.partClass, registryKey: held.bridgePart.registryKey });
          const liftDistance = Math.hypot(robot.tcp.xMm - motion.archHeldTcp.xMm,
            robot.tcp.yMm - motion.archHeldTcp.yMm, robot.tcp.zMm - motion.archHeldTcp.zMm);
          if (robot.moving && liftDistance > 30) save('arch-carried', { brickId: held.id, partClass: 'ARCH_B', liftDistance });
        }
      }
      if (motion.archHeldId && !robot.heldBrickId && !motion.frames['arch-placed']) {
        const target = r.board.getTargets().find(t => t.occupiedBy === motion.archHeldId
          && t.correctness === true && ['agent', 'codex'].includes(t.completedBy)
          && t.executionMode !== 'simulated_fast_forward'
          && byId.get(t.targetId ?? t.id)?.partClass === 'ARCH_B');
        if (target) save('arch-placed', { targetId: target.targetId ?? target.id,
          brickId: target.occupiedBy, partClass: 'ARCH_B', completedBy: target.completedBy, executionMode: 'robot' });
      }
    });
    return true;
  }, { includeImage: writeEvidence });
}
async function drainMotionFrames() {
  const motion = await evaluate(() => {
    const motion = window.__level2Motion;
    if (!motion) return null;
    const fresh = [];
    for (const frame of Object.values(motion.frames)) {
      if (frame.delivered) continue;
      fresh.push({ ...frame });
      frame.delivered = true;
      // Only this diagnostic readback copy is released. The live scene is untouched.
      frame.dataUrl = null;
    }
    return { sampleCount: motion.sampleCount, movingFrames: motion.movingFrames,
      maxTcpDisplacementMm: motion.maxTcpDisplacementMm, fresh };
  });
  if (!motion) return;
  const filenames = { 'robot-moving': '07-robot-moving', 'arch-pickup': '08-real-arch-pickup',
    'arch-carried': '09-real-arch-carried', 'arch-placed': '10-real-arch-placed' };
  for (const frame of motion.fresh) {
    assert.equal(report.motionFrames[frame.phase], undefined, 'Motion frame was delivered twice');
    const { dataUrl, ...metadata } = frame;
    const file = await capture(filenames[frame.phase], dataUrl);
    report.motionFrames[frame.phase] = { ...metadata, file, imageCaptured: Boolean(file) };
    if (frame.partClass === 'ARCH_B') assert.equal(frame.renderPart?.drawable, true,
      `Measured ARCH_B has no drawable live mesh: ${JSON.stringify(metadata)}`);
    console.log(JSON.stringify({ observed: frame.phase, ...metadata, file }));
  }
  report.motionSampling = { sampleCount: motion.sampleCount, movingFrames: motion.movingFrames,
    maxTcpDisplacementMm: motion.maxTcpDisplacementMm };
}
async function observedNativeBuild(input) {
  await evaluate(({ input }) => {
    const testing = document.modelContextTesting ?? navigator.modelContextTesting;
    if (!testing?.executeTool) throw new Error('native_model_context_testing_unavailable');
    if (window.__level2PendingCall && !window.__level2PendingCall.done) throw new Error('overlapping_native_batch');
    const call = { done: false, startedAt: performance.now(), input };
    window.__level2PendingCall = call;
    Promise.resolve(testing.executeTool('build_next_parts', JSON.stringify(input))).then(
      result => { call.result = result; call.done = true; call.durationMs = performance.now() - call.startedAt; },
      error => { call.error = { name: error?.name, message: error?.message }; call.done = true; }
    );
    return true;
  }, { input });
  const batchDeadline = Math.min(deadline, Date.now() + 120_000);
  while (Date.now() < batchDeadline) {
    await drainMotionFrames();
    const status = await evaluate(() => {
      const call = window.__level2PendingCall;
      return call.done ? call : { done: false };
    });
    if (status.done) {
      await drainMotionFrames();
      assert.equal(status.error, undefined, `Native build failed: ${JSON.stringify(status.error)}`);
      return { result: parseResult(status.result), durationMs: status.durationMs };
    }
    await delay(90);
  }
  throw new Error('bounded_native_build_timeout');
}

async function humanPlaceNext() {
  return evaluate(async () => {
    const r = window.__ROBO_BRIDGE__;
    const { eligibleBatch } = await import('/src/bridge-construction/bridge-build-session.js');
    const robot = r.robotController.getState();
    if (robot.moving || robot.operationState !== 'idle' || robot.heldBrickId
      || r.robotController.pendingMoveCount || r.humanBuildAdapter.getState().heldBrickId) {
      return { ok: false, reason: 'operation_in_progress', actor: 'human', simulation: true };
    }
    const prepared = r.construction.preparedBuild;
    const revisionBeforeSelection = r.robotController.worldRevision;
    const eligible = eligibleBatch(prepared, r.board, 5, { actorHint: 'human' });
    const sources = r.robotController.getBricks().filter(b => !b.heldBy && !b.snapped
      && !b.placedTargetId && !b.placementType && b.graspable !== false);
    const selection = eligible.selected.filter(p => p.collaboration?.advisoryActor === 'human'
      && p.dependencyIds.every(id => eligible.accepted.has(id))).map(placement => ({
      placement, source: sources.find(b => b.colour === placement.compatibilityKey
        && b.bridgePart?.allowedActors?.includes('human')
        && prepared.inventory.compatibleSources(placement.compatibilityKey).some(s => s.sourceId === b.id))
    })).find(item => item.source);
    if (revisionBeforeSelection !== r.robotController.worldRevision) throw new Error('human_selection_mutated_world');
    if (!selection) return { ok: false,
      reason: eligible.selected.some(p => p.collaboration?.advisoryActor === 'human') ? 'human_source_unavailable' : 'no_ready_human_side_target',
      actor: 'human', simulation: true, scheduling: eligible.scheduling };
    const { placement, source } = selection;
    const target = r.board.getTarget(placement.placementId);
    const before = r.construction.getBuildProgress();
    if (target.occupiedBy || target.correctness) throw new Error('human_selected_accepted_target');
    const pickup = r.humanBuildAdapter.pickup(source.id);
    if (!pickup.ok) return { ...pickup, actor: 'human', simulation: true, stage: 'pickup' };
    const previewRevision = r.robotController.worldRevision;
    const preview = r.robotController.placementAuthority.preview({
      brickId: source.id, position: target.position, yawRad: target.yawRad
    });
    if (r.robotController.worldRevision !== previewRevision) throw new Error('human_preview_mutated_world');
    if (!preview.ok || !preview.candidate?.valid || preview.candidate.targetId !== placement.placementId) {
      const cancel = r.humanBuildAdapter.cancel();
      return { ok: false, reason: preview.reason ?? 'invalid_human_target_preview', actor: 'human', simulation: true,
        stage: 'preview', placementId: placement.placementId, sourceId: source.id, preview, cancel };
    }
    if (!r.humanBuildAdapter.setPreview(preview.candidate)) throw new Error('human_preview_not_applied');
    const released = r.humanBuildAdapter.release();
    if (!released.ok) {
      const cancel = r.humanBuildAdapter.cancel();
      return { ...released, actor: 'human', simulation: true, stage: 'release', cancel };
    }
    const accepted = r.board.getTarget(placement.placementId);
    const liveSource = r.robotController.getBricks().find(b => b.id === source.id);
    return { ok: true, actor: 'human', simulation: true,
      actorLabel: 'TEST HUMAN SIMULATOR; not real pointer input',
      targetId: placement.placementId, sourceId: source.id, partClass: placement.partClass,
      advisoryActor: placement.collaboration.advisoryActor, side: placement.collaboration.side,
      sourceColour: source.colour, sourceDisplayHex: source.displayHex,
      colourPreserved: liveSource?.colour === source.colour && liveSource?.displayHex === source.displayHex,
      worldRevisionBefore: before.worldRevision, pickupWorldRevision: pickup.worldRevision,
      previewWorldRevision: previewRevision, worldRevisionAfter: r.robotController.worldRevision,
      completedBefore: before.completed, completedAfter: r.construction.getBuildProgress().completed,
      target: { occupiedBy: accepted.occupiedBy, correctness: accepted.correctness, completedBy: accepted.completedBy },
      normalAuthorityApplied: released.placementAuthorityApplied === true,
      heldAfter: r.humanBuildAdapter.getState().heldBrickId };
  });
}
async function nativeSafetyChecks() {
  const before = await runtimeSnapshot();
  const mission = await nativeCall('get_mission_state');
  const stale = await nativeCall('build_next_parts', sessionInput(mission, {
    expectedWorldRevision: mission.revisions.worldRevision + 1, count: 1, executionMode: 'robot', cycleTimeMs, actorHint: 'agent'
  }));
  assert.equal(stale.ok, false);
  assert.equal(stale.error?.code, 'STALE_WORLD_REVISION', JSON.stringify(stale));
  const afterStale = await runtimeSnapshot();
  assert.equal(afterStale.worldRevision, before.worldRevision);
  assert.deepEqual(afterStale.targets, before.targets);
  check('native stale revision rejected without mutation', { error: stale.error.code, worldRevision: before.worldRevision });

  // Discover AbortSignal support using a READ-ONLY call first. An older
  // browser which ignores the third argument cannot accidentally place a part.
  const readProbeExceptionStart = browser.console.exceptions.length;
  const probe = await evaluate(async () => {
    const testing = document.modelContextTesting ?? navigator.modelContextTesting;
    const abort = new AbortController(); abort.abort('level2_preaborted_read_probe');
    let signalRead = false, result = null, error = null;
    try { result = await testing.executeTool('get_build_progress', '{}', {
      get signal() { signalRead = true; return abort.signal; }
    }); } catch (failure) { error = { name: failure.name, message: failure.message }; }
    return { signalRead, result, error };
  });
  await settleFrames();
  recordExpectedAbortExceptions(readProbeExceptionStart, 'level2_preaborted_read_probe', probe.error);
  report.nativeCancellation = { capabilityProbe: probe, mutationTested: false };
  if (probe.signalRead) {
    const fresh = await nativeCall('get_mission_state');
    const buildProbeExceptionStart = browser.console.exceptions.length;
    const cancelled = await evaluate(async input => {
      const testing = document.modelContextTesting ?? navigator.modelContextTesting;
      const abort = new AbortController(); abort.abort('level2_preaborted_build');
      try { return { result: await testing.executeTool('build_next_parts', JSON.stringify(input), { signal: abort.signal }) }; }
      catch (error) { return { error: { name: error.name, message: error.message } }; }
    }, sessionInput(fresh, { count: 1, cycleTimeMs, actorHint: 'agent', executionMode: 'robot' }));
    const parsed = cancelled.result ? parseResult(cancelled.result) : null;
    assert.ok(cancelled.error || parsed?.ok === false, `Cancelled native call unexpectedly succeeded: ${JSON.stringify(cancelled)}`);
    await settleFrames();
    recordExpectedAbortExceptions(buildProbeExceptionStart, 'level2_preaborted_build', cancelled.error);
    const after = await runtimeSnapshot();
    assert.equal(after.worldRevision, before.worldRevision, 'Pre-cancelled native build mutated world');
    assert.deepEqual(after.targets, before.targets);
    report.nativeCancellation = { ...report.nativeCancellation, mutationTested: true, cancelled };
    check('native pre-aborted build has no side effects', { outcome: cancelled.error ?? parsed?.error ?? parsed?.reason });
  } else check('native cancellation capability', { available: false,
    statement: 'This browser did not consume executeTool options.signal; no native cancellation PASS is claimed.' });
}

function recordExpectedAbortExceptions(startIndex, reason, caughtError) {
  // Chrome may report an aborted native testing call through CDP even when
  // its returned Promise is caught. Preserve the raw exceptions and classify
  // only this exact one-shot probe's sentinel, within its measured call window.
  const emitted = browser.console.exceptions.slice(startIndex);
  assert.ok(emitted.length <= 1, `Unexpected exception count during ${reason}: ${JSON.stringify(emitted)}`);
  for (const exception of emitted) {
    assert.ok(caughtError, `An exception escaped a probe without a caught rejection: ${reason}`);
    assert.equal(exception.exception?.type, 'string');
    assert.equal(exception.exception?.value, reason);
    assert.equal(exception.url, url);
    report.expectedProbeExceptions.push({ reason, caughtError, exception });
  }
}

async function verifyLevel2UiAndTrainGuard() {
  const ui = await evaluate(() => {
    const r = window.__ROBO_BRIDGE__;
    const select = document.querySelector('select[data-demo-mode]');
    const labels = r.renderer.machineRoot.getObjectByName('BRIDGE_ADVISORY_SIDE_LABELS');
    return { selectValue: select?.value, selectedText: select?.selectedOptions?.[0]?.textContent,
      rootMode: document.documentElement.dataset.demoMode, rootLevel: document.documentElement.dataset.demoLevel ?? null,
      labelGroupVisible: labels?.visible, labelCount: labels?.children.length,
      labels: labels?.children.map(label => ({ scale: label.scale.toArray(), visible: label.visible,
        toneMapped: label.material?.toneMapped, textureColourSpace: label.material?.map?.colorSpace })) ?? [] };
  });
  assert.equal(ui.selectValue, 'bridge'); assert.equal(ui.rootMode, 'bridge');
  assert.match(ui.selectedText, /^2\s/); assert.equal(ui.labelGroupVisible, true); assert.equal(ui.labelCount, 2);
  for (const label of ui.labels) { assert.equal(label.visible, true); assert.equal(label.toneMapped, false); }
  check('current Level 2 selector and spatial side labels', ui);
  const before = await runtimeSnapshot();
  const missionBefore = await nativeCall('get_mission_state');
  const rejected = await nativeCall('test_bridge', sessionInput(missionBefore));
  assert.equal(rejected.ok, false); assert.equal(rejected.error?.code ?? rejected.reason, 'LEVEL3_ONLY', JSON.stringify(rejected));
  const after = await runtimeSnapshot();
  const missionAfter = await nativeCall('get_mission_state');
  assertNoTrain(after, 'rejected Level 3 tool');
  assert.equal(after.worldRevision, before.worldRevision); assert.deepEqual(after.targets, before.targets);
  assert.equal(missionAfter.phase, missionBefore.phase); assert.deepEqual(missionAfter.revisions, missionBefore.revisions);
  assert.equal(missionAfter.nextActions.includes('test_bridge'), false);
  assert.equal(rejected.error?.allowedNextActions?.includes('test_bridge') ?? false, false);
  check('native Train tool rejected without Level 2 mutation', { rejected, phase: missionAfter.phase, revisions: missionAfter.revisions });
}

try {
  await browser.navigate(url);
  await browser.waitFor(`document.documentElement.dataset.runtimeReady === 'true'`, { timeoutMs: 90_000 });
  const boot = await evaluate(async () => {
    const r = window.__ROBO_BRIDGE__;
    const context = document.modelContext ?? navigator.modelContext;
    const testing = document.modelContextTesting ?? navigator.modelContextTesting;
    const nativeTools = typeof testing?.listTools === 'function' ? await testing.listTools() : null;
    window.__level2Authorities = { controller: r.robotController, board: r.board, coordinator: r.fastPlacement, runner: r.placementCycleRunner };
    const terrain = r.challenge.getState();
    return { native: Boolean(context?.registerTool), testing: Boolean(testing?.executeTool),
      names: [...window.__level2Tools.keys()], nativeNames: nativeTools?.map(t => t.name) ?? null,
      duplicates: [...window.__level2DuplicateTools],
      terrain: { loaded: terrain.loaded, terrainAsset: terrain.terrainAsset, metrics: terrain.terrainMetrics,
        challengeId: terrain.bridgeChallengeInput?.id, visible: r.challenge.terrainGroup.visible },
      gripper: r.renderer.getPerformance().gripper };
  });
  assert.equal(boot.native, true); assert.equal(boot.testing, true);
  assert.equal(boot.names.length, 31); assert.equal(new Set(boot.names).size, 31);
  assert.deepEqual(boot.duplicates, []);
  if (boot.nativeNames) assert.deepEqual(boot.nativeNames.toSorted(), boot.names.toSorted());
  for (const name of ['get_bridge_design', 'update_bridge_design', 'start_bridge_build', 'get_build_progress', 'build_next_parts']) assert.ok(boot.names.includes(name));
  assert.equal(boot.terrain.loaded, true); assert.equal(boot.terrain.visible, true);
  assert.equal(boot.terrain.challengeId, 'terrain7-easy-aqueduct');
  assert.ok(report.assetResponses.some(r => new URL(r.url).pathname === `/${MAIN_DEMO_TERRAIN_ASSET.packagePath}` && r.status === 200), 'Current terrain binary did not load over HTTP');
  const initialState = await runtimeSnapshot(); assertNoTrain(initialState, 'boot');
  check('native Level 2 current terrain boot without Train', { ...boot, terrainAsset: report.terrainAsset });
  await verifyLevel2UiAndTrainGuard();
  await setBridgeCamera({ wide: true }); await capture('00-current-terrain-level2-no-train');
  await setBridgeCamera();

  const four = await patchDesign({ family: 'viaduct', viaduct: { archCount: 4 } }, 'four arches');
  assert.equal(four.bridgeSpec.viaduct.archCount, 4);
  await compareHologramRendering();
  const five = await patchDesign({ viaduct: { archCount: 5 } }, 'five arches');
  assert.equal(five.bridgeSpec.viaduct.archCount, 5);
  assert.notEqual(five.designChecksum, four.designChecksum);
  await capture('03-hologram-five-arches');
  const widerRatio = Math.min(0.94, Number(five.bridgeSpec.viaduct.openingWidthRatio) + 0.03);
  assert.notEqual(widerRatio, five.bridgeSpec.viaduct.openingWidthRatio);
  const wider = await patchDesign({ viaduct: { openingWidthRatio: widerRatio } }, 'wider openings');
  assert.equal(wider.bridgeSpec.viaduct.openingWidthRatio, widerRatio);
  await capture('04-hologram-wider-openings');
  const desired = await patchDesign({ viaduct: { archCount: 4, openingWidthRatio: four.bridgeSpec.viaduct.openingWidthRatio } }, 'restore supported four arches');
  assert.equal(desired.designChecksum, four.designChecksum, 'Restored geometry must match the original four-arch design');
  await capture('05-hologram-frozen-design');

  const mission = await nativeCall('get_mission_state');
  const started = await nativeCall('start_bridge_build', sessionInput(mission, { expectedDesignRevision: desired.designRevision }));
  success(started, 'start bridge build');
  await settleFrames();
  let state = await runtimeSnapshot();
  const expected = state.preparedPlan;
  assert.ok(expected?.requiredIds.length > 0);
  assert.equal(expected.requiredIds.length, desired.buildPlanSummary.physicalPartCount);
  assert.equal(started.requiredPartCount, expected.requiredIds.length);
  assertBoard(state, expected, 'start');
  const nativeProgress = await nativeCall('get_build_progress'); success(nativeProgress, 'native initial progress');
  assert.equal(nativeProgress.build.required, expected.requiredIds.length);
  assert.equal(nativeProgress.collaboration?.advisoryOnly, true, JSON.stringify(nativeProgress));
  assert.equal(nativeProgress.collaboration.byAdvisorySide.human.total + nativeProgress.collaboration.byAdvisorySide.agent.total, expected.requiredIds.length);
  const permissions = await evaluate(() => {
    const prepared = window.__ROBO_BRIDGE__.construction.preparedBuild;
    return { allPartsShared: prepared.registry.list().every(p => p.allowedActors.includes('human') && p.allowedActors.includes('agent')),
      registryClasses: [...new Set(prepared.registry.list().map(p => p.partClass))] };
  });
  assert.equal(permissions.allPartsShared, true);
  check('frozen exact shared BuildBoard and advisory side split', { plan: expected, collaboration: nativeProgress.collaboration, permissions });
  await capture('06-shared-build-start');
  await nativeSafetyChecks();
  await setBridgeCamera({ wide: true });
  await installRobotObserver();

  let executionMode = 'robot';
  let noProgressCount = 0;
  let refillCount = 0;
  for (let batchNumber = 1; batchNumber <= expected.requiredIds.length * 2; batchNumber += 1) {
    assert.ok(Date.now() < deadline, 'Level 2 journey exceeded its bounded 30-minute deadline');
    state = await runtimeSnapshot(); assertBoard(state, expected, `batch ${batchNumber} before Human`);
    if (state.progress.remaining === 0) break;
    const completedAtIterationStart = state.progress.completed;

    // Human work is interleaved between bounded native batches. No Human
    // operation overlaps a moving robot or falsifies a pointer-input claim.
    for (let index = 0; index < batchLimit; index += 1) {
      const human = await humanPlaceNext();
      if (!human.ok) {
        assert.ok(['human_source_unavailable', 'no_ready_human_side_target'].includes(human.reason), JSON.stringify(human));
        break;
      }
      assert.equal(human.actor, 'human'); assert.equal(human.simulation, true);
      assert.equal(human.advisoryActor, 'human'); assert.equal(human.target.completedBy, 'human');
      assert.equal(human.target.correctness, true); assert.equal(human.target.occupiedBy, human.sourceId);
      assert.equal(human.normalAuthorityApplied, true); assert.equal(human.colourPreserved, true);
      assert.equal(human.heldAfter, null); assert.equal(human.completedAfter, human.completedBefore + 1);
      assert.ok(human.pickupWorldRevision > human.worldRevisionBefore);
      assert.ok(human.worldRevisionAfter > human.pickupWorldRevision);
      report.human.push(human);
      if (report.human.length === 1) {
        await settleFrames(); await capture('06a-test-human-normal-accepted');
        check('test Human normal preview/release acceptance', human);
      }
    }
    const before = await runtimeSnapshot(); assertBoard(before, expected, `batch ${batchNumber} before native`);
    if (before.progress.remaining === 0) { state = before; break; }
    const freshMission = await nativeCall('get_mission_state');
    const count = Math.min(batchLimit, before.progress.remaining);
    const input = sessionInput(freshMission, { count, executionMode, cycleTimeMs, actorHint: 'agent' });
    const observed = await observedNativeBuild(input);
    await settleFrames();
    const after = await runtimeSnapshot(); assertBoard(after, expected, `batch ${batchNumber} after native`);
    const progress = await nativeCall('get_build_progress'); success(progress, 'native progress after batch');
    assert.equal(progress.build.accepted, after.progress.completed);
    assert.equal(progress.build.remaining, after.progress.remaining);
    assert.equal(progress.plan.planId, expected.planId);
    assert.ok(after.worldRevision >= before.worldRevision);
    const beforeAccepted = new Map(acceptedTargets(before).map(t => [t.id, t]));
    const accepted = acceptedTargets(after);
    for (const previous of beforeAccepted.values()) {
      assert.deepEqual(accepted.find(t => t.id === previous.id), previous, 'A prior accepted target was changed');
    }
    const delta = accepted.filter(t => !beforeAccepted.has(t.id));
    assert.ok(delta.length <= count, 'A bounded call accepted more parts than requested');
    const execution = await evaluate(() => {
      const r = window.__ROBO_BRIDGE__;
      const state = r.construction.getBuildState();
      return { lastPlan: state.lastPlan, lastExecution: state.lastExecution, runner: state.runner };
    });
    const batch = { batchNumber, input, durationMs: observed.durationMs, result: observed.result,
      worldRevisionBefore: before.worldRevision, worldRevisionAfter: after.worldRevision,
      newlyAccepted: delta, progress: after.progress, nativeProgress: progress,
      lastExecution: execution.lastExecution, scheduling: execution.lastPlan?.scheduling ?? null };
    report.batches.push(batch);
    console.log(JSON.stringify({ batch: batchNumber, mode: executionMode, requested: count, accepted: delta.length,
      completed: after.progress.completed, total: after.progress.total,
      human: after.progress.contributions.human, robot: after.progress.byExecutionMode.robot,
      fastForward: after.progress.byExecutionMode.simulated_fast_forward,
      overruns: execution.lastExecution?.overruns ?? null,
      reason: observed.result.error?.code ?? observed.result.reason ?? null }));
    if (observed.result.ok === true) assert.equal(observed.result.completed, delta.length, 'Native completed count disagrees with board delta');

    const stalled = delta.length === 0;
    const underlyingReason = execution.lastExecution?.reason ?? observed.result.error?.code ?? observed.result.reason;
    const failed = observed.result.ok === false || (stalled && after.progress.remaining > 0);
    if (failed && executionMode === 'robot') {
      const failure = { batchNumber, result: observed.result, execution, state: after, underlyingReason };
      report.robotBlocker = failure;
      await capture('11-real-robot-blocker');
      await drainMotionFrames();
      assert.ok(allowFallback, `Real robot blocked; fallback disabled: ${JSON.stringify(observed.result)}`);
      assert.ok(report.motionFrames['robot-moving'] && report.motionFrames['arch-pickup'] && report.motionFrames['arch-placed'],
        'Accelerated fallback is forbidden before genuine robot movement and ARCH_B pickup/placement are observed');
      assert.equal(after.robot.moving, false); assert.equal(after.robot.operationState, 'idle');
      assert.equal(after.robot.heldBrickId, null, 'No fallback while the real gripper is holding a part');
      report.fallback = { executionMode: 'simulated_fast_forward', explicitlyLabelled: true,
        trigger: underlyingReason, firstBatch: batchNumber + 1, remainingAtStart: after.progress.remaining,
        robotExecuted: false, motionCollisionVerified: false,
        statement: 'Only remaining bounded deterministic placements; not robot-motion or collision proof.' };
      check('explicit bounded accelerated fallback after real robot blocker', report.fallback);
      executionMode = 'simulated_fast_forward';
    } else if (failed) {
      assert.fail(`Accelerated path failed closed: ${JSON.stringify({ result: observed.result, execution })}`);
    }
    noProgressCount = after.progress.completed === completedAtIterationStart ? noProgressCount + 1 : 0;
    if (noProgressCount > 0 && report.refills.length < 8) {
      const current = await nativeCall('get_mission_state');
      const refill = await nativeCall('request_more_bricks', { expectedWorldRevision: current.revisions.worldRevision });
      success(refill, 'shared inventory refill');
      refillCount += 1; report.refills.push({ refillCount, result: refill });
      assert.ok(Number(refill.spawnedDelta) > 0, 'Shared feeder produced no new sources');
    }
    assert.ok(noProgressCount < 3, 'Three bounded iterations made no accepted progress');
    if (batchNumber % 10 === 0) await saveReport();
    state = after;
  }

  await drainMotionFrames();
  state = await runtimeSnapshot();
  const accepted = assertBoard(state, expected, 'completed bridge');
  assert.equal(state.progress.remaining, 0, JSON.stringify(state.progress));
  assert.equal(accepted.length, expected.requiredIds.length);
  assert.ok(state.progress.contributions.human > 0, 'No accepted Human contribution');
  assert.ok(state.progress.byExecutionMode.robot > 0, 'No genuine robot placements');
  assert.equal(report.human.length, state.progress.contributions.human);
  assert.ok(report.motionFrames['robot-moving'] && report.motionFrames['arch-pickup'] && report.motionFrames['arch-placed']);
  const completion = await nativeCall('get_build_progress'); success(completion, 'native completed progress');
  assert.equal(completion.build.accepted, expected.requiredIds.length);
  assert.equal(completion.build.incorrect, 0);
  await settleFrames();
  const finalHologram = await hologramSnapshot(); assertHologram(finalHologram, desired, []);
  assert.equal(finalHologram.summary.pendingPhysicalCount, 0);
  await setBridgeCamera(); await capture('12-shared-bridge-complete');
  await setBridgeCamera({ wide: true }); await capture('13-complete-terrain-no-train');
  const finalMission = await nativeCall('get_mission_state', { detail: 'detail' }); success(finalMission, 'final mission read');
  assert.equal(finalMission.phase, 'BUILD', 'Level 2 completion must not fake a Train/Mission COMPLETE result');
  assert.equal(finalMission.nextActions.includes('test_bridge'), false);
  report.final = { expected, progress: completion, mission: finalMission, state, hologram: finalHologram };
  check('dynamic exact shared bridge completion without Train', { planId: expected.planId, total: expected.requiredIds.length,
    uniqueTargets: new Set(accepted.map(t => t.id)).size, uniqueSourceIds: new Set(accepted.map(t => t.occupiedBy)).size,
    contributions: state.progress.contributions, byExecutionMode: state.progress.byExecutionMode,
    byPartClass: state.progress.byPartClass, collaboration: state.progress.collaboration });
  report.console = browser.console;
  assert.equal(browser.console.errors.length, 0, JSON.stringify(browser.console.errors));
  assert.equal(browser.console.warnings.length, 0, JSON.stringify(browser.console.warnings));
  const expectedExceptions = new Set(report.expectedProbeExceptions.map(entry => entry.exception));
  const unexpectedExceptions = browser.console.exceptions.filter(exception => !expectedExceptions.has(exception));
  assert.equal(unexpectedExceptions.length, 0, JSON.stringify(unexpectedExceptions));
  report.consoleSummary = { applicationErrors: browser.console.errors.length,
    applicationWarnings: browser.console.warnings.length, unexpectedExceptions: unexpectedExceptions.length,
    rawExceptions: browser.console.exceptions.length, expectedProbeExceptions: report.expectedProbeExceptions.length };
  check('application console; raw expected cancellation probes retained', report.consoleSummary);
  report.ok = true;
} catch (error) {
  report.ok = false; report.error = error?.stack ?? String(error);
  report.console = browser.console;
  try { report.failureState = await runtimeSnapshot(); } catch {}
  try { await drainMotionFrames(); } catch {}
  try { await capture('failure'); } catch {}
  console.error(error);
  process.exitCode = 1;
} finally {
  try { await evaluate(() => { window.__level2MotionCleanup?.(); window.__level2MotionCleanup = null; return true; }); } catch {}
  report.finishedAt = new Date().toISOString(); report.durationMs = Date.now() - startedAt;
  await saveReport();
  await browser.close();
}
if (report.ok) console.log(JSON.stringify({ passed: true, checks: report.checks.length,
  total: report.final.state.progress.total, contributions: report.final.state.progress.contributions,
  byExecutionMode: report.final.state.progress.byExecutionMode,
  screenshots: report.screenshots, visual: report.visual }));
