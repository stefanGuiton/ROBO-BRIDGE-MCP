const encoder = new TextEncoder();

function fnv1a(bytes) {
  let hash = 2166136261;
  for (let index = 0; index < bytes.length; index += 1) {
    hash ^= bytes[index];
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function checksumTypedArray(array) {
  return `fnv1a32:${fnv1a(new Uint8Array(array.buffer, array.byteOffset, array.byteLength))}`;
}

export function checksumString(value) {
  return `fnv1a32:${fnv1a(encoder.encode(value))}`;
}

export function stableStringify(value, indent = 0) {
  const normalise = (item) => {
    if (Array.isArray(item)) return item.map(normalise);
    if (item && typeof item === "object") {
      const result = {};
      for (const key of Object.keys(item).sort()) result[key] = normalise(item[key]);
      return result;
    }
    return item;
  };
  return JSON.stringify(normalise(value), null, indent);
}
