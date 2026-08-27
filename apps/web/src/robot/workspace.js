import { CHALLENGE_WORKSPACE } from './ur10-definition.js';
import { isFiniteNumber } from './math.js';

export function validateWorkspacePoint(target, workspace = CHALLENGE_WORKSPACE) {
  if (!target || ![target.xMm, target.yMm, target.zMm].every(isFiniteNumber)) {
    return { ok: false, reason: 'invalid_input' };
  }
  if (
    target.xMm < workspace.xMinMm || target.xMm > workspace.xMaxMm ||
    target.yMm < workspace.yMinMm || target.yMm > workspace.yMaxMm ||
    target.zMm < workspace.zMinMm || target.zMm > workspace.zMaxMm
  ) {
    return { ok: false, reason: 'outside_workspace', workspace };
  }
  return { ok: true };
}

export function sampleChallengeWorkspace(count, seed = 0x10C0DE, workspace = CHALLENGE_WORKSPACE) {
  let state = seed >>> 0;
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  return Array.from({ length: count }, () => ({
    xMm: workspace.xMinMm + random() * (workspace.xMaxMm - workspace.xMinMm),
    yMm: workspace.yMinMm + random() * (workspace.yMaxMm - workspace.yMinMm),
    zMm: workspace.zMinMm + random() * (workspace.zMaxMm - workspace.zMinMm)
  }));
}
