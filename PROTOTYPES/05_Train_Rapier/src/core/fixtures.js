import { createRailSupportSegments } from "./track.js";

export const FIXTURES = Object.freeze({
  A: {
    id: "A",
    name: "A · Supported crossing",
    description: "Complete flat railway. Expected: CROSSED.",
    initialUnsupported: [],
    events: [],
  },
  B: {
    id: "B",
    name: "B · Centre gap",
    description: "Centre support is missing from the beginning.",
    initialUnsupported: [6, 7],
    events: [],
  },
  C: {
    id: "C",
    name: "C · Failure ahead",
    description: "Centre support disappears as the locomotive approaches.",
    initialUnsupported: [],
    events: [{ type: "route-s", at: -9.2, segmentIds: [6, 7] }],
  },
  D: {
    id: "D",
    name: "D · Failure under carriage",
    description: "Support disappears under the first carriage for articulated failure.",
    initialUnsupported: [],
    events: [{ type: "body-s", bodyIndex: 1, at: -4.2, segmentIds: [4, 5, 6] }],
  },
  E: {
    id: "E",
    name: "E · Progressive failure",
    description: "Several support sections fail progressively.",
    initialUnsupported: [],
    events: [
      { type: "route-s", at: -12, segmentIds: [5] },
      { type: "route-s", at: -6, segmentIds: [6] },
      { type: "route-s", at: 0, segmentIds: [7] },
    ],
  },
});

export function getFixture(id) {
  return FIXTURES[id] ?? FIXTURES.A;
}

export function supportsForFixture(id) {
  const fixture = getFixture(id);
  const unsupported = new Set(fixture.initialUnsupported);
  return createRailSupportSegments().map((segment) => ({
    ...segment,
    supported: !unsupported.has(segment.id),
  }));
}
