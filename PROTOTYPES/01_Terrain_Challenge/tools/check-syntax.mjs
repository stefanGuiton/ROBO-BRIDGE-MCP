import { readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = [];
function visit(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === "vendor" || entry.name === "node_modules") continue;
    const target = join(path, entry.name);
    if (entry.isDirectory()) visit(target);
    else if (extname(entry.name) === ".js" || extname(entry.name) === ".mjs") files.push(target);
  }
}
visit(root);
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax OK: ${files.length} source and test files.`);
