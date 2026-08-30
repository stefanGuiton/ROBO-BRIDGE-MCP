export function stableClone(value) {
  if (Array.isArray(value)) return value.map(stableClone);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableClone(value[key])]));
  }
  return value;
}

export function stableStringify(value, space = 0) {
  return JSON.stringify(stableClone(value), null, space);
}

export function fnv1a(value) {
  const text = typeof value === "string" ? value : stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function checksum(value) {
  return fnv1a(value).toString(16).padStart(8, "0").toUpperCase();
}
