import { pendingHumanGuide, previewHumanGuide } from '../../apps/web/src/player/pending-placement-guide.js';

const SATISFIED = new Set(['COMPLETED', 'ADOPTED']);
const ELIGIBLE = new Set(['PENDING', 'PLANNED', 'WAITING_SOURCE']);
const clone = (value) => structuredClone(value);

function finitePosition(position) {
  return Boolean(position) && ['xMm', 'yMm', 'zMm'].every((axis) => Number.isFinite(position[axis]));
}

function freeSource(brick) {
  return Boolean(brick)
    && !brick.heldBy
    && !brick.snapped
    && !brick.placedTargetId
    && !brick.placementType
    && brick.graspable !== false;
}

function controllerIsBusy(controller) {
  const state = controller?.getState?.() ?? {};
  return state.operationState !== undefined && state.operationState !== 'idle'
    || state.moving === true
    || state.heldBrickId !== null && state.heldBrickId !== undefined
    || controller?.pendingMoveCount > 0
    || controller?.operationBlocked?.() === true;
}

function entriesFor(coordinator) {
  return coordinator?.stream?.entries ?? [];
}

function dependenciesReady(entry, byId) {
  const dependencies = new Set([
    ...(entry.request?.dependsOnPlacementIds ?? []),
    ...(entry.request?.supportPlacementId ? [entry.request.supportPlacementId] : [])
  ]);
  return [...dependencies].every((id) => {
    const dependency = byId.get(id);
    return Boolean(dependency && SATISFIED.has(dependency.status) && dependency.actualBrickId);
  });
}

function guideFromEntry(entry, byId, carried) {
  if (!entry || !ELIGIBLE.has(entry.status) || !finitePosition(entry.request?.position)) return null;
  if (entry.request.colour && carried?.colour && entry.request.colour !== carried.colour) return null;
  if (!dependenciesReady(entry, byId)) return null;
  return {
    placementId: entry.placementId,
    position: { ...entry.request.position },
    yawRad: entry.request.yawRad ?? 0,
    colour: entry.request.colour,
    preferredColour: entry.request.preferredColour,
    supportBrickId: entry.request.supportBrickId ?? byId.get(entry.request.supportPlacementId)?.actualBrickId ?? null,
    supportSide: entry.request.supportSide ?? 'M',
    carriedSide: entry.request.carriedSide ?? null
  };
}

/**
 * Test-only Human actor.
 *
 * This deliberately drives the same HumanBuildAdapter and PlacementAuthority
 * path as a player. It never writes stream status, BuildBoard targets, or
 * occupancy directly. `simulation: true` exists only on returned evidence so
 * an automated actor cannot be mistaken for a real browser user.
 */
export class HumanSimulator {
  constructor({
    adapter = null,
    humanBuildAdapter = null,
    authority = null,
    placementAuthority = null,
    coordinator = null,
    placementCoordinator = null,
    controller,
    wait = async () => {}
  } = {}) {
    this.adapter = adapter ?? humanBuildAdapter;
    this.authority = authority ?? placementAuthority;
    this.coordinator = coordinator ?? placementCoordinator;
    this.controller = controller;
    this.wait = wait;
    if (!this.adapter || !this.authority || !this.coordinator || !this.controller) {
      throw new TypeError('adapter, authority, coordinator, and controller are required');
    }
    this.busy = false;
    this.sequence = 0;
    this.evidence = [];
    this.lastResult = null;
  }

  getState() {
    return {
      actor: 'human',
      simulation: true,
      busy: this.busy,
      heldBrickId: this.adapter.getState?.().heldBrickId ?? this.controller.getState?.().heldBrickId ?? null,
      worldRevision: this.controller.getState().worldRevision,
      evidenceCount: this.evidence.length,
      lastResult: this.lastResult ? clone(this.lastResult) : null
    };
  }

  getEvidence() { return clone(this.evidence); }

  #busyResult(reason = 'operation_in_progress') {
    return { ok: false, reason, actor: 'human', simulation: true, worldRevision: this.controller.getState().worldRevision };
  }

  #record(result, details = {}) {
    const evidence = {
      actor: 'human',
      simulation: true,
      sequence: ++this.sequence,
      timestampMs: Date.now(),
      ...clone(details),
      ok: Boolean(result?.ok),
      status: result?.ok ? 'ACCEPTED' : 'REJECTED',
      reason: result?.ok ? null : result?.reason ?? 'rejected',
      worldRevision: this.controller.getState().worldRevision
    };
    this.evidence.push(evidence);
    this.lastResult = clone(result);
    return { ...result, actor: 'human', simulation: true, evidence: clone(evidence) };
  }

  #freeSources({ sourceId = null, sourceColour = null, colour = null, preferredColour = null } = {}) {
    const requestedColour = sourceColour ?? colour;
    let sources = this.controller.getBricks().filter(freeSource);
    if (sourceId !== null) sources = sources.filter((brick) => brick.id === sourceId);
    if (requestedColour !== null && requestedColour !== undefined) {
      sources = sources.filter((brick) => brick.colour === requestedColour);
    }
    return sources.sort((a, b) => {
      const aPreferred = preferredColour && a.colour === preferredColour ? 0 : 1;
      const bPreferred = preferredColour && b.colour === preferredColour ? 0 : 1;
      return aPreferred - bPreferred || a.id.localeCompare(b.id);
    });
  }

  /**
   * Read-only selection of a real stream entry and a compatible loose source.
   * A caller may request a source colour (for example blue) while the stream
   * only specifies `preferredColour: red`; that remains valid because the
   * stream did not impose a strict red requirement.
   */
  chooseEligiblePendingTarget(options = {}) {
    if (this.busy || controllerIsBusy(this.controller) || this.adapter.getState?.().heldBrickId) {
      return this.#busyResult();
    }
    const entries = entriesFor(this.coordinator);
    const byId = new Map(entries.map((entry) => [entry.placementId, entry]));
    const targetId = options.placementId ?? null;
    const targetEntry = targetId === null ? null : byId.get(targetId);
    if (targetId !== null && !targetEntry) return this.#busyResult('placement_not_found');
    const sources = this.#freeSources(options);
    if (!sources.length) return this.#busyResult('source_unavailable');

    for (const source of sources) {
      // Use the production read-only guide for the normal selection path.
      const productionGuide = targetId === null ? pendingHumanGuide(this.coordinator, source) : null;
      const guide = targetEntry ? guideFromEntry(targetEntry, byId, source) : productionGuide;
      if (!guide) continue;
      return {
        ok: true,
        actor: 'human',
        simulation: true,
        source: clone(source),
        guide: clone(guide),
        placementId: guide.placementId,
        worldRevision: this.controller.getState().worldRevision
      };
    }
    return this.#busyResult(targetId === null ? 'no_eligible_pending_target' : 'target_not_eligible');
  }

  // Alias kept short for test scripts that model a human's next action.
  chooseNext(options = {}) { return this.chooseEligiblePendingTarget(options); }

  async #cancelCarry(details = {}) {
    const held = this.adapter.getState?.().heldBrickId ?? null;
    if (!held) return null;
    const cancelled = this.adapter.cancel();
    return { ...clone(details), cancelled: Boolean(cancelled?.ok), cancelResult: clone(cancelled) };
  }

  /**
   * Pick up one selected shared source, validate the guided pose, then release
   * through HumanBuildAdapter. `yawOffsetRad` is intentionally useful for a
   * negative test; an invalid preview is cancelled and cannot be accepted.
   */
  async placeNext({
    sourceId = null,
    sourceColour = null,
    colour = null,
    preferredColour = null,
    placementId = null,
    yawRad = null,
    yawOffsetRad = 0,
    signal = null,
    onStage = null,
    wait = this.wait,
    cancelOnFailure = true
  } = {}) {
    if (this.busy || controllerIsBusy(this.controller) || this.adapter.getState?.().heldBrickId) {
      return this.#record(this.#busyResult(), { action: 'placement', stage: 'preflight' });
    }
    if (signal?.aborted) {
      return this.#record({ ok: false, reason: 'cancelled', worldRevision: this.controller.getState().worldRevision }, {
        action: 'placement', stage: 'preflight'
      });
    }
    const selected = this.chooseEligiblePendingTarget({ sourceId, sourceColour, colour, preferredColour, placementId });
    if (!selected.ok) return this.#record(selected, { action: 'placement', stage: 'selection', placementId });

    this.busy = true;
    let picked = false;
    const startedAtWorldRevision = selected.worldRevision;
    const stage = async (name, data = {}) => {
      if (typeof onStage === 'function') await onStage(name, clone(data));
      if (typeof wait === 'function') await wait(name, clone(data));
      if (signal?.aborted) throw new Error('human_simulator_cancelled');
    };
    try {
      const pickup = this.adapter.pickup(selected.source.id);
      if (!pickup.ok) return this.#record(pickup, { action: 'placement', stage: 'pickup', placementId: selected.placementId, sourceBrickId: selected.source.id });
      picked = true;
      const carried = this.controller.getBricks().find((brick) => brick.id === selected.source.id);
      const requestedYaw = yawRad ?? selected.guide.yawRad + yawOffsetRad;
      let preview;
      try {
        await stage('after_pickup', { placementId: selected.placementId, sourceBrickId: selected.source.id });
        preview = previewHumanGuide({ guide: selected.guide, carried, authority: this.authority, yawRad: requestedYaw });
      } catch (error) {
        const cancelled = await this.#cancelCarry({ stage: 'cancelled', placementId: selected.placementId });
        return this.#record({ ok: false, reason: 'cancelled', worldRevision: this.controller.getState().worldRevision }, {
          action: 'placement', placementId: selected.placementId, sourceBrickId: selected.source.id, ...cancelled
        });
      }
      if (!preview) {
        const cancelled = cancelOnFailure ? await this.#cancelCarry({ stage: 'preview' }) : null;
        return this.#record({ ok: false, reason: 'invalid_preview', worldRevision: this.controller.getState().worldRevision }, {
          action: 'placement', placementId: selected.placementId, sourceBrickId: selected.source.id, ...cancelled
        });
      }
      this.adapter.setPreview(preview);
      if (!preview.valid) {
        const cancelled = cancelOnFailure ? await this.#cancelCarry({ stage: 'preview' }) : null;
        return this.#record({ ok: false, reason: preview.blockedReason ?? 'preview_blocked', preview: clone(preview), worldRevision: this.controller.getState().worldRevision }, {
          action: 'placement', placementId: selected.placementId, sourceBrickId: selected.source.id, ...cancelled
        });
      }
      try {
        await stage('before_release', { placementId: selected.placementId, sourceBrickId: selected.source.id, preview });
      } catch {
        const cancelled = await this.#cancelCarry({ stage: 'cancelled', placementId: selected.placementId });
        return this.#record({ ok: false, reason: 'cancelled', worldRevision: this.controller.getState().worldRevision }, {
          action: 'placement', placementId: selected.placementId, sourceBrickId: selected.source.id, ...cancelled
        });
      }
      const release = this.adapter.release();
      if (!release.ok) {
        const cancelled = cancelOnFailure ? await this.#cancelCarry({ stage: 'release' }) : null;
        return this.#record(release, {
          action: 'placement', placementId: selected.placementId, sourceBrickId: selected.source.id, ...cancelled
        });
      }
      const entry = this.coordinator.stream?.byId?.get(selected.placementId);
      return this.#record({ ...release, placementId: selected.placementId }, {
        action: 'placement',
        placementId: selected.placementId,
        sourceBrickId: selected.source.id,
        colour: release.brick?.colour ?? carried?.colour ?? selected.source.colour,
        targetStatus: entry?.status ?? null,
        startedAtWorldRevision,
        completedAtWorldRevision: release.worldRevision,
        preview: clone(preview)
      });
    } finally {
      // If a caller supplied a cancellation hook that fired after pickup, do
      // not leave a hidden held source behind even when an unexpected error
      // escapes the normal result paths.
      if (picked && signal?.aborted && this.adapter.getState?.().heldBrickId) await this.#cancelCarry({ stage: 'finally' });
      this.busy = false;
    }
  }

  async cancel() {
    const result = this.adapter.cancel();
    return this.#record(result, { action: 'cancel', stage: 'explicit' });
  }
}

export function createHumanSimulator(options) { return new HumanSimulator(options); }
export const Human_Simulator = HumanSimulator;
