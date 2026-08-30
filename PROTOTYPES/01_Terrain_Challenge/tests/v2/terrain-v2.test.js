import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRESETS, TerrainGenerationError, generateChallenge, normaliseSettings, serialiseChallenge, validateWatertightMesh } from "../../src/v2/index.js";

const GOLDEN = Object.freeze({
  V2_FLAT_GAP_SMALL: { heightField: "fnv1a32:bb57271a", supportMask: "fnv1a32:dad0f35f", mesh: "fnv1a32:dcb113df", challenge: "fnv1a32:a07ae648" },
  V2_RAVINE_SIMPLE: { heightField: "fnv1a32:9443844f", supportMask: "fnv1a32:08964cef", mesh: "fnv1a32:02d82e89", challenge: "fnv1a32:6bd8fd90" },
  V2_RIVER_SIMPLE: { heightField: "fnv1a32:85bb30d2", supportMask: "fnv1a32:402975fe", mesh: "fnv1a32:894af2f5", challenge: "fnv1a32:00fe5275" },
  V2_MOUNTAIN_PASS: { heightField: "fnv1a32:409b7ba5", supportMask: "fnv1a32:5e62d789", mesh: "fnv1a32:c27dbab0", challenge: "fnv1a32:a8f96611" },
  V2_ALPINE_RAVINE: { heightField: "fnv1a32:e5d48fef", supportMask: "fnv1a32:5308a746", mesh: "fnv1a32:4c3c9b6d", challenge: "fnv1a32:55b79975" },
  V2_CORRUPTION_STRESS: { heightField: "fnv1a32:695d99e4", supportMask: "fnv1a32:a97e9bb1", mesh: "fnv1a32:fa992a06", challenge: "fnv1a32:605c4aaf" }
});

function generatePreset(name, overrides = {}) {
  const settings = { ...PRESETS[name], ...overrides };
  return generateChallenge(settings.seed, settings);
}

function sampleRectangle(bounds, steps, callback) {
  for (let iz = 0; iz <= steps; iz += 1) {
    for (let ix = 0; ix <= steps; ix += 1) {
      const x = bounds.minX + (bounds.maxX - bounds.minX) * ix / steps;
      const z = bounds.minZ + (bounds.maxZ - bounds.minZ) * iz / steps;
      callback(x, z);
    }
  }
}

test("all V2 presets match frozen deterministic checksums", () => {
  for (const name of Object.keys(PRESETS)) {
    const first = generatePreset(name);
    const second = generatePreset(name);
    assert.deepEqual(first.checksums, GOLDEN[name], name);
    assert.deepEqual(second.checksums, first.checksums, name);
    assert.deepEqual(second.heightField, first.heightField, name);
    assert.equal(serialiseChallenge(second.state), serialiseChallenge(first.state), name);
  }
});

test("settings validation fails closed before allocating terrain arrays", () => {
  assert.throws(() => normaliseSettings(1, { mode: "volcano" }), (error) => error instanceof TerrainGenerationError && error.code === "INVALID_MODE");
  assert.throws(() => normaliseSettings(1, { chunkWidth: Number.NaN }), (error) => error.code === "INVALID_NUMBER");
  assert.throws(() => normaliseSettings(1, { sharedTopY: 0, valleyFloorY: 0 }), (error) => error.code === "INVALID_HEIGHTS");
  assert.throws(() => normaliseSettings(1, { chunkWidth: 30 }), (error) => error.code === "NO_PLATFORM_SPACE");
  assert.throws(() => normaliseSettings(1, { stretchY: 0 }), (error) => error.code === "INVALID_STRETCH");
});

test("browser controls preserve every preset value without step rounding", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const steps = { floorWidth: 0.5, valleyDepth: 1, shoulderWidth: 0.5, moundFalloffWidth: 0.5, moundEdgeDrop: 0.5, mountainPeakScale: 0.01, ridgeAmplitude: 0.1, ridgeScale: 1, ridgeWarpAmplitude: 0.5, centreNoiseAmplitude: 0.01, centreNoiseScale: 1, macroAmplitude: 0.1, slopeNoiseAmplitude: 0.01, detailAmplitude: 0.01, terraceStrength: 0.01, stretchX: 0.05, stretchY: 0.05, stretchZ: 0.05 };
  for (const [id, step] of Object.entries(steps)) {
    assert.match(html, new RegExp(`id="${id}"[^>]*step="${String(step)}"`), id);
    for (const preset of Object.values(PRESETS)) {
      const value = id === "valleyDepth" ? preset.sharedTopY - preset.valleyFloorY : preset[id];
      assert.ok(Math.abs(value / step - Math.round(value / step)) <= 1e-8, `${id} cannot preserve ${value}`);
    }
  }
});

test("regeneration is transactional and retains the previous terrain on invalid input", () => {
  const source = readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
  const body = source.slice(source.indexOf("function regenerate()"), source.indexOf("for (const [name, settings]"));
  assert.ok(body.indexOf("generateChallenge(settings.seed, settings)") < body.indexOf("disposeObjectTree(scene, previousRoot)"));
  assert.match(body, /if \(candidateRoot\) addDisposal\(disposeObjectTree\(scene, candidateRoot\)\)/);
  assert.match(body, /Last valid terrain retained/);
});

test("secondary XYZ stretch transforms the authoritative model and export", () => {
  const base = generatePreset("V2_ALPINE_RAVINE");
  const factors = { stretchX: 1.5, stretchY: 1.75, stretchZ: 0.65 };
  const stretched = generatePreset("V2_ALPINE_RAVINE", factors);
  const repeated = generatePreset("V2_ALPINE_RAVINE", factors);
  assert.deepEqual(repeated.checksums, stretched.checksums);
  assert.equal(stretched.sourceSettings.chunkWidth, base.settings.chunkWidth);
  assert.equal(stretched.settings.chunkWidth, base.settings.chunkWidth * factors.stretchX);
  assert.equal(stretched.settings.chunkDepth, base.settings.chunkDepth * factors.stretchZ);
  assert.equal(stretched.settings.sharedTopY, base.settings.sharedTopY * factors.stretchY);
  assert.equal(stretched.platforms.left.centre.x, base.platforms.left.centre.x * factors.stretchX);
  assert.equal(stretched.platforms.left.centre.y, base.platforms.left.centre.y * factors.stretchY);
  assert.equal(stretched.platforms.left.width, base.platforms.left.width * factors.stretchZ);
  assert.equal(stretched.corridor.deckWidth, base.corridor.deckWidth * factors.stretchZ);
  assert.equal(stretched.corridor.vehicleClearHeight, base.corridor.vehicleClearHeight * factors.stretchY);
  for (const [ix, iz] of [[0, 0], [37, 21], [64, 48], [128, 96]]) {
    const before = base.api.getGridSample(ix, iz);
    const after = stretched.api.getGridSample(ix, iz);
    assert.ok(Math.abs(after.x - before.x * factors.stretchX) <= 1e-5);
    assert.ok(Math.abs(after.y - before.y * factors.stretchY) <= 1e-5);
    assert.ok(Math.abs(after.z - before.z * factors.stretchZ) <= 1e-5);
    assert.ok(Math.abs(stretched.api.getHeightAt(after.x, after.z) - after.y) <= 1e-5);
  }
  assert.deepEqual(stretched.state.terrain.postProcess.axisStretch, { x: 1.5, y: 1.75, z: 0.65 });
  assert.deepEqual(stretched.state.terrain.postProcess.sourceDimensions, { width: 160, depth: 96, heightScale: 50 });
  assert.equal(stretched.topology.highGroundComponents, 2);
  assert.equal(validateWatertightMesh(stretched.meshData).valid, true);
});

test("left and right protected platforms are one exact shared plane", () => {
  for (const name of Object.keys(PRESETS)) {
    const result = generatePreset(name);
    assert.equal(result.platforms.left.planeY, result.settings.sharedTopY, name);
    assert.equal(result.platforms.right.planeY, result.settings.sharedTopY, name);
    assert.equal(result.platforms.left.planeY, result.platforms.right.planeY, name);
    for (const platform of [result.platforms.left, result.platforms.right]) {
      assert.ok(platform.width >= result.settings.platformWidth, name);
      assert.ok(platform.length >= result.settings.platformLength, name);
      sampleRectangle(platform.bounds, 8, (x, z) => {
        assert.ok(Math.abs(result.api.getHeightAt(x, z) - result.settings.sharedTopY) <= 1e-6, `${name} platform height`);
        assert.ok(result.api.getSlopeAt(x, z) <= 1e-6, `${name} platform slope`);
        const normal = result.api.getNormalAt(x, z);
        assert.ok(Math.abs(normal.x) <= 1e-6 && normal.y >= 0.999999 && Math.abs(normal.z) <= 1e-6, `${name} platform normal`);
        assert.equal(result.api.isSupportable(x, z), true, `${name} platform support`);
      });
    }
    for (let iz = 0; iz < result.settings.gridV; iz += 1) for (let ix = 0; ix < result.settings.gridU; ix += 1) {
      const index = iz * result.settings.gridU + ix;
      if (result.platformMask[index]) assert.equal(result.displacementMask[index], 0, `${name} protected displacement`);
    }
  }
});

test("mountain envelope reaches its ground shelf while preserving the flat fixture", () => {
  for (const name of Object.keys(PRESETS)) {
    const result = generatePreset(name);
    const { chunkWidth, moundEdgeDrop, moundFalloffWidth } = result.settings;
    const z = result.settings.chunkDepth * 0.3;
    const inset = moundFalloffWidth + 2;
    for (const side of [-1, 1]) {
      const edgeX = side * chunkWidth / 2;
      const innerX = side * (chunkWidth / 2 - inset);
      const edgeHeight = result.api.getHeightAt(edgeX, z);
      const innerHeight = result.api.getHeightAt(innerX, z);
      const expectedGround = result.settings.sharedTopY - moundEdgeDrop;
      assert.ok(Math.abs(edgeHeight - expectedGround) <= 1e-6, `${name} ${side < 0 ? "left" : "right"} ground shelf`);
      if (moundEdgeDrop === 0) assert.ok(Math.abs(edgeHeight - innerHeight) <= 1e-6, `${name} flat edge`);
      else assert.ok(innerHeight - edgeHeight >= moundEdgeDrop * 0.65, `${name} ${side < 0 ? "left" : "right"} mountain rise`);
    }
    const frontGround = result.api.getHeightAt(result.platforms.left.centre.x, -result.settings.chunkDepth / 2);
    const backGround = result.api.getHeightAt(result.platforms.right.centre.x, result.settings.chunkDepth / 2);
    assert.ok(Math.abs(frontGround - (result.settings.sharedTopY - moundEdgeDrop)) <= 1e-6, `${name} front ground shelf`);
    assert.ok(Math.abs(backGround - (result.settings.sharedTopY - moundEdgeDrop)) <= 1e-6, `${name} back ground shelf`);
  }
});

test("ENTRY, EXIT and the corridor use the shared plane and cross the obstacle", () => {
  for (const name of Object.keys(PRESETS)) {
    const result = generatePreset(name);
    assert.ok(result.entry.position.x < 0, name);
    assert.ok(result.exit.position.x > 0, name);
    assert.equal(result.entry.position.y, result.platforms.sharedPlaneY, name);
    assert.equal(result.exit.position.y, result.platforms.sharedPlaneY, name);
    assert.equal(result.api.isSupportable(result.entry.position.x, result.entry.position.z), true, name);
    assert.equal(result.api.isSupportable(result.exit.position.x, result.exit.position.z), true, name);
    assert.equal(result.api.isSupportable(result.api.getObstacleAt(0).centreX, 0), false, name);
    assert.equal(result.corridor.centreline[0].x, result.entry.position.x, name);
    assert.equal(result.corridor.centreline.at(-1).x, result.exit.position.x, name);
  }
});

test("height, slope and support queries agree with authoritative grid samples", () => {
  for (const name of Object.keys(PRESETS)) {
    const result = generatePreset(name);
    for (let iz = 0; iz < result.settings.gridV; iz += 7) {
      for (let ix = 0; ix < result.settings.gridU; ix += 9) {
        const index = iz * result.settings.gridU + ix;
        const sample = result.api.getGridSample(ix, iz);
        assert.ok(Math.abs(result.api.getHeightAt(sample.x, sample.z) - result.heightField[index]) <= 1e-5, name);
        assert.equal(result.api.isSupportable(sample.x, sample.z), Boolean(result.supportMask[index]), name);
      }
    }
  }
});

test("every exported support-region sample is supportable", () => {
  for (const name of Object.keys(PRESETS)) {
    const result = generatePreset(name);
    assert.ok(result.supportRegions.some((region) => region.side === "left"), `${name} left regions`);
    assert.ok(result.supportRegions.some((region) => region.side === "right"), `${name} right regions`);
    const ids = result.supportRegions.map((region) => region.id);
    assert.equal(new Set(ids).size, ids.length, `${name} unique IDs`);
    for (const region of result.supportRegions) sampleRectangle(region.bounds, 3, (x, z) => {
      assert.equal(result.api.isSupportable(x, z), true, `${name} ${region.id} contradicted support API`);
    });
  }
});

test("each preset has exactly two high-ground bank components", () => {
  for (const name of Object.keys(PRESETS)) assert.equal(generatePreset(name).topology.highGroundComponents, 2, name);
});

test("every preset produces one positive-volume watertight mesh", () => {
  for (const name of Object.keys(PRESETS)) {
    const result = generatePreset(name);
    const validation = validateWatertightMesh(result.meshData);
    assert.equal(validation.valid, true, name);
    assert.equal(validation.nonManifoldEdges, 0, name);
    assert.equal(validation.degenerateTriangles, 0, name);
    assert.equal(validation.connectedComponents, 1, name);
    assert.ok(validation.signedVolume > 0, name);
    assert.ok(result.meshData.positions.some((value, index) => index % 3 === 1 && Math.abs(value - result.meshData.bottomY) <= 1e-6), name);
  }
});

test("river water ribbon follows the exact generated centreline", () => {
  const result = generatePreset("V2_RIVER_SIMPLE");
  assert.ok(result.waterMeshData);
  for (let index = 0; index < result.obstacle.centreline.length; index += 8) {
    const offset = index * 6;
    const centreX = (result.waterMeshData.positions[offset] + result.waterMeshData.positions[offset + 3]) / 2;
    const centreZ = (result.waterMeshData.positions[offset + 2] + result.waterMeshData.positions[offset + 5]) / 2;
    assert.ok(Math.abs(centreX - result.obstacle.centreline[index].x) <= 1e-5);
    assert.ok(Math.abs(centreZ - result.obstacle.centreline[index].z) <= 1e-5);
  }
});

test("1,000 bounded seed cases preserve core invariants", { timeout: 120_000 }, () => {
  const names = Object.keys(PRESETS);
  const edgeSeeds = [0, 1, 0x7fffffff, 0x80000000, 0xffffffff, 0xdeadbeef, 0xcafebabe, 24001];
  for (let caseIndex = 0; caseIndex < 1000; caseIndex += 1) {
    const name = names[caseIndex % names.length];
    const seed = caseIndex < edgeSeeds.length ? edgeSeeds[caseIndex] : (0xa511e9b3 + Math.imul(caseIndex, 0x9e3779b9)) >>> 0;
    const settings = { ...PRESETS[name], seed, gridU: 65, gridV: 49, validateMesh: false };
    const result = generateChallenge(seed, settings);
    assert.equal(result.topology.highGroundComponents, 2, `${name} seed ${seed}`);
    assert.equal(result.platforms.left.planeY, result.platforms.right.planeY, `${name} seed ${seed}`);
    assert.equal(result.api.isSupportable(result.entry.position.x, 0), true, `${name} seed ${seed} entry`);
    assert.equal(result.api.isSupportable(result.exit.position.x, 0), true, `${name} seed ${seed} exit`);
    assert.equal(result.state.version, 3, `${name} seed ${seed}`);
    assert.ok(result.supportRegions.length >= 2, `${name} seed ${seed} support regions`);
    for (const value of result.heightField) assert.ok(Number.isFinite(value), `${name} seed ${seed} finite height`);
    if (caseIndex % 50 === 0) assert.equal(validateWatertightMesh(result.meshData).valid, true, `${name} seed ${seed} mesh`);
  }
});
