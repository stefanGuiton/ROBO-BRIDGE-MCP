function compact(value) {
  const text = JSON.stringify(value);
  return text.length <= 1450 ? text : `${text.slice(0, 1410)}…"truncated":true}`;
}

export async function registerWebMcpTools(api) {
  const modelContext = document.modelContext;
  if (!modelContext?.registerTool) {
    return { ok: false, reason: 'document.modelContext is unavailable. Use a WebMCP-enabled secure browser context.' };
  }

  const tools = [
    {
      name: 'get_scene_state',
      description: 'Return structured workcell objects, bins, obstacles, positions, sizes, colours, and graspability. Use before planning manipulation.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: async () => compact(api.getSceneState())
    },
    {
      name: 'get_robot_state',
      description: 'Return the SCARA joint state, Cartesian end-effector state, gripper state, workspace, and current operation.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: async () => compact(api.getRobotState())
    },
    {
      name: 'analyse_reachability',
      description: 'Check whether one Cartesian target is reachable without changing robot state. Coordinates are millimetres in the robot machine frame.',
      inputSchema: {
        type: 'object',
        properties: {
          xMm: { type: 'number', description: 'Machine X in millimetres.' },
          yMm: { type: 'number', description: 'Machine Y in millimetres.' },
          zMm: { type: 'number', description: 'Machine Z in millimetres.' }
        },
        required: ['xMm', 'yMm', 'zMm'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: async (input) => compact(api.analyseReachability(input))
    },
    {
      name: 'move_end_effector',
      description: 'Move the shared SCARA end effector to a reachable Cartesian target. Invalid requests fail closed and preserve the last accepted pose.',
      inputSchema: {
        type: 'object',
        properties: {
          xMm: { type: 'number', description: 'Machine X in millimetres.' },
          yMm: { type: 'number', description: 'Machine Y in millimetres.' },
          zMm: { type: 'number', description: 'Machine Z in millimetres.' }
        },
        required: ['xMm', 'yMm', 'zMm'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input) => compact(api.moveEndEffector(input))
    },
    {
      name: 'set_gripper',
      description: 'Set the parallel gripper opening. Use 1 for fully open and 0 for fully closed.',
      inputSchema: {
        type: 'object',
        properties: {
          openFraction: { type: 'number', minimum: 0, maximum: 1, description: 'Opening from 0 closed to 1 open.' }
        },
        required: ['openFraction'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input) => compact(api.setGripper(input.openFraction))
    },
    {
      name: 'plan_pick_and_place',
      description: 'Create and display a fail-closed SCARA pick-and-place plan between one graspable object and one destination bin. This does not execute it.',
      inputSchema: {
        type: 'object',
        properties: {
          objectId: { type: 'string', description: 'ID of a graspable scene object.' },
          destinationId: { type: 'string', description: 'ID of a destination bin.' }
        },
        required: ['objectId', 'destinationId'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input) => compact(api.planPickAndPlace(input.objectId, input.destinationId))
    },
    {
      name: 'simulate_trajectory',
      description: 'Validate the current plan with the Newton service when available, or the deterministic browser fallback. Returns collisions and grasp status.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: async (_input, options = {}) => compact(await api.simulateCurrentPlan({ signal: options.signal }))
    },
    {
      name: 'execute_trajectory',
      description: 'Execute the current physics-validated trajectory in the shared workcell. Refuses execution when no successful validation exists.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (_input, options = {}) => compact(await api.executeCurrentPlan({ signal: options.signal }))
    },
    {
      name: 'reset_workcell',
      description: 'Reset the robot, gripper, objects, current plan, and physics result to the deterministic starting state.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async () => compact(api.resetWorkcell())
    }
  ];

  const controller = new AbortController();
  for (const tool of tools) {
    await modelContext.registerTool(tool, { signal: controller.signal });
  }
  return { ok: true, toolCount: tools.length, toolNames: tools.map((tool) => tool.name), controller };
}
