const ALLOWED = new Set(['OBSERVE','TARGET','MOVE','LATCH','VERIFY','PLACE','RECOVER']);
const clone = (v) => JSON.parse(JSON.stringify(v));
export function createAgentActivity({ maxEntries = 12 } = {}) {
  const entries = []; const listeners = new Set(); let sequence = 0;
  function push(state, message, data = {}) {
    const normalized = ALLOWED.has(state) ? state : 'VERIFY';
    const event = Object.freeze({ sequence: ++sequence, state: normalized, message: String(message).slice(0, 180), data: clone(data) });
    entries.unshift(event); if (entries.length > maxEntries) entries.length = maxEntries;
    for (const listener of listeners) listener(clone(event), list());
    return clone(event);
  }
  function list() { return clone(entries); }
  return Object.freeze({
    push, list,
    subscribe(listener) { listeners.add(listener); listener(null, list()); return () => listeners.delete(listener); },
    clear() { entries.length = 0; for (const listener of listeners) listener(null, []); }
  });
}
