import { loadPackagedModule } from './bootstrap.mjs';
const m = await loadPackagedModule('tools/submission/browser-suite.mjs');
export const { runBrowserSuite, validateAdversarial, validateConstruction, validateHero, validateIntegratedReset, validateMission, validateSourceReassignment, validateTerrain, validateTrainFailure, validateTrainSuccess } = m;
