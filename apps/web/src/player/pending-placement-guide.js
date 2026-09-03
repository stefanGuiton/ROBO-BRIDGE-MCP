const SATISFIED = new Set(['COMPLETED', 'ADOPTED']);

// Read-only guidance derived from the existing stream, never another target
// ledger. Either actor can still satisfy the slot through PlacementAuthority.
export function pendingHumanGuide(coordinator, carried = null) {
  const entries = coordinator?.stream?.entries ?? [];
  const byId = new Map(entries.map(entry => [entry.placementId, entry]));
  const eligible = entries.filter(entry => {
    if (!['PENDING', 'PLANNED', 'WAITING_SOURCE'].includes(entry.status)) return false;
    if (entry.request.colour && carried && entry.request.colour !== carried.colour) return false;
    const dependencies = new Set([...(entry.request.dependsOnPlacementIds ?? []),
      ...(entry.request.supportPlacementId ? [entry.request.supportPlacementId] : [])]);
    return entry.request.position && [...dependencies].every(id => {
      const support = byId.get(id);
      return SATISFIED.has(support?.status) && Boolean(support.actualBrickId);
    });
  });
  // Prefer a second ready slot so the displayed Human suggestion does not
  // compete with the robot's first slot. This is guidance, not permission.
  const entry = eligible[1] ?? eligible[0];
  if (!entry) return null;
  return { placementId: entry.placementId, position: { ...entry.request.position }, yawRad: entry.request.yawRad ?? 0,
    colour: entry.request.colour, preferredColour: entry.request.preferredColour,
    supportBrickId: entry.request.supportBrickId ?? byId.get(entry.request.supportPlacementId)?.actualBrickId ?? null,
    supportSide: entry.request.supportSide ?? 'M', carriedSide: entry.request.carriedSide ?? null };
}

export function previewHumanGuide({ guide, carried, authority, yawRad }) {
  if (!guide || !carried) return null;
  const rotationError = Math.abs(Math.sin(yawRad - guide.yawRad));
  const blocked = reason => ({ carriedBrickId: carried.id, position: { ...guide.position }, yawRad,
    valid: false, status: 'BLOCKED', blockedReason: reason, placementType: null });
  if (rotationError > 0.01) return blocked('rotate_to_pending_target');
  if (guide.colour && guide.colour !== carried.colour) return blocked('wrong_colour');
  const result = authority.preview({ brickId: carried.id, position: guide.position, yawRad: guide.yawRad,
    supportBrickId: guide.supportBrickId, supportSide: guide.supportSide, carriedSide: guide.carriedSide });
  return result.ok ? result.candidate : { ...(result.candidate ?? blocked(result.reason)), valid: false, status: 'BLOCKED', blockedReason: result.reason };
}
