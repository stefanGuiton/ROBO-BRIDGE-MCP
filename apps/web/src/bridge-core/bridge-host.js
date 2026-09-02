'use strict';

import { applyChallengeToSettings, normalizeChallengeInput } from './challenge-input.js';
import { getV46DefaultSettings } from './bridge-defaults.js';
import { createBridgeCompiler } from './bridge-compiler-service.js';
import { BridgeCoreError, assertNotAborted, cloneValue } from './errors.js';
import { normalizeCompilerSettings, validateExactDesignRevision } from './schemas.js';

export class BridgeHost {
  constructor(options = {}) {
    this.compiler = options.compiler ?? createBridgeCompiler(options.compilerOptions);
    this.challenge = options.challenge ? normalizeChallengeInput(options.challenge) : null;
    this.challengePolicy = options.challengePolicy ?? 'initial';
    if (!['initial', 'locked', 'none'].includes(this.challengePolicy)) {
      throw new BridgeCoreError('INVALID_CHALLENGE', 'challengePolicy must be initial, locked, or none.', { challengePolicy: this.challengePolicy });
    }
    this.initialSettings = cloneValue(options.initialSettings ?? {});
    this._settings = null;
    this._compiled = null;
    this._buildPlan = null;
    this._designRevision = 0;
    this._compileCount = 0;
    this._mutationActive = false;
    this._state = 'uninitialised';
    this._lastError = null;
    this._listeners = new Set();
    this.renderer = null;
    this._constructionLock = null;
  }

  get ready() { return Boolean(this._compiled && this._buildPlan && this._state !== 'uninitialised'); }
  get settings() { return this._settings ? cloneValue(this._settings) : null; }
  get compiled() { return this._compiled ? cloneValue(this._compiled) : null; }
  get buildPlan() { return this._buildPlan ? cloneValue(this._buildPlan) : null; }
  get compileCount() { return this._compileCount; }
  get designRevision() { return this._designRevision; }
  get worldTransform() { return this._compiled?.worldTransform ? cloneValue(this._compiled.worldTransform) : cloneValue(this.challenge?.worldTransform ?? null); }

  lockConstruction(planId) {
    if (this._mutationActive || planId !== this._buildPlan?.planId || this._constructionLock) {
      throw new BridgeCoreError('OPERATION_IN_PROGRESS', 'Cannot freeze this bridge while its design is changing or already frozen.');
    }
    const token = Object.freeze({ planId });
    this._constructionLock = token;
    return () => { if (this._constructionLock === token) this._constructionLock = null; };
  }

  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _emit(type, details = {}) {
    const event = Object.freeze({ type, designRevision: this._designRevision, compileCount: this._compileCount, ...cloneValue(details) });
    for (const listener of this._listeners) {
      try { listener(event); } catch {}
    }
  }

  _settingsForChallenge(settings, apply = false) {
    if (!this.challenge || !apply) return normalizeCompilerSettings(settings);
    return normalizeCompilerSettings(applyChallengeToSettings(settings, this.challenge).settings);
  }

  getFamilyPreset(family) {
    const initialFamily = this.initialSettings.family ?? 'aqueduct';
    const preset = family === initialFamily
      ? { ...getV46DefaultSettings(family), ...this.initialSettings, family }
      : getV46DefaultSettings(family);
    return this._settingsForChallenge(preset, Boolean(this.challenge));
  }

  exportPlan() {
    if (!this._buildPlan) throw new BridgeCoreError('BUILDPLAN_UNAVAILABLE', 'Compile the bridge before exporting its BuildPlan.');
    return cloneValue(this._buildPlan);
  }

  getCompileState() {
    return {
      state: this._state,
      ready: this.ready,
      mutationActive: this._mutationActive,
      compileCount: this._compileCount,
      designRevision: this._designRevision,
      planId: this._buildPlan?.planId ?? null,
      designChecksum: this._buildPlan?.designChecksum ?? null,
      lastError: cloneValue(this._lastError)
    };
  }

  async initialize({ signal = null, terrainHeightAt = null } = {}) {
    if (this.ready) return this.getCompileState();
    if (this._mutationActive) throw new BridgeCoreError('OPERATION_IN_PROGRESS', 'A bridge compile is already active.');
    this._mutationActive = true;
    this._state = 'compiling';
    this._emit('compile_started', { initial: true });
    try {
      assertNotAborted(signal);
      const family = this.initialSettings.family ?? 'aqueduct';
      let candidate = { ...getV46DefaultSettings(family), ...this.initialSettings, family };
      candidate = this._settingsForChallenge(candidate, Boolean(this.challenge) && this.challengePolicy !== 'none');
      const result = await this.compiler.compile({
        settings: candidate,
        supportProfile: this.challenge?.supportProfile ?? { type: 'flat', heightY: 0 },
        terrainHeightAt,
        worldTransform: this.challenge?.worldTransform ?? {},
        designRevision: 1,
        signal
      });
      assertNotAborted(signal);
      this._settings = candidate;
      this._compiled = result;
      this._buildPlan = result.buildPlan;
      this._designRevision = 1;
      this._compileCount += 1;
      this._state = 'ready';
      this._lastError = null;
      this._emit('compile_committed', { initial: true, planId: result.buildPlan.planId, designChecksum: result.buildPlan.designChecksum });
      return this.getCompileState();
    } catch (error) {
      this._state = this.ready ? 'ready' : 'uninitialised';
      this._lastError = { code: error?.code ?? 'COMPILE_FAILED', message: error?.message ?? 'Initial compile failed.' };
      this._emit('compile_rejected', { initial: true, error: this._lastError });
      throw error;
    } finally {
      this._mutationActive = false;
    }
  }

  async applySettingsBatch(candidateSettings, expectedDesignRevision, { signal = null, terrainHeightAt = null, challenge = this.challenge } = {}) {
    validateExactDesignRevision(expectedDesignRevision);
    if (!this.ready) throw new BridgeCoreError('BUILDPLAN_UNAVAILABLE', 'Initialise the bridge host before mutation.');
    if (expectedDesignRevision !== this._designRevision) {
      throw new BridgeCoreError('STALE_DESIGN_REVISION', 'Bridge design changed. Read the latest design before updating it.', {
        expectedDesignRevision,
        designRevision: this._designRevision
      });
    }
    if (this._mutationActive) throw new BridgeCoreError('OPERATION_IN_PROGRESS', 'A bridge mutation is already active.');
    if (this._constructionLock) throw new BridgeCoreError('OPERATION_IN_PROGRESS', 'Reset construction before changing the frozen bridge design.');
    const candidateChallenge = challenge ? normalizeChallengeInput(challenge) : null;
    this._mutationActive = true;
    this._state = 'compiling';
    this._emit('compile_started', { expectedDesignRevision });
    try {
      assertNotAborted(signal);
      let candidate = normalizeCompilerSettings(candidateSettings);
      if (this.challengePolicy === 'locked' && candidateChallenge) {
        candidate = normalizeCompilerSettings(applyChallengeToSettings(candidate, candidateChallenge).settings);
      }
      const nextRevision = expectedDesignRevision + 1;
      const candidateResult = await this.compiler.compile({
        settings: candidate,
        supportProfile: candidateChallenge?.supportProfile ?? { type: 'flat', heightY: 0 },
        terrainHeightAt,
        worldTransform: candidateChallenge?.worldTransform ?? this._compiled.worldTransform ?? {},
        designRevision: nextRevision,
        signal
      });
      assertNotAborted(signal);
      if (this._designRevision !== expectedDesignRevision) {
        throw new BridgeCoreError('STALE_DESIGN_REVISION', 'Bridge design changed while the candidate was compiling.', {
          expectedDesignRevision,
          designRevision: this._designRevision
        });
      }
      this._settings = candidate;
      this.challenge = candidateChallenge;
      this._compiled = candidateResult;
      this._buildPlan = candidateResult.buildPlan;
      this._designRevision = nextRevision;
      this._compileCount += 1;
      this._state = 'ready';
      this._lastError = null;
      const response = {
        ok: true,
        designRevision: this._designRevision,
        executionRevision: this._buildPlan.executionRevision,
        planId: this._buildPlan.planId,
        designChecksum: this._buildPlan.designChecksum,
        family: this._settings.family,
        metadata: cloneValue(candidateResult.metadata),
        billOfMaterials: cloneValue(this._buildPlan.billOfMaterials),
        timing: cloneValue(this._buildPlan.timing),
        warnings: []
      };
      this._emit('compile_committed', response);
      return response;
    } catch (error) {
      this._state = 'ready';
      this._lastError = { code: error?.code ?? 'COMPILE_FAILED', message: error?.message ?? 'Candidate compile failed.' };
      this._emit('compile_rejected', { expectedDesignRevision, error: this._lastError });
      throw error;
    } finally {
      this._mutationActive = false;
    }
  }

  async compileExpectedRevision(expectedDesignRevision, options = {}) {
    if (!this._settings) throw new BridgeCoreError('BUILDPLAN_UNAVAILABLE', 'Initialise the bridge host before compiling.');
    return this.applySettingsBatch(this._settings, expectedDesignRevision, options);
  }
}

export async function createBridgeHost(options = {}) {
  const host = new BridgeHost(options);
  await host.initialize({ signal: options.signal ?? null, terrainHeightAt: options.terrainHeightAt ?? null });
  return host;
}
