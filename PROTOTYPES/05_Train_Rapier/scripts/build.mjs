import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
for (const name of ["index.html", "src", "vendor"]) cpSync(join(root, name), join(dist, name), { recursive: true });
console.log(`Built standalone static prototype at ${dist}`);
