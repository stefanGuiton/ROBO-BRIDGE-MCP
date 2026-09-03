// Lifecycle gate only: no Train, physics, renderer root or frame subscription
// exists until Level 3 explicitly enables the existing integration factory.
export function createLevelGatedTrain({ createIntegration, subscribeFrame = () => () => {} }) {
  let enabled = false, integration = null, unsubscribe = null;
  const unavailable = () => Object.assign(new Error('Train is available only in Level 3.'), { code: 'LEVEL3_ONLY' });
  const current = () => {
    if (!enabled) throw unavailable();
    if (!integration) {
      integration = createIntegration();
      unsubscribe = subscribeFrame(delta => integration?.updateFrame(delta));
    }
    return integration;
  };
  function clear() {
    unsubscribe?.(); unsubscribe = null;
    integration?.dispose(); integration = null;
    return { ok: true, configured: false };
  }
  return Object.freeze({
    setEnabled(value) { enabled = Boolean(value); if (!enabled) clear(); return { ok: true, enabled }; },
    clear,
    prepare(input) { return current().prepare(input); },
    test(input) { return current().test(input); },
    refresh(input) { return current().refresh(input); },
    notifyPusherReady(...args) { return current().notifyPusherReady(...args); },
    runToTerminal(...args) { return current().runToTerminal(...args); },
    updateFrame(delta) { return integration?.updateFrame(delta) ?? { active: false, configured: false, fixedSteps: 0 }; },
    reset(input) { return integration?.reset(input) ?? { ok: true, state: 'UNCONFIGURED' }; },
    getState() { return { ...(integration?.getState() ?? { configured: false, state: 'UNCONFIGURED', terminal: false }), enabled, demoLevel: enabled ? 3 : 2 }; },
    getSubsystem: () => integration?.getSubsystem() ?? null,
    getDetailedSnapshot: () => integration?.getDetailedSnapshot() ?? null,
    getEvidence: () => integration?.getEvidence() ?? null,
    getSupportMap: () => integration?.getSupportMap() ?? null,
    getCollisionSnapshot: () => integration?.getCollisionSnapshot() ?? null,
    getTerrainDiagnostics: () => integration?.getTerrainDiagnostics() ?? null,
    dispose() { enabled = false; return clear(); }
  });
}
