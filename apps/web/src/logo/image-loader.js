import { MAX_SOURCE_DIMENSION, MAX_SOURCE_FILE_BYTES, MAX_SOURCE_PIXELS } from './compiler.js';

export async function decodeImageFile(file) {
  if (!file) throw new Error('missing_file');
  const allowed = new Set(['image/png', 'image/jpeg', 'image/webp']);
  if (file.type && !allowed.has(file.type)) throw new Error('unsupported_image_type');
  if (Number.isFinite(file.size) && file.size > MAX_SOURCE_FILE_BYTES) throw new Error('image_file_too_large');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('image_decode_failed');
  }
  try {
    if (bitmap.width > MAX_SOURCE_DIMENSION || bitmap.height > MAX_SOURCE_DIMENSION || bitmap.width * bitmap.height > MAX_SOURCE_PIXELS) throw new Error('image_too_large');
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    bitmap.close?.();
  }
}
