import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { DEFAULT_TUNING, FIXTURES, StructuralSolverSession, getFixture, solveStructure } from "../dist/index.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const samples = [];
const iterationsPerFixture = 100;

for (const fixture of FIXTURES) {
  for (let index = 0; index < iterationsPerFixture; index += 1) {
    const started = performance.now();
    solveStructure(fixture.graph, fixture.route, {
      mode: "BUILD",
      loadProgress: (index % 101) / 100,
      loadMass: 48,
      tuning: DEFAULT_TUNING,
      testId: index,
    });
    samples.push(performance.now() - started);
  }
}

samples.sort((a, b) => a - b);
const percentile = (fraction) => samples[Math.min(samples.length - 1, Math.floor(samples.length * fraction))] ?? 0;
const fixture = getFixture("long-supported-beam");
const session = new StructuralSolverSession(fixture.graph, fixture.route);
session.update(0.501, 48, DEFAULT_TUNING);
const cachedStarted = performance.now();
let cachedCount = 0;
for (let index = 0; index < 2000; index += 1) if (!session.update(0.501 + (index % 5) * 0.00001, 48, DEFAULT_TUNING).recalculated) cachedCount += 1;
const cachedElapsed = performance.now() - cachedStarted;

const report = {
  generatedAt: new Date().toISOString(),
  runtime: process.version,
  platform: `${process.platform}-${process.arch}`,
  fixtureCount: FIXTURES.length,
  sampleCount: samples.length,
  iterationsPerFixture,
  solveMilliseconds: {
    mean: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    median: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    maximum: samples[samples.length - 1] ?? 0,
  },
  loadRegionCache: {
    calls: 2000,
    skippedSolves: cachedCount,
    elapsedMilliseconds: cachedElapsed,
    meanCallMicroseconds: cachedElapsed * 1000 / 2000,
  },
  note: "Game-prototype timing only. These figures are not engineering accuracy evidence or integrated-application frame timings.",
};

await mkdir(join(root, "docs"), { recursive: true });
await writeFile(join(root, "docs", "performance-results.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
