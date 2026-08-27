const colour = {
  transparent: [0, 0, 0, 0], black: [20, 22, 26, 255], white: [242, 244, 248, 255],
  red: [214, 48, 54, 255], blue: [40, 92, 196, 255], yellow: [245, 196, 52, 255], green: [48, 150, 84, 255]
};

function image(size = 256) {
  return { width: size, height: size, data: new Uint8ClampedArray(size * size * 4) };
}
function setPixel(out, x, y, rgba) {
  const index = (y * out.width + x) * 4;
  out.data[index] = rgba[0]; out.data[index + 1] = rgba[1]; out.data[index + 2] = rgba[2]; out.data[index + 3] = rgba[3];
}
function fill(out, predicate, rgba) {
  for (let y = 0; y < out.height; y += 1) for (let x = 0; x < out.width; x += 1) if (predicate(x, y, out.width, out.height)) setPixel(out, x, y, rgba);
}

export function makePattern(name = 'ring', size = 256) {
  const out = image(size);
  if (name === 'diagonal') {
    fill(out, () => true, colour.white);
    fill(out, (x, y, w) => y > x * 0.72 + w * 0.08, colour.blue);
    fill(out, (x, y, w) => y < x * 0.72 - w * 0.08, colour.red);
    return out;
  }
  if (name === 'glyph') {
    fill(out, (x, y, w, h) => x > w * 0.22 && x < w * 0.38 && y > h * 0.14 && y < h * 0.82, colour.yellow);
    fill(out, (x, y, w, h) => x > w * 0.32 && x < w * 0.75 && y > h * 0.67 && y < h * 0.82, colour.yellow);
    fill(out, (x, y, w, h) => x > w * 0.48 && x < w * 0.66 && y > h * 0.18 && y < h * 0.58, colour.green);
    return out;
  }
  if (name === 'transparent') {
    fill(out, (x, y, w, h) => {
      const nx = (x - w / 2) / (w / 2); const ny = (y - h / 2) / (h / 2);
      return Math.abs(nx) + Math.abs(ny) < 0.68;
    }, colour.white);
    fill(out, (x, y, w, h) => Math.abs(x - w / 2) < w * 0.08 || Math.abs(y - h / 2) < h * 0.08, colour.red);
    return out;
  }
  if (name === 'six') {
    const colours = [colour.black, colour.white, colour.red, colour.blue, colour.yellow, colour.green];
    for (let y = 0; y < out.height; y += 1) for (let x = 0; x < out.width; x += 1) {
      const col = Math.min(2, Math.floor(x / (out.width / 3)));
      const row = Math.min(1, Math.floor(y / (out.height / 2)));
      setPixel(out, x, y, colours[row * 3 + col]);
    }
    return out;
  }
  fill(out, (x, y, w, h) => {
    const dx = x - w / 2; const dy = y - h / 2; const r = Math.hypot(dx, dy);
    return r < w * 0.39 && r > w * 0.19;
  }, colour.white);
  fill(out, (x, y, w, h) => {
    const dx = x - w / 2; const dy = y - h / 2;
    return Math.hypot(dx, dy) < w * 0.12;
  }, colour.blue);
  return out;
}

export const PATTERN_NAMES = Object.freeze(['ring', 'diagonal', 'glyph', 'transparent', 'six']);
