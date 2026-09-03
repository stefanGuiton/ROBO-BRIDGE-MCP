'use strict';

import { segmentAtRouteDistance } from './buildboard-support-map.js';
import { bodyAxes, conjugateQuaternion, dot, rotateVector, subtract } from './math.js';

// Structural sufficiency and actual rail acceptance are deliberately separate:
// a track visual cannot prove structure, and structure cannot invent a rail.
export function createAcceptedRailContactProvider({ plan, boardSnapshot, supportMap, routeFrame }) {
  const accepted = new Set(boardSnapshot.acceptedPlacementIds || []);
  const definition = plan.catalogue?.customDefinitions?.find((item) => (
    item.definitionId === plan.geometry?.track?.definitionId && item.partClass === 'TRACK_SEGMENT'
  )) || plan.catalogue?.customDefinitions?.find((item) => item.partClass === 'TRACK_SEGMENT');
  const parameters = definition?.parameters || {};
  const scale = routeFrame.worldTransform.scale;
  const gaugeMm = Number(parameters.railGauge) * scale;
  const railWidthMm = Number(parameters.railWidth) * scale;
  if (!(Number.isFinite(gaugeMm) && Number.isFinite(railWidthMm) && gaugeMm > 0 && railWidthMm > 0 && railWidthMm < gaugeMm)) {
    throw new TypeError('Contact mode requires finite rail geometry from the frozen BuildPlan.');
  }
  const segments = supportMap.segments.map((segment) => Object.freeze({
    ...segment,
    structureSupported: segment.supported === true,
    trackAccepted: accepted.has(segment.trackPlacementId),
    supported: segment.supported === true && accepted.has(segment.trackPlacementId),
    reason: segment.supported !== true ? 'MISSING_STRUCTURE'
      : !accepted.has(segment.trackPlacementId) ? 'MISSING_ACCEPTED_TRACK' : null
  }));
  const contactMap = Object.freeze({ ...supportMap, segments: Object.freeze(segments) });
  const requiredStructureIds = [];
  const sliceCount = plan.geometry.sliceArray.count;
  for (const master of plan.geometry.masterSlice.placements || []) {
    for (let slice = 0; slice < sliceCount; slice += 1) requiredStructureIds.push(`${plan.planId}.s.${master.basePlacementId}.${slice}`);
  }
  (plan.geometry.masterSlice.customPlacements || []).forEach((master, index) => {
    if (master.partClass === 'TRACK_SEGMENT') return;
    if (master.repeatAcrossSlices === false) requiredStructureIds.push(`${plan.planId}.c.${index}.t`);
    else for (let slice = 0; slice < sliceCount; slice += 1) requiredStructureIds.push(`${plan.planId}.c.${index}.${slice}`);
  });
  const requiredTrackIds = [...new Set(segments.map(segment => segment.trackPlacementId))];
  const requiredIds = [...requiredStructureIds, ...requiredTrackIds];

  function queryBodySupport(body) {
    const axes = bodyAxes(body);
    const upright = dot(axes[1], { x: 0, y: 1, z: 0 }) >= Math.cos(Math.PI / 12);
    const aligned = dot(axes[0], { x: 1, y: 0, z: 0 }) >= Math.cos(Math.PI / 12);
    const contacts = [];
    const missing = [];
    let routeAxles = 0;
    for (const direction of [-1, 1]) {
      const offset = rotateVector(body.rotation, { x: direction * body.size.x * 0.32, y: -body.size.y * 0.5, z: 0 });
      const forwardMm = body.position.x + offset.x;
      if (forwardMm < 0 || forwardMm > routeFrame.lengthMm) continue;
      routeAxles += 1;
      const segment = segmentAtRouteDistance(contactMap, forwardMm);
      if (!segment?.supported) {
        missing.push({ forwardMm, segmentId: segment?.id ?? null, reason: segment?.reason ?? 'NO_RAIL_SEGMENT' });
        continue;
      }
      for (const side of [-1, 1]) {
        // Choose the nearest point on each finite rail top, then prove it lies
        // under the actual body footprint. A narrow body cannot bridge a gauge.
        const railCentre = side * gaugeMm * 0.5;
        const rightMm = Math.max(railCentre - railWidthMm * 0.5, Math.min(railCentre + railWidthMm * 0.5, body.position.z));
        const point = { x: forwardMm, y: 0, z: rightMm };
        const local = rotateVector(conjugateQuaternion(body.rotation), subtract(point, body.position));
        if (Math.abs(local.x) > body.size.x * 0.5 + 1e-6 || Math.abs(local.z) > body.size.z * 0.5 + 1e-6) {
          missing.push({ forwardMm, segmentId: segment.id, reason: 'RAIL_OUTSIDE_CONTACT_FOOTPRINT' });
          continue;
        }
        contacts.push({ point, normal: { x: 0, y: 1, z: 0 }, kind: 'accepted-rail', sourceId: segment.trackPlacementId });
      }
    }
    return {
      supported: routeAxles > 0 && missing.length === 0 && contacts.length === routeAxles * 2 && upright && aligned,
      fullyOnRoute: routeAxles === 2,
      routeAxles,
      contacts,
      missing,
      heightMm: 0,
      kind: 'accepted-rail',
      upright,
      aligned
    };
  }

  return Object.freeze({
    queryBodySupport,
    getMap() { return contactMap; },
    getSummary() {
      return {
        segmentCount: segments.length,
        supportedCount: segments.filter((segment) => segment.supported).length,
        acceptedTrackCount: segments.filter((segment) => segment.trackAccepted).length,
        allSupported: segments.length > 0 && segments.every((segment) => segment.supported),
        requiredStructureCount: requiredStructureIds.length,
        acceptedStructureCount: requiredStructureIds.filter(id => accepted.has(id)).length,
        missingRequiredPlacementCount: requiredIds.filter(id => !accepted.has(id)).length,
        allRequiredPartsAccepted: requiredIds.length > 0 && requiredIds.every(id => accepted.has(id)),
        gaugeMm,
        railWidthMm
      };
    }
  });
}
