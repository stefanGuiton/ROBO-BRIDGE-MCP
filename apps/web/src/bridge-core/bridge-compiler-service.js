'use strict';

import { applyChallengeToSettings, normalizeChallengeInput } from './challenge-input.js';
import { createV46BuildPlan } from './buildplan-adapter.js';
import { BridgeCoreError, assertNotAborted, cloneValue } from './errors.js';
import { normalizeCompilerSettings } from './schemas.js';
import { compileV46Core } from './v46-compiler-core.js';
import { compileV46InWorker } from './v46-worker-adapter.js';
import { normalizeWorldTransform } from './world-transform.js';

const now = () => globalThis.performance?.now?.() ?? Date.now();

export function createBridgeCompiler(options = {}) {
  const preferWorker = options.preferWorker ?? true;
  const workerUrl = options.workerUrl ?? null;
  const workerFactory = options.workerFactory ?? null;

  return Object.freeze({
    mode: preferWorker && (typeof workerFactory === 'function' || typeof globalThis.Worker === 'function') ? 'worker' : 'inline',
    async compile(request = {}) {
      assertNotAborted(request.signal);
      const started = now();
      let settings = normalizeCompilerSettings(request.settings ?? {});
      let challenge = null;
      let supportProfile = request.supportProfile ?? { type: 'flat', heightY: 0 };
      let worldTransform = normalizeWorldTransform(request.worldTransform ?? {});
      if (request.challenge) {
        const applied = applyChallengeToSettings(settings, request.challenge);
        settings = normalizeCompilerSettings(applied.settings);
        challenge = applied.challenge;
        supportProfile = challenge.supportProfile;
        worldTransform = challenge.worldTransform;
      }
      const designRevision = request.designRevision ?? 1;
      if (!Number.isSafeInteger(designRevision) || designRevision < 0) {
        throw new BridgeCoreError('INVALID_SETTINGS', 'designRevision must be a non-negative safe integer.', { designRevision });
      }
      let compiled;
      const canUseWorker = preferWorker
        && !request.terrainHeightAt
        && (typeof workerFactory === 'function' || typeof globalThis.Worker === 'function')
        && request.useWorker !== false;
      if (canUseWorker) {
        compiled = await compileV46InWorker({
          settings,
          supportProfile,
          includeGridMaps: Boolean(request.includeGridMaps),
          signal: request.signal,
          workerUrl: workerUrl ?? new URL('./v46-worker-entry.js', import.meta.url),
          workerFactory
        });
      } else {
        await Promise.resolve();
        compiled = compileV46Core({
          settings,
          supportProfile,
          terrainHeightAt: request.terrainHeightAt ?? null,
          signal: request.signal,
          includeGridMaps: Boolean(request.includeGridMaps)
        });
      }
      assertNotAborted(request.signal);
      const buildPlan = createV46BuildPlan({
        compiled,
        settings,
        designRevision,
        executionRevision: request.executionRevision ?? 0
      });
      const completed = now();
      const result = {
        ok: true,
        compilerVersion: compiled.compilerVersion,
        compileMode: canUseWorker ? 'worker' : 'inline',
        metadata: cloneValue(compiled.metadata),
        placements: cloneValue(compiled.placements),
        customDefinitions: cloneValue(compiled.customDefinitions),
        customPlacements: cloneValue(compiled.customPlacements),
        requiredRuns: cloneValue(compiled.requiredRuns),
        segments: cloneValue(compiled.segments),
        renderBaseIds: cloneValue(compiled.renderBaseIds),
        grid: cloneValue(compiled.grid),
        buildPlan,
        settings: cloneValue(settings),
        challenge: challenge ? cloneValue(challenge) : null,
        worldTransform: cloneValue(worldTransform),
        performance: {
          compilerMs: compiled.metadata.timing.total,
          serviceTotalMs: completed - started,
          buildPlanBytes: JSON.stringify(buildPlan).length,
          compiledDataBytes: JSON.stringify({
            metadata: compiled.metadata,
            placements: compiled.placements,
            customDefinitions: compiled.customDefinitions,
            customPlacements: compiled.customPlacements,
            requiredRuns: compiled.requiredRuns,
            segments: compiled.segments,
            grid: compiled.grid
          }).length
        }
      };
      if (compiled.gridMaps) result.gridMaps = cloneValue(compiled.gridMaps);
      return result;
    }
  });
}

export async function compileBridge(request = {}, options = {}) {
  return createBridgeCompiler(options).compile(request);
}
