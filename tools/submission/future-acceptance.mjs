import { loadPackagedModule } from './bootstrap.mjs';
const m = await loadPackagedModule('tools/submission/future-acceptance.mjs');
export const { runFutureAcceptance } = m;
