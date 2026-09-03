import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { constructionHarness } from '../helpers/construction-harness.js';
import { BuildBoard } from '../../apps/web/src/bricks/build-board.js';
import { PlacementAuthority } from '../../apps/web/src/bricks/placement-authority.js';
import { sourceToControllerBrick } from '../../apps/web/src/bridge-construction/bridge-part-inventory.js';
import { createBridgePlacementQueueEntries } from '../../apps/web/src/bridge-construction/bridge-build-adapter.js';
import { ConnectionGraph } from '../../apps/web/src/player/connection-graph.js';
import { HumanBuildAdapter } from '../../apps/web/src/player/human-build-adapter.js';
import { PlacementIntentEngine } from '../../apps/web/src/player/placement-intent.js';
import { PLAYER_FALLBACK_SETTINGS } from '../../apps/web/src/player/player-settings.js';
import { RobotController } from '../../apps/web/src/robot/controller.js';
import { PlacementLookaheadCoordinator } from '../../apps/web/src/robot/placement-lookahead.js';
import { PlannedPlacementCycleRunner } from '../../apps/web/src/robot/placement-cycle-runner.js';
import { RevisionClock } from '../../apps/web/src/state/revision-clock.js';

const settings = {
  ...PLAYER_FALLBACK_SETTINGS,
  ...JSON.parse(await readFile(new URL('../../apps/web/config/player/LOGO_ROBO_PLAYER_SETTINGS.json', import.meta.url), 'utf8'))
};

const expectedHeroClasses = ['1x1x1', '1x2x1', 'ARCH_A', 'ARCH_B', 'TRACK_SEGMENT'];

function heroClass(placement) {
  return placement.partClass === 'STANDARD_BRICK' ? placement.partType : placement.partClass;
}

function makeSharedAuthority({ profile, targetSet, sourceRecords }) {
  const clock = new RevisionClock();
  const board = new BuildBoard({
    blueprintId: `class-proof.${targetSet[0].partClass}.${targetSet[0].partType}`,
    targets: targetSet.map((target) => ({
      ...target,
      dependencyIds: [],
      requiresStructureComplete: false
    }))
  }, { revisionClock: clock, mode: 'co-build' });
  const sourcePoses = [
    { xMm: 440, yMm: 245, yawRad: Math.PI / 2 },
    { xMm: 620, yMm: 245, yawRad: Math.PI / 2 }
  ];
  const bricks = sourceRecords.map((source, index) => sourceToControllerBrick(source, sourcePoses[index]));
  const controller = new RobotController({
    board,
    bricks,
    revisionClock: clock,
    workspace: profile.workspace,
    layout: profile.layout,
    timeScale: 0
  });
  const graph = new ConnectionGraph(settings);
  const placementEngine = new PlacementIntentEngine(settings, board, graph);
  const authority = new PlacementAuthority({
    board,
    graph,
    placementEngine,
    settings,
    getBricks: () => controller.getBricks(),
    profile
  });
  controller.setPlacementAuthority(authority);
  const human = new HumanBuildAdapter({ controller, board, graph, placementEngine });
  const coordinator = new PlacementLookaheadCoordinator({
    controller,
    placementAuthority: authority,
    workcellProfile: profile
  });
  const runner = new PlannedPlacementCycleRunner({ controller, coordinator });
  return { board, controller, authority, human, coordinator, runner };
}

test('every current hero part class is shared by Human and Codex through one inventory and BuildBoard', async (t) => {
  const current = await constructionHarness();
  current.service.startBuild({ expectedWorldRevision: current.controller.worldRevision });
  const prepared = current.service.preparedBuild;
  const groups = new Map();
  for (const placement of prepared.normalisedBuild.placements) {
    const key = heroClass(placement);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(placement);
  }

  assert.deepEqual([...groups.keys()].sort(), [...expectedHeroClasses].sort());

  for (const partClass of expectedHeroClasses) {
    await t.test(partClass, async () => {
      const placements = groups.get(partClass);
      assert.ok(placements?.length >= 2, `${partClass} needs two current BuildPlan placements for the shared-actor proof`);
      const selected = placements.slice(0, 2).map((placement) => ({
        ...placement,
        dependencyIds: [],
        requiresStructureComplete: false
      }));
      const targets = selected.map((placement) => prepared.targetSet.targets.find((target) => target.targetId === placement.placementId));
      const sources = selected.map((placement) => prepared.inventory.list().find((source) => source.dedicatedPlacementId === placement.placementId));

      assert.ok(targets.every(Boolean));
      assert.ok(sources.every(Boolean));
      for (const placement of selected) {
        const registryRecord = prepared.registry.resolve(placement);
        assert.deepEqual(registryRecord.allowedActors, ['human', 'agent']);
        assert.equal(registryRecord.robotSupport.enabled, true);
      }
      assert.ok(sources.every((source) => source.allowedActors.includes('human') && source.allowedActors.includes('agent')));

      const h = makeSharedAuthority({ profile: current.profile, targetSet: targets, sourceRecords: sources });

      const humanPreview = h.authority.preview({
        brickId: sources[0].sourceId,
        position: targets[0].position,
        yawRad: targets[0].yawRad
      });
      assert.equal(humanPreview.ok, true, JSON.stringify(humanPreview));
      assert.equal(h.human.pickup(sources[0].sourceId).ok, true);
      assert.equal(h.human.setPreview(humanPreview.candidate), true);
      const humanResult = h.human.release();
      assert.equal(humanResult.ok, true, JSON.stringify(humanResult));

      const queueEntries = createBridgePlacementQueueEntries([selected[1]], {
        acceptedPlacementIds: new Set([selected[0].placementId]),
        resolveBrickId: () => sources[1].sourceId
      });
      const planned = h.coordinator.planQueue(queueEntries, {
        expectedWorldRevision: h.controller.worldRevision,
        streamId: `class-proof.${partClass}`,
        mode: 'replace',
        finalChunk: true,
        cycleTimeMs: 250
      });
      assert.equal(planned.ok, true, JSON.stringify(planned));
      const agentResult = await h.runner.run({
        maximumPlacements: 1,
        cycleTimeMs: 250,
        physicalSpeedMmS: 650
      });
      assert.equal(agentResult.ok, true, JSON.stringify(agentResult));

      assert.deepEqual(h.board.getBuildState().contributions, { human: 1, agent: 1 });
      const snaps = h.board.eventLog.filter((event) => event.type === 'snap');
      assert.deepEqual(snaps.map((event) => event.actor).sort(), ['agent', 'human']);
      assert.equal(snaps.find((event) => event.actor === 'human').brickId, sources[0].sourceId);
      assert.equal(snaps.find((event) => event.actor === 'agent').brickId, sources[1].sourceId);
      assert.equal(h.controller.board, h.board);
      assert.equal(h.authority.board, h.board);
    });
  }
});
