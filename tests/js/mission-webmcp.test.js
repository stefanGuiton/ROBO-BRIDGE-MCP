'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createMissionHarness } from '../helpers/mission-fakes.js';
import { getMissionToolDefinitions } from '../../apps/web/src/mission/webmcp-mission-tools.js';

const NAMES = [
  'get_mission_state',
  'get_terrain_options',
  'select_terrain',
  'start_bridge_build',
  'get_build_progress',
  'build_next_parts',
  'test_bridge',
  'reset_mission'
];

test('eight unique outcome tools are exposed', () => {
  const harness = createMissionHarness();
  const tools = getMissionToolDefinitions(harness.service);
  assert.deepEqual(tools.map((tool) => tool.name), NAMES);
  assert.equal(new Set(NAMES).size, 8);
  for (const tool of tools) {
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(typeof tool.annotations.untrustedContentHint, 'boolean');
  }
});

test('annotations match read and mutation effects', () => {
  const harness = createMissionHarness();
  const map = new Map(harness.tools.map((tool) => [tool.name, tool]));
  for (const name of ['get_mission_state', 'get_terrain_options', 'get_build_progress']) {
    assert.equal(map.get(name).annotations.readOnlyHint, true, name);
  }
  for (const name of ['select_terrain', 'start_bridge_build', 'build_next_parts', 'test_bridge', 'reset_mission']) {
    assert.equal(map.get(name).annotations.readOnlyHint, false, name);
  }
});

test('challenge-derived results are marked as possibly untrusted', () => {
  const harness = createMissionHarness();
  const map = new Map(harness.tools.map((tool) => [tool.name, tool]));
  for (const name of ['get_mission_state', 'get_terrain_options', 'select_terrain']) {
    assert.equal(map.get(name).annotations.untrustedContentHint, true, name);
  }
  for (const name of ['start_bridge_build', 'get_build_progress', 'build_next_parts', 'test_bridge', 'reset_mission']) {
    assert.equal(map.get(name).annotations.untrustedContentHint, false, name);
  }
});

test('all mutations require exact mission and world revisions', () => {
  const harness = createMissionHarness();
  for (const tool of harness.tools.filter((item) => !item.annotations.readOnlyHint)) {
    for (const field of ['expectedMissionId', 'expectedMissionRevision', 'expectedWorldRevision']) {
      assert.ok(tool.inputSchema.required.includes(field), `${tool.name}:${field}`);
    }
  }
});

test('build batch schema is one to five', () => {
  const harness = createMissionHarness();
  const tool = harness.tools.find((item) => item.name === 'build_next_parts');
  assert.equal(tool.inputSchema.properties.count.minimum, 1);
  assert.equal(tool.inputSchema.properties.count.maximum, 5);
});

test('reset requires explicit true confirmation', () => {
  const harness = createMissionHarness();
  const tool = harness.tools.find((item) => item.name === 'reset_mission');
  assert.equal(tool.inputSchema.properties.confirm.const, true);
});

test('live registration schema derives enabled terrain IDs', async () => {
  const harness = createMissionHarness();
  const tools = await harness.getToolsForRegistration();
  const terrain = tools.find((tool) => tool.name === 'select_terrain');
  assert.deepEqual(terrain.inputSchema.properties.challengeId.enum, ['EASY']);
});

test('bridge mutation guard blocks changes outside DESIGN', async () => {
  const harness = createMissionHarness();
  let calls = 0;
  const base = [
    { name: 'get_bridge_design', execute: async () => ({ ok: true }) },
    {
      name: 'update_bridge_design',
      execute: async () => {
        calls += 1;
        return { ok: true, changed: true, planId: 'p', designChecksum: 'c' };
      }
    }
  ];
  const guarded = harness.guardBridgeTools(base);
  assert.equal((await guarded[1].execute({})).ok, true);
  assert.equal(calls, 1);
  await harness.startBuild();
  const blocked = await guarded[1].execute({});
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error.code, 'INVALID_PHASE');
  assert.equal(calls, 1);
});

test('bridge guard rejects duplicate names', () => {
  const harness = createMissionHarness();
  const tool = { name: 'update_bridge_design', execute: async () => ({ ok: true }) };
  assert.throws(() => harness.guardBridgeTools([tool, tool]), /Duplicate/);
});

test('14 low-level plus five bridge plus eight mission equals 27 unique names', () => {
  const low = [
    'get_scene_state', 'get_build_state', 'get_robot_state', 'get_workspace',
    'observe_camera', 'preview_placement', 'get_placement_stream_status',
    'plan_placement_queue', 'execute_next_placement', 'move_tool', 'latch',
    'unlatch', 'claim_target', 'reset_workcell'
  ];
  const bridge = [
    'get_bridge_design', 'get_bridge_capabilities', 'update_bridge_design',
    'get_bridge_build_plan', 'reset_bridge_design'
  ];
  const harness = createMissionHarness();
  const all = [...low, ...bridge, ...harness.tools.map((tool) => tool.name)];
  assert.equal(all.length, 27);
  assert.equal(new Set(all).size, 27);
});

test('mission tools provide a consistent pre-cancel error envelope for the registrar', () => {
  const harness = createMissionHarness();
  const state = harness.tools.find((tool) => tool.name === 'get_mission_state');
  const result = state.onPreCancelled();
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'CANCELLED');
  assert.equal(result.missionId, harness.service.missionId);
  assert.equal(result.phase, 'DESIGN');
});

test('registration schema discovery follows dynamically budgeted terrain pages', async () => {
  const harness = createMissionHarness();
  const options = Array.from({ length: 6 }, (_, index) => ({
    id: `EASY_${index}`,
    label: 'L'.repeat(80),
    description: 'D'.repeat(120),
    checksum: `challenge-${index}-` + 'C'.repeat(220),
    enabled: true
  }));
  harness.challengeService.getOptions = async ({ cursor = 0, limit = 20 } = {}) => ({
    ok: true,
    options: options.slice(cursor, cursor + limit),
    totalAvailable: options.length,
    nextCursor: cursor + limit < options.length ? cursor + limit : null
  });
  harness.challengeService.getActiveChallenge = async () => ({ ok: true, challenge: options[0] });
  const tools = await harness.getToolsForRegistration();
  const terrain = tools.find((tool) => tool.name === 'select_terrain');
  assert.deepEqual(terrain.inputSchema.properties.challengeId.enum, options.map((item) => item.id));
});

test('registration fails closed when ChallengeService has no enabled terrain', async () => {
  const harness = createMissionHarness();
  const disabled = { id: 'LOCKED', label: 'Locked', checksum: 'locked-checksum', enabled: false };
  harness.challengeService.getOptions = async () => ({ ok: true, options: [disabled], totalAvailable: 1, nextCursor: null });
  harness.challengeService.getActiveChallenge = async () => ({ ok: true, challenge: disabled });
  await assert.rejects(() => harness.getToolsForRegistration(), /no enabled terrain IDs/i);
});
