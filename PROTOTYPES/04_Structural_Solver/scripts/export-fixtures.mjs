import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_TUNING, FIXTURES, getFixture, solveStructure } from "../dist/index.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixtureDirectory = join(root, "fixtures");
const examplesDirectory = join(root, "examples");
await rm(fixtureDirectory, { recursive: true, force: true });
await mkdir(fixtureDirectory, { recursive: true });
await mkdir(examplesDirectory, { recursive: true });

for (const fixture of FIXTURES) {
  await writeFile(join(fixtureDirectory, `${fixture.id}.StructuralGraph.json`), `${JSON.stringify({ graph: fixture.graph, route: fixture.route }, null, 2)}\n`, "utf8");
}

const example = getFixture("short-supported-beam");
const result = solveStructure(example.graph, example.route, {
  mode: "TEST",
  loadProgress: 1,
  loadMass: 48,
  tuning: DEFAULT_TUNING,
  testId: 4001,
});
await writeFile(join(examplesDirectory, "TestResult.json"), `${JSON.stringify(result.testResult, null, 2)}\n`, "utf8");
console.log(`Exported ${FIXTURES.length} StructuralGraph fixtures and examples/TestResult.json.`);
