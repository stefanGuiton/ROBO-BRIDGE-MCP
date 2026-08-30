import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FLAT_GAP, RAVINE, specForChallenge } from "../src/engine/fixtures.js";
import { generateBridgeGraph2D } from "../src/engine/generator.js";
import { stableStringify } from "../src/engine/stable-json.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = join(root, "fixtures", "exports");
await mkdir(output, { recursive: true });
await writeFile(join(output, "ChallengeState.flat-gap.json"), `${stableStringify(FLAT_GAP, 2)}\n`);
await writeFile(join(output, "ChallengeState.ravine.json"), `${stableStringify(RAVINE, 2)}\n`);

const manifest = { version: 1, generatorVersion: 1, families: {} };
for (const family of ["beam", "trestle", "warren", "pratt", "howe", "arch", "aqueduct", "box", "suspension"]) {
  const spec = specForChallenge(RAVINE, family);
  const result = generateBridgeGraph2D(RAVINE, spec);
  await writeFile(join(output, `BridgeSpec.${family}.json`), `${stableStringify(spec, 2)}\n`);
  await writeFile(join(output, `BridgeGraph2D.${family}.json`), `${stableStringify(result.graph, 2)}\n`);
  manifest.families[family] = {
    valid: result.validation.valid,
    nodes: result.graph.nodes.length,
    members: result.graph.members.length,
    cables: result.graph.cables.length,
    designRevision: result.graph.metadata.designRevision,
    checksum: result.graph.metadata.deterministicChecksum,
  };
}
await writeFile(join(output, "validation-report.json"), `${stableStringify(manifest, 2)}\n`);
console.log(`Exported deterministic fixtures to ${output}`);
