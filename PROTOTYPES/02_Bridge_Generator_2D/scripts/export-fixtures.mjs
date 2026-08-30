import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createFixtureFiles } from "./fixture-data.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = join(root, "fixtures", "exports");
const files = createFixtureFiles();

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all([...files].map(([name, content]) => writeFile(join(output, name), content)));
console.log(`Exported ${files.size} deterministic fixtures to ${output}`);
