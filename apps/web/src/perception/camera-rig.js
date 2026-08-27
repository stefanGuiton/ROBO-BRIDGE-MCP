import { lookAt, mat4Multiply, orthographic } from './math.js';

const CAMERA_IDS = Object.freeze(['tray_camera', 'canvas_camera']);
const DEFAULT_CAMERA_CONFIGS = Object.freeze({
  tray_camera: Object.freeze({ position: [430, -180, 680], target: [430, -180, 0], halfWidth: 255 }),
  canvas_camera: Object.freeze({ position: [-120, 245, 660], target: [-120, 245, 0], halfWidth: 290 })
});

export function createCameraRig({ widthPx = 640, heightPx = 360, cameraConfigs = {} } = {}) {
  let size = { widthPx, heightPx };

  function make(id, worldRevision = 0) {
    const aspect = size.widthPx / size.heightPx;
    const config = cameraConfigs[id] ?? DEFAULT_CAMERA_CONFIGS[id];
    const halfHeight = config.halfWidth / aspect;
    const viewMatrix = lookAt(config.position, config.target, [0, 1, 0]);
    const projectionMatrix = orthographic(-config.halfWidth, config.halfWidth, -halfHeight, halfHeight, 1, 1400);
    return Object.freeze({
      id,
      widthPx: size.widthPx,
      heightPx: size.heightPx,
      position: [...config.position],
      target: [...config.target],
      nearMm: 1,
      farMm: 1400,
      projection: 'orthographic',
      viewMatrix,
      projectionMatrix,
      viewProjectionMatrix: mat4Multiply(projectionMatrix, viewMatrix),
      worldRevision
    });
  }

  return Object.freeze({
    ids: CAMERA_IDS,
    resize(width, height) {
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 64 || height < 64) {
        throw new Error('invalid_camera_size');
      }
      size = { widthPx: Math.round(width), heightPx: Math.round(height) };
    },
    getCamera(id, worldRevision = 0) {
      if (!CAMERA_IDS.includes(id)) return null;
      return make(id, worldRevision);
    },
    getSize() {
      return { ...size };
    }
  });
}

export { CAMERA_IDS, DEFAULT_CAMERA_CONFIGS };
