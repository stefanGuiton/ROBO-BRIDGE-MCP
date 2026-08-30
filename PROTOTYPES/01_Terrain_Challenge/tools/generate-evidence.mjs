import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PRESETS, generateChallenge, serialiseChallenge, validateWatertightMesh } from "../src/v2/index.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const percentile = (values, fraction) => values[Math.min(values.length - 1, Math.floor(values.length * fraction))];
const round = (value) => Number(value.toFixed(3));
const performanceRows = [];
const deterministicRows = [];

for (const [name, preset] of Object.entries(PRESETS)) {
  for (let warmup = 0; warmup < 5; warmup += 1) generateChallenge(preset.seed, preset);
  const pure = [], mesh = [], total = [];
  let lastResult;
  for (let run = 0; run < 25; run += 1) {
    lastResult = generateChallenge(preset.seed, preset);
    pure.push(lastResult.timings.heightField + lastResult.timings.support);
    mesh.push(lastResult.timings.mesh);
    total.push(lastResult.timings.total);
  }
  pure.sort((a, b) => a - b); mesh.sort((a, b) => a - b); total.sort((a, b) => a - b);
  const meshValidation = validateWatertightMesh(lastResult.meshData);
  performanceRows.push({
    preset: name,
    samples: 25,
    pureP50Ms: round(percentile(pure, 0.5)),
    pureP95Ms: round(percentile(pure, 0.95)),
    meshP50Ms: round(percentile(mesh, 0.5)),
    meshP95Ms: round(percentile(mesh, 0.95)),
    totalP50Ms: round(percentile(total, 0.5)),
    totalP95Ms: round(percentile(total, 0.95)),
    vertexCount: lastResult.meshData.vertexCount,
    triangleCount: lastResult.meshData.triangleCount,
    supportRegionCount: lastResult.supportRegions.length,
    meshClosed: meshValidation.valid
  });
  const repeated = generateChallenge(preset.seed, preset);
  deterministicRows.push({ preset: name, seed: preset.seed, checksums: repeated.checksums, highGroundComponents: repeated.topology.highGroundComponents, sharedPlaneY: repeated.platforms.sharedPlaneY });
}

const example = generateChallenge(PRESETS.V2_MOUNTAIN_PASS.seed, PRESETS.V2_MOUNTAIN_PASS);
writeFileSync(`${root}ChallengeState.json`, serialiseChallenge(example.state), "utf8");
writeFileSync(`${root}docs/PERFORMANCE_RESULTS.json`, `${JSON.stringify({ generatedAt: new Date().toISOString(), environment: { node: process.version, platform: process.platform, arch: process.arch }, targets: { pureP50Ms: 20, meshP50Ms: 35 }, rows: performanceRows }, null, 2)}\n`, "utf8");
writeFileSync(`${root}docs/DETERMINISM_EVIDENCE.json`, `${JSON.stringify({ generatedAt: new Date().toISOString(), generatorVersion: 2, challengeVersion: 3, rows: deterministicRows }, null, 2)}\n`, "utf8");
console.table(performanceRows);
console.log(`Wrote ChallengeState.json and evidence for ${performanceRows.length} presets.`);
