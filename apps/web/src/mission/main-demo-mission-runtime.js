'use strict';

import { createMissionPackage } from './create-mission-package.js';
import { MissionError } from './errors.js';

export const LOW_LEVEL_TOOL_NAMES = Object.freeze([
  'get_scene_state',
  'get_build_state',
  'get_robot_state',
  'get_workspace',
  'observe_camera',
  'preview_placement',
  'get_placement_stream_status',
  'plan_placement_queue',
  'execute_next_placement',
  'move_tool',
  'latch',
  'unlatch',
  'claim_target',
  'reset_workcell'
]);

export const BRIDGE_DESIGN_TOOL_NAMES = Object.freeze([
  'get_bridge_design',
  'get_bridge_capabilities',
  'update_bridge_design',
  'get_bridge_build_plan',
  'reset_bridge_design'
]);

export const MISSION_TOOL_NAMES = Object.freeze([
  'get_mission_state',
  'get_terrain_options',
  'select_terrain',
  'start_bridge_build',
  'get_build_progress',
  'build_next_parts',
  'test_bridge',
  'reset_mission'
]);

export const EXPECTED_FULL_TOOL_COUNT =
  LOW_LEVEL_TOOL_NAMES.length + BRIDGE_DESIGN_TOOL_NAMES.length + MISSION_TOOL_NAMES.length;

function assertExactNames(tools, expectedNames, groupName) {
  if (!Array.isArray(tools)) {
    throw new MissionError('INVALID_PARAMETER', `${groupName} must be an array.`);
  }
  const names = tools.map((tool) => tool?.name);
  const duplicate = names.find((name, index) => names.indexOf(name) !== index);
  if (duplicate !== undefined) {
    throw new MissionError('INVALID_PARAMETER', `Duplicate ${groupName} tool name: ${String(duplicate)}.`);
  }
  const missing = expectedNames.filter((name) => !names.includes(name));
  const unexpected = names.filter((name) => !expectedNames.includes(name));
  if (missing.length || unexpected.length || names.length !== expectedNames.length) {
    throw new MissionError(
      'INVALID_PARAMETER',
      `${groupName} does not match the expected production tool surface.`,
      { missing, unexpected }
    );
  }
}

function assertUniqueFullSurface(additionalTools) {
  const names = [...LOW_LEVEL_TOOL_NAMES, ...additionalTools.map((tool) => tool.name)];
  const duplicate = names.find((name, index) => names.indexOf(name) !== index);
  if (duplicate !== undefined) {
    throw new MissionError('INVALID_PARAMETER', `Duplicate full-surface tool name: ${duplicate}.`);
  }
  if (names.length !== EXPECTED_FULL_TOOL_COUNT) {
    throw new MissionError(
      'INVALID_PARAMETER',
      `Expected ${EXPECTED_FULL_TOOL_COUNT} tools but composed ${names.length}.`
    );
  }
  return Object.freeze([...names]);
}

/**
 * Prepare the mission and bridge tools for the existing native WebMCP registrar.
 * This function does not register a native tool and does not own registration.
 */
export async function createMainDemoMissionWebMcpBundle({
  bridgeHost,
  bridgeDesignService,
  bridgeTools,
  constructionService,
  trainService,
  challengeService,
  robotController,
  runtime,
  eventSink = () => {},
  events = null,
  idFactory,
  now,
  maximumTerrainOptions = 100
} = {}) {
  assertExactNames(bridgeTools, BRIDGE_DESIGN_TOOL_NAMES, 'bridge design');

  const missionPackage = createMissionPackage({
    bridgeHost,
    bridgeDesignService,
    constructionService,
    trainService,
    challengeService,
    robotController,
    runtime,
    eventSink,
    events
  }, { idFactory, now });

  const guardedBridgeTools = missionPackage.guardBridgeTools(bridgeTools);
  const missionTools = await missionPackage.getToolsForRegistration({
    maximumOptions: maximumTerrainOptions
  });
  assertExactNames(missionTools, MISSION_TOOL_NAMES, 'mission');

  const additionalTools = Object.freeze([...guardedBridgeTools, ...missionTools]);
  const fullToolNames = assertUniqueFullSurface(additionalTools);

  return Object.freeze({
    missionPackage,
    service: missionPackage.service,
    events: missionPackage.events,
    guardedBridgeTools,
    missionTools,
    additionalTools,
    fullToolNames,
    expectedToolCount: EXPECTED_FULL_TOOL_COUNT,

    /**
     * Call the existing registerWebMcpTools function exactly once.
     */
    registerWithExistingRegistrar(registerWebMcpTools, onLifecycle = () => {}) {
      if (typeof registerWebMcpTools !== 'function') {
        throw new MissionError('INVALID_PARAMETER', 'registerWebMcpTools must be a function.');
      }
      return registerWebMcpTools(runtime, onLifecycle, additionalTools);
    }
  });
}
