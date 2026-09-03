import test from 'node:test';
import assert from 'node:assert/strict';
import { simpleHarness, simplePlacements, SIMPLE_DEMO_SCENARIOS } from '../helpers/simple-demo-harness.js';
import { HumanBuildAdapter } from '../../apps/web/src/player/human-build-adapter.js';

async function setup() {
  const h = await simpleHarness();
  const adapter = new HumanBuildAdapter({controller:h.controller,board:h.board,graph:h.graph,placementEngine:h.engine});
  return {...h, adapter};
}

test('pickup events and retained log record actual colour; release leaves blue unchanged', async () => {
  const h = await setup(), events = [], robotEvents = [];
  h.adapter.subscribe(e => events.push(e)); h.controller.subscribe(e => robotEvents.push(e));
  const blue = h.controller.getBricks().find(b => b.colour === 'blue');
  const original = structuredClone(blue);
  assert.equal(h.adapter.pickup(blue.id).ok, true);
  const log = h.adapter.getPickupLog()[0];
  assert.equal(log.brickId, blue.id); assert.equal(log.colour, 'blue');
  assert.equal(log.colourAfterPickup, 'blue'); assert.equal(log.colourPreserved, true);
  assert.equal(log.worldRevision, h.controller.worldRevision);
  assert.equal(events.find(e => e.type === 'picked_up').colour, 'blue');
  assert.equal(robotEvents.find(e => e.type === 'human_pickup').colour, 'blue');
  assert.equal(h.board.getPlacements().length, 0);
  const [target] = simplePlacements(SIMPLE_DEMO_SCENARIOS[0], await h.call('get_workspace', {}));
  const preview = h.authority.preview({brickId:blue.id,position:{xMm:target.xMm,yMm:target.yMm,zMm:target.zMm},yawRad:0});
  assert.equal(preview.ok, true);
  h.adapter.setPreview({...preview.candidate,carriedBrickId:blue.id});
  const released = h.adapter.release(); assert.equal(released.ok, true, released.reason);
  assert.equal(released.brick.colour, original.colour);
  assert.equal(released.brick.displayHex, original.displayHex);
  assert.equal(events.find(e => e.type === 'released').colourPreserved, true);
  assert.equal(h.board.getPlacements()[0].colour, 'blue');
});

test('pickup history is bounded, read-only, survives reset, and excludes rejected pickups', async () => {
  const h = await setup(), blue = h.controller.getBricks().find(b => b.colour === 'blue');
  assert.equal(h.adapter.pickup('absent').ok, false);
  assert.equal(h.adapter.getPickupLog().length, 0);
  for (let i = 0; i < 102; i++) {
    assert.equal(h.adapter.pickup(blue.id).ok, true);
    assert.equal(h.adapter.cancel().ok, true);
  }
  const revision = h.controller.worldRevision;
  const log = h.adapter.getPickupLog();
  assert.equal(log.length, 100); assert.equal(log[0].sequence, 3);
  assert.ok(log.every(e => e.colour === 'blue' && e.colourPreserved));
  log[0].colour = 'red'; log[0].position.xMm = -9999;
  assert.equal(h.adapter.getPickupLog()[0].colour, 'blue');
  assert.notEqual(h.adapter.getPickupLog()[0].position.xMm, -9999);
  assert.equal(h.controller.worldRevision, revision);
  await h.controller.reset();
  assert.equal(h.adapter.getPickupLog().length, 100);
});
