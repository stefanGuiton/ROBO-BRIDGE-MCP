import { machinePointToTable, tablePointToMachine } from '../workcell/v8-workcell-profile.js';

const STORAGE_KEY = 'roboBridgeEasyEndpointsV1';

export function endpointToTable(point, settings) {
  const table = machinePointToTable({ xMm: point.x, yMm: point.y, zMm: point.z }, settings);
  return { x: table.xMm, y: table.yMm, z: table.zMm - settings.tableTopHeightMm };
}

export function endpointToMachine(point, settings) {
  if (![point?.x, point?.y, point?.z].every(Number.isFinite)) throw new Error('Enter a number for every XYZ field.');
  const machine = tablePointToMachine({ xMm: point.x, yMm: point.y, zMm: point.z + settings.tableTopHeightMm }, settings);
  return { x: machine.xMm, y: machine.yMm, z: machine.zMm };
}

// UI drafts/persistence are not a second live BridgeSpec. Only a successful
// BridgeHost compile commits these endpoints through the ChallengeService.
export async function installEndpointSettings({ groups, challenge, bridgeHost, getSettings, beforeApply = () => {} }) {
  if (!groups || !challenge || !bridgeHost) return null;
  const current = () => ({ entry: endpointToTable(challenge.getEntry().position, getSettings()), exit: endpointToTable(challenge.getExit().position, getSettings()) });
  const defaults = current(), inputs = {};
  const section = document.createElement('details');
  section.className = 'settings-group'; section.open = true; section.dataset.endpointSettings = '';
  section.style.scrollMarginTop = '100px';
  const summary = document.createElement('summary'); summary.textContent = 'Bridge ENTRY / EXIT';
  const body = document.createElement('div'); body.className = 'settings-group-body';
  const help = document.createElement('p');
  help.textContent = 'Table frame, mm: X right, Y toward the back, Z above the tabletop. X/Y zero is the table centre. Z is linked to keep the Aqueduct level.';
  body.append(help);
  for (const endpoint of ['entry', 'exit']) {
    inputs[endpoint] = {};
    for (const axis of ['x', 'y', 'z']) {
      const row = document.createElement('label'); row.className = 'setting-row'; row.dataset.settingRow = `bridge ${endpoint} ${axis} xyz`;
      const label = document.createElement('span'); label.textContent = `${endpoint.toUpperCase()} ${axis.toUpperCase()} (mm)`;
      const input = document.createElement('input'); input.type = 'number'; input.step = '1';
      input.dataset.endpoint = endpoint; input.dataset.axis = axis;
      input.setAttribute('aria-label', `${endpoint.toUpperCase()} ${axis.toUpperCase()} (mm)`);
      inputs[endpoint][axis] = input; row.append(label, input); body.append(row);
      if (axis === 'z') input.addEventListener('input', () => { inputs[endpoint === 'entry' ? 'exit' : 'entry'].z.value = input.value; });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); void apply(); } });
    }
  }
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.dataset.endpointStatus = '';
  const applyButton = document.createElement('button'); applyButton.type = 'button'; applyButton.textContent = 'Apply endpoints';
  const resetButton = document.createElement('button'); resetButton.type = 'button'; resetButton.textContent = 'Reset endpoints';
  body.append(applyButton, resetButton, status); section.append(summary, body); groups.prepend(section);
  const fill = points => { for (const e of ['entry', 'exit']) for (const a of ['x', 'y', 'z']) inputs[e][a].value = String(Number(points[e][a].toFixed(3))); };
  const read = () => Object.fromEntries(['entry', 'exit'].map(e => [e, Object.fromEntries(['x', 'y', 'z'].map(a => {
    if (inputs[e][a].value.trim() === '') throw new Error('Enter a number for every XYZ field.');
    return [a, Number(inputs[e][a].value)];
  }))]));
  let applying = false;
  async function apply(points = null, { reset = false } = {}) {
    if (applying) return;
    try {
      beforeApply();
      const draft = points ?? read(), settings = getSettings();
      const machine = { entry: endpointToMachine(draft.entry, settings), exit: endpointToMachine(draft.exit, settings) };
      applying = true; applyButton.disabled = true; resetButton.disabled = true;
      status.textContent = 'Updating bridge and terrain…';
      await challenge.updateEndpoints(bridgeHost, machine, { expectedDesignRevision: bridgeHost.designRevision });
      fill(current());
      try { if (reset) localStorage.removeItem(STORAGE_KEY); else localStorage.setItem(STORAGE_KEY, JSON.stringify(current())); } catch { /* Session controls still work without storage. */ }
      status.textContent = 'Applied — bridge, terrain, ENTRY and EXIT updated together.';
    } catch (error) { status.textContent = error.message; }
    finally { applying = false; applyButton.disabled = false; resetButton.disabled = false; }
  }
  applyButton.addEventListener('click', () => void apply());
  resetButton.addEventListener('click', () => void apply(defaults, { reset: true }));
  fill(defaults); status.textContent = 'Edit XYZ, then Apply endpoints (or press Enter).';
  try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'); if (saved) await apply(saved); } catch { /* Ignore an invalid saved draft. */ }
  return { section, apply, readCurrent: current };
}
