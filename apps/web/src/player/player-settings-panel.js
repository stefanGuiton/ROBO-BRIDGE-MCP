import { SCENE_LAYOUT_CONTROLS } from '../workcell/scene-layout-settings.js';
const GROUP_RULES = [
  ['Scene Layout', /^(tableYawDeg|robotBase)/],
  ['Player', /^(mouse|invertY|pitch|fov|cameraZoom|nearClip|farClip|player|moveSpeed|verticalSpeed|sprint|acceleration|deceleration|movementDamping|maximumSpeed|unlimitedPickup|maximumPickup|selectionHighlight|hold)/],
  ['Mobile Controls', /^mobile/],
  ['Physics', /^(gravity|physicsHz|maximumSubsteps|maximumCatchup|brickMass|pendulum|angularDamping|linearDamping|maximumAngular|pivotAcceleration|pickup)/],
  ['Placement', /^(placement|heldCollision|gridPitch|snap|ghostOpacity|allowPicking|brickCollision|collision|heldSurface|brickConnections|connection|autoCapture|structuralCollapse)/],
  ['Brick', /^(brickLength|brickWidth|brickBody|studPitch|studDiameter|studHeight|brickRoughness|brickMetalness)/],
  ['Table', /^(table|leg)/],
  ['20×20 Stud Build Mat', /^(mat|gridVisible|gridColor|gridOpacity)/],
  ['Camera / Graphics', /^(pixelRatio|shadows|shadowMap|shadowUpdate|mobileShadow|exposure|toneMapping)/],
  ['ACES Colour Grading', /^(colorGrading|grade|lut)/],
  ['Lighting', /^(backgroundBrightness|environmentIntensity|keyLight|keyX|keyY|keyZ|fillIntensity|rimIntensity|shadowBias|shadowNormalBias)/],
  ['Reference Sun', /^sun/],
  ['UR10 Surface Normals', /^ur10(Normal|Smooth|Weld|Clean)/],
  ['UR10 Materials', /^ur10(Blue|Dark|Aluminium|LightPolymer|Rubber)/],
  ['Scene Materials', /^(floor|gripperMaterial)/],
  ['Robot Mount', /^robotMount/],
  ['Scene', /^(restitution|friction|spawnCount|seed|hudHz)/],
  ['Debug', /^debug/]
];

const SELECT_OPTIONS = Object.freeze({
  mobileControlsMode: ['Auto', 'On', 'Off'],
  toneMapping: ['ACES', 'Neutral', 'None'],
  ur10NormalMode: ['smooth', 'hybrid', 'exported', 'flat'],
  ur10NormalWeighting: ['corner', 'area', 'uniform'],
  connectionOverhangGhostStyle: ['Yellow', 'Green']
});

const HIDDEN_SETTINGS = new Set(['verticalSpeedMmS', 'movementFollowsPitch', 'robotMountXmm', 'robotMountYmm', 'robotMountZmm', 'robotMountYawDeg']);

function labelFor(key) {
  return key
    .replace(/MmS2/g, ' mm/s²')
    .replace(/MmS/g, ' mm/s')
    .replace(/Mm/g, ' mm')
    .replace(/Deg/g, '°')
    .replace(/Rad/g, ' rad')
    .replace(/Hz/g, ' Hz')
    .replace(/Pct/g, ' %')
    .replace(/Ms/g, ' ms')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (character) => character.toUpperCase());
}

function groupFor(key) {
  return GROUP_RULES.find(([, rule]) => rule.test(key))?.[0] ?? 'Advanced';
}

function numberStep(value) {
  const absolute = Math.abs(value);
  if (absolute > 100) return 1;
  if (absolute > 10) return 0.1;
  if (absolute > 1) return 0.01;
  return 0.001;
}

function makeControl(key, value, store) {
  const row = document.createElement('label');
  row.className = 'setting-row';
  row.dataset.settingRow = key.toLowerCase();
  const name = document.createElement('span');
  name.textContent = labelFor(key);
  name.title = key;
  const layout = SCENE_LAYOUT_CONTROLS[key];
  if (layout) {
    row.classList.add('scene-layout-row');
    name.textContent = layout.label;
    const controls = document.createElement('span');
    controls.className = 'scene-layout-inputs';
    const slider = document.createElement('input'), number = document.createElement('input');
    slider.type = 'range'; number.type = 'number';
    for (const input of [slider, number]) {
      input.min = layout.min; input.max = layout.max; input.step = layout.step;
      input.value = value; input.setAttribute('aria-label', `${layout.label}${input === slider ? ' slider' : ''}`);
      input.dataset[input === slider ? 'layoutSlider' : 'setting'] = key;
      input.addEventListener(input === slider ? 'input' : 'change', () => {
        store.set(key, Number(input.value));
        slider.value = number.value = String(store.get()[key]);
      });
    }
    store.subscribe(() => { slider.value = number.value = String(store.get()[key]); });
    controls.append(slider, number); row.append(name, controls); return row;
  }
  let input;
  if (typeof value === 'boolean') {
    input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.addEventListener('change', () => store.set(key, input.checked));
  } else if (SELECT_OPTIONS[key]) {
    input = document.createElement('select');
    for (const optionValue of SELECT_OPTIONS[key]) {
      const option = document.createElement('option');
      option.value = optionValue;
      option.textContent = optionValue;
      input.append(option);
    }
    input.value = value;
    input.addEventListener('change', () => store.set(key, input.value));
  } else {
    input = document.createElement('input');
    if (typeof value === 'number') {
      input.type = 'number';
      input.step = String(numberStep(value));
      input.value = String(value);
      input.addEventListener('change', () => {
        const next = Number(input.value);
        if (Number.isFinite(next)) store.set(key, next);
        else input.value = String(store.get()[key]);
      });
    } else if (/Color$/.test(key) && /^#[0-9a-f]{6}$/i.test(value)) {
      input.type = 'color';
      input.value = value;
      input.addEventListener('input', () => store.set(key, input.value));
    } else {
      input.type = 'text';
      input.value = value;
      input.addEventListener('change', () => store.set(key, input.value));
    }
  }
  input.dataset.setting = key;
  input.disabled = key === 'structuralCollapseEnabled';
  if (input.disabled) input.title = 'Disabled in the production shared-state runtime';
  row.append(name, input);
  return row;
}

export function installPlayerSettingsPanel({ store, panel, groups, search, onImportError = () => {} }) {
  if (!panel || !groups) return null;
  const settings = store.get();
  const sections = new Map();
  for (const name of [...GROUP_RULES.map(([group]) => group), 'Advanced']) {
    const details = document.createElement('details');
    details.className = 'settings-group';
    details.open = ['Scene Layout', 'Player', 'Physics', 'Placement', '20×20 Stud Build Mat'].includes(name);
    const summary = document.createElement('summary');
    summary.textContent = name;
    const body = document.createElement('div');
    body.className = 'settings-group-body';
    details.append(summary, body);
    groups.append(details);
    sections.set(name, { details, body });
  }
  for (const [key, value] of Object.entries(settings)) {
    if (HIDDEN_SETTINGS.has(key)) continue;
    sections.get(groupFor(key)).body.append(makeControl(key, value, store));
  }
  const layoutInfo = document.createElement('small');
  layoutInfo.dataset.sceneLayoutStatus = '';
  layoutInfo.textContent = 'Base XYZ: offsets from the current base in the fixed world frame. Stop motion before tuning; reset BUILD before rotating the table.';
  sections.get('Scene Layout').body.append(layoutInfo);
  for (const { details, body } of sections.values()) if (!body.childElementCount) details.remove();

  const setOpen = (open) => {
    if (open && document.pointerLockElement) document.exitPointerLock?.();
    panel.classList.toggle('is-open', open);
    panel.classList.toggle('closed', !open);
    panel.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('settings-open', open);
  };
  for (const button of document.querySelectorAll('[data-settings-toggle]')) {
    button.addEventListener('click', () => setOpen(!panel.classList.contains('is-open')));
  }
  panel.querySelector('[data-settings-close]')?.addEventListener('click', () => setOpen(false));
  search?.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    for (const section of panel.querySelectorAll('.settings-group')) {
      let visible = 0;
      for (const row of section.querySelectorAll('[data-setting-row]')) {
        const matches = !query || row.dataset.settingRow.includes(query) || row.textContent.toLowerCase().includes(query);
        row.hidden = !matches;
        if (matches) visible += 1;
      }
      section.hidden = visible === 0;
      if (query && visible) section.open = true;
    }
  });
  addEventListener('keydown', (event) => {
    if (event.target?.matches?.('input,select,textarea')) return;
    if (event.code === 'KeyP') {
      event.preventDefault();
      setOpen(!panel.classList.contains('is-open'));
    }
    if (event.code === 'Escape' && panel.classList.contains('is-open')) setOpen(false);
  });
  document.querySelector('[data-reset-player-settings]')?.addEventListener('click', () => {
    store.reset();
    location.reload();
  });
  const importInput = document.querySelector('[data-import-player-settings]');
  importInput?.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      const result = store.setMany(JSON.parse(await file.text()));
      if (!result.ok) throw new Error(result.reason);
      location.reload();
    } catch (error) {
      onImportError(error);
    } finally {
      importInput.value = '';
    }
  });
  return { setOpen };
}
