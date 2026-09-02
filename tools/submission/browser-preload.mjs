import { loadPackagedModule } from './bootstrap.mjs';
const m = await loadPackagedModule('tools/submission/browser-preload.mjs');
export const { PRELOAD_SCRIPT } = m;
