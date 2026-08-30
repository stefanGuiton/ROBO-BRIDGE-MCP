import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const prototypeRoot = normalize(new URL("..", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const requestedRoot = process.argv[2] === "dist" ? join(prototypeRoot, "dist") : prototypeRoot;
const root = resolve(requestedRoot);
const port = Number(process.env.PORT || 4181);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".md": "text/markdown; charset=utf-8",
};

if (!existsSync(root)) throw new Error(`Serve root does not exist: ${root}`);

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  let file = resolve(root, relative);
  if (!file.startsWith(root) || !existsSync(file)) file = join(root, "index.html");
  if (statSync(file).isDirectory()) file = join(file, "index.html");
  response.writeHead(200, {
    "Content-Type": types[extname(file)] || "application/octet-stream",
    "Cache-Control": "no-store",
    "Cross-Origin-Resource-Policy": "same-origin",
  });
  createReadStream(file).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`ROBO BRIDGE Rapier train running at http://127.0.0.1:${port}`);
});
