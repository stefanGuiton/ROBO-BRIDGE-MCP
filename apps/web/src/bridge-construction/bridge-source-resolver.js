'use strict';

import { invariant } from './internal.js';

function freeLiveSources(controller, compatibilityKey) {
  return controller.getBricks()
    .filter((brick) => brick.colour === compatibilityKey)
    .filter((brick) => !brick.heldBy && !brick.snapped && !brick.placedTargetId && !brick.placementType)
    .filter((brick) => brick.graspable !== false)
    .filter((brick) => brick.reachability?.reachable !== false);
}

export function createBridgeSourceResolver({ controller, inventory } = {}) {
  invariant(controller && typeof controller.getBricks === 'function', 'INVALID_SETTINGS', 'The existing RobotController is required.');
  invariant(inventory?.compatibleSources, 'INVALID_SETTINGS', 'The immutable bridge inventory specification is required.');

  return Object.freeze({
    supportsPlacement(placement) {
      return inventory.compatibleSources(placement.compatibilityKey).length > 0;
    },
    resolveBrickId(placement) {
      const live = freeLiveSources(controller, placement.compatibilityKey);
      const dedicated = live.find((brick) => brick.bridgePart?.dedicatedPlacementId === placement.placementId);
      return (dedicated ?? live.sort((left, right) => left.id.localeCompare(right.id))[0])?.id ?? null;
    },
    compatibleLiveSources(placement) {
      return freeLiveSources(controller, placement.compatibilityKey).map((brick) => structuredClone(brick));
    },
    getReassignmentEvidence(placement, priorBrickId) {
      const next = this.resolveBrickId(placement);
      return {
        placementId: placement.placementId,
        priorBrickId,
        nextBrickId: next,
        reassigned: Boolean(priorBrickId && next && priorBrickId !== next)
      };
    }
  });
}
