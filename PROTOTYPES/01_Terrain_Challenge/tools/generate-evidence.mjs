import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_SETTINGS, PRESETS, generateChallenge, serialiseChallenge } from "../src/terrain.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const example = generateChallenge(PRESETS.FLAT_GAP_SMALL.seed, { ...DEFAULT_SETTINGS, ...PRESETS.FLAT_GAP_SMALL });
writeFileSync(`${root}ChallengeState.json`, serialiseChallenge(example.state), "utf8");

const results = [];
for (const [name, preset] of Object.entries(PRESETS)) {
  const samples = [];
  for (let run = 0; run < 25; run++) samples.push(generateChallenge(preset.seed, { ...DEFAULT_SETTINGS, ...preset }).generationMs);
  samples.sort((a, b) => a - b);
  results.push({ preset: name, medianMs: samples[12], p95Ms: samples[23], vertices: DEFAULT_SETTINGS.gridX * DEFAULT_SETTINGS.gridZ, triangles: (DEFAULT_SETTINGS.gridX - 1) * (DEFAULT_SETTINGS.gridZ - 1) * 2 });
}
console.table(results.map((row) => ({ preset: row.preset, "median ms": row.medianMs.toFixed(2), "p95 ms": row.p95Ms.toFixed(2), vertices: row.vertices, triangles: row.triangles })));
console.log(JSON.stringify(results));
