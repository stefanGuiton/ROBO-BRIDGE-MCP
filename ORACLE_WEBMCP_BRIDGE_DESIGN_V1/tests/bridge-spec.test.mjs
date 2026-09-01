import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPublicPatch,
  bridgePatchJsonSchema,
  parameterCapabilities,
  publicBridgeSpec
} from '../src/bridge-spec.js';
import { FakeV46Adapter } from './fake-v46-adapter.mjs';

function codeOf(fn) {
  try { fn(); return null; } catch (error) { return error.code; }
}

test('public mapping uses clear names and keeps V4.6 internal names behind the adapter', () => {
  const adapter = new FakeV46Adapter();
  const spec = publicBridgeSpec(adapter.getInternalSettings());
  assert.equal(spec.family, 'aqueduct');
  assert.equal(spec.aqueduct.topArchCount, 8);
  assert.equal(spec.common.entryExitGap, 220);
  assert.equal('aqTopCount' in spec.aqueduct, false);
});

test('family switch starts from tested family defaults and then applies the patch', () => {
  const adapter = new FakeV46Adapter('aqueduct');
  const current = adapter.getInternalSettings();
  current.anchorGapX = 300;
  const candidate = applyPublicPatch(current, {
    family: 'viaduct',
    viaduct: { archCount: 5, openingWidthRatio: 0.9 }
  }, (family) => adapter.getFamilyDefaults(family));
  assert.equal(candidate.family, 'viaduct');
  assert.equal(candidate.anchorGapX, 190);
  assert.equal(candidate.viArchCount, 5);
  assert.equal(candidate.viOpeningWidthRatio, 0.9);
});

test('unknown properties, non-finite values, bad families, and out-of-range counts fail closed', () => {
  const adapter = new FakeV46Adapter();
  const current = adapter.getInternalSettings();
  const defaults = (family) => adapter.getFamilyDefaults(family);
  assert.equal(codeOf(() => applyPublicPatch(current, { mystery: 1 }, defaults)), 'INVALID_PARAMETER');
  assert.equal(codeOf(() => applyPublicPatch(current, { family: 'hybrid' }, defaults)), 'UNKNOWN_FAMILY');
  assert.equal(codeOf(() => applyPublicPatch(current, { aqueduct: { topArchCount: 25 } }, defaults)), 'OUT_OF_RANGE');
  assert.equal(codeOf(() => applyPublicPatch(current, { aqueduct: { topOpeningOffset: Number.NaN } }, defaults)), 'INVALID_PARAMETER');
  assert.equal(codeOf(() => applyPublicPatch(current, { aqueduct: { topOpeningOffset: Number.POSITIVE_INFINITY } }, defaults)), 'INVALID_PARAMETER');
});

test('cross-field checks reject nonsensical deck and track geometry', () => {
  const adapter = new FakeV46Adapter();
  const current = adapter.getInternalSettings();
  const defaults = (family) => adapter.getFamilyDefaults(family);
  assert.equal(codeOf(() => applyPublicPatch(current, {
    common: { anchorHeight: 2, deckThickness: 3 }
  }, defaults)), 'OUT_OF_RANGE');
  assert.equal(codeOf(() => applyPublicPatch(current, {
    track: { railGaugeCells: 2.7, railWidthCells: 0.6 }
  }, defaults)), 'OUT_OF_RANGE');
});

test('capabilities and JSON schema are strict and composable', () => {
  const capabilities = parameterCapabilities('aqueduct');
  assert.deepEqual(capabilities.families, ['aqueduct', 'viaduct']);
  assert.equal(capabilities.groups.aqueduct.topArchCount.minimum, 3);
  assert.equal(capabilities.groups.viaduct, undefined);
  const schema = bridgePatchJsonSchema();
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.aqueduct.additionalProperties, false);
  assert.equal(schema.properties.viaduct.properties.archCount.maximum, 14);
});
