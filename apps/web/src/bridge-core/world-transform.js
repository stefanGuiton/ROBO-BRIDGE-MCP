'use strict';

import { BridgeCoreError, cloneValue } from './errors.js';

const ROOT_KEYS = new Set(['id', 'translationMm', 'yawRad', 'yawDeg', 'scale', 'sourceFrame', 'targetFrame']);
const TRANSLATION_KEYS = new Set(['xMm', 'yMm', 'zMm']);

function finite(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BridgeCoreError('INVALID_TRANSFORM', `${path} must be a finite number.`, { path, value });
  }
  return value;
}

export function normalizeWorldTransform(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BridgeCoreError('INVALID_TRANSFORM', 'worldTransform must be an object.');
  }
  for (const key of Object.keys(input)) {
    if (!ROOT_KEYS.has(key)) throw new BridgeCoreError('INVALID_TRANSFORM', `Unknown worldTransform property: ${key}.`, { path: key });
  }
  const translation = input.translationMm ?? {};
  if (!translation || typeof translation !== 'object' || Array.isArray(translation)) {
    throw new BridgeCoreError('INVALID_TRANSFORM', 'worldTransform.translationMm must be an object.');
  }
  for (const key of Object.keys(translation)) {
    if (!TRANSLATION_KEYS.has(key)) {
      throw new BridgeCoreError('INVALID_TRANSFORM', `Unknown translation property: ${key}.`, { path: `translationMm.${key}` });
    }
  }
  if (input.yawRad !== undefined && input.yawDeg !== undefined) {
    const fromRadians = finite(input.yawRad, 'worldTransform.yawRad');
    const fromDegrees = finite(input.yawDeg, 'worldTransform.yawDeg') * Math.PI / 180;
    if (Math.abs(fromRadians - fromDegrees) > 1e-9) {
      throw new BridgeCoreError('INVALID_TRANSFORM', 'yawRad and yawDeg do not describe the same angle.');
    }
  }
  const yawRad = input.yawRad !== undefined
    ? finite(input.yawRad, 'worldTransform.yawRad')
    : finite(input.yawDeg ?? 0, 'worldTransform.yawDeg') * Math.PI / 180;
  const scale = finite(input.scale ?? 1, 'worldTransform.scale');
  if (!(scale > 0) || scale > 1000) {
    throw new BridgeCoreError('INVALID_TRANSFORM', 'worldTransform.scale must be greater than 0 and at most 1000.', { scale });
  }
  return Object.freeze({
    id: typeof input.id === 'string' && input.id ? input.id : 'bridge-local-to-main-demo',
    translationMm: Object.freeze({
      xMm: finite(translation.xMm ?? 0, 'worldTransform.translationMm.xMm'),
      yMm: finite(translation.yMm ?? 0, 'worldTransform.translationMm.yMm'),
      zMm: finite(translation.zMm ?? 0, 'worldTransform.translationMm.zMm')
    }),
    yawRad,
    yawDeg: yawRad * 180 / Math.PI,
    scale,
    sourceFrame: 'v46-bridge-local-x-span-y-up-z-width',
    targetFrame: 'main-demo-machine-x-y-horizontal-z-up'
  });
}

export function transformPointToMainDemo(point, worldTransform = {}) {
  const transform = normalizeWorldTransform(worldTransform);
  if (!point || typeof point !== 'object') throw new BridgeCoreError('INVALID_TRANSFORM', 'A bridge-local point is required.');
  const localX = finite(point.x ?? point.xMm, 'point.x');
  const localY = finite(point.y ?? point.yMm, 'point.y');
  const localZ = finite(point.z ?? point.zMm, 'point.z');
  const c = Math.cos(transform.yawRad);
  const s = Math.sin(transform.yawRad);
  return {
    xMm: transform.translationMm.xMm + transform.scale * (c * localX - s * localZ),
    yMm: transform.translationMm.yMm + transform.scale * (s * localX + c * localZ),
    zMm: transform.translationMm.zMm + transform.scale * localY
  };
}

export function transformDirectionToMainDemo(vector, worldTransform = {}) {
  const transform = normalizeWorldTransform(worldTransform);
  const localX = finite(vector.x ?? vector.xMm, 'vector.x');
  const localY = finite(vector.y ?? vector.yMm, 'vector.y');
  const localZ = finite(vector.z ?? vector.zMm, 'vector.z');
  const c = Math.cos(transform.yawRad);
  const s = Math.sin(transform.yawRad);
  return {
    x: c * localX - s * localZ,
    y: s * localX + c * localZ,
    z: localY
  };
}

export function transformYawToMainDemo(localYawRad = 0, worldTransform = {}) {
  finite(localYawRad, 'localYawRad');
  return normalizeWorldTransform(worldTransform).yawRad + localYawRad;
}

export function transformBoxToMainDemo({ centre, size, yawRad = 0 }, worldTransform = {}) {
  const transform = normalizeWorldTransform(worldTransform);
  if (!size || typeof size !== 'object') throw new BridgeCoreError('INVALID_TRANSFORM', 'A bridge-local box size is required.');
  return {
    position: transformPointToMainDemo(centre, transform),
    yawRad: transformYawToMainDemo(yawRad, transform),
    sizeMm: {
      xMm: finite(size.x ?? size.xMm, 'size.x') * transform.scale,
      yMm: finite(size.z ?? size.zMm, 'size.z') * transform.scale,
      zMm: finite(size.y ?? size.yMm, 'size.y') * transform.scale
    }
  };
}

export function transformAnchorToMainDemo(anchor, worldTransform = {}) {
  if (!anchor) return null;
  const transformed = transformBoxToMainDemo({ centre: anchor.centre, size: anchor.size }, worldTransform);
  const innerLocal = { x: anchor.innerFaceX, y: anchor.centre.y, z: anchor.centre.z };
  return {
    ...transformed,
    innerFace: transformPointToMainDemo(innerLocal, worldTransform),
    local: cloneValue(anchor)
  };
}

export function inverseTransformPointFromMainDemo(point, worldTransform = {}) {
  const transform = normalizeWorldTransform(worldTransform);
  const dx = finite(point.xMm, 'point.xMm') - transform.translationMm.xMm;
  const dy = finite(point.yMm, 'point.yMm') - transform.translationMm.yMm;
  const dz = finite(point.zMm, 'point.zMm') - transform.translationMm.zMm;
  const c = Math.cos(transform.yawRad);
  const s = Math.sin(transform.yawRad);
  return {
    x: (c * dx + s * dy) / transform.scale,
    y: dz / transform.scale,
    z: (-s * dx + c * dy) / transform.scale
  };
}
