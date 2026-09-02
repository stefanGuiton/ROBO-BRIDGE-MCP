'use strict';

import { compileV46Core } from './v46-compiler-core.js';
import { errorResult } from './errors.js';

self.onmessage = (event) => {
  const request = event.data ?? {};
  try {
    const result = compileV46Core({
      settings: request.settings,
      supportProfile: request.supportProfile,
      includeGridMaps: Boolean(request.includeGridMaps)
    });
    self.postMessage({ id: request.id, ok: true, result });
  } catch (error) {
    self.postMessage({ id: request.id, ok: false, error: errorResult(error, 'COMPILE_FAILED') });
  }
};
