import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileBridgeGraph } from "../src/compiler.js";
import { FIXTURES } from "../src/fixtures.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const graphDirectory = resolve(root, "examples/graphs");
const outputDirectory = resolve(root, "examples/build-plans");
await mkdir(graphDirectory, { recursive: true });
await mkdir(outputDirectory, { recursive: true });

for (const [name, graph] of Object.entries(FIXTURES)) {
  const result = compileBridgeGraph(graph);
  await writeFile(resolve(graphDirectory, `${name}.BridgeGraph2D.json`), `${JSON.stringify(graph, null, 2)}\n`);
  await writeFile(resolve(outputDirectory, `${name}.BuildPlan.json`), `${JSON.stringify(result.buildPlan, null, 2)}\n`);
  await writeFile(resolve(outputDirectory, `${name}.member-map.json`), `${JSON.stringify(result.memberToPlacements, null, 2)}\n`);
  await writeFile(resolve(outputDirectory, `${name}.dependency-graph.json`), `${JSON.stringify(result.dependencyGraph, null, 2)}\n`);
  await writeFile(resolve(outputDirectory, `${name}.diagnostics.json`), `${JSON.stringify(result.diagnostics, null, 2)}\n`);
}
console.log(`Generated ${Object.keys(FIXTURES).length} graph and BuildPlan example sets.`);
