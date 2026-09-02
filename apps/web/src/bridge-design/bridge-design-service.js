'use strict';

import { BridgeDesignError, assertNotAborted, errorResult, structuredCloneSafe } from './errors.js';
import {
  applyPublicPatch,
  changedInternalFields,
  isBridgePatchEmpty,
  parameterCapabilities,
  publicBridgeSpec
} from './bridge-spec.js';

function safeIntegerRevision(value, path = 'expectedDesignRevision') {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BridgeDesignError('INVALID_PARAMETER', `${path} must be a non-negative safe integer.`, { path, value });
  }
}

function compactTiming(timing) {
  if (!timing) return null;
  const pick = (item) => item ? {
    partCount: item.partCount,
    milliseconds: item.milliseconds,
    seconds: item.seconds,
    minutes: item.minutes,
    byClass: structuredCloneSafe(item.byClass)
  } : null;
  return {
    robotOnly: pick(timing.robotOnly),
    codexAssigned: pick(timing.codexAssigned),
    codexRemaining: pick(timing.codexRemaining)
  };
}

function planSummary(plan, rendererSnapshot = null) {
  const bom = plan.billOfMaterials || {};
  const classes = bom.byPartClass || {};
  const family = plan.geometry?.family || null;
  const logicalArchCount = family === 'aqueduct'
    ? ['aqTopCount', 'aqMiddleCount', 'aqBottomCount'].reduce((sum, key) => sum + Number(plan.__settings?.[key] || 0), 0)
    : Number(plan.__settings?.viArchCount || 0);
  const fallbackLogicalArchCount = family === 'aqueduct'
    ? Number(plan.geometry?.masterSlice?.customPlacements?.filter((item) => item.partClass !== 'TRACK_SEGMENT').length || 0)
    : Number(plan.geometry?.masterSlice?.customPlacements?.filter((item) => item.partClass !== 'TRACK_SEGMENT').length || 0);
  return {
    schemaVersion: plan.schemaVersion,
    planId: plan.planId,
    designChecksum: plan.designChecksum,
    designRevision: plan.designRevision,
    executionRevision: plan.executionRevision,
    family,
    logicalArchCount: logicalArchCount || fallbackLogicalArchCount,
    physicalPartCount: bom.totalPhysicalParts ?? null,
    physicalStandardBrickCount: classes.STANDARD_BRICK ?? null,
    physicalArchPieceCount: classes.CUSTOM_ARCH ?? null,
    trackModuleCount: classes.TRACK_SEGMENT ?? bom.trackSegmentCount ?? null,
    standardPartCounts: structuredCloneSafe(bom.byStandardPartType || bom.byPartType || {}),
    timing: compactTiming(plan.timing),
    entry: structuredCloneSafe(plan.anchors?.entry || null),
    exit: structuredCloneSafe(plan.anchors?.exit || null),
    compileTimingMs: rendererSnapshot?.metadata?.timing ? structuredCloneSafe(rendererSnapshot.metadata.timing) : null,
    warnings: []
  };
}

function currentPlanWithSettings(adapter) {
  const plan = adapter.getBuildPlan();
  const settings = adapter.getInternalSettings();
  Object.defineProperty(plan, '__settings', { value: settings, enumerable: false });
  return plan;
}

function summariseDefinition(definition) {
  return {
    definitionId: definition.definitionId,
    partClass: definition.partClass,
    geometryVersion: definition.geometryVersion,
    geometryHash: definition.geometryHash,
    widthCells: definition.widthCells,
    materialRole: definition.materialRole,
    parameters: structuredCloneSafe(definition.parameters || {})
  };
}

function summarisePlacement(item, kind) {
  if (kind === 'standard') {
    return {
      placementKind: item.placementKind || 'STANDARD_BRICK',
      basePlacementId: item.basePlacementId,
      partType: item.partType,
      layer: item.layer,
      gridX: item.gridX,
      gridY: item.gridY,
      lengthCells: item.lengthCells,
      role: item.role,
      curve: item.curve,
      territory: item.territory,
      segmentId: item.segmentId,
      dependsOn: structuredCloneSafe(item.dependsOn || [])
    };
  }
  return {
    placementKind: item.placementKind,
    masterCustomId: item.masterCustomId,
    definitionId: item.definitionId,
    partClass: item.partClass,
    centreX: item.centreX,
    baseY: item.baseY,
    baseLayer: item.baseLayer,
    repeatAcrossSlices: item.repeatAcrossSlices,
    role: item.role,
    territory: item.territory,
    phase: item.phase,
    trackIndex: item.trackIndex
  };
}

export class BridgeDesignService {
  constructor(adapter) {
    if (!adapter) throw new BridgeDesignError('RUNTIME_UNAVAILABLE', 'A V4.6 adapter is required.');
    this.adapter = adapter;
    this.mutationActive = false;
  }

  getCapabilities(family = null) {
    try {
      return { ok: true, ...parameterCapabilities(family) };
    } catch (error) {
      return errorResult(error);
    }
  }

  getDesignState(options = {}) {
    try {
      if (!this.adapter.ready) {
        throw new BridgeDesignError('BUILDPLAN_UNAVAILABLE', 'The V4.6 bridge is not compiled yet.');
      }
      const internal = this.adapter.getInternalSettings();
      const plan = currentPlanWithSettings(this.adapter);
      const state = {
        ok: true,
        family: internal.family,
        bridgeSpec: publicBridgeSpec(internal),
        designRevision: plan.designRevision,
        executionRevision: plan.executionRevision,
        planId: plan.planId,
        designChecksum: plan.designChecksum,
        compileState: this.adapter.getCompileState(),
        buildPlanSummary: planSummary(plan, this.adapter.getRendererSnapshot()),
        entryExit: {
          entry: structuredCloneSafe(plan.anchors?.entry || null),
          exit: structuredCloneSafe(plan.anchors?.exit || null),
          roadY: plan.anchors?.roadY ?? null,
          bridgeStartX: plan.anchors?.bridgeStartX ?? null,
          bridgeEndX: plan.anchors?.bridgeEndX ?? null
        },
        warnings: []
      };
      if (options.includeCapabilities !== false) {
        state.parameterBounds = parameterCapabilities(internal.family).groups;
      }
      return state;
    } catch (error) {
      return errorResult(error);
    }
  }

  async patchBridgeSpec(patch, expectedDesignRevision, options = {}) {
    if (this.mutationActive) {
      return errorResult(new BridgeDesignError('OPERATION_IN_PROGRESS', 'Another bridge-design mutation is active.'));
    }
    this.mutationActive = true;
    const wallStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      assertNotAborted(options.signal);
      safeIntegerRevision(expectedDesignRevision);
      const planBefore = currentPlanWithSettings(this.adapter);
      if (planBefore.designRevision !== expectedDesignRevision) {
        throw new BridgeDesignError('STALE_DESIGN_REVISION', 'The bridge design changed. Read it again before mutation.', {
          expectedDesignRevision,
          currentDesignRevision: planBefore.designRevision,
          currentPlanId: planBefore.planId,
          currentDesignChecksum: planBefore.designChecksum
        });
      }
      const before = this.adapter.getInternalSettings();
      const candidate = applyPublicPatch(before, patch, (family) => this.adapter.getFamilyDefaults(family));
      const changedFields = changedInternalFields(before, candidate);
      if (changedFields.length === 0 || isBridgePatchEmpty(patch)) {
        const state = this.getDesignState({ includeCapabilities: false });
        return { ...state, changed: false, changedInternalFields: [], toolDurationMs: 0 };
      }
      await this.adapter.applyInternalSettings(candidate, expectedDesignRevision, { signal: options.signal });
      const state = this.getDesignState({ includeCapabilities: false });
      if (!state.ok) return state;
      const wallEnd = typeof performance !== 'undefined' ? performance.now() : Date.now();
      return {
        ...state,
        changed: true,
        changedInternalFields: changedFields,
        previousDesignRevision: expectedDesignRevision,
        toolDurationMs: Math.round((wallEnd - wallStart) * 1000) / 1000
      };
    } catch (error) {
      return errorResult(error, 'COMPILE_FAILED');
    } finally {
      this.mutationActive = false;
    }
  }

  async compileBridge(expectedDesignRevision, options = {}) {
    if (this.mutationActive) {
      return errorResult(new BridgeDesignError('OPERATION_IN_PROGRESS', 'Another bridge-design mutation is active.'));
    }
    this.mutationActive = true;
    try {
      assertNotAborted(options.signal);
      safeIntegerRevision(expectedDesignRevision);
      const plan = currentPlanWithSettings(this.adapter);
      if (plan.designRevision !== expectedDesignRevision) {
        throw new BridgeDesignError('STALE_DESIGN_REVISION', 'The bridge design changed. Read it again before compiling.', {
          expectedDesignRevision, currentDesignRevision: plan.designRevision
        });
      }
      await this.adapter.compileCurrent(expectedDesignRevision, { signal: options.signal });
      return { ...this.getDesignState({ includeCapabilities: false }), changed: true };
    } catch (error) {
      return errorResult(error, 'COMPILE_FAILED');
    } finally {
      this.mutationActive = false;
    }
  }

  getBuildPlan(options = {}) {
    try {
      const detail = options.detail || 'summary';
      const allowed = new Set(['summary', 'bom', 'anchors', 'placements', 'definitions']);
      if (!allowed.has(detail)) {
        throw new BridgeDesignError('INVALID_PARAMETER', `Unknown BuildPlan detail mode: ${String(detail)}.`);
      }
      const plan = currentPlanWithSettings(this.adapter);
      const summary = planSummary(plan, this.adapter.getRendererSnapshot());
      if (detail === 'summary') return { ok: true, detail, summary };
      if (detail === 'bom') {
        return {
          ok: true,
          detail,
          summary,
          billOfMaterials: structuredCloneSafe(plan.billOfMaterials),
          timing: structuredCloneSafe(plan.timing)
        };
      }
      if (detail === 'anchors') {
        return {
          ok: true,
          detail,
          summary,
          anchors: structuredCloneSafe(plan.anchors),
          collaboration: structuredCloneSafe(plan.collaboration),
          track: structuredCloneSafe(plan.geometry?.track || null)
        };
      }
      const cursor = options.cursor ?? 0;
      const limit = options.limit ?? 20;
      if (!Number.isSafeInteger(cursor) || cursor < 0) {
        throw new BridgeDesignError('INVALID_PARAMETER', 'cursor must be a non-negative integer.');
      }
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) {
        throw new BridgeDesignError('OUT_OF_RANGE', 'limit must be an integer from 1 to 25.');
      }
      if (detail === 'definitions') {
        const source = plan.catalogue?.customDefinitions || [];
        const page = source.slice(cursor, cursor + limit).map(summariseDefinition);
        return {
          ok: true, detail, summary, cursor, limit,
          returnedCount: page.length,
          totalAvailable: source.length,
          nextCursor: cursor + page.length < source.length ? cursor + page.length : null,
          truncated: cursor + page.length < source.length,
          definitions: page
        };
      }
      const standard = plan.geometry?.masterSlice?.placements || [];
      const custom = plan.geometry?.masterSlice?.customPlacements || [];
      const source = [
        ...standard.map((item) => ({ kind: 'standard', item })),
        ...custom.map((item) => ({ kind: 'custom', item }))
      ];
      const page = source.slice(cursor, cursor + limit).map(({ item, kind }) => summarisePlacement(item, kind));
      return {
        ok: true, detail, summary, cursor, limit,
        returnedCount: page.length,
        totalAvailable: source.length,
        nextCursor: cursor + page.length < source.length ? cursor + page.length : null,
        truncated: cursor + page.length < source.length,
        placements: page
      };
    } catch (error) {
      return errorResult(error);
    }
  }

  async resetBridgeDesign(family, expectedDesignRevision, options = {}) {
    if (this.mutationActive) {
      return errorResult(new BridgeDesignError('OPERATION_IN_PROGRESS', 'Another bridge-design mutation is active.'));
    }
    this.mutationActive = true;
    const wallStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      assertNotAborted(options.signal);
      safeIntegerRevision(expectedDesignRevision);
      const planBefore = currentPlanWithSettings(this.adapter);
      if (planBefore.designRevision !== expectedDesignRevision) {
        throw new BridgeDesignError('STALE_DESIGN_REVISION', 'The bridge design changed. Read it again before reset.', {
          expectedDesignRevision,
          currentDesignRevision: planBefore.designRevision,
          currentPlanId: planBefore.planId,
          currentDesignChecksum: planBefore.designChecksum
        });
      }
      const targetFamily = family ?? this.adapter.getInternalSettings().family;
      const candidate = this.adapter.getFamilyDefaults(targetFamily);
      await this.adapter.applyInternalSettings(candidate, expectedDesignRevision, { signal: options.signal });
      const state = this.getDesignState({ includeCapabilities: false });
      if (!state.ok) return state;
      const wallEnd = typeof performance !== 'undefined' ? performance.now() : Date.now();
      return {
        ...state,
        changed: true,
        reset: true,
        previousDesignRevision: expectedDesignRevision,
        toolDurationMs: Math.round((wallEnd - wallStart) * 1000) / 1000
      };
    } catch (error) {
      return errorResult(error, 'COMPILE_FAILED');
    } finally {
      this.mutationActive = false;
    }
  }
}
