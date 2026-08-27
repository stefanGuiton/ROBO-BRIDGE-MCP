import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createFixtureRuntime } from '../tests/fixtures/logo-robo-runtime.js';
import { createRuntimeBridge } from '../apps/web/src/webmcp/runtime-bridge.js';
import { createObservationService } from '../apps/web/src/perception/observation-service.js';
import { createLogoRoboToolHandlers } from '../apps/web/src/webmcp/tool-handlers.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const outputPath = path.join(root, 'evidence', 'oracle3', 'performance.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (quantile) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * quantile))];
  return { runs: sorted.length, p50Ms: at(0.5), p95Ms: at(0.95), p99Ms: at(0.99), maxMs: sorted.at(-1) };
}

async function time(fn, runs = 60) {
  const samples = [];
  for (let index = 0; index < runs; index += 1) {
    const started = performance.now();
    await fn();
    samples.push(performance.now() - started);
  }
  return stats(samples);
}

const observations = {};
for (const count of [20, 50, 100]) {
  const service = createObservationService({ bridge: createRuntimeBridge(createFixtureRuntime({ brickCount: count })) });
  observations[count] = await time(() => service.observe({ cameraId: 'tray_camera', limit: 50 }), 60);
}
const runtime = createFixtureRuntime({ brickCount: 50 });
const handlers = createLogoRoboToolHandlers({ bridge: createRuntimeBridge(runtime) });
const handlerLatency = {
  get_build_state: await time(() => handlers.getBuildState({ limit: 20 }), 120),
  observe_camera: await time(() => handlers.observeCamera({ cameraId: 'tray_camera', limit: 20 }), 120)
};
const output = {
  generatedAt: new Date().toISOString(),
  units: 'milliseconds',
  observationGeneration: observations,
  handlerLatency,
  targets: { observationAbsoluteMaxMs: 100, observationPreferredP95Ms: 20 },
  notes: [
    'Observation is request-driven, not recomputed every animation frame.',
    'Handler latency excludes robot animation because the fixture moveTool is instantaneous.'
  ]
};
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
