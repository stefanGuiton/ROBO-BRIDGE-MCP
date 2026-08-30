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

export class StraightCentreline {
  constructor(track = TRACK) {
    this.track = track;
    this.length = track.endS - track.startS;
  }

  sample(s) {
    return {
      position: { x: s, y: this.track.railTopY, z: 0 },
      tangent: { x: 1, y: 0, z: 0 },
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
    return Math.max(0, Math.min(1, (s - this.track.startS) / this.length));
  }
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
    this.initialState = this.segments.map((segment) => segment.supported);
  }

  segmentAt(s) {
    return this.segments.find((segment, index) =>
      s >= segment.startS && (s < segment.endS || (index === this.segments.length - 1 && s <= segment.endS)),
    );
  }

  isSupportedAt(s) {
    return this.segmentAt(s)?.supported ?? false;
  }

  setSupport(id, supported) {
    const segment = this.segments.find((candidate) => candidate.id === Number(id));
    if (!segment) return false;
    segment.supported = Boolean(supported);
    return true;
  }

  restoreInitial() {
    this.segments.forEach((segment, index) => {
      segment.supported = this.initialState[index];
    });
  }

  snapshot() {
    return this.segments.map((segment) => ({ ...segment }));
  }
}
