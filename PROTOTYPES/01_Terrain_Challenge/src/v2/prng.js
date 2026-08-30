function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mix32(value) {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

export function deriveSeed(seed, streamName) {
  return mix32((Number(seed) >>> 0) ^ hashString(streamName));
}

export function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createSimplex2D(random) {
  const gradients = Object.freeze([
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [1, 0], [-1, 0],
    [0, 1], [0, -1], [0, 1], [0, -1]
  ]);
  const source = new Uint8Array(256);
  for (let index = 0; index < source.length; index += 1) source[index] = index;
  for (let index = source.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    const swap = source[index]; source[index] = source[target]; source[target] = swap;
  }
  const permutation = new Uint8Array(512);
  for (let index = 0; index < permutation.length; index += 1) permutation[index] = source[index & 255];
  const f2 = 0.5 * (Math.sqrt(3) - 1);
  const g2 = (3 - Math.sqrt(3)) / 6;
  const contribution = (x, y, gradientIndex) => {
    let attenuation = 0.5 - x * x - y * y;
    if (attenuation <= 0) return 0;
    attenuation *= attenuation;
    const gradient = gradients[gradientIndex % 12];
    return attenuation * attenuation * (gradient[0] * x + gradient[1] * y);
  };
  return (x, y) => {
    const skew = (x + y) * f2;
    const i = Math.floor(x + skew), j = Math.floor(y + skew);
    const unskew = (i + j) * g2;
    const x0 = x - (i - unskew), y0 = y - (j - unskew);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + g2, y1 = y0 - j1 + g2;
    const x2 = x0 - 1 + 2 * g2, y2 = y0 - 1 + 2 * g2;
    const ii = i & 255, jj = j & 255;
    const g0 = permutation[ii + permutation[jj]];
    const g1 = permutation[ii + i1 + permutation[jj + j1]];
    const g2Index = permutation[ii + 1 + permutation[jj + 1]];
    return 70 * (contribution(x0, y0, g0) + contribution(x1, y1, g1) + contribution(x2, y2, g2Index));
  };
}

export function createNoiseStreams(seed) {
  const make = (name) => createSimplex2D(createRandom(deriveSeed(seed, name)));
  return Object.freeze({
    centre: make("centre"),
    macro: make("macro"),
    slope: make("slope"),
    detail: make("detail"),
    ridge: make("ridge"),
    ridgeWarp: make("ridge-warp")
  });
}
