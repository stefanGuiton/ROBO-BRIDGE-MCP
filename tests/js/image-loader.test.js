import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeImageFile } from '../../apps/web/src/logo/image-loader.js';
import { MAX_SOURCE_FILE_BYTES } from '../../apps/web/src/logo/compiler.js';

test('oversized upload is rejected before bitmap decode', async () => {
  let decoded = false;
  const previous = globalThis.createImageBitmap;
  globalThis.createImageBitmap = async () => { decoded = true; throw new Error('should not run'); };
  try {
    await assert.rejects(decodeImageFile({ type: 'image/png', size: MAX_SOURCE_FILE_BYTES + 1 }), /image_file_too_large/);
    assert.equal(decoded, false);
  } finally {
    if (previous === undefined) delete globalThis.createImageBitmap;
    else globalThis.createImageBitmap = previous;
  }
});
