'use strict';

async function startOracleBridgeDesignPackage() {
  try {
    const lifecycle = [];
    const bridgePackage = createBridgeDesignPackage({
      host: globalThis.ROBO_BRIDGE_DEBUG,
      onLifecycle(event) {
        lifecycle.push({ ...event, time: Date.now() });
        if (lifecycle.length > 100) lifecycle.shift();
      }
    });
    const { service, tools, invoke } = bridgePackage;
    const registration = await bridgePackage.register();
    const api = Object.freeze({
      version: '1.0.0',
      service,
      tools,
      invoke,
      registration,
      lifecycle,
      get nativeWebMcpProven() { return registration.ok === true; }
    });
    globalThis.ROBO_BRIDGE_WEBMCP = api;
    mountBridgeDemoPanel(api, registration);
    globalThis.dispatchEvent(new CustomEvent('robo-bridge-webmcp-ready', { detail: { registration } }));
  } catch (error) {
    globalThis.ROBO_BRIDGE_WEBMCP = Object.freeze({
      version: '1.0.0',
      ready: false,
      error: { code: error.code || 'INTERNAL_ERROR', message: error.message }
    });
    console.error('ROBO BRIDGE WebMCP package failed to start:', error);
  }
}

startOracleBridgeDesignPackage();
