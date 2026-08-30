import { FAMILY_IDS } from "../src/engine/catalogue.js";
import { FLAT_GAP, RAVINE, specForChallenge } from "../src/engine/fixtures.js";
import { generateBridgeGraph2D } from "../src/engine/generator.js";
import { stableStringify } from "../src/engine/stable-json.js";

const json = (value) => `${stableStringify(value, 2)}\n`;

export function createFixtureFiles() {
  const files = new Map([
    ["ChallengeState.flat-gap.json", json(FLAT_GAP)],
    ["ChallengeState.ravine.json", json(RAVINE)],
  ]);
  const manifest = { version: 3, generatorVersion: 3, families: {} };

  for (const family of FAMILY_IDS) {
    const spec = specForChallenge(RAVINE, family);
    const result = generateBridgeGraph2D(RAVINE, spec);
    if (!result.validation.valid || !result.graph) throw new Error(`Cannot export invalid ${family} fixture: ${stableStringify(result.validation)}`);
    files.set(`BridgeSpec.${family}.json`, json(spec));
    files.set(`BridgeGraph2D.${family}.json`, json(result.graph));
    manifest.families[family] = {
      valid: true,
      nodes: result.graph.nodes.length,
      members: result.graph.members.length,
      cables: result.graph.cables.length,
      brickZones: result.graph.metadata.brickZones.length,
      constructionSystem: result.graph.metadata.construction.system,
      compatibility: result.graph.metadata.construction.compatibility,
      warnings: result.validation.warnings.map((entry) => entry.code),
      designRevision: result.graph.metadata.designRevision,
      checksum: result.graph.metadata.deterministicChecksum,
    };
  }
  files.set("validation-report.json", json(manifest));
  return files;
}
