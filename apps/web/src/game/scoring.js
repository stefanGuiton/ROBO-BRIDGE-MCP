export function scoreCoBuild(game, nowMs = game.startedAtMs ?? 0) {
  const state = game.getState(nowMs);
  return { mode: 'co-build', totalTimeMs: state.timer.elapsedMs, correctTargets: state.progress.correctTargets, totalTargets: state.progress.totalTargets, humanCorrectPlacements: state.contributions.human, agentCorrectPlacements: state.contributions.agent, corrections: state.corrections, replans: state.replans, completionStatus: state.status };
}

export function scoreRace(game, nowMs = game.startedAtMs ?? 0) {
  const state = game.getState(nowMs);
  return { mode: 'race', humanProgress: state.human.progress, agentProgress: state.agent.progress, completionMs: state.completionMs, invalidPlacements: state.invalidPlacements, winner: state.winner };
}
