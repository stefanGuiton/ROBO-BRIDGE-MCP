import { machineError } from './runtime-bridge.js';

// Keep the public surface deliberately small.  `brightness` is the user-facing
// name for the existing renderer exposure setting; tableColor is already the
// PlayerSettingsStore key used by V8Workbench.
export const SCENE_PRESENTATION_SETTINGS = Object.freeze({
  brightness: Object.freeze({
    sourceKey: 'exposure',
    type: 'number',
    min: 0.1,
    max: 4,
    step: 0.05,
    description: 'Overall renderer brightness, mapped to the existing tone-mapping exposure.'
  }),
  tableColor: Object.freeze({
    sourceKey: 'tableColor',
    type: 'color',
    description: 'Workbench/table surface colour as a six-digit hexadecimal colour.'
  })
});

const SETTING_NAMES = new Set(Object.keys(SCENE_PRESENTATION_SETTINGS));
const HEX_COLOUR = /^#[0-9a-f]{6}$/i;
const NAMED_COLOURS = Object.freeze({
  white: '#ffffff',
  black: '#000000',
  red: '#d71920',
  blue: '#2d78c8',
  yellow: '#f2c230',
  green: '#3b7d3b',
  orange: '#e67e22',
  purple: '#7b4bb7',
  grey: '#666666',
  gray: '#666666',
  'dark grey': '#444444',
  'dark gray': '#444444'
});

const clone = (value) => value === undefined ? undefined : structuredClone(value);
const currentRevision = (revisionClock) => Number(revisionClock?.value);
const validRevision = (value) => Number.isSafeInteger(value) && value >= 0;

function invalid(message, extra = {}) {
  return machineError('invalid_input', message, extra);
}

function normalizeColour(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (HEX_COLOUR.test(trimmed)) return trimmed;
  return NAMED_COLOURS[trimmed] ?? null;
}

function publicSettings(settings) {
  return {
    brightness: Number(settings?.exposure),
    tableColor: typeof settings?.tableColor === 'string' ? settings.tableColor : null
  };
}

function resultWithSettings(settingsStore, revisionClock, extra = {}) {
  const settings = publicSettings(settingsStore.get());
  return { ok: true, ...extra, settings, ...settings, worldRevision: currentRevision(revisionClock) };
}

function validatePatch(input, settings) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid('Scene settings input must be an object.');
  const supplied = Object.keys(input).filter((key) => key !== 'expectedWorldRevision');
  if (!supplied.length) return invalid('Provide at least one supported scene setting to update.');
  const unknown = supplied.find((key) => !SETTING_NAMES.has(key));
  if (unknown) return invalid(`Unsupported scene setting: ${unknown}.`);

  const patch = {};
  if (Object.prototype.hasOwnProperty.call(input, 'brightness')) {
    if (!Number.isFinite(input.brightness)
      || input.brightness < SCENE_PRESENTATION_SETTINGS.brightness.min
      || input.brightness > SCENE_PRESENTATION_SETTINGS.brightness.max) {
      return invalid(`brightness must be a finite number from ${SCENE_PRESENTATION_SETTINGS.brightness.min} to ${SCENE_PRESENTATION_SETTINGS.brightness.max}.`);
    }
    if (!(SCENE_PRESENTATION_SETTINGS.brightness.sourceKey in settings)) return invalid('The renderer exposure setting is unavailable.');
    patch.exposure = input.brightness;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'tableColor')) {
    const colour = normalizeColour(input.tableColor);
    if (!colour) return invalid('tableColor must be a #RRGGBB value or a supported simple colour name.');
    if (!(SCENE_PRESENTATION_SETTINGS.tableColor.sourceKey in settings)) return invalid('The table colour setting is unavailable.');
    patch.tableColor = colour;
  }
  return patch;
}

/**
 * Create the small presentation-settings API over the existing PlayerSettingsStore.
 *
 * The store remains the sole settings authority.  A successful update calls
 * `setMany` once, so the update is all-or-nothing after validation.  Existing
 * production subscribers may bump the shared RevisionClock for the store's
 * `'*'` notification; when no subscriber does so (as in a unit harness), this
 * service performs the one required bump itself.
 */
export function createSceneSettingsService({ settingsStore, revisionClock, canUpdate = null } = {}) {
  if (!settingsStore || typeof settingsStore.get !== 'function' || typeof settingsStore.setMany !== 'function') {
    throw new TypeError('settingsStore with get/setMany is required');
  }
  if (!revisionClock || !validRevision(currentRevision(revisionClock)) || typeof revisionClock.bump !== 'function') {
    throw new TypeError('revisionClock with a non-negative value and bump() is required');
  }

  function getSceneSettings(input = {}) {
    const revision = currentRevision(revisionClock);
    if (input?.expectedWorldRevision !== undefined) {
      if (!validRevision(input.expectedWorldRevision)) return invalid('expectedWorldRevision must be a non-negative safe integer.', { worldRevision: revision });
      if (input.expectedWorldRevision !== revision) {
        return machineError('stale_state', 'Scene settings changed; read the current settings again.', { worldRevision: revision });
      }
    }
    return resultWithSettings(settingsStore, revisionClock, {
      supportedSettings: clone(SCENE_PRESENTATION_SETTINGS),
      sourceOfTruth: 'PlayerSettingsStore'
    });
  }

  function updateSceneSettings(input = {}, options = {}) {
    const revision = currentRevision(revisionClock);
    if (options?.signal?.aborted) return machineError('cancelled', 'Scene settings update was cancelled.', { worldRevision: revision });
    if (!validRevision(input?.expectedWorldRevision)) return invalid('expectedWorldRevision must be a non-negative safe integer.', { worldRevision: revision });
    if (input.expectedWorldRevision !== revision) {
      return machineError('stale_state', 'Scene changed; read scene settings again before updating.', {
        expectedWorldRevision: input.expectedWorldRevision, worldRevision: revision
      });
    }

    const settings = settingsStore.get();
    const patch = validatePatch(input, settings);
    if (patch?.ok === false) return { ...patch, worldRevision: revision };
    if (typeof canUpdate === 'function') {
      const permission = canUpdate({ input: clone(input), patch: clone(patch), worldRevision: revision });
      if (permission === false) return machineError('operation_in_progress', 'Scene settings cannot change while the current operation is active.', { worldRevision: revision });
      if (permission && permission.ok === false) return { ...permission, worldRevision: revision };
    }
    // No await occurs between this check and the synchronous store commit.
    // This makes cancellation a clean pre-commit boundary rather than leaving
    // a partially applied presentation patch.
    if (options?.signal?.aborted) return machineError('cancelled', 'Scene settings update was cancelled.', { worldRevision: revision });

    const applied = settingsStore.setMany(patch);
    if (!applied?.ok) return { ok: false, reason: applied?.reason ?? 'invalid_input', message: applied?.message ?? 'Scene settings update was rejected.', worldRevision: currentRevision(revisionClock) };
    // Complete the shared revision transition before observing a cancellation
    // raised by a synchronous store subscriber.  A committed patch must never
    // be reported with its pre-update revision.
    if (currentRevision(revisionClock) === revision) revisionClock.bump();
    if (options?.signal?.aborted) {
      // The commit is already authoritative and cannot be rolled back safely;
      // report the committed result instead of pretending cancellation undid it.
      return resultWithSettings(settingsStore, revisionClock, {
        changed: Object.keys(patch), cancellationBoundary: 'committed'
      });
    }
    return resultWithSettings(settingsStore, revisionClock, { changed: Object.keys(patch) });
  }

  return Object.freeze({ getSceneSettings, updateSceneSettings });
}

export function createSceneSettingsTools(options = {}) {
  const service = createSceneSettingsService(options);
  return Object.freeze([
    {
      name: 'get_scene_settings',
      description: 'Read the current presentation settings shared by the Player, renderer, and WebMCP. Returns overall brightness and table colour without changing world state.',
      inputSchema: {
        type: 'object',
        properties: {
          expectedWorldRevision: { type: 'integer', minimum: 0, description: 'Optional exact worldRevision for a consistent read.' }
        },
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: (input = {}) => service.getSceneSettings(input)
    },
    {
      name: 'update_scene_settings',
      description: 'Atomically update safe presentation settings through the existing PlayerSettingsStore. brightness maps to renderer exposure; tableColor accepts #RRGGBB or a supported simple colour name. Requires the latest exact worldRevision.',
      inputSchema: {
        type: 'object',
        properties: {
          brightness: { type: 'number', minimum: 0.1, maximum: 4, description: 'Renderer exposure / overall brightness.' },
          tableColor: { type: 'string', minLength: 1, maxLength: 16, description: 'Table/workbench colour, preferably #RRGGBB; simple colour names are normalized.' },
          expectedWorldRevision: { type: 'integer', minimum: 0, description: 'Exact worldRevision from the latest successful read or tool result.' }
        },
        required: ['expectedWorldRevision'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input = {}, callOptions = {}) => service.updateSceneSettings(input, callOptions)
    }
  ]);
}
