export class HumanBuildAdapter {
  constructor({ controller, board, graph, placementEngine }) {
    this.controller = controller;
    this.board = board;
    this.graph = graph;
    this.placementEngine = placementEngine;
    this.active = null;
    this.mode = 'BUILD';
    this.listeners = new Set();
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
    const placement = this.board.getPlacements?.().find((entry) => entry.brickId === brickId) ?? null;
    const result = this.controller.beginHumanCarry(brickId);
    if (!result.ok) return result;
    this.graph.removeBrick(brickId);
    this.active = {
      brickId,
      original: {
        position: { ...source.position },
        yawRad: source.yawRad ?? 0,
        placement,
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
      placementType: preview.placementType
    });
    if (!result.ok) return { ...result, keepHolding: true };
    const brickId = this.active.brickId;
    this.graph.registerPlacement(brickId, {
      placementType: result.snapped ? 'blueprint-target' : preview.placementType,
      cells: preview.cells ?? [],
      connection: preview.connection,
      connections: preview.connections ?? []
    });
    this.active = null;
    this.placementEngine.reset();
    this.emit('released', { brickId, result });
    return result;
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
    if (original.snapped || original.placement) {
      result = this.controller.commitHumanPlacement({
        brickId,
        position: original.position,
        yawRad: original.yawRad,
        connection: original.placement?.connection ?? null,
        placementType: original.placement?.placementType ?? 'blueprint-target'
      });
      if (result.ok) {
        this.graph.registerPlacement(brickId, {
          placementType: result.snapped ? 'blueprint-target' : original.placement?.placementType,
          connection: original.placement?.connection ?? null
        });
      }
    } else {
      result = this.controller.cancelHumanCarry(brickId, original);
    }
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

  getState() {
    return {
      mode: this.mode,
      locked: this.mode === 'TEST',
      heldBrickId: this.active?.brickId ?? null,
      preview: this.getPreview(),
      connectionGraph: this.graph.snapshot(),
      worldRevision: this.controller.getState().worldRevision
    };
  }
}
