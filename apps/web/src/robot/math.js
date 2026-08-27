export const EPSILON = 1e-9;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
export const radToDeg = (value) => value * 180 / Math.PI;
export const degToRad = (value) => value * Math.PI / 180;

export function wrapPi(value) {
  let result = ((value + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  if (Object.is(result, -0)) result = 0;
  return result;
}

export function angleDistance(a, b) {
  return Math.abs(wrapPi(a - b));
}

export function mat4Identity() {
  return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
}

export function mat4Multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[r * 4 + k] * b[k * 4 + c];
      out[r * 4 + c] = sum;
    }
  }
  return out;
}

export function dhMatrix(a, d, alpha, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  return [
    c, -s * ca, s * sa, a * c,
    s, c * ca, -c * sa, a * s,
    0, sa, ca, d,
    0, 0, 0, 1
  ];
}

export function translationMatrix(x, y, z) {
  return [1,0,0,x, 0,1,0,y, 0,0,1,z, 0,0,0,1];
}

export function transformPoint(matrix, point = [0, 0, 0]) {
  const [x, y, z] = point;
  return {
    xMm: matrix[0] * x + matrix[1] * y + matrix[2] * z + matrix[3],
    yMm: matrix[4] * x + matrix[5] * y + matrix[6] * z + matrix[7],
    zMm: matrix[8] * x + matrix[9] * y + matrix[10] * z + matrix[11]
  };
}

export function rotation3(matrix4) {
  return [
    matrix4[0], matrix4[1], matrix4[2],
    matrix4[4], matrix4[5], matrix4[6],
    matrix4[8], matrix4[9], matrix4[10]
  ];
}

export function mat3Multiply(a, b) {
  const out = new Array(9).fill(0);
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return out;
}

export function mat3Transpose(a) {
  return [a[0],a[3],a[6], a[1],a[4],a[7], a[2],a[5],a[8]];
}

export function rotationVectorError(current, target) {
  const relative = mat3Multiply(target, mat3Transpose(current));
  const trace = relative[0] + relative[4] + relative[8];
  const cosAngle = clamp((trace - 1) / 2, -1, 1);
  const angle = Math.acos(cosAngle);
  if (angle < 1e-10) return [0, 0, 0];

  let axis = [relative[7] - relative[5], relative[2] - relative[6], relative[3] - relative[1]];
  const axisNorm = Math.hypot(...axis);
  if (axisNorm > 1e-9) {
    axis = axis.map((value) => value / axisNorm);
    return axis.map((value) => value * angle);
  }

  const xx = Math.max(0, (relative[0] + 1) / 2);
  const yy = Math.max(0, (relative[4] + 1) / 2);
  const zz = Math.max(0, (relative[8] + 1) / 2);
  axis = [Math.sqrt(xx), Math.sqrt(yy), Math.sqrt(zz)];
  if (relative[7] - relative[5] < 0) axis[0] *= -1;
  if (relative[2] - relative[6] < 0) axis[1] *= -1;
  if (relative[3] - relative[1] < 0) axis[2] *= -1;
  const norm = Math.hypot(...axis) || 1;
  return axis.map((value) => value / norm * angle);
}

export function vectorNorm(values) {
  return Math.hypot(...values);
}

export function solveLinearSystem(matrix, vector) {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const div = a[col][col];
    for (let j = col; j <= n; j += 1) a[col][j] /= div;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      if (Math.abs(factor) < 1e-15) continue;
      for (let j = col; j <= n; j += 1) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => row[n]);
}

export function distance3(a, b) {
  return Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm, a.zMm - b.zMm);
}
