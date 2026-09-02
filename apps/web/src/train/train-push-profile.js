'use strict';

import { clamp, round6 } from './math.js';

function positive(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new RangeError(`${name} must be a positive finite number.`);
  return number;
}

export function createPushProfile({ pushDistanceMm, trainSpeedMmPerSecond } = {}) {
  const distanceMm = positive(pushDistanceMm, 'pushDistanceMm');
  const finalSpeedMmPerSecond = positive(trainSpeedMmPerSecond, 'trainSpeedMmPerSecond');
  const durationSeconds = 2 * distanceMm / finalSpeedMmPerSecond;
  return Object.freeze({
    pushDistanceMm: distanceMm,
    trainSpeedMmPerSecond: finalSpeedMmPerSecond,
    durationSeconds,
    sample(timeSeconds) {
      const time = clamp(Number(timeSeconds) || 0, 0, durationSeconds);
      if (time <= 0) return {
        timeSeconds: 0,
        normalizedTime: 0,
        distanceMm: 0,
        speedMmPerSecond: 0,
        accelerationMmPerSecondSquared: 0,
        complete: false
      };
      if (time >= durationSeconds) return {
        timeSeconds: durationSeconds,
        normalizedTime: 1,
        distanceMm,
        speedMmPerSecond: finalSpeedMmPerSecond,
        accelerationMmPerSecondSquared: 0,
        complete: true
      };
      const normalizedTime = time / durationSeconds;
      const angle = Math.PI * normalizedTime;
      const speedMmPerSecond = finalSpeedMmPerSecond * 0.5 * (1 - Math.cos(angle));
      const accelerationMmPerSecondSquared = finalSpeedMmPerSecond * Math.PI
        / (2 * durationSeconds) * Math.sin(angle);
      const travelled = finalSpeedMmPerSecond * 0.5
        * (time - durationSeconds / Math.PI * Math.sin(angle));
      return {
        timeSeconds: round6(time),
        normalizedTime: round6(normalizedTime),
        distanceMm: round6(travelled),
        speedMmPerSecond: round6(speedMmPerSecond),
        accelerationMmPerSecondSquared: round6(accelerationMmPerSecondSquared),
        complete: false
      };
    }
  });
}
