import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = normalize(new URL("../", import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, "$1"));
const port = Number(process.env.PORT || 4173);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8" };

createServer((request, response) => {
  try {
    const relative = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname).replace(/^\/+/, "") || "index.html";
    const path = normalize(join(root, relative));
    if (!path.startsWith(root)) throw new Error("outside prototype root");
    const file = statSync(path).isDirectory() ? join(path, "index.html") : path;
    response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`V2 Terrain Generator: http://127.0.0.1:${port}`));
