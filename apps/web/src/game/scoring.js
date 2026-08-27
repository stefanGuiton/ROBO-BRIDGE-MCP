export function scoreCoBuild(game, nowMs = game.startedAtMs ?? 0) {
  const state = game.getState(nowMs);
  return {
    mode: 'co-build',
    totalTimeMs: state.timer.elapsedMs,
    correctTargets: state.progress.correctTargets,
    totalTargets: state.progress.totalTargets,
    humanCorrectPlacements: state.contributions.human,
    agentCorrectPlacements: state.contributions.agent,
    corrections: state.corrections,
    replans: state.replans,
    completionStatus: state.status
  };
}

export function scoreRace(game, nowMs = game.startedAtMs ?? 0) {
  const state = game.getState(nowMs);
  return {
    mode: 'race',
    humanProgress: state.human.progress,
    aiProgress: state.ai.progress,
    completionMs: state.completionMs,
    invalidPlacements: state.invalidPlacements,
    corrections: { human: state.human.corrections, ai: state.ai.corrections },
    winner: state.winner
  };
}
