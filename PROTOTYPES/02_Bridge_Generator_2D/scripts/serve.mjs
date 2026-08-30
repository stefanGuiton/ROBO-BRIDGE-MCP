import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = normalize(new URL("..", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };
const port = Number(process.env.PORT || 4178);

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  let file = normalize(join(root, relative));
  if (!file.startsWith(root) || !existsSync(file)) file = join(root, "index.html");
  if (statSync(file).isDirectory()) file = join(file, "index.html");
  response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  createReadStream(file).pipe(response);
}).listen(port, "127.0.0.1", () => console.log(`ROBO BRIDGE 2D running at http://127.0.0.1:${port}`));
