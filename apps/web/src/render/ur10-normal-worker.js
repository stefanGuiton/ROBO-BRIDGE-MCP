import { buildUr10SurfaceGeometry } from './ur10-surface-normals.js';

self.onmessage = ({ data }) => {
  try {
    const result = buildUr10SurfaceGeometry({
      positions: new Float32Array(data.positions),
      normals: data.normals ? new Float32Array(data.normals) : null,
      indices: new Uint32Array(data.indices),
      mode: data.mode,
      angleDeg: data.angleDeg,
      weldToleranceMm: data.weldToleranceMm,
      weighting: data.weighting,
      clean: data.clean,
      edited: data.edited
    });
    self.postMessage({ id: data.id, ok: true, positions: result.positions.buffer, normals: result.normals.buffer, indices: result.indices.buffer, diagnostics: result.diagnostics }, [result.positions.buffer, result.normals.buffer, result.indices.buffer]);
  } catch (error) {
    self.postMessage({ id: data.id, ok: false, reason: error?.message ?? 'normal_rebuild_failed' });
  }
};
