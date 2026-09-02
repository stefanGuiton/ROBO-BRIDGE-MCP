import { loadPackagedModule } from './bootstrap.mjs';
const m = await loadPackagedModule('tools/submission/current-acceptance.mjs');
export const { runCurrentAcceptance } = m;
