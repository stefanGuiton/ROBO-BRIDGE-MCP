'use strict';

import { boundedErrorResult } from './errors.js';

export function createMissionTrainAdapter(trainIntegration) {
  if (!trainIntegration?.test || !trainIntegration?.reset || !trainIntegration?.getState) {
    throw new TypeError('Mission Train adapter requires a Train integration instance.');
  }
  return Object.freeze({
    getState() {
      return trainIntegration.getState();
    },
    async test(input = {}) {
      try {
        return await trainIntegration.test(input);
      } catch (error) {
        return boundedErrorResult(error, 'TRAIN_TEST_FAILED');
      }
    },
    reset(options = {}) {
      try {
        return trainIntegration.reset(options);
      } catch (error) {
        return boundedErrorResult(error, 'TRAIN_RESET_FAILED');
      }
    }
  });
}
