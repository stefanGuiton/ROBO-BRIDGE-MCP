import { cp, mkdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
for (const required of ["index.html", "src/app.js", "src/styles.css", "src/engine/generator.js"]) await stat(join(root, required));
const html = await readFile(join(root, "index.html"), "utf8");
if (!html.includes("2D Generator") || !html.includes("/src/app.js")) throw new Error("index.html is missing prototype metadata or entrypoint");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(join(root, "index.html"), join(dist, "index.html"));
await cp(join(root, "src"), join(dist, "src"), { recursive: true });
await cp(join(root, "schemas"), join(dist, "schemas"), { recursive: true });
console.log(`Standalone build ready: ${dist}`);
