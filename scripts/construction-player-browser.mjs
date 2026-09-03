// Explicit browser acceptance command; never runs as part of read-only tests.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const { chromium } = createRequire(import.meta.url)(option('--playwright-module', 'playwright'));
const output = path.resolve('output/playwright/construction-hardening');
const write = args.includes('--write-evidence');
if (write) await mkdir(output, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: option('--browser', undefined),
  args: ['--enable-experimental-web-platform-features']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
const warnings = [];
page.on('pageerror', (error) => consoleErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
  if (message.type() === 'warning') warnings.push(message.text());
});

async function screenshot(name) {
  if (write && args.includes('--screenshots')) await page.screenshot({ path: path.join(output, `${name}.png`) });
}

async function aimAt(kind, id) {
  return page.evaluate(({ kind, id }) => {
    const renderer = window.__ROBO_BRIDGE__.renderer;
    const mesh = kind === 'source' ? renderer.brickMeshes.get(id) : renderer.targetMeshes.get(id);
    if (!mesh) throw new Error(`${kind}_mesh_not_found:${id}`);
    mesh.updateWorldMatrix(true, true);
    const pickMesh = mesh.getObjectByProperty('isMesh', true);
    const position = pickMesh?.geometry?.getAttribute?.('position');
    if (!pickMesh || !position || position.count < 3) throw new Error(`${kind}_pick_geometry_unavailable:${id}`);
    const indices = pickMesh.geometry.index?.array ?? [0, 1, 2];
    // Aim at the centroid of a real surface triangle, not through an arch opening.
    const target = mesh.position.clone().set(0, 0, 0);
    for (let axis = 0; axis < 3; axis += 1) {
      const getter = axis === 0 ? 'getX' : axis === 1 ? 'getY' : 'getZ';
      target.setComponent(axis, (position[getter](indices[0]) + position[getter](indices[1]) + position[getter](indices[2])) / 3);
    }
    pickMesh.localToWorld(target);
    const normals = pickMesh.geometry.getAttribute('normal');
    const normal = target.clone().set(
      (normals.getX(indices[0]) + normals.getX(indices[1]) + normals.getX(indices[2])) / 3,
      (normals.getY(indices[0]) + normals.getY(indices[1]) + normals.getY(indices[2])) / 3,
      (normals.getZ(indices[0]) + normals.getZ(indices[1]) + normals.getZ(indices[2])) / 3
    ).normalize().transformDirection(pickMesh.matrixWorld);
    const camera = target.clone().addScaledVector(normal, -Math.min(180, renderer.raycaster.far * 0.7));
    renderer.player.setLookAt(camera, target);
    renderer.camera.updateMatrixWorld(true);
    renderer.render();
    renderer.updatePlayerInteraction();
    const picks = [...renderer.brickMeshes.values(), ...renderer.batcher.pickMeshes()];
    const hits = renderer.centreHits(picks).slice(0, 5).map((hit) => ({
      brickId: renderer.brickIdFromHit(hit),
      distance: hit.distance,
      object: hit.object.name || hit.object.type
    }));
    const ray = renderer.raycaster.ray;
    return {
      target: target.toArray(),
      camera: camera.toArray(),
      highlightedBrickId: renderer.highlightedBrickId,
      rayOrigin: ray.origin.toArray(),
      rayDirection: ray.direction.toArray(),
      rayFar: renderer.raycaster.far,
      hits
    };
  }, { kind, id });
}

try {
  await page.goto(option('--url', 'http://127.0.0.1:8774/'), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.dataset.runtimeReady === 'true', null, { timeout: 30000 });
  await page.getByRole('button', { name: 'BUILD BRIDGE', exact: true }).click();
  await page.waitForFunction(() => window.__ROBO_BRIDGE__.construction?.getBuildState().started);

  const planned = await page.evaluate(() => {
    const runtime = window.__ROBO_BRIDGE__;
    const sources = runtime.robotController.getBricks();
    const compatibleSource = (entry) => sources.find((brick) =>
      brick.bridgePart?.partClass === 'STANDARD_BRICK' && brick.colour === entry.compatibilityKey
    );
    const placement = runtime.construction.preparedBuild.normalisedBuild.placements.find((entry) =>
      entry.partClass === 'STANDARD_BRICK'
      && entry.dependencyIds.length === 0
      && compatibleSource(entry)
    );
    const source = placement && compatibleSource(placement);
    if (!placement || !source) throw new Error('current_standard_player_fixture_unavailable');
    const target = runtime.board.getTarget(placement.placementId);
    return {
      sourceId: source.id,
      targetId: placement.placementId,
      targetPosition: target.position,
      targetYawRad: target.yawRad,
      worldRevision: runtime.robotController.worldRevision
    };
  });

  const sourceAim = await aimAt('source', planned.sourceId);
  console.log('SOURCE_AIM', JSON.stringify({ planned, sourceAim }));
  await page.waitForFunction((sourceId) => window.__ROBO_BRIDGE__.renderer.highlightedBrickId === sourceId, planned.sourceId, { timeout: 5000 });
  await screenshot('01-player-aims-at-shared-source');

  const canvas = page.locator('#scene');
  await canvas.click({ position: { x: 720, y: 500 } });
  await page.waitForTimeout(300);
  await canvas.click({ position: { x: 720, y: 500 } });
  await page.waitForFunction((sourceId) => window.__ROBO_BRIDGE__.humanBuildAdapter.getState().heldBrickId === sourceId, planned.sourceId);
  await screenshot('02-player-picked-shared-source');

  const targetAim = await aimAt('target', planned.targetId);
  console.log('TARGET_AIM', JSON.stringify({ targetAim }));
  await page.waitForFunction((targetId) => {
    const preview = window.__ROBO_BRIDGE__.humanBuildAdapter.getPreview();
    return preview?.valid === true && preview?.targetId === targetId;
  }, planned.targetId);
  await screenshot('03-player-valid-target-preview');
  await canvas.click({ position: { x: 720, y: 500 } });
  await page.waitForFunction((targetId) => window.__ROBO_BRIDGE__.board.getTarget(targetId)?.correctness === true, planned.targetId);
  await screenshot('04-player-accepted-on-shared-board');

  const result = await page.evaluate(({ sourceId, targetId }) => {
    const runtime = window.__ROBO_BRIDGE__;
    const target = runtime.board.getTarget(targetId);
    const event = runtime.board.eventLog.find((entry) => entry.type === 'snap' && entry.targetId === targetId);
    return {
      sourceId,
      targetId,
      heldBrickId: runtime.humanBuildAdapter.getState().heldBrickId,
      accepted: target.correctness,
      completedBy: target.completedBy,
      event,
      contributions: runtime.board.getBuildState().contributions,
      playerEnabled: runtime.renderer.player.enabled,
      planId: runtime.construction.getBuildState().planId,
      partRegistryHash: runtime.construction.getBuildState().partRegistryHash
    };
  }, planned);
  if (!result.accepted || result.completedBy !== 'human' || result.event?.brickId !== planned.sourceId) {
    throw new Error(`player_acceptance_mismatch:${JSON.stringify(result)}`);
  }
  if (consoleErrors.length) throw new Error(`blocking_console_errors:${JSON.stringify(consoleErrors)}`);

  const evidence = { planned, sourceAim, targetAim, result, consoleErrors, warnings };
  console.log('PLAYER_CONSTRUCTION_ACCEPTANCE', JSON.stringify(evidence));
  if (write) {
    await writeFile(path.join(output, 'acceptance.json'), JSON.stringify(evidence, null, 2));
    await writeFile(path.join(output, 'console.json'), JSON.stringify({ consoleErrors, warnings }, null, 2));
  }
} catch (error) {
  await screenshot('failure');
  console.error('PLAYER_CONSTRUCTION_FAILURE', error.message, JSON.stringify({ consoleErrors, warnings }));
  process.exitCode = 1;
} finally {
  await browser.close();
}
