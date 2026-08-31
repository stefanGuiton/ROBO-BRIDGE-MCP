import { lookAt, mat4Multiply, orthographic, perspective } from './math.js';

const CAMERA_IDS = Object.freeze(['tray_camera', 'canvas_camera', 'top_camera', 'left_camera', 'right_camera', 'user_camera']);
const DEFAULT_CAMERA_CONFIGS = Object.freeze({
  tray_camera: Object.freeze({ position: [430, -180, 680], target: [430, -180, 0], halfWidth: 255 }),
  canvas_camera: Object.freeze({ position: [-120, 245, 660], target: [-120, 245, 0], halfWidth: 290 }),
  top_camera: Object.freeze({ position: [600, 0, 1000], target: [600, 0, 0], halfWidth: 620 }),
  left_camera: Object.freeze({ position: [-450, 0, 320], target: [600, 0, 120], up: [0, 0, 1], halfWidth: 640 }),
  right_camera: Object.freeze({ position: [1650, 0, 320], target: [600, 0, 120], up: [0, 0, 1], halfWidth: 640 }),
  user_camera: Object.freeze({ position: [600, -900, 500], target: [600, 0, 120], up: [0, 0, 1], projection: 'perspective', fovYDeg: 62, nearMm: 2, farMm: 12000 })
});

export function createCameraRig({ widthPx = 640, heightPx = 360, cameraConfigs = {} } = {}) {
  let size = { widthPx, heightPx };

  function make(id, worldRevision = 0) {
    const aspect = size.widthPx / size.heightPx;
    const config = cameraConfigs[id] ?? DEFAULT_CAMERA_CONFIGS[id];
    const nearMm = Number(config.nearMm ?? 1);
    const farMm = Number(config.farMm ?? 1400);
    const viewMatrix = lookAt(config.position, config.target, config.up ?? [0, 1, 0]);
    let projectionMatrix;
    if (config.projection === 'perspective') {
      projectionMatrix = perspective(Number(config.fovYDeg ?? 62), aspect, nearMm, farMm);
    } else {
      const halfHeight = config.halfWidth / aspect;
      projectionMatrix = orthographic(-config.halfWidth, config.halfWidth, -halfHeight, halfHeight, nearMm, farMm);
    }
    return Object.freeze({
      id,
      widthPx: size.widthPx,
      heightPx: size.heightPx,
      position: [...config.position],
      target: [...config.target],
      up: [...(config.up ?? [0, 1, 0])],
      nearMm,
      farMm,
      projection: config.projection === 'perspective' ? 'perspective' : 'orthographic',
      fovYDeg: config.projection === 'perspective' ? Number(config.fovYDeg ?? 62) : null,
      halfWidth: config.projection === 'perspective' ? null : Number(config.halfWidth),
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
