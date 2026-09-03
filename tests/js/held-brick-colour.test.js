import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../apps/web/vendor/three.module.min.js';
import { RobotRenderer } from '../../apps/web/src/render/robot-renderer.js';
import { V8BrickGeometryFactory, createV8BrickVisual, colourHex } from '../../apps/web/src/player/v8-brick-visual.js';
import { PLAYER_FALLBACK_SETTINGS } from '../../apps/web/src/player/player-settings.js';
import { PlacedBrickBatcher } from '../../apps/web/src/player/placed-brick-batcher.js';

function rendererHarness() {
  const settings = { ...PLAYER_FALLBACK_SETTINGS, brickRoughness: 0.31, brickMetalness: 0, ghostOpacity: 0.3 };
  const machineRoot = new THREE.Group();
  return {
    playerSettings: settings, machineRoot, frameBricks: [], brickMeshes: new Map(),
    brickFactory: new V8BrickGeometryFactory(settings), batcher: new PlacedBrickBatcher(machineRoot, settings),
    board: { getTargets: () => [], getPlacements: () => [] }, snapAnimation: null
  };
}

test('reused source IDs refresh visible colour after inventory reset, before pickup', () => {
  const renderer = rendererHarness();
  const brick = { id: 'same-source', colour: 'blue', position: { xMm: 0, yMm: 0, zMm: 4.8 } };
  for (const colour of ['blue', 'red', 'blue', 'yellow']) {
    brick.colour = colour;
    RobotRenderer.prototype.syncBricks.call(renderer, [brick]);
    const visible = renderer.brickMeshes.get(brick.id).userData.material;
    const carried = createV8BrickVisual(brick, renderer.playerSettings, renderer.brickFactory);
    assert.equal(visible.color.getHex(), colourHex(brick), `reset source ${colour} must look correct before picking it up`);
    assert.equal(visible.color.getHex(), carried.userData.material.color.getHex());
    carried.userData.material.dispose();
  }
});

test('human preview keeps blue colour even when blocked; robot previews retain status colours', () => {
  const renderer = rendererHarness();
  const brick = { id: 'blue-source', colour: 'blue' };
  renderer.frameBricks = [brick];
  const visuals = RobotRenderer.prototype.makeSnapPreview.call(renderer);
  const preview = { type: 'MAT', status: 'BLOCKED', valid: false, carriedBrickId: brick.id,
    position: { xMm: 0, yMm: 0, zMm: 4.8 }, yawRad: 0 };
  for (const valid of [false, true, false]) {
    RobotRenderer.prototype.syncPreviewVisual.call(renderer, { ...preview, valid }, visuals);
    assert.equal(visuals.ghost.userData.material.color.getHex(), colourHex(brick));
  }
  RobotRenderer.prototype.syncPreviewVisual.call(renderer, { ...preview, proposal: true }, visuals);
  assert.equal(visuals.ghost.userData.material.color.getHex(), 0xe34f45);
});

test('placed batches refresh displayHex without changing logical colour', () => {
  const renderer = rendererHarness();
  const brick = { id: 'placed', colour: 'blue', displayHex: 0x123456, position: { xMm: 0, yMm: 0, zMm: 4.8 } };
  renderer.board.getPlacements = () => [{ brickId: brick.id }];
  RobotRenderer.prototype.syncBricks.call(renderer, [brick]);
  brick.displayHex = 0xabcdef;
  RobotRenderer.prototype.syncBricks.call(renderer, [brick]);
  const visible = renderer.batcher.pickMeshes();
  assert.equal(visible.length, 1);
  assert.equal(visible[0].material.color.getHex(), 0xabcdef);
  assert.equal(brick.colour, 'blue');
});

test('blue carried brick keeps its material colour for blocked, valid and free previews', () => {
  const previousDocument = globalThis.document;
  globalThis.document = { body: { classList: { toggle() {} } } };
  const settings = { ...PLAYER_FALLBACK_SETTINGS, brickRoughness: 0.31, brickMetalness: 0 };
  const factory = new V8BrickGeometryFactory(settings);
  const brick = { id: 'blue', colour: 'blue' };
  const heldGhost = createV8BrickVisual(brick, settings, factory);
  try {
    for (const candidate of [{ valid: false }, { valid: true }, null]) {
      const fake = { snapAnimation: null, heldGhost, heldVisual: { getVisualPose: () => ({
        position: { xMm: 1, yMm: 2, zMm: 3 }, quaternion: new THREE.Quaternion().toArray(), candidate
      }) } };
      RobotRenderer.prototype.syncHeldGhost.call(fake);
      assert.equal(heldGhost.userData.material.color.getHex(), colourHex(brick));
      assert.equal(heldGhost.userData.material.emissiveIntensity, 0);
      assert.equal(heldGhost.userData.material.emissive.getHex(), 0);
      assert.equal(heldGhost.userData.material.opacity, 1);
      assert.equal(brick.colour, 'blue');
    }
  } finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    heldGhost.userData.material.dispose(); factory.body.dispose(); factory.stud.dispose();
  }
});
