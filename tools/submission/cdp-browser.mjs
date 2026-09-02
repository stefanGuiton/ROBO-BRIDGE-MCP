import { loadPackagedModule } from './bootstrap.mjs';
const m = await loadPackagedModule('tools/submission/cdp-browser.mjs');
export const { findBrowserExecutable, ChromiumSession } = m;
