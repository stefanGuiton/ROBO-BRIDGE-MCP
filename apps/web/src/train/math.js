'use strict';

export const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
export const round6 = (value) => Math.round(Number(value) * 1e6) / 1e6;
export const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
export const cloneValue = (value) => value === undefined ? undefined : structuredClone(value);

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (ArrayBuffer.isView(value)) return canonicalJson(Array.from(value));
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function fnv1aText(value, seed = 2166136261) {
  const text = typeof value === 'string' ? value : canonicalJson(value);
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    hash ^= code & 255;
    hash = Math.imul(hash, 16777619);
    if (code > 255) {
      hash ^= (code >>> 8) & 255;
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

export function checksumHex(value, seed = 2166136261) {
  return fnv1aText(value, seed).toString(16).padStart(8, '0');
}

export function vector(x = 0, y = 0, z = 0) { return { x, y, z }; }
export function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
export function subtract(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
export function multiply(a, scalar) { return { x: a.x * scalar, y: a.y * scalar, z: a.z * scalar }; }
export function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
export function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}
export function lengthSquared(value) { return dot(value, value); }
export function length(value) { return Math.sqrt(lengthSquared(value)); }
export function normalise(value, fallback = { x: 1, y: 0, z: 0 }) {
  const magnitude = length(value);
  return magnitude > 1e-12 ? multiply(value, 1 / magnitude) : { ...fallback };
}
export function midpoint(a, b) { return multiply(add(a, b), 0.5); }

export function identityQuaternion() { return { x: 0, y: 0, z: 0, w: 1 }; }

export function normaliseQuaternion(quaternion = identityQuaternion()) {
  const magnitude = Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w) || 1;
  return {
    x: quaternion.x / magnitude,
    y: quaternion.y / magnitude,
    z: quaternion.z / magnitude,
    w: quaternion.w / magnitude
  };
}

export function multiplyQuaternions(a, b) {
  return normaliseQuaternion({
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
  });
}

export function conjugateQuaternion(q) { return { x: -q.x, y: -q.y, z: -q.z, w: q.w }; }

export function rotateVector(quaternion, value) {
  const q = normaliseQuaternion(quaternion);
  const tx = 2 * (q.y * value.z - q.z * value.y);
  const ty = 2 * (q.z * value.x - q.x * value.z);
  const tz = 2 * (q.x * value.y - q.y * value.x);
  return {
    x: value.x + q.w * tx + (q.y * tz - q.z * ty),
    y: value.y + q.w * ty + (q.z * tx - q.x * tz),
    z: value.z + q.w * tz + (q.x * ty - q.y * tx)
  };
}

export function integrateQuaternion(quaternion, angularVelocity, dt) {
  const qx = quaternion.x;
  const qy = quaternion.y;
  const qz = quaternion.z;
  const qw = quaternion.w;
  const wx = angularVelocity.x;
  const wy = angularVelocity.y;
  const wz = angularVelocity.z;
  quaternion.x += 0.5 * (wx * qw + wy * qz - wz * qy) * dt;
  quaternion.y += 0.5 * (-wx * qz + wy * qw + wz * qx) * dt;
  quaternion.z += 0.5 * (wx * qy - wy * qx + wz * qw) * dt;
  quaternion.w += 0.5 * (-wx * qx - wy * qy - wz * qz) * dt;
  const normal = normaliseQuaternion(quaternion);
  quaternion.x = normal.x;
  quaternion.y = normal.y;
  quaternion.z = normal.z;
  quaternion.w = normal.w;
  return quaternion;
}

export function eulerDegreesToQuaternion(euler = {}) {
  const x = finite(euler.xDeg ?? euler.x, 0) * Math.PI / 360;
  const y = finite(euler.yDeg ?? euler.y, 0) * Math.PI / 360;
  const z = finite(euler.zDeg ?? euler.z, 0) * Math.PI / 360;
  const sx = Math.sin(x), cx = Math.cos(x);
  const sy = Math.sin(y), cy = Math.cos(y);
  const sz = Math.sin(z), cz = Math.cos(z);
  return normaliseQuaternion({
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz,
    w: cx * cy * cz - sx * sy * sz
  });
}

export function quaternionAngularError(a, b) {
  const qa = normaliseQuaternion(a);
  const qb = normaliseQuaternion(b);
  const product = clamp(Math.abs(qa.x * qb.x + qa.y * qb.y + qa.z * qb.z + qa.w * qb.w), 0, 1);
  return 2 * Math.acos(product);
}

export function quaternionFromRotationMatrix(columns) {
  const m00 = columns[0].x, m10 = columns[0].y, m20 = columns[0].z;
  const m01 = columns[1].x, m11 = columns[1].y, m21 = columns[1].z;
  const m02 = columns[2].x, m12 = columns[2].y, m22 = columns[2].z;
  const trace = m00 + m11 + m22;
  let x, y, z, w;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = 0.25 * s;
    x = (m21 - m12) / s;
    y = (m02 - m20) / s;
    z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  return normaliseQuaternion({ x, y, z, w });
}

export function quaternionFromXDirection(direction) {
  const from = { x: 1, y: 0, z: 0 };
  const to = normalise(direction, from);
  const cosine = clamp(dot(from, to), -1, 1);
  if (cosine > 0.999999) return identityQuaternion();
  if (cosine < -0.999999) return { x: 0, y: 1, z: 0, w: 0 };
  const axis = normalise(cross(from, to), { x: 0, y: 1, z: 0 });
  const half = Math.acos(cosine) * 0.5;
  const sine = Math.sin(half);
  return { x: axis.x * sine, y: axis.y * sine, z: axis.z * sine, w: Math.cos(half) };
}

export function bodyAxes(body) {
  return [
    rotateVector(body.rotation, { x: 1, y: 0, z: 0 }),
    rotateVector(body.rotation, { x: 0, y: 1, z: 0 }),
    rotateVector(body.rotation, { x: 0, y: 0, z: 1 })
  ].map((axis) => normalise(axis));
}

// Returns the minimum translation axis from body A to body B.
export function orientedBoxOverlap(bodyA, bodyB, epsilon = 1e-7) {
  const axesA = bodyAxes(bodyA);
  const axesB = bodyAxes(bodyB);
  const halfA = [bodyA.size.x * 0.5, bodyA.size.y * 0.5, bodyA.size.z * 0.5];
  const halfB = [bodyB.size.x * 0.5, bodyB.size.y * 0.5, bodyB.size.z * 0.5];
  const centreDelta = subtract(bodyB.position, bodyA.position);
  const rotation = Array.from({ length: 3 }, () => new Array(3).fill(0));
  const absolute = Array.from({ length: 3 }, () => new Array(3).fill(0));
  const translationA = axesA.map((axis) => dot(centreDelta, axis));
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      rotation[i][j] = dot(axesA[i], axesB[j]);
      absolute[i][j] = Math.abs(rotation[i][j]) + epsilon;
    }
  }

  let minimumDepth = Infinity;
  let minimumAxis = null;
  const consider = (distance, radiusA, radiusB, axis, sign) => {
    const depth = radiusA + radiusB - Math.abs(distance);
    if (depth < 0) return false;
    if (depth < minimumDepth) {
      minimumDepth = depth;
      minimumAxis = multiply(normalise(axis), sign >= 0 ? 1 : -1);
    }
    return true;
  };

  for (let i = 0; i < 3; i += 1) {
    const radiusB = halfB[0] * absolute[i][0] + halfB[1] * absolute[i][1] + halfB[2] * absolute[i][2];
    if (!consider(translationA[i], halfA[i], radiusB, axesA[i], translationA[i])) return { overlap: false, depthMm: 0, axis: null };
  }

  for (let j = 0; j < 3; j += 1) {
    const distance = dot(centreDelta, axesB[j]);
    const radiusA = halfA[0] * absolute[0][j] + halfA[1] * absolute[1][j] + halfA[2] * absolute[2][j];
    if (!consider(distance, radiusA, halfB[j], axesB[j], distance)) return { overlap: false, depthMm: 0, axis: null };
  }

  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      const axis = cross(axesA[i], axesB[j]);
      const axisMagnitude = length(axis);
      if (axisMagnitude < 1e-6) continue;
      const i1 = (i + 1) % 3;
      const i2 = (i + 2) % 3;
      const j1 = (j + 1) % 3;
      const j2 = (j + 2) % 3;
      const radiusA = halfA[i1] * absolute[i2][j] + halfA[i2] * absolute[i1][j];
      const radiusB = halfB[j1] * absolute[i][j2] + halfB[j2] * absolute[i][j1];
      const rawDistance = Math.abs(translationA[i2] * rotation[i1][j] - translationA[i1] * rotation[i2][j]);
      const rawDepth = radiusA + radiusB - rawDistance;
      if (rawDepth < 0) return { overlap: false, depthMm: 0, axis: null };
      const depth = rawDepth / axisMagnitude;
      if (depth < minimumDepth) {
        const normal = normalise(axis);
        minimumDepth = depth;
        minimumAxis = dot(centreDelta, normal) >= 0 ? normal : multiply(normal, -1);
      }
    }
  }

  return {
    overlap: Boolean(minimumAxis) && minimumDepth >= 0,
    depthMm: Number.isFinite(minimumDepth) ? Math.max(0, minimumDepth) : 0,
    axis: minimumAxis || { x: 1, y: 0, z: 0 }
  };
}

export function deepFreezePlain(value) {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value) || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreezePlain(child);
  return Object.freeze(value);
}
