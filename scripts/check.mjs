import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
for (const file of ["script.js", "scripts/build.mjs", "scripts/preview.mjs", "scripts/check.mjs", "tests/validate.mjs", "tests/live-check.mjs"]) {
  const check = spawnSync(process.execPath, ["--check", resolve(root, file)], { encoding: "utf8" });
  assert.equal(check.status, 0, `${file}: ${check.stderr}`);
}
const assets = ["index.html", "style.css", "script.js", "favicon.svg", "social-card.png"];
assert.deepEqual((await readdir(resolve(root, "dist"))).sort(), [...assets].sort(), "Export must contain only runtime assets");
let bytes = 0;
for (const file of assets) {
  const source = await readFile(resolve(root, file));
  assert(source.equals(await readFile(resolve(root, "dist", file))), `Export differs from source: ${file}`);
  bytes += (await stat(resolve(root, "dist", file))).size;
}
const html = await readFile(resolve(root, "index.html"), "utf8");
for (const asset of assets.slice(1)) assert(html.includes(`./${asset}`), `Missing relative asset: ${asset}`);
for (const meta of ["description", "og:title", "og:image"]) assert(html.includes(`\"${meta}\"`), `Missing metadata: ${meta}`);
assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, "Exactly one main heading");
assert.equal((html.match(/<script[\s>]/g) || []).length, 1, "Exactly one script");
assert(bytes < 8388608, "Export exceeds 8 MiB");
const png = await readFile(resolve(root, "dist/social-card.png"));
assert.equal(png.readUInt32BE(16), 1200, "Share image width");
assert.equal(png.readUInt32BE(20), 630, "Share image height");
const lock = JSON.parse(await readFile(resolve(root, "package-lock.json"), "utf8"));
assert.deepEqual(Object.keys(lock.packages), [""], "The project has no package dependencies");
// Explicit delivery budget: all source/config/docs plus the four delivered directories.
const paths = [".gitignore", "index.html", "style.css", "script.js", "favicon.svg", "social-card.png", "social-card.svg", "package.json", "package-lock.json", "jsconfig.json", "README.md", "DESIGN.md", "scripts", "tests", "dist", "artifacts"];
async function deliverySize(path) {
  const file = resolve(root, path);
  const info = await stat(file);
  if (!info.isDirectory()) {
    assert(!/\.(?:tgz|zip|deb|tar|gz)$/.test(path), `Unnecessary archive: ${path}`);
    return info.size;
  }
  let size = 0;
  for (const entry of await readdir(file)) {
    assert(!["node_modules", ".cache", ".npm", ".playwright-mcp"].includes(entry), `Generated dependency/cache directory: ${path}/${entry}`);
    size += await deliverySize(`${path}/${entry}`);
  }
  return size;
}
let delivered = 0;
for (const path of paths) delivered += await deliverySize(path);
assert(delivered <= 8388608, `Delivery exceeds 8 MiB: ${delivered}`);
console.log(`Syntax, metadata, relative assets, source/export equality, share image and dependency checks passed. Export: ${bytes.toLocaleString()} bytes. Delivery: ${delivered.toLocaleString()} / 8,388,608 bytes.`);
