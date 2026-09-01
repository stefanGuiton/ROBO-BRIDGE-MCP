import test from 'node:test';
import assert from 'node:assert/strict';
import { BridgeDesignService } from '../src/bridge-design-service.js';
import { FakeV46Adapter } from './fake-v46-adapter.mjs';

test('Scenarios A and B: partial aqueduct updates preserve unspecified values', async () => {
  const adapter = new FakeV46Adapter('aqueduct');
  const service = new BridgeDesignService(adapter);
  const initial = service.getDesignState({ includeCapabilities: false });
  const a = await service.patchBridgeSpec({
    family: 'aqueduct',
    aqueduct: { topArchCount: 10, middleArchCount: 6, bottomArchCount: 3 }
  }, initial.designRevision);
  assert.equal(a.ok, true);
  assert.equal(a.bridgeSpec.aqueduct.topArchCount, 10);
  assert.equal(a.bridgeSpec.aqueduct.middleArchCount, 6);
  assert.equal(a.bridgeSpec.aqueduct.bottomArchCount, 3);
  assert.equal(a.designRevision, initial.designRevision + 1);
  assert.notEqual(a.designChecksum, initial.designChecksum);

  const b = await service.patchBridgeSpec({
    aqueduct: { topArchCount: 8, bottomArchCount: 4 }
  }, a.designRevision);
  assert.equal(b.ok, true);
  assert.equal(b.bridgeSpec.aqueduct.topArchCount, 8);
  assert.equal(b.bridgeSpec.aqueduct.middleArchCount, 6);
  assert.equal(b.bridgeSpec.aqueduct.bottomArchCount, 4);
  assert.equal(b.designRevision, a.designRevision + 1);
});

test('Scenarios C and D: family switch uses viaduct defaults and supports a follow-up patch', async () => {
  const adapter = new FakeV46Adapter('aqueduct');
  const service = new BridgeDesignService(adapter);
  const initial = service.getDesignState({ includeCapabilities: false });
  const c = await service.patchBridgeSpec({ family: 'viaduct' }, initial.designRevision);
  assert.equal(c.ok, true);
  assert.equal(c.family, 'viaduct');
  assert.equal(c.bridgeSpec.viaduct.archCount, 6);
  assert.equal(c.bridgeSpec.aqueduct, undefined);
  assert.equal(c.bridgeSpec.common.entryExitGap, 190);

  const d = await service.patchBridgeSpec({
    viaduct: { archCount: 5, openingWidthRatio: 0.9 }
  }, c.designRevision);
  assert.equal(d.ok, true);
  assert.equal(d.bridgeSpec.viaduct.archCount, 5);
  assert.equal(d.bridgeSpec.viaduct.openingWidthRatio, 0.9);
});

test('Scenarios E and F: stale and invalid mutations do not change state', async () => {
  const adapter = new FakeV46Adapter('aqueduct');
  const service = new BridgeDesignService(adapter);
  const initial = service.getDesignState({ includeCapabilities: false });
  const valid = await service.patchBridgeSpec({ aqueduct: { topArchCount: 10 } }, initial.designRevision);
  const beforeStale = service.getDesignState({ includeCapabilities: false });
  const stale = await service.patchBridgeSpec({ aqueduct: { topArchCount: 9 } }, initial.designRevision);
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, 'STALE_DESIGN_REVISION');
  const afterStale = service.getDesignState({ includeCapabilities: false });
  assert.equal(afterStale.designRevision, beforeStale.designRevision);
  assert.equal(afterStale.designChecksum, beforeStale.designChecksum);
  assert.equal(afterStale.bridgeSpec.aqueduct.topArchCount, valid.bridgeSpec.aqueduct.topArchCount);

  const applyCountBefore = adapter.applyCount;
  const invalid = await service.patchBridgeSpec({ aqueduct: { topArchCount: 99 } }, afterStale.designRevision);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, 'OUT_OF_RANGE');
  assert.equal(adapter.applyCount, applyCountBefore);
  const afterInvalid = service.getDesignState({ includeCapabilities: false });
  assert.equal(afterInvalid.designRevision, afterStale.designRevision);
  assert.equal(afterInvalid.designChecksum, afterStale.designChecksum);
});

test('read-only calls do not increment revision and BuildPlan pages are bounded', () => {
  const adapter = new FakeV46Adapter();
  const service = new BridgeDesignService(adapter);
  const before = service.getDesignState({ includeCapabilities: false });
  const state = service.getDesignState();
  const summary = service.getBuildPlan({ detail: 'summary' });
  const page = service.getBuildPlan({ detail: 'placements', cursor: 0, limit: 7 });
  const after = service.getDesignState({ includeCapabilities: false });
  assert.equal(state.ok, true);
  assert.equal(summary.ok, true);
  assert.equal(page.placements.length, 7);
  assert.equal(page.truncated, true);
  assert.equal(before.designRevision, after.designRevision);
  assert.equal(adapter.applyCount, 0);
});

test('reset always reapplies the tested family preset and creates one new revision', async () => {
  const adapter = new FakeV46Adapter();
  const service = new BridgeDesignService(adapter);
  const initial = service.getDesignState({ includeCapabilities: false });
  const changed = await service.patchBridgeSpec({ aqueduct: { topArchCount: 10 } }, initial.designRevision);
  const reset = await service.resetBridgeDesign('aqueduct', changed.designRevision);
  assert.equal(reset.ok, true);
  assert.equal(reset.reset, true);
  assert.equal(reset.bridgeSpec.aqueduct.topArchCount, 8);
  assert.equal(reset.designRevision, changed.designRevision + 1);
});
