import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
const port = Number(process.argv[2] || 4173);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png" };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
    const file = resolve(root, `.${pathname.endsWith("/") ? pathname + "index.html" : pathname}`);
    if (!file.startsWith(root + sep) && file !== resolve(root, "index.html")) { res.writeHead(403); res.end(); return; }
    const content = await readFile(file);
    res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(content);
  } catch { res.writeHead(404); res.end("Not found"); }
});
server.listen(port, "127.0.0.1", () => console.log(`Hamster Pulse: http://localhost:${port} (Ctrl+C to stop)`));
