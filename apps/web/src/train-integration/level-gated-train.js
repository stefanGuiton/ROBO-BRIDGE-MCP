// Lifecycle gate only: no Train, physics, renderer root or frame subscription
// exists until Level 3 explicitly enables the existing integration factory.
export function createLevelGatedTrain({ createIntegration, subscribeFrame = () => () => {} }) {
  let enabled = false, integration = null, unsubscribe = null, closing = null;
  const unavailable = () => Object.assign(new Error('Train is available only in Level 3.'), { code: 'LEVEL3_ONLY' });
  const current = () => {
    if (!enabled) throw unavailable();
    if (closing) throw Object.assign(new Error('Await the previous Train cleanup before preparing another instance.'), { code: 'TRAIN_DISPOSING' });
    if (!integration) {
      integration = createIntegration();
      unsubscribe = subscribeFrame(delta => integration?.updateFrame(delta));
    }
    return integration;
  };
  function clear() {
    if (closing) return closing;
    unsubscribe?.(); unsubscribe = null;
    const previous = integration; integration = null;
    const cleanup = previous?.dispose();
    const result = { ok: true, configured: false };
    if (!cleanup?.then) return result;
    closing = cleanup.then(() => result).finally(() => { closing = null; });
    return closing;
  }
  return Object.freeze({
    setEnabled(value) {
      enabled = Boolean(value);
      const cleanup = !enabled ? clear() : closing;
      const result = { ok: true, enabled };
      return cleanup?.then ? cleanup.then(() => result) : result;
    },
    clear,
    prepare(input) { return current().prepare(input); },
    test(input) { return current().test(input); },
    refresh(input) { return current().refresh(input); },
    notifyPusherReady(...args) { return current().notifyPusherReady(...args); },
    runToTerminal(...args) { return current().runToTerminal(...args); },
    updateFrame(delta) { return integration?.updateFrame(delta) ?? { active: false, configured: false, fixedSteps: 0 }; },
    reset(input) { return integration?.reset(input) ?? { ok: true, state: 'UNCONFIGURED' }; },
    getState() { return { ...(integration?.getState() ?? { configured: false, state: 'UNCONFIGURED', terminal: false }), enabled, disposing: Boolean(closing), demoLevel: enabled ? 3 : 2 }; },
    getSubsystem: () => integration?.getSubsystem() ?? null,
    getDetailedSnapshot: () => integration?.getDetailedSnapshot() ?? null,
    getEvidence: () => integration?.getEvidence() ?? null,
    getSupportMap: () => integration?.getSupportMap() ?? null,
    getCollisionSnapshot: () => integration?.getCollisionSnapshot() ?? null,
    getTerrainDiagnostics: () => integration?.getTerrainDiagnostics() ?? null,
    validateTestMotion: input => integration?.validateTestMotion?.(input) === true,
    cancelMotion: reason => closing ?? integration?.cancelMotion?.(reason) ?? Promise.resolve({ ok: true }),
    dispose() { enabled = false; return clear(); }
  });
}
