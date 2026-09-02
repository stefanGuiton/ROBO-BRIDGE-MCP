import { loadPackagedModule } from './bootstrap.mjs';
const m = await loadPackagedModule('tools/submission/browser-support.mjs');
export const { delay, freePort, waitForHealth, startServer, stopServer, evaluate, waitForIdle, bridgeSnapshot, passFail, unavailable, errorCode, stripDeckOverhang, capture, providerAcceptance, safeArray, harmlessConsoleError, writeBrowserEvidence } = m;
