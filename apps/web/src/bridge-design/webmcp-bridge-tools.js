'use strict';

import { bridgePatchJsonSchema, BRIDGE_FAMILIES } from './bridge-spec.js';
import { BridgeDesignError, errorResult } from './errors.js';

const REVISION_SCHEMA = {
  type: 'integer',
  minimum: 0,
  description: 'Exact designRevision from the most recent successful bridge-design read or mutation result.'
};

function validatePlainInput(input, allowedKeys, requiredKeys = []) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return errorResult(new BridgeDesignError('INVALID_PARAMETER', 'Tool input must be an object.'));
  }
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(input).find((key) => !allowed.has(key));
  if (unknown) {
    return errorResult(new BridgeDesignError('INVALID_PARAMETER', `Unknown tool input property: ${unknown}.`, { path: unknown }));
  }
  const missing = requiredKeys.find((key) => !Object.prototype.hasOwnProperty.call(input, key));
  if (missing) {
    return errorResult(new BridgeDesignError('INVALID_PARAMETER', `Missing required tool input property: ${missing}.`, { path: missing }));
  }
  return null;
}

function checkedExecute(validate, execute) {
  return async (input = {}, options = {}) => {
    const failure = validate(input);
    return failure || execute(input, options);
  };
}

function boundedJson(value, maxChars = 16000) {
  const candidate = typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
  const arrays = ['placements', 'definitions'];
  for (const key of arrays) {
    if (!Array.isArray(candidate?.[key])) continue;
    const totalAvailable = candidate.totalAvailable ?? candidate[key].length;
    while (candidate[key].length > 1 && JSON.stringify(candidate).length > maxChars) candidate[key].pop();
    if (candidate[key].length < totalAvailable) {
      candidate.truncated = true;
      candidate.returnedCount = candidate[key].length;
      candidate.totalAvailable = totalAvailable;
      candidate.nextCursor = (candidate.cursor || 0) + candidate[key].length;
    }
  }
  const text = JSON.stringify(candidate);
  if (text.length <= maxChars) return text;
  return JSON.stringify({
    ok: candidate?.ok !== false,
    error: candidate?.ok === false ? candidate.error : undefined,
    designRevision: candidate?.designRevision ?? candidate?.summary?.designRevision ?? null,
    planId: candidate?.planId ?? candidate?.summary?.planId ?? null,
    designChecksum: candidate?.designChecksum ?? candidate?.summary?.designChecksum ?? null,
    truncated: true,
    message: 'The tool result was reduced to the bounded response size.'
  });
}

export function getBridgeDesignToolDefinitions(service) {
  return [
    {
      name: 'get_bridge_design',
      description: 'Read the authoritative V4.6 bridge family, public BridgeSpec, exact design revision, plan ID/checksum, ENTRY/EXIT data, useful bounds, and bounded BuildPlan summary.',
      inputSchema: {
        type: 'object',
        properties: {
          includeCapabilities: { type: 'boolean', default: true, description: 'Include bounded parameter definitions and limits.' }
        },
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: checkedExecute((input) => {
        const failure = validatePlainInput(input, ['includeCapabilities']);
        if (failure) return failure;
        if (input.includeCapabilities !== undefined && typeof input.includeCapabilities !== 'boolean') {
          return errorResult(new BridgeDesignError('INVALID_PARAMETER', 'includeCapabilities must be boolean.', { path: 'includeCapabilities' }));
        }
        return null;
      }, (input) => service.getDesignState({ includeCapabilities: input.includeCapabilities !== false }))
    },
    {
      name: 'get_bridge_capabilities',
      description: 'Read supported bridge families, patch semantics, public parameter names, types, bounds, and enums. This does not change the bridge.',
      inputSchema: {
        type: 'object',
        properties: {
          family: { type: 'string', enum: [...BRIDGE_FAMILIES], description: 'Optional family filter.' }
        },
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: checkedExecute((input) => validatePlainInput(input, ['family']),
        (input) => service.getCapabilities(input.family ?? null))
    },
    {
      name: 'update_bridge_design',
      description: 'Atomically merge a partial public BridgeSpec patch and compile one exact BuildPlan. Terrain7 hero: change NUMBER OF ARCHES with patch.viaduct.archCount (read the current design first). Unspecified values remain unchanged. A family switch starts from that family’s tested V4.6 preset.',
      inputSchema: {
        type: 'object',
        properties: {
          expectedDesignRevision: REVISION_SCHEMA,
          patch: bridgePatchJsonSchema()
        },
        required: ['expectedDesignRevision', 'patch'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: checkedExecute((input) => validatePlainInput(input, ['expectedDesignRevision', 'patch'], ['expectedDesignRevision', 'patch']),
        (input, options) => service.patchBridgeSpec(input.patch, input.expectedDesignRevision, options))
    },
    {
      name: 'get_bridge_build_plan',
      description: 'Read a bounded view of the authoritative BuildPlan 4.6. Summary is the default. Placements and custom definitions are paged and never return the complete large plan by default.',
      inputSchema: {
        type: 'object',
        properties: {
          detail: { type: 'string', enum: ['summary', 'bom', 'anchors', 'placements', 'definitions'], default: 'summary' },
          cursor: { type: 'integer', minimum: 0, default: 0 },
          limit: { type: 'integer', minimum: 1, maximum: 25, default: 20 }
        },
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: checkedExecute((input) => validatePlainInput(input, ['detail', 'cursor', 'limit']),
        (input) => service.getBuildPlan(input))
    },
    {
      name: 'reset_bridge_design',
      description: 'Atomically reset the authoritative design to a tested V4.6 aqueduct or viaduct preset and compile a new BuildPlan.',
      inputSchema: {
        type: 'object',
        properties: {
          expectedDesignRevision: REVISION_SCHEMA,
          family: { type: 'string', enum: [...BRIDGE_FAMILIES], description: 'Preset family. Defaults to the current family.' }
        },
        required: ['expectedDesignRevision'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: checkedExecute((input) => validatePlainInput(input, ['expectedDesignRevision', 'family'], ['expectedDesignRevision']),
        (input, options) => service.resetBridgeDesign(input.family, input.expectedDesignRevision, options))
    }
  ];
}

export function createBridgeToolRuntime(service) {
  const tools = getBridgeDesignToolDefinitions(service);
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  return Object.freeze({
    tools,
    async invoke(name, input = {}, options = {}) {
      const tool = byName.get(name);
      if (!tool) return errorResult(new BridgeDesignError('INVALID_PARAMETER', `Unknown bridge tool: ${String(name)}.`));
      try {
        return await tool.execute(input, options);
      } catch (error) {
        return errorResult(error);
      }
    }
  });
}

let activeRegistrationController = null;

export async function registerBridgeWebMcpTools({
  service,
  modelContext = globalThis.document?.modelContext,
  onLifecycle = () => {},
  maxResultChars = 16000
} = {}) {
  if (!service) return { ok: false, reason: 'runtime_unavailable', message: 'BridgeDesignService is unavailable.' };
  if (!modelContext?.registerTool) {
    return {
      ok: false,
      reason: 'native_webmcp_unavailable',
      message: 'document.modelContext.registerTool is unavailable in this browser.'
    };
  }
  const tools = getBridgeDesignToolDefinitions(service);
  activeRegistrationController?.abort();
  activeRegistrationController = new AbortController();
  const registeredNames = [];
  try {
    for (const tool of tools) {
      await modelContext.registerTool({
        ...tool,
        async execute(input = {}, options = {}) {
          onLifecycle({ status: 'executing', toolName: tool.name });
          if (options.signal?.aborted) {
            const cancelled = errorResult(new BridgeDesignError('CANCELLED', 'The tool call was cancelled before it started.'));
            onLifecycle({ status: 'rejected', toolName: tool.name, reason: 'CANCELLED' });
            return boundedJson(cancelled, maxResultChars);
          }
          let result;
          try {
            result = await tool.execute(input, options);
          } catch (error) {
            result = errorResult(error);
          }
          onLifecycle({
            status: result?.ok === false ? 'rejected' : 'succeeded',
            toolName: tool.name,
            reason: result?.error?.code ?? null
          });
          return boundedJson(result, maxResultChars);
        }
      }, { signal: activeRegistrationController.signal });
      registeredNames.push(tool.name);
      onLifecycle({ status: 'discovered', toolName: tool.name });
    }
  } catch (error) {
    activeRegistrationController.abort();
    return {
      ok: false,
      reason: 'tool_registration_failed',
      registeredNames,
      message: String(error?.message || 'Tool registration failed.')
    };
  }
  return {
    ok: true,
    toolCount: tools.length,
    toolNames: tools.map((tool) => tool.name),
    controller: activeRegistrationController
  };
}

export { boundedJson };
