export const TRACK = Object.freeze({
  startS: -42,
  endS: 60,
  segmentLength: 6,
  gauge: 1.25,
  deckTopY: 0.15,
  railTopY: 0.42,
  bodyTargetY: 0.98,
  deckWidth: 4.6,
});

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function frameFromTangent(tangent) {
  const horizontalLength = Math.hypot(tangent.x, tangent.z) || 1;
  const lateral = { x: -tangent.z / horizontalLength, y: 0, z: tangent.x / horizontalLength };
  const vertical = {
    x: -lateral.z * tangent.y,
    y: lateral.z * tangent.x - lateral.x * tangent.z,
    z: lateral.x * tangent.y,
  };
  const verticalLength = Math.hypot(vertical.x, vertical.y, vertical.z) || 1;
  vertical.x /= verticalLength;
  vertical.y /= verticalLength;
  vertical.z /= verticalLength;
  return { lateral, vertical };
}

export class StraightCentreline {
  constructor(track = TRACK) {
    this.track = track;
    this.length = track.endS - track.startS;
    this.profile = "straight";
  }

  sample(s) {
    return {
      s,
      position: { x: s, y: this.track.railTopY, z: 0 },
      tangent: { x: 1, y: 0, z: 0 },
      lateral: { x: 0, y: 0, z: 1 },
      vertical: { x: 0, y: 1, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
    };
  }

  project(point) {
    return {
      s: point.x,
      lateral: point.z,
      vertical: point.y - this.track.railTopY,
    };
  }

  progressForS(s) {
    return clamp((s - this.track.startS) / this.length, 0, 1);
  }
}

export class CurvedCentreline extends StraightCentreline {
  constructor(track = TRACK, options = {}) {
    super(track);
    this.profile = "curved";
    this.curveStartS = options.curveStartS ?? -28;
    this.curveEndS = options.curveEndS ?? 38;
    this.curveAmplitude = options.curveAmplitude ?? 7.5;
    this.dipDepth = options.dipDepth ?? 1.8;
    this.curveSpan = this.curveEndS - this.curveStartS;
  }

  sample(s) {
    const clampedS = clamp(s, this.track.startS, this.track.endS);
    const rawU = (clampedS - this.curveStartS) / this.curveSpan;
    const u = clamp(rawU, 0, 1);
    let y = this.track.railTopY;
    let z = 0;
    let dyDs = 0;
    let dzDs = 0;

    if (rawU >= 0 && rawU <= 1) {
      const envelope = Math.sin(Math.PI * u) ** 2;
      const envelopeDerivative = Math.PI * Math.sin(2 * Math.PI * u);
      const wave = Math.sin(2 * Math.PI * u);
      const waveDerivative = 2 * Math.PI * Math.cos(2 * Math.PI * u);
      y -= this.dipDepth * envelope;
      z = this.curveAmplitude * wave * envelope;
      dyDs = (-this.dipDepth * envelopeDerivative) / this.curveSpan;
      dzDs = (this.curveAmplitude * (waveDerivative * envelope + wave * envelopeDerivative)) / this.curveSpan;
    }

    const tangentLength = Math.hypot(1, dyDs, dzDs);
    const tangent = { x: 1 / tangentLength, y: dyDs / tangentLength, z: dzDs / tangentLength };
    const { lateral, vertical } = frameFromTangent(tangent);
    return {
      s: clampedS,
      position: { x: clampedS, y, z },
      tangent,
      lateral,
      vertical,
      normal: lateral,
    };
  }

  project(point) {
    const s = clamp(point.x, this.track.startS, this.track.endS);
    const sample = this.sample(s);
    const dx = point.x - sample.position.x;
    const dy = point.y - sample.position.y;
    const dz = point.z - sample.position.z;
    return {
      s,
      lateral: dx * sample.lateral.x + dy * sample.lateral.y + dz * sample.lateral.z,
      vertical: dx * sample.vertical.x + dy * sample.vertical.y + dz * sample.vertical.z,
    };
  }
}

export function createCentreline(profile = "curved", track = TRACK) {
  return profile === "straight" ? new StraightCentreline(track) : new CurvedCentreline(track);
}

export function createRailSupportSegments(track = TRACK) {
  const result = [];
  let id = 0;
  for (let startS = track.startS; startS < track.endS; startS += track.segmentLength) {
    result.push({
      id: id++,
      startS,
      endS: Math.min(track.endS, startS + track.segmentLength),
      supported: true,
    });
  }
  return result;
}

export class RailSupportMap {
  constructor(segments = createRailSupportSegments()) {
    this.segments = segments.map((segment) => ({ ...segment }));
    this.initialState = new Uint8Array(this.segments.length);
    this.supportFlags = new Uint8Array(this.segments.length);
    this.byId = new Map();
    this.segments.forEach((segment, index) => {
      this.initialState[index] = segment.supported ? 1 : 0;
      this.supportFlags[index] = this.initialState[index];
      this.byId.set(segment.id, index);
    });
  }

  #indexAt(s) {
    let low = 0;
    let high = this.segments.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const segment = this.segments[middle];
      const isLast = middle === this.segments.length - 1;
      if (s < segment.startS) high = middle - 1;
      else if (s > segment.endS || (!isLast && s === segment.endS)) low = middle + 1;
      else return middle;
    }
    return -1;
  }

  segmentAt(s) {
    const index = this.#indexAt(s);
    return index < 0 ? undefined : this.segments[index];
  }

  isSupportedAt(s) {
    const index = this.#indexAt(s);
    return index >= 0 && this.supportFlags[index] === 1;
  }

  setSupport(id, supported) {
    const index = this.byId.get(Number(id));
    if (index === undefined) return false;
    const value = supported ? 1 : 0;
    this.supportFlags[index] = value;
    this.segments[index].supported = value === 1;
    return true;
  }

  restoreInitial() {
    this.segments.forEach((segment, index) => {
      this.supportFlags[index] = this.initialState[index];
      segment.supported = this.initialState[index] === 1;
    });
  }

  snapshot() {
    return this.segments.map((segment) => ({ ...segment }));
  }
}
