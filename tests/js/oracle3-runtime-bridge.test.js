import test from 'node:test'; import assert from 'node:assert/strict';
import { createRuntimeBridge, runtimeAvailability, STABLE_ERRORS } from '../../apps/web/src/webmcp/runtime-bridge.js'; import { createFixtureRuntime } from '../fixtures/logo-robo-runtime.js';
test('runtime bridge verifies the narrow Oracle 3 contract',()=>{const r=createFixtureRuntime(),a=runtimeAvailability(r);assert.equal(a.ok,true);assert.deepEqual(a.missing,[]);});
test('missing production runtime fails gracefully',async()=>{const b=createRuntimeBridge(null);const r=await b.robot.latch();assert.equal(r.reason,'runtime_unavailable');});
test('required stable machine errors are present',()=>{for(const e of ['runtime_unavailable','outside_workspace','speed_limit','ik_failed','collision','cancelled','no_brick_in_capture','already_holding','not_holding','target_occupied','unknown_target','wrong_mode','stale_state','invalid_input'])assert.ok(STABLE_ERRORS.includes(e));});
