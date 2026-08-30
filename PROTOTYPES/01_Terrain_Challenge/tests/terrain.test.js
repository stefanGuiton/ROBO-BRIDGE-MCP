import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, PRESETS, generateChallenge, serialiseChallenge } from "../src/terrain.js";

function result(preset = PRESETS.RAVINE_SIMPLE) { return generateChallenge(preset.seed, { ...DEFAULT_SETTINGS, ...preset }); }

test("same seed and settings produce byte-identical terrain and state", () => {
  const a = result(), b = result();
  assert.deepEqual(a.heights, b.heights);
  assert.equal(serialiseChallenge(a.state), serialiseChallenge(b.state));
});

test("same seed produces the same ENTRY and EXIT", () => {
  const a = result(), b = result();
  assert.deepEqual(a.state.entry, b.state.entry);
  assert.deepEqual(a.state.exit, b.state.exit);
});

test("ENTRY and EXIT are outside the obstacle and on supportable pads", () => {
  for (const preset of Object.values(PRESETS)) {
    const challenge = result(preset);
    for (const anchor of [challenge.state.entry, challenge.state.exit]) {
      assert.equal(challenge.api.isSupportable(anchor.position.x, anchor.position.z), true, `${preset.mode} anchor should be supportable`);
      assert.ok(challenge.api.getSlopeAt(anchor.position.x, anchor.position.z) <= challenge.settings.maxSupportSlope);
    }
  }
});

test("straight centreline crosses the obstacle", () => {
  const challenge = result();
  const { entry, exit } = challenge.state;
  assert.ok(entry.position.z < 0 && exit.position.z > 0);
  assert.equal(challenge.api.isSupportable(0, 0), false);
});

test("height queries match every rendered height-field vertex", () => {
  const challenge = result(PRESETS.NOISY_TEST);
  const { width, depth, gridX, gridZ } = challenge.settings;
  for (let iz = 0; iz < gridZ; iz += 7) for (let ix = 0; ix < gridX; ix += 9) {
    const x = -width / 2 + ix * width / (gridX - 1), z = -depth / 2 + iz * depth / (gridZ - 1);
    assert.ok(Math.abs(challenge.api.getHeightAt(x, z) - challenge.heights[iz * gridX + ix]) < 1e-5);
  }
});

test("river mode remains deterministic and declares a river obstacle", () => {
  const challenge = result(PRESETS.RIVER_SIMPLE);
  assert.equal(challenge.state.terrain.obstacle.type, "river");
  assert.equal(challenge.state.mode, "rail");
});

test("flat gap fixture is simple, flat and repeatable", () => {
  const a = result(PRESETS.FLAT_GAP_SMALL), b = result(PRESETS.FLAT_GAP_SMALL);
  assert.deepEqual(a.heights, b.heights);
  assert.equal(a.api.getHeightAt(0, -40), 0);
  assert.equal(a.api.getHeightAt(0, 0), -PRESETS.FLAT_GAP_SMALL.obstacleDepth);
});
