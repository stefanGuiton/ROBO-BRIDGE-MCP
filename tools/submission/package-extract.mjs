import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

const CHUNKS = Array.from({ length: 8 }, (_, index) => `chunk-${String(index).padStart(2, '0')}.txt`);

function readString(buffer, start, length) {
  const end = buffer.indexOf(0, start);
  return buffer.subarray(start, end >= start && end < start + length ? end : start + length).toString('utf8');
}

function safeRelativePath(name) {
  const normalized = path.posix.normalize(name).replace(/^\.\//, '');
  if (!normalized || normalized === '.' || path.posix.isAbsolute(normalized) || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`Unsafe path in submission package: ${name}`);
  }
  return normalized;
}

async function extractTar(tar, destination) {
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    const name = readString(header, 0, 100);
    const prefix = readString(header, 345, 155);
    const relative = safeRelativePath(prefix ? `${prefix}/${name}` : name);
    const sizeText = readString(header, 124, 12).trim().replace(/\0/g, '');
    const size = sizeText ? Number.parseInt(sizeText, 8) : 0;
    if (!Number.isSafeInteger(size) || size < 0) throw new Error(`Invalid size in submission package: ${relative}`);
    const type = String.fromCharCode(header[156] || 48);
    const bodyStart = offset + 512;
    const bodyEnd = bodyStart + size;
    if (bodyEnd > tar.length) throw new Error(`Truncated submission package entry: ${relative}`);
    const target = path.join(destination, ...relative.split('/'));
    if (type === '0' || type === '\0') {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, tar.subarray(bodyStart, bodyEnd));
    } else if (type === '5') {
      await mkdir(target, { recursive: true });
    } else {
      throw new Error(`Unsupported submission package entry type ${JSON.stringify(type)}: ${relative}`);
    }
    offset = bodyStart + Math.ceil(size / 512) * 512;
  }
}

export async function extractSubmissionPackage({ packageDirectory, destination, expectedSha256 }) {
  const encoded = (await Promise.all(CHUNKS.map((name) => readFile(path.join(packageDirectory, name), 'utf8')))).join('').replace(/\s+/g, '');
  const archive = Buffer.from(encoded, 'base64');
  const actualSha256 = createHash('sha256').update(archive).digest('hex');
  if (actualSha256 !== expectedSha256) {
    throw new Error(`Submission package checksum mismatch: expected ${expectedSha256}, got ${actualSha256}`);
  }
  await extractTar(gunzipSync(archive), destination);
}
