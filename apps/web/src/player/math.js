export const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
export const mmToM = (millimetres) => millimetres / 1000;
export const mToMm = (metres) => metres * 1000;
export const smootherstep = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

export function moveTowards(current, target, maximumDelta) {
  const delta = target - current;
  if (Math.abs(delta) <= maximumDelta) return target;
  return current + Math.sign(delta) * maximumDelta;
}

export function angleWrap(value) {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function quaternionErrorVector(current, target, output, temporaryQuaternion) {
  temporaryQuaternion.copy(current).invert().premultiply(target);
  if (temporaryQuaternion.w < 0) {
    temporaryQuaternion.x *= -1;
    temporaryQuaternion.y *= -1;
    temporaryQuaternion.z *= -1;
    temporaryQuaternion.w *= -1;
  }
  const w = clamp(temporaryQuaternion.w, -1, 1);
  const angle = 2 * Math.acos(w);
  const scale = Math.sqrt(Math.max(1e-12, 1 - w * w));
  if (angle < 1e-7) return output.set(0, 0, 0);
  return output
    .set(temporaryQuaternion.x / scale, temporaryQuaternion.y / scale, temporaryQuaternion.z / scale)
    .multiplyScalar(angle > Math.PI ? angle - Math.PI * 2 : angle);
}

export function supportHeightMm(quaternion, halfX, halfY, halfZ) {
  const { x, y, z, w } = quaternion;
  const zx = 2 * (x * z - w * y);
  const zy = 2 * (y * z + w * x);
  const zz = 1 - 2 * (x * x + y * y);
  return Math.abs(zx) * halfX + Math.abs(zy) * halfY + Math.abs(zz) * halfZ;
}

export function shortestQuarterTurn(value) {
  return Math.round(angleWrap(value) / (Math.PI / 2)) * (Math.PI / 2);
}

export function fixedStepAdvance(accumulator, frameSeconds, stepSeconds, maximumSubsteps) {
  let nextAccumulator = Math.min(accumulator + Math.max(0, frameSeconds), stepSeconds * maximumSubsteps);
  let steps = 0;
  while (nextAccumulator + 1e-12 >= stepSeconds && steps < maximumSubsteps) {
    nextAccumulator -= stepSeconds;
    steps += 1;
  }
  return { accumulator: Math.max(0, nextAccumulator), steps };
}

// Exact deterministic helpers from the authoritative Oracle V8 player demo.
export function seededRng(seed) {
  let value = (seed | 0) || 0x6d2b79f5;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

export function gridCandidateLocal(x, y, orientation, pitch = 8, originX = 0, originY = 0) {
  const offsetX = orientation === 0 ? 1.5 * pitch : 0.5 * pitch;
  const offsetY = orientation === 0 ? 0.5 * pitch : 1.5 * pitch;
  const ix = Math.round((x - originX - offsetX) / pitch);
  const iy = Math.round((y - originY - offsetY) / pitch);
  return {
    x: originX + ix * pitch + offsetX,
    y: originY + iy * pitch + offsetY,
    ix,
    iy
  };
}

export function occupancyCells(ix, iy, orientation) {
  const result = [];
  const columns = orientation === 0 ? 4 : 2;
  const rows = orientation === 0 ? 2 : 4;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) result.push([ix + column, iy + row]);
  }
  return result;
}
