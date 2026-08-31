const clone = (value) => structuredClone(value);

function poseMatches(brick, expected, tolerance = 1e-6) {
  if (!brick || !expected) return false;
  const positionMatches = ['xMm', 'yMm', 'zMm'].every((axis) => Math.abs(brick.position[axis] - expected.position[axis]) <= tolerance);
  const yawDelta = Math.atan2(Math.sin((brick.yawRad ?? 0) - expected.yawRad), Math.cos((brick.yawRad ?? 0) - expected.yawRad));
  return positionMatches && Math.abs(yawDelta) <= tolerance
    && (brick.placementType ?? null) === (expected.placementType ?? null)
    && (brick.placedTargetId ?? null) === (expected.targetId ?? null);
}

export class HumanBuildAdapter {
  constructor({ controller, board, graph, placementEngine }) {
    this.controller = controller;
    this.board = board;
    this.graph = graph;
    this.placementEngine = placementEngine;
    this.active = null;
    this.mode = 'BUILD';
    this.listeners = new Set();
    this.undoStack = [];
    this.maximumUndoDepth = 50;
    this.controller.subscribe?.((event) => {
      if (!['reset', 'world_reset'].includes(event.type)) return;
      this.active = null;
      this.undoStack = [];
      this.graph.clear();
      this.placementEngine.reset();
      this.emit('history_cleared');
    });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(type, details = {}) {
    const event = { type, ...details, state: this.getState() };
    for (const listener of this.listeners) listener(event);
  }

  setMode(mode) {
    if (!['BUILD', 'TEST'].includes(mode)) return false;
    if (mode === 'TEST' && this.active) this.cancel();
    this.mode = mode;
    this.emit('mode_changed', { mode });
    return true;
  }

  pickup(brickId) {
    if (this.mode !== 'BUILD') return { ok: false, reason: 'test_mode_locked' };
    if (this.active) return { ok: false, reason: 'operation_in_progress' };
    const source = this.controller.getBricks().find((brick) => brick.id === brickId);
    if (!source) return { ok: false, reason: 'invalid_input' };
    const blockedByBrickIds = this.graph.upperBrickIdsFor(brickId);
    if (blockedByBrickIds.length) {
      return { ok: false, reason: 'supporting_brick', blockedByBrickIds, worldRevision: this.controller.getState().worldRevision };
    }
    const placement = this.board.getPlacements?.().find((entry) => entry.brickId === brickId) ?? null;
    const result = this.controller.beginHumanCarry(brickId);
    if (!result.ok) return result;
    this.graph.removeBrick(brickId);
    this.active = {
      brickId,
      original: {
        position: { ...source.position },
        yawRad: source.yawRad ?? 0,
        placement: placement ? clone(placement) : null,
        targetId: source.placedTargetId ?? null,
        snapped: Boolean(source.snapped)
      },
      preview: {
        position: { ...source.position },
        yawRad: source.yawRad ?? 0,
        valid: false,
        status: 'CARRYING',
        placementType: null,
        connection: null
      }
    };
    this.placementEngine.reset();
    this.emit('picked_up', { brickId, worldRevision: result.worldRevision });
    return { ok: true, brickId, state: this.getState(), worldRevision: result.worldRevision };
  }

  setPreview(candidate) {
    if (!this.active || !candidate || candidate.carriedBrickId !== this.active.brickId) return false;
    this.active.preview = structuredClone(candidate);
    this.emit('preview_changed', { candidate: structuredClone(candidate) });
    return true;
  }

  rotate(direction = 1) {
    if (!this.active) return { ok: false, reason: 'not_holding' };
    const degrees = this.placementEngine.rotate(direction);
    this.emit('rotated', { degrees });
    return { ok: true, degrees };
  }

  release() {
    if (!this.active) return { ok: false, reason: 'not_holding' };
    const preview = this.active.preview;
    if (!preview?.valid) return { ok: false, reason: preview?.blockedReason ?? 'no_snap_target', keepHolding: true };
    const result = this.controller.commitHumanPlacement({
      brickId: this.active.brickId,
      position: preview.position,
      yawRad: preview.yawRad,
      connection: preview.connections?.length > 1 ? { groups: preview.connections } : preview.connection,
      supportBrickId: preview.supportBrickId ?? null,
      supportSide: preview.supportSide ?? 'M',
      carriedSide: preview.carriedSide ?? null,
      placementType: preview.placementType
    });
    if (!result.ok) return { ...result, keepHolding: true };
    const brickId = this.active.brickId;
    const undoRecord = {
      brickId,
      before: clone(this.active.original),
      after: {
        position: { ...(result.brick?.position ?? preview.position) },
        yawRad: result.brick?.yawRad ?? preview.yawRad,
        placementType: result.brick?.placementType ?? result.placementType ?? preview.placementType ?? null,
        targetId: result.brick?.placedTargetId ?? result.targetId ?? null
      }
    };
    if (!result.placementAuthorityApplied) {
      this.graph.registerPlacement(brickId, {
        placementType: result.snapped ? 'blueprint-target' : preview.placementType,
        cells: preview.cells ?? [],
        connection: preview.connection,
        connections: preview.connections ?? []
      });
    }
    this.active = null;
    this.placementEngine.reset();
    this.undoStack.push(undoRecord);
    if (this.undoStack.length > this.maximumUndoDepth) this.undoStack.shift();
    this.emit('released', { brickId, result });
    return result;
  }

  restoreOriginal(brickId, original) {
    const placement = original.placement;
    if (!original.snapped && !placement) return this.controller.cancelHumanCarry(brickId, original);
    const groups = placement?.connections?.length ? placement.connections
      : placement?.connection?.groups?.length ? placement.connection.groups
        : placement?.connection ? [placement.connection] : [];
    const connection = groups.length > 1 ? { groups } : groups[0] ?? null;
    const primary = groups[0] ?? null;
    const result = this.controller.commitHumanPlacement({
      brickId,
      position: original.position,
      yawRad: original.yawRad,
      connection,
      placementType: placement?.placementType ?? 'blueprint-target',
      supportBrickId: primary?.lowerBrickId ?? null,
      supportSide: primary?.lowerConnector ?? null,
      carriedSide: primary?.upperConnector ?? null
    });
    if (result.ok && !result.placementAuthorityApplied) {
      this.graph.registerPlacement(brickId, {
        placementType: result.snapped ? 'blueprint-target' : placement?.placementType,
        cells: placement?.cells ?? [],
        connection,
        connections: groups
      });
    }
    return result;
  }

  undo() {
    if (this.mode !== 'BUILD') return { ok: false, reason: 'test_mode_locked' };
    if (this.active) {
      const result = this.cancel();
      return result.ok ? { ...result, action: 'carry_cancelled', canUndo: this.undoStack.length > 0 } : result;
    }
    const record = this.undoStack.at(-1);
    if (!record) return { ok: false, reason: 'nothing_to_undo', worldRevision: this.controller.getState().worldRevision };
    const blockedByBrickIds = this.graph.upperBrickIdsFor(record.brickId);
    if (blockedByBrickIds.length) {
      return { ok: false, reason: 'undo_blocked_by_structure', blockedByBrickIds, worldRevision: this.controller.getState().worldRevision };
    }
    const current = this.controller.getBricks().find((brick) => brick.id === record.brickId);
    if (!poseMatches(current, record.after)) {
      return { ok: false, reason: 'undo_stale', worldRevision: this.controller.getState().worldRevision };
    }
    const currentPlacement = this.board.getPlacements?.().find((entry) => entry.brickId === record.brickId) ?? null;
    const rollbackState = {
      position: { ...current.position },
      yawRad: current.yawRad ?? 0,
      placement: currentPlacement ? clone(currentPlacement) : null,
      targetId: current.placedTargetId ?? null,
      snapped: Boolean(current.snapped)
    };
    const pickup = this.controller.beginHumanCarry(record.brickId);
    if (!pickup.ok) return pickup;
    this.graph.removeBrick(record.brickId);
    const restored = this.restoreOriginal(record.brickId, record.before);
    if (!restored.ok) {
      const rollback = this.restoreOriginal(record.brickId, rollbackState);
      return {
        ...restored,
        reason: restored.reason ?? 'undo_restore_failed',
        rolledBack: Boolean(rollback.ok),
        worldRevision: this.controller.getState().worldRevision
      };
    }
    this.undoStack.pop();
    this.placementEngine.reset();
    this.emit('undone', { brickId: record.brickId, result: restored });
    return {
      ok: true,
      action: 'placement_undone',
      brickId: record.brickId,
      brick: this.controller.getBricks().find((brick) => brick.id === record.brickId) ?? null,
      canUndo: this.undoStack.length > 0,
      worldRevision: this.controller.getState().worldRevision
    };
  }

  drop(position = null) {
    if (!this.active) return { ok: false, reason: 'not_holding' };
    const preview = this.active.preview;
    const result = this.controller.commitHumanDrop({
      brickId: this.active.brickId,
      position: position ?? preview.position,
      yawRad: preview.yawRad
    });
    if (!result.ok) return result;
    const brickId = this.active.brickId;
    this.active = null;
    this.placementEngine.reset();
    this.emit('dropped', { brickId, result });
    return result;
  }

  cancel() {
    if (!this.active) return { ok: true, reason: 'not_holding' };
    const { brickId, original } = this.active;
    let result;
    result = this.restoreOriginal(brickId, original);
    if (result.ok) {
      this.active = null;
      this.placementEngine.reset();
      this.emit('cancelled', { brickId });
    }
    return result;
  }

  getPreview() {
    return this.active ? structuredClone(this.active.preview) : null;
  }

  canUndo() { return Boolean(this.active || this.undoStack.length); }

  getState() {
    return {
      mode: this.mode,
      locked: this.mode === 'TEST',
      heldBrickId: this.active?.brickId ?? null,
      preview: this.getPreview(),
      canUndo: this.canUndo(),
      undoDepth: this.undoStack.length,
      connectionGraph: this.graph.snapshot(),
      worldRevision: this.controller.getState().worldRevision
    };
  }
}
