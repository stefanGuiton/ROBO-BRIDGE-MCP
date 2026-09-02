'use strict';

function percentile(sorted, fraction) {
  if (!sorted.length) return 0;
  const position = Math.max(0, Math.min(sorted.length - 1, (sorted.length - 1) * fraction));
  const low = Math.floor(position);
  const high = Math.ceil(position);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

export function createPerformanceRecorder({ capacity = 2400, channels = [] } = {}) {
  const size = Math.max(32, Math.round(capacity));
  const names = [...new Set(channels)];
  const stores = Object.fromEntries(names.map((name) => [name, new Float64Array(size)]));
  const indices = Object.fromEntries(names.map((name) => [name, 0]));
  const counts = Object.fromEntries(names.map((name) => [name, 0]));
  const totals = Object.fromEntries(names.map((name) => [name, 0]));
  const maximums = Object.fromEntries(names.map((name) => [name, 0]));
  const counters = {};

  function record(name, rawValue) {
    const value = Number(rawValue);
    const store = stores[name];
    if (!store || !Number.isFinite(value)) return false;
    const index = indices[name];
    if (counts[name] >= size) totals[name] -= store[index];
    store[index] = value;
    totals[name] += value;
    indices[name] = (index + 1) % size;
    counts[name] = Math.min(size, counts[name] + 1);
    maximums[name] = Math.max(maximums[name], value);
    return true;
  }

  function values(name) {
    const store = stores[name];
    const count = counts[name] || 0;
    if (!store || !count) return [];
    const start = count < size ? 0 : indices[name];
    return Array.from({ length: count }, (_, index) => store[(start + index) % size]);
  }

  function summary(name) {
    const count = counts[name] || 0;
    if (!count) return { count: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0, stddev: 0 };
    const sample = values(name).sort((a, b) => a - b);
    const mean = totals[name] / count;
    const variance = sample.reduce((sum, value) => sum + (value - mean) ** 2, 0) / count;
    return {
      count,
      mean,
      p50: percentile(sample, 0.5),
      p95: percentile(sample, 0.95),
      p99: percentile(sample, 0.99),
      max: maximums[name],
      stddev: Math.sqrt(variance)
    };
  }

  function reset() {
    for (const name of names) {
      stores[name].fill(0);
      indices[name] = 0;
      counts[name] = 0;
      totals[name] = 0;
      maximums[name] = 0;
    }
    for (const key of Object.keys(counters)) delete counters[key];
  }

  return Object.freeze({
    record,
    increment(name, amount = 1) {
      counters[name] = (Number(counters[name]) || 0) + (Number(amount) || 0);
      return counters[name];
    },
    setCounter(name, value) { counters[name] = Number(value) || 0; },
    summary,
    report() {
      return {
        capacity: size,
        channels: Object.fromEntries(names.map((name) => [name, summary(name)])),
        counters: { ...counters }
      };
    },
    reset
  });
}

export { percentile };
