import { RECOLOUR_PALETTE } from '../bricks/recolour-palette.js';

export function createRecolourLooseBricksTool({ controller, coordinator, runner, isSimpleMode }) {
  return {
    name: 'recolour_loose_bricks',
    description: 'Simulation-only colour edit of 1–50 explicit loose brick IDs. Does not move, spawn, or recolour placed, held, reserved or bridge parts. Read inventory first; requires exact worldRevision. Simple mode only.',
    inputSchema: { type: 'object', properties: {
      changes: { type: 'array', minItems: 1, maxItems: 50, items: {
        type: 'object', properties: {
          brickId: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9_.:-]+$' },
          colour: { type: 'string', enum: [...RECOLOUR_PALETTE] }
        }, required: ['brickId', 'colour'], additionalProperties: false
      } },
      expectedWorldRevision: { type: 'integer', minimum: 0 }
    }, required: ['changes', 'expectedWorldRevision'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, untrustedContentHint: false },
    execute(input = {}, options = {}) {
      const fail = reason => ({ ok: false, reason, worldRevision: controller.worldRevision });
      if (options.signal?.aborted) return fail('cancelled');
      if (!isSimpleMode()) return fail('unsupported_demo_level');
      if (!input || Object.keys(input).some(k => !['changes', 'expectedWorldRevision'].includes(k))) return fail('invalid_input');
      const state = coordinator.getState();
      if (runner.getState().running || state.running) return fail('operation_in_progress');
      return controller.recolourLooseBricks({ ...input, signal: options.signal,
        reservedBrickIds: (state.queue ?? []).map(p => p.brickId).filter(Boolean), actor: 'agent' });
    }
  };
}
