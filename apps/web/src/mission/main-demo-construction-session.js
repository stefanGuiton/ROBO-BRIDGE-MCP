'use strict';

/**
 * Presents the current MAIN_DEMO ConstructionService using the session-shaped
 * interface expected by the accepted Mission adapter. All state and progress
 * remain owned by the existing ConstructionService and BuildBoard.
 */
export function createMainDemoConstructionSession(constructionService, getWorldRevision) {
  if (!constructionService?.startBuild || typeof getWorldRevision !== 'function') {
    throw new TypeError('The current ConstructionService and world revision reader are required.');
  }
  const revision = (provided) => Number.isSafeInteger(provided) ? provided : getWorldRevision();
  return Object.freeze({
    get preparedBuild() { return constructionService.preparedBuild; },
    startBuild(options = {}) {
      if (constructionService.preparedBuild) return constructionService.getBuildState();
      return constructionService.startBuild({
        expectedWorldRevision: revision(options.expectedWorldRevision),
        signal: options.signal
      });
    },
    getBuildProgress() { return constructionService.getBuildProgress(); },
    buildNextParts(count, options = {}) {
      return constructionService.buildNextParts(count, {
        ...options,
        expectedWorldRevision: revision(options.expectedWorldRevision)
      });
    },
    cancelBuild(reason = 'mission_cancelled') {
      return constructionService.cancelBuild({
        expectedWorldRevision: getWorldRevision(),
        reason
      });
    },
    reset(options = {}) {
      return constructionService.reset({
        expectedWorldRevision: revision(options.expectedWorldRevision)
      });
    }
  });
}
