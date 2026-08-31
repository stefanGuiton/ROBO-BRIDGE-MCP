import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUr10SurfaceGeometry,
  buildUr10SurfaceGeometryAsync,
  UR10_NORMAL_DEFAULTS
} from '../../apps/web/src/render/ur10-surface-normals.js';

const seamSquare = Object.freeze({
  positions: new Float32Array([
    0, 0, 0, 1, 0, 0, 1, 1, 0,
    0, 0, 0, 1, 1, 0, 0, 1, 0
  ]),
  normals: new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0, 1, 0, 0, 1, 0, 0, 1
  ]),
  indices: new Uint16Array([0, 1, 2, 3, 4, 5])
});

test('reference UR10 normal defaults remain locked to the tuned demo', () => {
  assert.deepEqual(UR10_NORMAL_DEFAULTS, {
    mode: 'smooth', angleDeg: 15, weldToleranceMm: 0.002, weighting: 'corner', clean: true
  });
});

test('smooth-by-angle welds a coplanar duplicate seam while flat mode preserves corners', () => {
  const smooth = buildUr10SurfaceGeometry({ ...seamSquare });
  const flat = buildUr10SurfaceGeometry({ ...seamSquare, mode: 'flat' });
  assert.equal(smooth.diagnostics.triangles, 2);
  assert.equal(smooth.diagnostics.renderVertices, 4);
  assert.equal(flat.diagnostics.renderVertices, 6);
  assert.deepEqual([...smooth.normals], Array(smooth.normals.length / 3).fill([0, 0, 1]).flat());
});

test('a sharp manifold edge is split below its angle and joined above it', () => {
  const geometry = {
    positions: new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      0, 0, 0, 0, 1, 0, 0, 0, 1
    ]),
    indices: new Uint16Array([0, 1, 2, 3, 4, 5])
  };
  const sharp = buildUr10SurfaceGeometry({ ...geometry, angleDeg: 15 });
  const soft = buildUr10SurfaceGeometry({ ...geometry, angleDeg: 100 });
  assert.equal(sharp.diagnostics.renderVertices, 6);
  assert.equal(soft.diagnostics.renderVertices, 4);
});

test('clean mode drops welded and zero-area triangles', () => {
  const result = buildUr10SurfaceGeometry({
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0, 0]),
    indices: new Uint16Array([0, 1, 2, 0, 3, 1]),
    mode: 'flat', clean: true
  });
  assert.equal(result.diagnostics.triangles, 0);
  assert.equal(result.diagnostics.removedFaces, 2);
});

test('exported and edited-hybrid modes preserve supplied normals exactly', () => {
  for (const [mode, edited] of [['exported', false], ['hybrid', true]]) {
    const result = buildUr10SurfaceGeometry({ ...seamSquare, mode, edited });
    assert.deepEqual([...result.positions], [...seamSquare.positions]);
    assert.deepEqual([...result.normals], [...seamSquare.normals]);
    assert.deepEqual([...result.indices], [...seamSquare.indices]);
  }
});

test('async normal rebuild has a deterministic non-worker fallback', async () => {
  const result = await buildUr10SurfaceGeometryAsync({ ...seamSquare, weighting: 'area' });
  assert.equal(result.diagnostics.renderVertices, 4);
  assert.ok([...result.normals].every(Number.isFinite));
});
