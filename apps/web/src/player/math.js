export const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

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
