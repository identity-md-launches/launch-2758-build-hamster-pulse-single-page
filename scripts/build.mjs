import { copyFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Optional export packaging only. The source itself works without a build step.
const root = fileURLToPath(new URL("../", import.meta.url));
const files = ["index.html", "style.css", "script.js", "favicon.svg", "social-card.png"];
await mkdir(resolve(root, "dist"), { recursive: true });
for (const file of files) {
  await copyFile(resolve(root, file), resolve(root, "dist", file));
  if (!(await readFile(resolve(root, "dist", file))).length) throw new Error(`Empty export: ${file}`);
}
console.log(`Exported ${files.length} unchanged files to dist/. No compilation or dependencies.`);
