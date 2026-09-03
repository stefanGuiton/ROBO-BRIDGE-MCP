import test from 'node:test';
import assert from 'node:assert/strict';
import { createLevel3ResultsCollector, deriveLevel3Results, createLevel3ResultsPanel } from '../../apps/web/src/logo/level3-results.js';
import { createMissionEventAdapter } from '../../apps/web/src/mission/mission-events.js';
import { MissionService } from '../../apps/web/src/mission/mission-service.js';
import { createMissionHarness } from '../helpers/mission-fakes.js';

const missionId = 'mission-result-1', planId = 'plan-result-1', designChecksum = 'checksum-result-1';
const identity = { missionId, planId, designChecksum };
const input = () => ({ mode: 'train',
  missionState: { ok: true, missionId, phase: 'COMPLETE', plan: { planId, designChecksum, frozen: true },
    bridge: { family: 'viaduct' }, revisions: { worldRevision: 42 },
    build: { required: 12, accepted: 12, human: 3, codex: 9, incorrect: 0 },
    train: { state: 'CROSSED', result: 'CROSSED' },
    lastTest: { ...identity, testId: 'test-2', supportSource: 'BUILD_BOARD', outcome: 'CROSSED' } },
  frozenMission: { ...identity, bridgeSpec: { family: 'viaduct', viaduct: { archCount: 3 } }, requiredPlacementIds: Array.from({ length: 12 }, (_, i) => `part-${i}`) },
  constructionProgress: { planId, designChecksum, worldRevision: 42, total: 12, completed: 12,
    contributions: { human: 3, agent: 9, unknown: 0 }, byExecutionMode: { human: 3, robot: 4, simulated_fast_forward: 5, unknown: 0 } },
  telemetry: { missionId, coverage: 'complete', testCount: 2, failureCount: 1, retryCount: 1, buildDurationMs: 16000, finalWorldRevision: 42 }
});

test('Level 3 SUCCESS requires authoritative COMPLETE and a matching BUILD_BOARD CROSSED result', () => {
  const sample = input();
  const result = deriveLevel3Results(sample);
  assert.equal(result.result, 'SUCCESS');
  assert.equal(result.missionId, missionId);
  assert.equal(result.family, 'viaduct');
  assert.equal(result.archCount, 3);
  assert.equal(result.partCount, 12);
  assert.equal(result.trainResult, 'CROSSED');
  assert.equal(result.finalWorldRevision, 42);
  for (const change of [
    state => { state.phase = 'BUILD'; },
    state => { state.lastTest.outcome = 'FELL'; },
    state => { state.lastTest.missionId = 'other-mission'; },
    state => { state.lastTest.planId = 'other-plan'; },
    state => { state.lastTest.designChecksum = 'other-checksum'; },
    state => { state.lastTest.supportSource = 'SYNTHETIC'; },
    state => { delete state.lastTest; },
    state => { state.ok = false; }
  ]) {
    const changed = input(); change(changed.missionState);
    assert.notEqual(deriveLevel3Results(changed).result, 'SUCCESS');
    assert.equal(deriveLevel3Results(changed).finalWorldRevision, null);
  }
});

test('all parts placed, a PASS event, or Train CROSSED alone never fabricate mission completion', () => {
  const sample = input();
  sample.missionState.phase = 'BUILD';
  assert.equal(deriveLevel3Results(sample).result, 'BUILDING');
  sample.missionState.phase = 'TEST';
  assert.equal(deriveLevel3Results(sample).result, 'TESTING');
  sample.missionState.phase = 'BUILD';
  sample.missionState.lastTest.outcome = 'DERAILED';
  assert.equal(deriveLevel3Results(sample).result, 'REPAIR_REQUIRED');
});

test('Human, agent total, normal robot motion and explicit accelerated contributions remain separate', () => {
  const result = deriveLevel3Results(input());
  assert.equal(result.humanAccepted, 3);
  assert.equal(result.agentAccepted, 9);
  assert.equal(result.robotAccepted, 4);
  assert.equal(result.acceleratedAccepted, 5);
  assert.equal(result.unknownAccepted, 0);
  assert.equal(result.incorrectPlacements, 0);
  assert.equal(result.rejectedPlacements, null, 'missing rejection history must not become zero');
  assert.equal(deriveLevel3Results({ ...input(), rejectedPlacementCount: 7 }).rejectedPlacements, 7);
  for (const change of [
    progress => { progress.planId = 'another-plan'; },
    progress => { progress.designChecksum = 'another-checksum'; },
    progress => { progress.worldRevision = 41; },
    progress => { progress.completed = 11; },
    progress => { progress.byExecutionMode.robot = -1; },
    progress => { progress.byExecutionMode.robot = 9; },
    progress => { delete progress.byExecutionMode; }
  ]) {
    const sample = input(); change(sample.constructionProgress);
    const stale = deriveLevel3Results(sample);
    assert.equal(stale.robotAccepted, null);
    assert.equal(stale.acceleratedAccepted, null);
    assert.equal(stale.agentAccepted, 9, 'the authoritative Mission aggregate remains usable');
  }
});

test('freeze identity scopes arch counts, with aqueduct logical arches summed across tiers', () => {
  const sample = input();
  sample.frozenMission.bridgeSpec = { family: 'aqueduct', aqueduct: { topArchCount: 5, middleArchCount: 4, bottomArchCount: 3 } };
  assert.equal(deriveLevel3Results(sample).archCount, 12);
  delete sample.frozenMission.bridgeSpec.aqueduct.middleArchCount;
  assert.equal(deriveLevel3Results(sample).archCount, null);
  sample.frozenMission.missionId = 'old-mission';
  assert.equal(deriveLevel3Results(sample).archCount, null);
});

test('projection is deterministic and cannot mutate input snapshots or world revisions', () => {
  const sample = input(), before = structuredClone(sample);
  const freeze = object => { for (const value of Object.values(object)) if (value && typeof value === 'object') freeze(value); return Object.freeze(object); };
  freeze(sample);
  assert.deepEqual(deriveLevel3Results(sample), deriveLevel3Results(sample));
  assert.deepEqual(sample, before);
  for (const mode of ['simple', 'bridge', undefined]) assert.equal(deriveLevel3Results({ ...sample, mode }).visible, false);
  assert.equal(deriveLevel3Results({ mode: 'train' }).result, 'UNAVAILABLE');
  assert.equal(deriveLevel3Results().partCount, null);
});

function eventHarness() {
  const collector = createLevel3ResultsCollector();
  let time = 0, revision = 1, id = missionId;
  const events = createMissionEventAdapter({ maximumEntries: 1, now: () => new Date(time),
    sink: event => collector.recordMissionEvent(event, { worldRevision: revision }) });
  return { collector, events,
    emit(type, phase, at, options = {}) {
      time = at; revision = options.revision ?? revision; id = options.missionId ?? id;
      return events.emit({ type, phase, missionId: id, planId, designChecksum, actor: options.actor ?? 'system' });
    }
  };
}

test('collector counts actual test attempts/recovery, BUILD time excluding tests, and PASS-time revision', () => {
  const h = eventHarness();
  h.emit('DESIGN', 'DESIGN', 0);
  h.emit('RECOVER', 'DESIGN', 500); // Failed build start is not a failed train test.
  h.emit('FREEZE', 'BUILD', 1000);
  h.emit('BUILD', 'BUILD', 2000);
  assert.equal(h.collector.getSnapshot({ nowMs: 6000 }).buildDurationMs, 5000);
  h.emit('TEST', 'TEST', 11000);
  h.emit('RECOVER', 'BUILD', 14000, { actor: 'train' });
  h.emit('BUILD', 'BUILD', 18000);
  h.emit('TEST', 'TEST', 20000);
  const pass = h.emit('PASS', 'COMPLETE', 24000, { revision: 42 });
  assert.equal(h.collector.recordMissionEvent(pass, { worldRevision: 999 }), false, 'duplicate sink deliveries do not count twice');
  const metrics = h.collector.getSnapshot({ missionId, nowMs: 999000 });
  assert.deepEqual(metrics, { missionId, coverage: 'complete', testCount: 2, failureCount: 1, retryCount: 1,
    buildDurationMs: 16000, finalWorldRevision: 42 });
  assert.equal(h.events.page().totalAvailable, 1, 'metrics survive bounded Mission activity-log eviction');
  const sample = input(); sample.missionState.revisions.worldRevision = 99;
  assert.equal(deriveLevel3Results({ ...sample, telemetry: metrics }).finalWorldRevision, 42);
});

test('stopped tests are failures, retries are test attempts after the first, and reset clears the old mission', () => {
  const h = eventHarness();
  h.emit('FREEZE', 'BUILD', 1000);
  h.emit('TEST', 'TEST', 3000);
  h.emit('RECOVER', 'BUILD', 4000); // System RECOVER after cancellation/error.
  assert.equal(h.collector.getSnapshot({ nowMs: 5000 }).failureCount, 1);
  assert.equal(h.collector.getSnapshot({ nowMs: 5000 }).retryCount, 0);
  const previous = h.emit('TEST', 'TEST', 5000);
  h.emit('RESET', 'DESIGN', 6000, { missionId: 'mission-result-2' });
  assert.equal(h.collector.recordMissionEvent(previous), false);
  assert.equal(h.collector.getSnapshot({ missionId }).coverage, 'none');
  const fresh = h.collector.getSnapshot({ missionId: 'mission-result-2', nowMs: 7000 });
  assert.equal(fresh.testCount, 0);
  assert.equal(fresh.failureCount, 0);
  assert.equal(fresh.buildDurationMs, null);
  assert.equal(fresh.finalWorldRevision, null);
  assert.equal(deriveLevel3Results({ ...input(), telemetry: fresh }).testCount, null);
});

test('late attachment, sequence gaps and invalid timestamps do not invent complete statistics', () => {
  const event = (sequence, type, phase, at) => ({ ...identity, sequence, type, phase, timestamp: at });
  const late = createLevel3ResultsCollector();
  late.recordMissionEvent(event(10, 'TEST', 'TEST', '2026-09-03T12:00:00Z'));
  assert.equal(late.getSnapshot().coverage, 'partial');
  assert.equal(late.getSnapshot().testCount, null);
  assert.equal(late.getSnapshot().buildDurationMs, null);
  const gap = createLevel3ResultsCollector();
  gap.recordMissionEvent(event(1, 'FREEZE', 'BUILD', '2026-09-03T12:00:00Z'));
  gap.recordMissionEvent(event(3, 'TEST', 'TEST', '2026-09-03T12:00:02Z'));
  assert.equal(gap.getSnapshot().coverage, 'partial');
  for (const badTimestamp of ['not-a-date', '2026-09-03T11:59:59Z']) {
    const bad = createLevel3ResultsCollector();
    bad.recordMissionEvent(event(1, 'FREEZE', 'BUILD', '2026-09-03T12:00:00Z'));
    bad.recordMissionEvent(event(2, 'TEST', 'TEST', badTimestamp));
    assert.equal(bad.getSnapshot().buildDurationMs, null);
    assert.equal(bad.getSnapshot().testCount, 1);
  }
  assert.equal(deriveLevel3Results({ ...input(), telemetry: null }).finalWorldRevision, null);
});

test('real MissionService transitions drive statistics without changing Mission or world state', async () => {
  // The production MissionService is exercised with the repository's deterministic
  // service fakes. This is contract coverage, not physical Train acceptance.
  const h = createMissionHarness(), collector = createLevel3ResultsCollector();
  let nowMs = 0;
  const mission = new MissionService(h.services, { idFactory: () => missionId, now: () => new Date(nowMs),
    eventSink: event => collector.recordMissionEvent(event, { worldRevision: h.worldRevision }) });
  const sessionInput = () => ({ expectedMissionId: mission.missionId, expectedMissionRevision: mission.missionRevision,
    expectedWorldRevision: h.worldRevision });
  const stats = async () => deriveLevel3Results({ mode: 'train', missionState: await mission.getMissionState({ detail: 'detail' }),
    frozenMission: mission.frozen, telemetry: collector.getSnapshot({ missionId, nowMs }) });
  assert.equal((await mission.testBridge(sessionInput())).ok, false);
  assert.equal((await stats()).testCount, 0, 'rejected precondition calls are not actual test attempts');
  nowMs = 1000;
  assert.equal((await mission.startBridgeBuild({ ...sessionInput(), expectedDesignRevision: 1 })).ok, true);
  nowMs = 5000;
  assert.equal((await mission.testBridge(sessionInput())).outcome, 'TRAIN_FELL');
  assert.equal((await stats()).result, 'REPAIR_REQUIRED');
  h.constructionService.acceptHuman(6);
  h.trainService.state.nextOutcome = 'CROSSED';
  nowMs = 9000;
  const crossed = await mission.testBridge(sessionInput());
  assert.equal(crossed.phase, 'COMPLETE');
  const revision = h.worldRevision, frozen = structuredClone(mission.frozen);
  const result = await stats();
  assert.equal(result.result, 'SUCCESS');
  assert.equal(result.humanAccepted, 6);
  assert.equal(result.testCount, 2);
  assert.equal(result.failureCount, 1);
  assert.equal(result.retryCount, 1);
  assert.equal(result.buildDurationMs, 8000);
  assert.equal(result.finalWorldRevision, crossed.revisions.worldRevision);
  assert.equal(h.worldRevision, revision);
  assert.deepEqual(mission.frozen, frozen);
});

function documentHarness() {
  class Element {
    constructor(tagName) { this.tagName = tagName; this.children = []; this.dataset = {}; this.attributes = {}; this.textContent = ''; this.hidden = false; }
    append(...children) { for (const child of children) { this.children.push(child); child.parent = this; } }
    setAttribute(name, value) { this.attributes[name] = value; }
    remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
  }
  const document = { createElement: tag => new Element(tag), body: new Element('body') };
  const descendants = element => element.children.flatMap(child => [child, ...descendants(child)]);
  return { document, descendants };
}

test('DOM panel is opt-in, level-gated, uses safe text, and displays explicit accelerated stats', () => {
  const h = documentHarness();
  const panel = createLevel3ResultsPanel({ document: h.document });
  assert.equal(panel.element.hidden, true);
  const sample = input();
  sample.missionState.bridge.family = '<img src=x onerror=alert(1)>';
  sample.frozenMission = null;
  panel.render(deriveLevel3Results(sample));
  assert.equal(panel.element.hidden, false);
  assert.equal(panel.element.dataset.result, 'SUCCESS');
  const nodes = h.descendants(panel.element);
  const stat = key => nodes.find(node => node.dataset.level3Stat === key).textContent;
  assert.equal(stat('family'), '<img src=x onerror=alert(1)>');
  assert.equal(nodes.some(node => node.tagName === 'img'), false);
  assert.equal(stat('robotAccepted'), '4');
  assert.equal(stat('acceleratedAccepted'), '5');
  assert.equal(stat('tests'), '2 / 1 / 1');
  assert.equal(stat('buildDurationMs'), '16.0 s');
  assert.equal(stat('rejectedPlacements'), '—');
  assert.match(nodes.find(node => node.tagName === 'small').textContent, /explicit simulation, not robot motion/);
  assert.match(nodes.find(node => node.tagName === 'style').textContent, /html:not\(\[data-demo-mode="train"\]\)/);
  for (const mode of ['bridge', 'simple']) {
    panel.render(deriveLevel3Results({ ...sample, mode }));
    assert.equal(panel.element.hidden, true);
  }
  panel.dispose();
  assert.equal(h.document.body.children.length, 0);
});
