import test from 'node:test';
import assert from 'node:assert/strict';

import { BRICK_SPEC } from '../../apps/web/src/bricks/brick-spec.js';
import { createSimpleStructurePlan, toWebMcpPlacements } from '../../apps/web/src/robot/simple-structure-planner.js';

const origin = Object.freeze({ xMm: 812, yMm: -120, zMm: 8.6 });

test('wall depth creates a centered logical 32x16 grid with complete layer supports', () => {
  const plan = createSimpleStructurePlan({
    structure: 'wall', colour: 'blue', width: 3, depth: 2, height: 2, blockCount: 12, origin
  });

  assert.equal(plan.ok, true, JSON.stringify(plan.errors));
  assert.equal(plan.depthBricks, 2);
  assert.equal(plan.blockCount, 12);
  assert.equal(plan.inventory.required.blue, 12);
  assert.equal(new Set(plan.placements.map(({ placementId }) => placementId)).size, 12);

  const base = plan.placements.slice(0, 6);
  assert.deepEqual(base.map(({ position }) => position.xMm), [780, 812, 844, 780, 812, 844]);
  assert.deepEqual(base.map(({ position }) => position.yMm), [-128, -128, -128, -112, -112, -112]);
  assert.ok(base.every(({ position }) => position.zMm === origin.zMm));
  assert.ok(base.every(({ dependsOnPlacementIds, supportPlacementId }) => {
    return dependsOnPlacementIds.length === 0 && supportPlacementId === null;
  }));

  const upper = plan.placements.slice(6);
  const lowerIds = base.map(({ placementId }) => placementId);
  for (const [index, placement] of upper.entries()) {
    assert.equal(placement.position.zMm, origin.zMm + BRICK_SPEC.bodyHeightMm);
    assert.deepEqual(placement.dependsOnPlacementIds, lowerIds);
    assert.equal(placement.supportPlacementId, base[index].placementId);
  }

  const webMcp = toWebMcpPlacements(plan);
  assert.equal(webMcp.length, 12);
  assert.deepEqual(webMcp[6].dependsOnPlacementIds, lowerIds);
  assert.equal(webMcp[6].supportPlacementId, base[0].placementId);
});

test('depth-one wall keeps the historical identity and generated geometry', () => {
  const implicit = createSimpleStructurePlan({
    structure: 'wall', colour: 'blue', width: 3, height: 4, origin
  });
  const explicit = createSimpleStructurePlan({
    structure: 'wall', colour: 'blue', width: 3, depth: 1, height: 4, origin
  });

  assert.equal(implicit.ok, true);
  assert.equal(explicit.ok, true);
  assert.equal(implicit.planId, explicit.planId);
  assert.equal(implicit.designChecksum, explicit.designChecksum);
  assert.deepEqual(implicit.placements, explicit.placements);
});

test('tower keeps two bricks per layer for both six-level and ten-level requests', () => {
  for (const height of [6, 10]) {
    const plan = createSimpleStructurePlan({
      structure: 'cross_laminated_tower', colour: 'red', width: 2, height, blockCount: height * 2, origin
    });
    assert.equal(plan.ok, true, JSON.stringify(plan.errors));
    assert.equal(plan.blockCount, height * 2);
    for (let layer = 0; layer < height; layer += 1) {
      const row = plan.placements.slice(layer * 2, layer * 2 + 2);
      assert.equal(row.length, 2);
      assert.ok(row.every(({ yawRad }) => {
        const degrees = Math.round(yawRad * 180 / Math.PI);
        return degrees === (layer % 2 ? 90 : 0);
      }));
    }
  }
});

test('planner rejects non-positive or non-integer requested dimensions and counts', () => {
  const cases = [
    [{ width: '5', height: 7, depth: 1 }, 'invalid_width'],
    [{ width: 5.5, height: 7, depth: 1 }, 'invalid_width'],
    [{ width: 5, height: 0, depth: 1 }, 'invalid_height'],
    [{ width: 5, height: 7, depth: -1 }, 'invalid_depth'],
    [{ width: 5, height: 7, depth: 1, blockCount: 35.5 }, 'invalid_block_count'],
    [{ width: 5, height: 7, depth: 1, blockCount: 0 }, 'invalid_block_count']
  ];
  for (const [dimensions, error] of cases) {
    const plan = createSimpleStructurePlan({ structure: 'wall', colour: 'blue', ...dimensions, origin });
    assert.equal(plan.ok, false, JSON.stringify({ dimensions, errors: plan.errors }));
    assert.ok(plan.errors.includes(error), JSON.stringify({ dimensions, errors: plan.errors }));
  }
});

test('planner bounds one request to fifty placements while allowing exactly fifty', () => {
  const exact = createSimpleStructurePlan({ structure: 'wall', colour: 'blue', width: 5, depth: 2, height: 5, origin });
  assert.equal(exact.ok, true, JSON.stringify(exact.errors));
  assert.equal(exact.blockCount, 50);

  const oversized = createSimpleStructurePlan({ structure: 'wall', colour: 'blue', width: 5, depth: 2, height: 6, origin });
  assert.equal(oversized.ok, false);
  assert.ok(oversized.errors.includes('structure_exceeds_single_mcp_chunk'));
});

test('tower rejects depth greater than one instead of changing its two-brick semantics', () => {
  const plan = createSimpleStructurePlan({
    structure: 'cross_laminated_tower', colour: 'red', width: 2, depth: 2, height: 5, origin
  });
  assert.equal(plan.ok, false);
  assert.ok(plan.errors.includes('tower_depth_must_be_one'));
});

test('single structure rejects supplied multi-brick dimensions instead of ignoring them', () => {
  const plan = createSimpleStructurePlan({ structure: 'single', colour: 'red', depth: 2, origin });
  assert.equal(plan.ok, false);
  assert.ok(plan.errors.includes('single_dimensions_must_be_one'));
});
