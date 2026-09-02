import { loadPackagedModule } from './bootstrap.mjs';
const m = await loadPackagedModule('tools/submission/future-contracts.mjs');
export const { validateConstruction, validateSourceReassignment, validateTrainFailure, validateTrainSuccess, validateMission, validateTerrain, validateHero, validateAdversarial, validateIntegratedReset } = m;
