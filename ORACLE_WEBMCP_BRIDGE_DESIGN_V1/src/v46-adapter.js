'use strict';

import { BridgeDesignError, assertNotAborted, structuredCloneSafe } from './errors.js';
import { BRIDGE_FAMILIES } from './bridge-spec.js';

function requireMethod(host, name) {
  if (!host || typeof host[name] !== 'function') {
    throw new BridgeDesignError('RUNTIME_UNAVAILABLE', `V4.6 design host is missing ${name}().`, { missing: name });
  }
}

function cloneBuildPlan(host) {
  const plan = typeof host.exportPlan === 'function' ? host.exportPlan() : host.buildPlan;
  return plan ? structuredCloneSafe(plan) : null;
}

export function createV46Adapter(host = globalThis.ROBO_BRIDGE_DEBUG) {
  if (!host) {
    throw new BridgeDesignError('RUNTIME_UNAVAILABLE', 'V4.6 bridge compiler host is unavailable.');
  }
  requireMethod(host, 'getFamilyPreset');
  requireMethod(host, 'applySettingsBatch');

  return Object.freeze({
    get ready() {
      return Boolean(host.ready && cloneBuildPlan(host));
    },
    getInternalSettings() {
      if (!host.settings || typeof host.settings !== 'object') {
        throw new BridgeDesignError('RUNTIME_UNAVAILABLE', 'V4.6 bridge settings are unavailable.');
      }
      return structuredCloneSafe(host.settings);
    },
    getFamilyDefaults(family) {
      if (!BRIDGE_FAMILIES.includes(family)) {
        throw new BridgeDesignError('UNKNOWN_FAMILY', `Unsupported bridge family: ${String(family)}.`);
      }
      const preset = host.getFamilyPreset(family);
      if (!preset || typeof preset !== 'object') {
        throw new BridgeDesignError('RUNTIME_UNAVAILABLE', `V4.6 preset ${family} is unavailable.`);
      }
      return structuredCloneSafe(preset);
    },
    getBuildPlan() {
      const plan = cloneBuildPlan(host);
      if (!plan) throw new BridgeDesignError('BUILDPLAN_UNAVAILABLE', 'Compile the bridge before reading its BuildPlan.');
      return plan;
    },
    getCompileState() {
      const state = typeof host.getCompileState === 'function' ? host.getCompileState() : null;
      return state ? structuredCloneSafe(state) : {
        state: host.ready ? 'ready' : 'unavailable',
        compileCount: Number(host.compileCount || 0)
      };
    },
    getRendererSnapshot() {
      const compiled = host.compiled;
      return {
        metadata: compiled?.metadata ? structuredCloneSafe(compiled.metadata) : null,
        renderStats: host.renderer?.renderStats ? structuredCloneSafe(host.renderer.renderStats) : null
      };
    },
    async applyInternalSettings(candidate, expectedRevision, options = {}) {
      assertNotAborted(options.signal);
      try {
        const result = await host.applySettingsBatch(structuredCloneSafe(candidate), expectedRevision, {
          signal: options.signal
        });
        return structuredCloneSafe(result);
      } catch (error) {
        if (error?.code === 'STALE_DESIGN_REVISION') {
          throw new BridgeDesignError('STALE_DESIGN_REVISION', error.message, error.details);
        }
        if (error?.code === 'CANCELLED' || options.signal?.aborted) {
          throw new BridgeDesignError('CANCELLED', 'The bridge-design operation was cancelled before commit.');
        }
        throw new BridgeDesignError('COMPILE_FAILED', error?.message || 'The V4.6 compiler rejected the candidate design.', {
          causeCode: error?.code || null
        });
      }
    },
    async compileCurrent(expectedRevision, options = {}) {
      assertNotAborted(options.signal);
      requireMethod(host, 'compileExpectedRevision');
      try {
        return structuredCloneSafe(await host.compileExpectedRevision(expectedRevision, { signal: options.signal }));
      } catch (error) {
        if (error?.code === 'STALE_DESIGN_REVISION') throw error;
        if (error?.code === 'CANCELLED' || options.signal?.aborted) {
          throw new BridgeDesignError('CANCELLED', 'The bridge compile was cancelled before commit.');
        }
        throw new BridgeDesignError('COMPILE_FAILED', error?.message || 'The V4.6 compiler failed.');
      }
    }
  });
}

export const createV46BrowserAdapter = createV46Adapter;
