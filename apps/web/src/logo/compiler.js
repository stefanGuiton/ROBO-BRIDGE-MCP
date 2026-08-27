import { BRICK_SPEC, DEFAULT_BOARD_LIMITS } from '../bricks/brick-spec.js';
import { createBlueprint, validateBlueprint } from './blueprint.js';
import { DEFAULT_PALETTE, DEFAULT_PALETTE_ID, nearestPaletteColour } from './palette.js';

export const COMPILER_VERSION = 'logo-compiler-v1';
export const ALPHA_EMPTY_THRESHOLD = 0.03;
export const EMPTY_COVERAGE_THRESHOLD = 0.28;
export const MAX_SOURCE_PIXELS = 1_048_576;
export const MAX_SOURCE_DIMENSION = 1024;
export const MAX_SOURCE_FILE_BYTES = 8 * 1024 * 1024;

function checkImageData(image) {
  if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height)) throw new Error('invalid_image_dimensions');
  if (image.width <= 0 || image.height <= 0) throw new Error('invalid_image_dimensions');
  if (image.width > MAX_SOURCE_DIMENSION || image.height > MAX_SOURCE_DIMENSION || image.width * image.height > MAX_SOURCE_PIXELS) throw new Error('image_too_large');
  if (!image.data || image.data.length !== image.width * image.height * 4) throw new Error('invalid_rgba_buffer');
}

function makeIntegral(image) {
  const width = image.width;
  const height = image.height;
  const stride = width + 1;
  const size = stride * (height + 1);
  const alpha = new Float64Array(size);
  const red = new Float64Array(size);
  const green = new Float64Array(size);
  const blue = new Float64Array(size);
  const data = image.data;
  for (let y = 1; y <= height; y += 1) {
    let rowA = 0; let rowR = 0; let rowG = 0; let rowB = 0;
    for (let x = 1; x <= width; x += 1) {
      const pixel = ((y - 1) * width + (x - 1)) * 4;
      const a = data[pixel + 3] / 255;
      rowA += a;
      rowR += data[pixel] * a;
      rowG += data[pixel + 1] * a;
      rowB += data[pixel + 2] * a;
      const index = y * stride + x;
      const above = index - stride;
      alpha[index] = alpha[above] + rowA;
      red[index] = red[above] + rowR;
      green[index] = green[above] + rowG;
      blue[index] = blue[above] + rowB;
    }
  }
  return { width, height, stride, alpha, red, green, blue };
}

function rectSum(array, stride, x0, y0, x1, y1) {
  const a = y0 * stride + x0;
  const b = y0 * stride + x1;
  const c = y1 * stride + x0;
  const d = y1 * stride + x1;
  return array[d] - array[b] - array[c] + array[a];
}

function sampleSourceRect(integral, x0Norm, y0Norm, x1Norm, y1Norm) {
  const width = integral.width;
  const height = integral.height;
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(x0Norm * width)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(y0Norm * height)));
  const x1 = Math.max(x0 + 1, Math.min(width, Math.ceil(x1Norm * width)));
  const y1 = Math.max(y0 + 1, Math.min(height, Math.ceil(y1Norm * height)));
  const pixelArea = Math.max(1, (x1 - x0) * (y1 - y0));
  const sumA = rectSum(integral.alpha, integral.stride, x0, y0, x1, y1);
  if (sumA <= ALPHA_EMPTY_THRESHOLD * pixelArea) return { localCoverage: sumA / pixelArea, srgb: [0, 0, 0] };
  const sumR = rectSum(integral.red, integral.stride, x0, y0, x1, y1);
  const sumG = rectSum(integral.green, integral.stride, x0, y0, x1, y1);
  const sumB = rectSum(integral.blue, integral.stride, x0, y0, x1, y1);
  return {
    localCoverage: sumA / pixelArea,
    srgb: [sumR / sumA, sumG / sumA, sumB / sumA]
  };
}

function fitGeometry(sourceAspect, outputAspect, fitMode) {
  if (fitMode === 'cover') {
    if (sourceAspect > outputAspect) {
      const width = outputAspect / sourceAspect;
      return { mode: 'cover', src: { x0: (1 - width) / 2, y0: 0, x1: (1 + width) / 2, y1: 1 } };
    }
    const height = sourceAspect / outputAspect;
    return { mode: 'cover', src: { x0: 0, y0: (1 - height) / 2, x1: 1, y1: (1 + height) / 2 } };
  }
  if (sourceAspect > outputAspect) {
    const height = outputAspect / sourceAspect;
    return { mode: 'contain', dst: { x0: 0, y0: (1 - height) / 2, x1: 1, y1: (1 + height) / 2 } };
  }
  const width = sourceAspect / outputAspect;
  return { mode: 'contain', dst: { x0: (1 - width) / 2, y0: 0, x1: (1 + width) / 2, y1: 1 } };
}

function sampleOutputRegion(integral, region, fit) {
  let sample;
  let fitFraction = 1;
  if (fit.mode === 'cover') {
    const src = fit.src;
    const sx0 = src.x0 + region.x0 * (src.x1 - src.x0);
    const sx1 = src.x0 + region.x1 * (src.x1 - src.x0);
    const sy0 = src.y0 + region.y0 * (src.y1 - src.y0);
    const sy1 = src.y0 + region.y1 * (src.y1 - src.y0);
    sample = sampleSourceRect(integral, sx0, sy0, sx1, sy1);
  } else {
    const dst = fit.dst;
    const ix0 = Math.max(region.x0, dst.x0);
    const ix1 = Math.min(region.x1, dst.x1);
    const iy0 = Math.max(region.y0, dst.y0);
    const iy1 = Math.min(region.y1, dst.y1);
    if (ix1 <= ix0 || iy1 <= iy0) return { coverage: 0, srgb: [0, 0, 0] };
    const regionArea = (region.x1 - region.x0) * (region.y1 - region.y0);
    const intersectionArea = (ix1 - ix0) * (iy1 - iy0);
    fitFraction = intersectionArea / regionArea;
    const sx0 = (ix0 - dst.x0) / (dst.x1 - dst.x0);
    const sx1 = (ix1 - dst.x0) / (dst.x1 - dst.x0);
    const sy0 = (iy0 - dst.y0) / (dst.y1 - dst.y0);
    const sy1 = (iy1 - dst.y0) / (dst.y1 - dst.y0);
    sample = sampleSourceRect(integral, sx0, sy0, sx1, sy1);
  }
  return { coverage: Math.max(0, Math.min(1, sample.localCoverage * fitFraction)), srgb: sample.srgb };
}

function sampleBrick(integral, row, col, rows, cols, fit, palette) {
  const region = { x0: col / cols, x1: (col + 2) / cols, y0: row / rows, y1: (row + 1) / rows };
  const whole = sampleOutputRegion(integral, region, fit);
  if (whole.coverage <= ALPHA_EMPTY_THRESHOLD) return { coverage: whole.coverage, srgb: whole.srgb, paletteMatch: null };

  const wholeMatch = nearestPaletteColour(whole.srgb, palette);
  if (wholeMatch.distance <= 0.08) return { coverage: whole.coverage, srgb: whole.srgb, paletteMatch: wholeMatch };

  // Edge regions can contain two source colours. Quantizing only the whole-brick
  // average can invent a third palette colour. For ambiguous averages, vote across
  // two deterministic half-brick samples and keep the fast path for solid areas.
  const votes = new Map();
  const xSteps = 2;
  const ySteps = 1;
  for (let sy = 0; sy < ySteps; sy += 1) {
    for (let sx = 0; sx < xSteps; sx += 1) {
      const sub = sampleOutputRegion(integral, {
        x0: region.x0 + (region.x1 - region.x0) * sx / xSteps,
        x1: region.x0 + (region.x1 - region.x0) * (sx + 1) / xSteps,
        y0: region.y0 + (region.y1 - region.y0) * sy / ySteps,
        y1: region.y0 + (region.y1 - region.y0) * (sy + 1) / ySteps
      }, fit);
      if (sub.coverage <= ALPHA_EMPTY_THRESHOLD) continue;
      const match = nearestPaletteColour(sub.srgb, palette);
      const prior = votes.get(match.entry.id) ?? { entry: match.entry, weight: 0, weightedError: 0 };
      prior.weight += sub.coverage;
      prior.weightedError += match.distance * sub.coverage;
      votes.set(match.entry.id, prior);
    }
  }
  let winner = null;
  for (const entry of palette) {
    const vote = votes.get(entry.id);
    if (!vote) continue;
    const error = vote.weightedError / Math.max(vote.weight, 1e-12);
    if (!winner || vote.weight > winner.weight + 1e-12 ||
      (Math.abs(vote.weight - winner.weight) <= 1e-12 && error < winner.distance - 1e-12)) {
      winner = { entry: vote.entry, weight: vote.weight, distance: error };
    }
  }
  return { coverage: whole.coverage, srgb: whole.srgb, paletteMatch: winner ? { entry: winner.entry, distance: winner.distance } : wholeMatch };
}

function scoreCandidate({ rows, cols, samples, targetCount, brickBudget, sourceAspect }) {
  let visual = 0;
  let mask = 0;
  for (const sample of samples) {
    if (sample.placed) {
      visual += sample.colourError * sample.coverage;
      mask += 1 - sample.coverage;
    } else {
      mask += sample.coverage;
    }
  }
  const regionCount = Math.max(1, samples.length);
  const aspectPenalty = Math.abs(Math.log((cols / rows) / sourceAspect));
  const unusedBudget = Math.max(0, (brickBudget - targetCount) / brickBudget);
  const resolutionPenalty = 1 / Math.sqrt(rows * cols);
  return (visual / regionCount) * 1.6 + (mask / regionCount) * 0.65 + aspectPenalty * 0.25 + unusedBudget * 0.16 + resolutionPenalty * 0.35;
}

function evaluateCandidate({ rows, cols, integral, sourceAspect, fitMode, palette, brickBudget, emptyCoverageThreshold }) {
  const fit = fitGeometry(sourceAspect, cols / rows, fitMode);
  const samples = [];
  const sampledTargets = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 2) {
      const sampled = sampleBrick(integral, row, col, rows, cols, fit, palette);
      const placed = sampled.coverage >= emptyCoverageThreshold && sampled.paletteMatch;
      const colourError = sampled.paletteMatch?.distance ?? 0;
      const record = { row, col, coverage: sampled.coverage, colourError, placed: Boolean(placed) };
      samples.push(record);
      if (placed) sampledTargets.push({ row, col, coverage: sampled.coverage, colourError, colour: sampled.paletteMatch.entry.id });
    }
  }
  if (sampledTargets.length === 0 || sampledTargets.length > brickBudget) return null;
  const cost = scoreCandidate({ rows, cols, samples, targetCount: sampledTargets.length, brickBudget, sourceAspect });
  return { rows, cols, sampledTargets, targetCount: sampledTargets.length, cost };
}

export function compileImageData(image, options = {}) {
  checkImageData(image);
  const start = globalThis.performance?.now?.() ?? Date.now();
  const brickBudget = Math.max(1, Math.min(512, Math.trunc(options.brickBudget ?? 48)));
  const fitMode = options.fitMode === 'cover' ? 'cover' : 'contain';
  const seed = Number.isFinite(options.seed) ? Math.trunc(options.seed) : 1;
  const palette = options.palette ?? DEFAULT_PALETTE;
  const paletteId = options.paletteId ?? DEFAULT_PALETTE_ID;
  const boardLimits = options.boardLimits ?? DEFAULT_BOARD_LIMITS;
  const maxColsRaw = Math.max(2, Math.floor(boardLimits.maxWidthMm / BRICK_SPEC.logicalCellMm));
  const maxCols = maxColsRaw % 2 === 0 ? maxColsRaw : maxColsRaw - 1;
  const maxRows = Math.max(1, Math.floor(boardLimits.maxHeightMm / BRICK_SPEC.logicalCellMm));
  const emptyCoverageThreshold = options.emptyCoverageThreshold ?? EMPTY_COVERAGE_THRESHOLD;
  const sourceAspect = image.width / image.height;
  const integral = makeIntegral(image);

  let best = null;
  for (let rows = 1; rows <= maxRows; rows += 1) {
    for (let cols = 2; cols <= maxCols; cols += 2) {
      if (rows * cols / 2 < Math.min(2, brickBudget)) continue;
      const candidate = evaluateCandidate({ rows, cols, integral, sourceAspect, fitMode, palette, brickBudget, emptyCoverageThreshold });
      if (!candidate) continue;
      if (!best || candidate.cost < best.cost - 1e-12 ||
        (Math.abs(candidate.cost - best.cost) <= 1e-12 && candidate.targetCount > best.targetCount) ||
        (Math.abs(candidate.cost - best.cost) <= 1e-12 && candidate.targetCount === best.targetCount && candidate.rows * candidate.cols > best.rows * best.cols)) {
        best = candidate;
      }
    }
  }
  if (!best) throw new Error('no_candidate_under_budget');
  const blueprint = createBlueprint({
    compilerVersion: COMPILER_VERSION,
    source: { widthPx: image.width, heightPx: image.height },
    rows: best.rows,
    cols: best.cols,
    sampledTargets: best.sampledTargets,
    brickBudget,
    fitMode,
    seed,
    palette,
    paletteId,
    boardOrigin: options.boardOrigin ?? null
  });
  const validation = validateBlueprint(blueprint, palette);
  if (!validation.ok) throw new Error(`blueprint_invariant:${validation.errors.join(',')}`);
  const end = globalThis.performance?.now?.() ?? Date.now();
  return { blueprint, diagnostics: { compileMs: end - start, candidateCost: best.cost, maxRows, maxCols } };
}
