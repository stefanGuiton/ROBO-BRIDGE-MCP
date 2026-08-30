import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileBridgeGraph } from "../src/compiler.js";
import { FIXTURES } from "../src/fixtures.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rows = [];
for (const [name, graph] of Object.entries(FIXTURES)) {
  for (let warm = 0; warm < 10; warm += 1) compileBridgeGraph(graph);
  const samples = [];
  let result;
  for (let run = 0; run < 30; run += 1) {
    const started = performance.now();
    result = compileBridgeGraph(graph);
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  rows.push({
    fixture: name,
    medianMs: samples[Math.floor(samples.length / 2)],
    p95Ms: samples[Math.floor(samples.length * 0.95)],
    placements: result.diagnostics.placementCount,
    occupancyCells: result.diagnostics.occupancyCellCount,
    checksum: result.diagnostics.checksum,
  });
}
const generatedAt = new Date().toISOString();
const beamWithLongParts = compileBridgeGraph(FIXTURES.beam).diagnostics.placementCount;
const beamShortOnly = compileBridgeGraph(FIXTURES.beam, { allowedBeamLengths: [] }).diagnostics.placementCount;
const beamReduction = (1 - beamWithLongParts / beamShortOnly) * 100;
const lines = [
  "# Performance results",
  "",
  `Generated: ${generatedAt}`,
  "",
  "Node-side deterministic compiler benchmark: 10 warm-up runs, then 30 measured runs per fixture. Browser FPS and draw calls are live UI measurements and are intentionally not fabricated here.",
  "",
  "| Fixture | Median compile | p95 compile | Placements | Occupancy cells | Checksum |",
  "|---|---:|---:|---:|---:|---|",
  ...rows.map((row) => `| ${row.fixture} | ${row.medianMs.toFixed(2)} ms | ${row.p95Ms.toFixed(2)} ms | ${row.placements} | ${row.occupancyCells} | \`${row.checksum}\` |`),
  "",
  "## Long-beam impact",
  "",
  `The beam fixture uses ${beamWithLongParts} placements with configured long beams versus ${beamShortOnly} with standard short parts only: a ${beamReduction.toFixed(1)}% placement-count reduction.`,
  "",
];
await mkdir(resolve(root, "docs"), { recursive: true });
await writeFile(resolve(root, "docs/PERFORMANCE_RESULTS.md"), lines.join("\n"));
console.table(rows);
