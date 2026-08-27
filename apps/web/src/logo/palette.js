const clamp01 = (value) => Math.min(1, Math.max(0, value));

function srgbChannelToLinear(byte) {
  const value = clamp01(byte / 255);
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearRgbToOklab(r, g, b) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l3 = Math.cbrt(l);
  const m3 = Math.cbrt(m);
  const s3 = Math.cbrt(s);
  return [
    0.2104542553 * l3 + 0.793617785 * m3 - 0.0040720468 * s3,
    1.9779984951 * l3 - 2.428592205 * m3 + 0.4505937099 * s3,
    0.0259040371 * l3 + 0.7827717662 * m3 - 0.808675766 * s3
  ];
}

export function srgbToOklab(srgb) {
  const [r, g, b] = srgb.map(srgbChannelToLinear);
  return linearRgbToOklab(r, g, b);
}

function entry(id, label, srgb) {
  return Object.freeze({ id, label, srgb: Object.freeze([...srgb]), oklab: Object.freeze(srgbToOklab(srgb)) });
}

export const DEFAULT_PALETTE = Object.freeze([
  entry('black', 'Black', [20, 22, 26]),
  entry('white', 'White', [242, 244, 248]),
  entry('red', 'Red', [214, 48, 54]),
  entry('blue', 'Blue', [40, 92, 196]),
  entry('yellow', 'Yellow', [245, 196, 52]),
  entry('green', 'Green', [48, 150, 84])
]);

export const DEFAULT_PALETTE_ID = 'challenge-6-v1';

export function oklabDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function nearestPaletteColour(srgb, palette = DEFAULT_PALETTE) {
  const lab = srgbToOklab(srgb);
  let best = null;
  for (let index = 0; index < palette.length; index += 1) {
    const candidate = palette[index];
    const distance = oklabDistance(lab, candidate.oklab);
    if (!best || distance < best.distance - 1e-12 || (Math.abs(distance - best.distance) <= 1e-12 && candidate.id < best.entry.id)) {
      best = { entry: candidate, distance };
    }
  }
  return { ...best, sourceOklab: lab };
}
