'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createMissionHarness } from '../helpers/mission-fakes.js';
import {
  BRIDGE_DESIGN_TOOL_NAMES,
  EXPECTED_FULL_TOOL_COUNT,
  LOW_LEVEL_TOOL_NAMES,
  MISSION_TOOL_NAMES,
  createMainDemoMissionWebMcpBundle
} from '../../apps/web/src/mission/main-demo-mission-runtime.js';

function bridgeTools(onMutation = () => {}) {
  return BRIDGE_DESIGN_TOOL_NAMES.map((name) => ({
    name,
    description: `${name} test tool`,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: !['update_bridge_design', 'reset_bridge_design'].includes(name), untrustedContentHint: false },
    async execute() {
      if (name === 'update_bridge_design' || name === 'reset_bridge_design') onMutation(name);
      return { ok: true, changed: true, planId: 'plan-1', designChecksum: 'checksum-1' };
    }
  }));
}

async function makeBundle(options = {}) {
  const harness = createMissionHarness();
  const bundle = await createMainDemoMissionWebMcpBundle({
    ...harness.services,
    bridgeTools: options.bridgeTools ?? bridgeTools(options.onMutation),
    idFactory: (() => {
      let id = 0;
      return () => `bundle-mission-${++id}`;
    })(),
    now: () => new Date('2026-09-02T10:00:00.000Z')
  });
  return { harness, bundle };
}

test('MAIN_DEMO seam composes one 27-tool surface', async () => {
  const { bundle } = await makeBundle();
  assert.equal(bundle.expectedToolCount, 27);
  assert.equal(EXPECTED_FULL_TOOL_COUNT, 27);
  assert.equal(bundle.additionalTools.length, 13);
  assert.equal(bundle.fullToolNames.length, 27);
  assert.deepEqual(bundle.fullToolNames.slice(0, 14), LOW_LEVEL_TOOL_NAMES);
  assert.deepEqual(bundle.fullToolNames.slice(-8), MISSION_TOOL_NAMES);
  assert.equal(new Set(bundle.fullToolNames).size, 27);
});

test('MAIN_DEMO seam calls the existing registrar exactly once', async () => {
  const { bundle, harness } = await makeBundle();
  const lifecycle = [];
  let calls = 0;
  let receivedRuntime = null;
  let receivedAdditionalTools = null;
  const controller = new AbortController();
  const registrar = async (runtime, onLifecycle, additionalTools) => {
    calls += 1;
    receivedRuntime = runtime;
    receivedAdditionalTools = additionalTools;
    for (const name of [...LOW_LEVEL_TOOL_NAMES, ...additionalTools.map((tool) => tool.name)]) {
      onLifecycle({ status: 'discovered', toolName: name });
    }
    return {
      ok: true,
      toolCount: LOW_LEVEL_TOOL_NAMES.length + additionalTools.length,
      toolNames: [...LOW_LEVEL_TOOL_NAMES, ...additionalTools.map((tool) => tool.name)],
      controller
    };
  };
  const result = await bundle.registerWithExistingRegistrar(registrar, (event) => lifecycle.push(event));
  assert.equal(calls, 1);
  assert.equal(receivedRuntime, harness.runtime);
  assert.equal(receivedAdditionalTools, bundle.additionalTools);
  assert.equal(result.toolCount, 27);
  assert.equal(result.controller, controller);
  assert.equal(lifecycle.filter((event) => event.status === 'discovered').length, 27);
});

test('MAIN_DEMO seam keeps ChallengeService terrain IDs in the registration schema', async () => {
  const { bundle } = await makeBundle();
  const terrain = bundle.missionTools.find((tool) => tool.name === 'select_terrain');
  assert.deepEqual(terrain.inputSchema.properties.challengeId.enum, ['EASY']);
  assert.equal(terrain.inputSchema.properties.challengeId.enum.includes('LOW'), false);
});

test('MAIN_DEMO seam guards bridge mutations after freeze', async () => {
  let mutationCalls = 0;
  const { bundle, harness } = await makeBundle({ onMutation: () => { mutationCalls += 1; } });
  const update = bundle.guardedBridgeTools.find((tool) => tool.name === 'update_bridge_design');
  assert.equal((await update.execute({})).ok, true);
  assert.equal(mutationCalls, 1);
  const state = bundle.service;
  const start = await state.startBridgeBuild({
    expectedMissionId: state.missionId,
    expectedMissionRevision: state.missionRevision,
    expectedWorldRevision: harness.worldRevision,
    expectedDesignRevision: harness.bridgeDesignService.getDesignState().designRevision
  });
  assert.equal(start.ok, true);
  const blocked = await update.execute({});
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error.code, 'INVALID_PHASE');
  assert.equal(mutationCalls, 1);
});

test('MAIN_DEMO seam rejects missing or duplicate bridge tool names', async () => {
  const harness = createMissionHarness();
  await assert.rejects(
    () => createMainDemoMissionWebMcpBundle({ ...harness.services, bridgeTools: bridgeTools().slice(1) }),
    /expected production tool surface/i
  );
  const duplicate = bridgeTools();
  duplicate[4] = { ...duplicate[4], name: duplicate[0].name };
  await assert.rejects(
    () => createMainDemoMissionWebMcpBundle({ ...harness.services, bridgeTools: duplicate }),
    /Duplicate bridge design tool name/i
  );
});
