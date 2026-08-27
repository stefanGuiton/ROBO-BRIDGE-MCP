import test from 'node:test';
import assert from 'node:assert/strict';
import { compileImageData } from '../../apps/web/src/logo/compiler.js';
import { makePattern } from '../../apps/web/src/logo/patterns.js';
import { CoBuildGame } from '../../apps/web/src/game/co-build.js';
import { RaceGame } from '../../apps/web/src/game/race.js';
import { scoreCoBuild, scoreRace } from '../../apps/web/src/game/scoring.js';

const blueprint = compileImageData(makePattern('glyph', 72), { brickBudget: 12, boardLimits: { maxWidthMm: 160, maxHeightMm: 128 } }).blueprint;
const input = (target, brickId, actor, nowMs = 0) => ({ brickId, colour: target.colour, position: { xMm: target.worldXmm, yMm: target.worldYmm, zMm: target.worldZmm }, yawDeg: 0, actor, nowMs });

test('Co-Build uses its one board for claims, placement, contributions, and completion', () => {
  const game = new CoBuildGame(blueprint);
  game.start(0);
  const target = blueprint.targets[0];
  assert.equal(game.claimTarget(target.targetId, 'agent').ok, true);
  assert.equal(game.place(input(target, 'human-b1', 'human', 100)).ok, true);
  assert.equal(game.board.getTarget(target.targetId).claimOwner, 'none');
  blueprint.targets.slice(1).forEach((candidate, index) => game.place(input(candidate, `b${index}`, index % 2 ? 'human' : 'agent', 110 + index)));
  const score = scoreCoBuild(game, 1000);
  assert.equal(score.completionStatus, 'complete');
  assert.equal(score.humanCorrectPlacements + score.agentCorrectPlacements, blueprint.targets.length);
});

test('claim conflict is stable but a later measured physical placement can override coordination metadata', () => {
  const game = new CoBuildGame(blueprint);
  const target = blueprint.targets[0];
  game.claimTarget(target.targetId, 'human');
  const conflict = game.claimTarget(target.targetId, 'agent');
  assert.equal(conflict.reason, 'claim_conflict');
  const placement = game.place(input(target, 'agent-b', 'agent', 100));
  assert.equal(placement.ok, true);
  assert.equal(game.board.getTarget(target.targetId).completedBy, 'agent');
});

test('Race explicitly owns two physical board states and has deterministic winner rules', () => {
  const game = new RaceGame(blueprint, { maxTcpSpeedMmS: 500 });
  game.start(0);
  blueprint.targets.forEach((target, index) => {
    game.place('human', input(target, `h${index}`, 'human', 100));
    game.place('agent', input(target, `a${index}`, 'agent', 120));
  });
  assert.equal(game.winner(), 'human');
  assert.equal(game.human.progress().correctTargets, blueprint.targets.length);
  assert.equal(game.agent.progress().correctTargets, blueprint.targets.length);
  assert.equal(scoreRace(game, 200).winner, 'human');
});
