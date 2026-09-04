'use strict';

import { MissionError } from './errors.js';

const REVISION = {
  type: 'integer',
  minimum: 0,
  description: 'Use the exact revision from the latest successful mission response.'
};

const SESSION = {
  expectedMissionId: {
    type: 'string',
    minLength: 1,
    maxLength: 160,
    pattern: '^[A-Za-z0-9_.:-]+$',
    description: 'Use the exact missionId from get_mission_state.'
  },
  expectedMissionRevision: {
    ...REVISION,
    description: 'Use the exact missionRevision from get_mission_state.'
  },
  expectedWorldRevision: {
    ...REVISION,
    description: 'Use the exact worldRevision from get_mission_state.'
  }
};

const READ_INTERNAL = Object.freeze({ readOnlyHint: true, untrustedContentHint: false });
const READ_CHALLENGE = Object.freeze({ readOnlyHint: true, untrustedContentHint: true });
const WRITE_INTERNAL = Object.freeze({ readOnlyHint: false, untrustedContentHint: false });
const WRITE_CHALLENGE = Object.freeze({ readOnlyHint: false, untrustedContentHint: true });

const tool = (name, description, inputSchema, annotations, execute, onPreCancelled = null) => Object.freeze({
  name,
  description,
  inputSchema,
  annotations,
  execute,
  ...(onPreCancelled ? { onPreCancelled } : {})
});

export function getMissionToolDefinitions(service, { challengeIds = null } = {}) {
  if (!service) throw new MissionError('SERVICE_UNAVAILABLE', 'MissionService is required.');

  const makeTool = (name, description, inputSchema, annotations, execute) => tool(
    name,
    description,
    inputSchema,
    annotations,
    execute,
    () => service._error(new MissionError('CANCELLED', 'The tool call was cancelled before it started.'))
  );

  const mutation = (extra = {}, required = []) => ({
    type: 'object',
    properties: { ...SESSION, ...extra },
    required: [
      'expectedMissionId',
      'expectedMissionRevision',
      'expectedWorldRevision',
      ...required
    ],
    additionalProperties: false
  });

  return [
    makeTool(
      'get_mission_state',
      'Read the concise mission orientation, frozen plan, build progress, robot state, train result, revisions, and legal next actions.',
      {
        type: 'object',
        properties: {
          detail: {
            type: 'string',
            enum: ['summary', 'detail'],
            default: 'summary',
            description: 'Use detail only when freeze, test, or activity evidence is required.'
          },
          eventCursor: {
            type: 'integer',
            minimum: 0,
            default: 0,
            description: 'Start offset for detailed mission events.'
          },
          eventLimit: {
            type: 'integer',
            minimum: 1,
            maximum: 20,
            default: 10,
            description: 'Maximum detailed mission events to return.'
          }
        },
        additionalProperties: false
      },
      READ_CHALLENGE,
      (input = {}) => service.getMissionState(input)
    ),
    makeTool(
      'get_terrain_options',
      'Read one bounded page of terrain options from the active ChallengeService. Do not invent terrain IDs.',
      {
        type: 'object',
        properties: {
          cursor: {
            type: 'integer',
            minimum: 0,
            default: 0,
            description: 'Start offset for terrain options.'
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 20,
            default: 5,
            description: 'Maximum terrain options to return.'
          }
        },
        additionalProperties: false
      },
      READ_CHALLENGE,
      (input = {}) => service.getTerrainOptions(input)
    ),
    makeTool(
      'select_terrain',
      'Select one enabled ChallengeService terrain while the mission is in DESIGN.',
      mutation({
        challengeId: Array.isArray(challengeIds) && challengeIds.length
          ? {
              type: 'string',
              enum: [...new Set(challengeIds)],
              description: 'Select one enabled ID returned by ChallengeService.'
            }
          : {
              type: 'string',
              minLength: 1,
              maxLength: 160,
              pattern: '^[A-Za-z0-9_.:/-]+$',
              description: 'Select one enabled ID returned by get_terrain_options.'
            }
      }, ['challengeId']),
      WRITE_CHALLENGE,
      (input, options = {}) => service.selectTerrain(input, options)
    ),
    makeTool(
      'start_bridge_build',
      'Freeze the exact compiled V4.6 plan and initialise ConstructionService atomically.',
      mutation({
        expectedDesignRevision: {
          ...REVISION,
          description: 'Use the exact designRevision from get_bridge_design.'
        }
      }, ['expectedDesignRevision']),
      WRITE_INTERNAL,
      (input, options = {}) => service.startBridgeBuild(input, options)
    ),
    makeTool(
      'get_build_progress',
      'Read concise authoritative ConstructionService and BuildBoard progress, with a bounded advisory-side collaboration summary for the frozen plan.',
      { type: 'object', properties: {}, additionalProperties: false },
      READ_INTERNAL,
      () => service.getBuildProgress()
    ),
    makeTool(
      'build_next_parts',
      'Place one to five frozen-plan bridge parts using the simulated UR10 robot pick-and-place path with the existing motion, IK, inventory and placement validation.',
      mutation({
        cycleTimeMs: {
          type: 'integer',
          minimum: 250,
          maximum: 60000,
          description: 'Optional bridge placement-cycle request in milliseconds; preserves collision and IK checks. Does not change Simple mode speed settings.'
        },
        actorHint: {
          type: 'string',
          enum: ['human', 'agent'],
          description: 'Optional advisory-side scheduling preference, not permission or actor attribution. Dependencies and acceptance remain authoritative; robot execution is still attributed to the agent.'
        },
        count: {
          type: 'integer',
          minimum: 1,
          maximum: 5,
          description: 'Number of authoritative placements to attempt in this bounded call.'
        }
      }, ['count']),
      WRITE_INTERNAL,
      (input, options = {}) => service.buildNextParts(input, options)
    ),
    makeTool(
      'test_bridge',
      'Run TrainService against the authoritative accepted BUILD_BOARD snapshot bound to the frozen plan. Only CROSSED can complete the mission.',
      mutation(),
      WRITE_INTERNAL,
      (input, options = {}) => service.testBridge(input, options)
    ),
    makeTool(
      'reset_mission',
      'Cancel active build or test work, reset authorised services, invalidate old identities, and create a new DESIGN mission.',
      mutation({
        confirm: {
          type: 'boolean',
          const: true,
          description: 'Must be true because reset invalidates the active mission identity and progress.'
        }
      }, ['confirm']),
      WRITE_INTERNAL,
      (input, options = {}) => service.resetMission(input, options)
    )
  ];
}

export function createMissionToolRuntime(service, options = {}) {
  const tools = getMissionToolDefinitions(service, options);
  const byName = new Map(tools.map((item) => [item.name, item]));
  return Object.freeze({
    tools,
    invoke(name, input = {}, callOptions = {}) {
      const item = byName.get(name);
      if (!item) {
        return service._error(new MissionError(
          'INVALID_PARAMETER',
          `Unknown mission tool: ${String(name)}.`
        ));
      }
      return item.execute(input, callOptions);
    }
  });
}
