import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createFixtureFiles } from "./fixture-data.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = join(root, "fixtures", "exports");
const expected = createFixtureFiles();
const actualNames = (await readdir(output)).sort();
const expectedNames = [...expected.keys()].sort();

if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
  throw new Error(`Fixture file set differs. Expected ${expectedNames.join(", ")}; found ${actualNames.join(", ")}.`);
}

const mismatches = [];
await Promise.all(expectedNames.map(async (name) => {
  const actual = (await readFile(join(output, name), "utf8")).replace(/\r\n/g, "\n");
  if (actual !== expected.get(name)) mismatches.push(name);
}));

if (mismatches.length) throw new Error(`Stale deterministic fixtures: ${mismatches.sort().join(", ")}. Run npm run fixtures.`);
console.log(`Verified ${expectedNames.length} deterministic fixture files without modifying them.`);
