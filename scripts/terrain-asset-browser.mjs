// Explicit current-asset browser smoke, not a full construction/Train gate.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ChromiumSession } from '../tools/submission/cdp-browser.mjs';
import { MAIN_DEMO_TERRAIN_ASSET } from '../apps/web/src/challenge/terrain-asset.js';

const writeEvidence = process.argv.includes('--write-evidence');
const output = path.resolve(process.env.ROBO_TERRAIN_OUTPUT ?? 'output/playwright/terrain9-smoke');
const url = process.env.ROBO_TERRAIN_URL ?? 'http://127.0.0.1:8774/?demo=bridge&level=2';
const report = { ok: false, url, expectedAsset: MAIN_DEMO_TERRAIN_ASSET, responses: [], screenshots: [],
  scope: 'Current production terrain, alignment and native boot; not full construction/Train acceptance',
  visual: 'IMAGE REVIEW REQUIRED' };
if (writeEvidence) await mkdir(output, { recursive: true });
const browser = await ChromiumSession.launch({ viewport: [1440, 900], args: ['--enable-experimental-web-platform-features'] });
const evaluate = (fn, value = null) => browser.evaluate(`(${fn.toString()})(${JSON.stringify(value)})`);
browser.connection.on('Network.responseReceived', (event, sessionId) => {
  if (sessionId === browser.sessionId && /\.glb(?:\?|$)/i.test(event.response?.url ?? '')) {
    report.responses.push({ url: event.response.url, status: event.response.status });
  }
});
async function capture(name) {
  if (!writeEvidence) return;
  const file = path.join(output, `${name}.png`);
  await browser.screenshot(file); report.screenshots.push(file);
}
try {
  report.browser = browser.version.product;
  await browser.navigate(url);
  await browser.waitFor(`document.documentElement.dataset.runtimeReady === 'true'`, { timeoutMs: 90000 });
  report.tools = await evaluate(async () => (await (document.modelContextTesting ?? navigator.modelContextTesting).listTools()).map(t => t.name));
  assert.equal(report.tools.length, 31); assert.equal(new Set(report.tools).size, 31);
  report.design = await evaluate(async () => {
    const raw = await (document.modelContextTesting ?? navigator.modelContextTesting).executeTool('get_bridge_design', '{}');
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  });
  assert.equal(report.design.ok, true);
  report.scene = await evaluate(() => {
    const r = window.__ROBO_BRIDGE__, before = r.robotController.worldRevision;
    const challenge = r.challenge.getState(), root = r.challenge.terrainGroup;
    const point = name => root.getObjectByName(name).getWorldPosition(r.renderer.camera.position.clone()).toArray();
    const trainObjects = [];
    r.renderer.scene.traverse(o => { if (/^(ROBO_BRIDGE_TRAIN|TRAIN_|PUSH_POSITION_BLOCK)/.test(o.name)) trainObjects.push(o.name); });
    return { before, after: r.robotController.worldRevision, challenge,
      anchors: { entry: point('ENTRY'), exit: point('EXIT') }, trainObjects,
      train: r.train.getState(), trainSubsystem: r.train.getSubsystem() != null,
      sharedClock: r.board.revisionClock === r.robotController.revisionClock,
      planId: r.bridgeHost.buildPlan.planId, checksum: r.bridgeHost.buildPlan.designChecksum,
      parts: r.bridgeHost.buildPlan.billOfMaterials.totalPhysicalParts,
      waterNormalMaps: root.getObjectByName('Plane').children.filter(o => o.material?.normalMap).length };
  });
  const scene = report.scene;
  assert.equal(scene.before, scene.after);
  assert.equal(scene.sharedClock, true);
  assert.equal(scene.challenge.terrainAsset.packagePath, MAIN_DEMO_TERRAIN_ASSET.packagePath);
  assert.equal(scene.challenge.terrainAsset.sha256, MAIN_DEMO_TERRAIN_ASSET.sha256);
  assert.equal(scene.challenge.terrainMetrics.triangleCount, MAIN_DEMO_TERRAIN_ASSET.triangleCount);
  assert.equal(scene.planId, 'bp_9453b510', 'asset swap must preserve the accepted initial bridge');
  assert.equal(scene.checksum, '9453b510'); assert.equal(scene.parts, 276);
  assert.equal(scene.train.enabled, false); assert.equal(scene.train.configured, false);
  assert.equal(scene.trainSubsystem, false); assert.deepEqual(scene.trainObjects, []);
  assert.ok(scene.waterNormalMaps > 0);
  for (const key of ['entry', 'exit']) {
    const expected = scene.challenge[key].displayPosition;
    for (const [index, axis] of ['x', 'y', 'z'].entries()) assert.ok(Math.abs(scene.anchors[key][index] - expected[axis]) < 1e-5);
  }
  const assetPath = `/${MAIN_DEMO_TERRAIN_ASSET.packagePath}`;
  assert.ok(report.responses.some(r => new URL(r.url).pathname === assetPath && r.status === 200));
  assert.ok(!report.responses.some(r => new URL(r.url).pathname.endsWith('/Terrain_7_Main.glb')));
  await capture('00-current-player-view');
  await evaluate(() => {
    const r = window.__ROBO_BRIDGE__, a = r.challenge.getEntry().position, b = r.challenge.getExit().position;
    const target = r.renderer.camera.position.clone().set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2 - 55);
    r.renderer.machineRoot.localToWorld(target);
    r.renderer.player.setEnabled(false); r.renderer.focus.copy(target);
    const offset = [480, -640, 350];
    r.renderer.yaw = Math.atan2(offset[1], offset[0]);
    r.renderer.pitch = Math.atan2(offset[2], Math.hypot(offset[0], offset[1]));
    r.renderer.radius = Math.hypot(...offset); r.renderer.updateCamera(); r.renderer.render();
  });
  await capture('01-terrain9-bridge');
  for (const kind of ['errors', 'warnings', 'exceptions']) assert.equal(browser.console[kind].length, 0, kind);
  report.ok = true;
  console.log(JSON.stringify({ ok: true, asset: MAIN_DEMO_TERRAIN_ASSET, nativeTools: report.tools.length,
    planId: scene.planId, parts: scene.parts, sameAnchors: true, trainInitialized: scene.trainSubsystem, console: browser.console }));
} catch (error) {
  report.error = { message: error.message, stack: error.stack }; process.exitCode = 1;
  console.error(error); try { await capture('99-failure'); } catch {}
} finally {
  report.console = browser.console;
  try { if (writeEvidence) await writeFile(path.join(output, 'acceptance.json'), JSON.stringify(report, null, 2)); }
  finally { await browser.close(); }
}
