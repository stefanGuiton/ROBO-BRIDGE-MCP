function isRejected(result) {
  return result?.ok === false || result?.success === false;
}

function normalizeResult(result) {
  if (result && result.ok === undefined && typeof result.success === 'boolean') {
    return { ok: result.success, ...result };
  }
  return result;
}

function errorResult(error, api) {
  return {
    ok: false,
    reason: error?.code ?? 'tool_execution_error',
    details: error?.details ?? { message: String(error?.message ?? error) },
    robot: api.getRobotState?.() ?? null
  };
}

export async function registerLogoWebMcpTools(api, onLifecycle = () => {}) {
  const modelContext = document.modelContext;
  if (!modelContext?.registerTool) {
    return { ok: false, reason: 'document.modelContext is unavailable. Use a WebMCP-enabled secure browser context.' };
  }

  const tools = [
    {
      name: 'get_scene_state',
      description: 'Read the authoritative LOGO ROBO workcell state, including the tray, board target, and brick pose.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: async () => api.getSceneState()
    },
    {
      name: 'get_robot_state',
      description: 'Read the authoritative UR10-class Cartesian TCP, joints, revisions, motion state, and held brick.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: async () => api.getRobotState()
    },
    {
      name: 'get_workspace',
      description: 'Read the bounded Cartesian workspace and motion speed limit in millimetres.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: async () => api.getWorkspace()
    },
    {
      name: 'move_tool',
      description: 'Move the shared UR10-class TCP to a reachable Cartesian target. Invalid motion fails closed and preserves the last accepted pose.',
      inputSchema: {
        type: 'object',
        properties: {
          xMm: { type: 'number', minimum: 470, maximum: 710, description: 'Machine X in millimetres.' },
          yMm: { type: 'number', minimum: -275, maximum: 275, description: 'Machine Y in millimetres.' },
          zMm: { type: 'number', minimum: 40, maximum: 470, description: 'Machine Z in millimetres.' },
          speedMmS: { type: 'number', exclusiveMinimum: 0, maximum: 650, description: 'TCP speed in millimetres per second.' }
        },
        required: ['xMm', 'yMm', 'zMm', 'speedMmS'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input, options = {}) => api.moveTool(input, { signal: options.signal })
    },
    {
      name: 'latch',
      description: 'Latch the single generic 2x4 brick when the TCP is within the measured capture envelope.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async () => normalizeResult(await api.latch())
    },
    {
      name: 'unlatch',
      description: 'Release the held brick and report whether the board adapter accepted a measured snap.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async () => normalizeResult(await api.unlatch())
    },
    {
      name: 'reset_workcell',
      description: 'Reset the authoritative robot, brick, board target, and revisions to the deterministic starting state.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async () => api.resetScene()
    }
  ];

  const controller = new AbortController();
  for (const tool of tools) {
    const execute = tool.execute;
    const registeredTool = {
      ...tool,
      async execute(...args) {
        onLifecycle({ status: 'executing', toolName: tool.name });
        try {
          const result = await execute(...args);
          const status = isRejected(result) ? 'rejected' : 'succeeded';
          onLifecycle({ status, toolName: tool.name, reason: result?.reason ?? null });
          return result;
        } catch (error) {
          const result = errorResult(error, api);
          onLifecycle({ status: 'rejected', toolName: tool.name, reason: result.reason });
          return result;
        }
      }
    };
    await modelContext.registerTool(registeredTool, { signal: controller.signal });
    onLifecycle({ status: 'discovered', toolName: tool.name });
  }
  return { ok: true, toolCount: tools.length, toolNames: tools.map((tool) => tool.name), controller };
}
