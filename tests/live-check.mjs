// Checks the exported files with real public services; no request fixtures or credentials.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const { chromium } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : "playwright");
const { default: AxeBuilder } = await import(process.argv[3] ? pathToFileURL(resolve(process.argv[3])).href : "@axe-core/playwright");
const output = resolve(root, "test/scratch/live-check");
await mkdir(output, { recursive: true });
await mkdir(resolve(root, "artifacts"), { recursive: true });
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (!pathname.startsWith("/hamster/")) throw new Error("Use subpath");
    const name = pathname.slice(9) || "index.html";
    if (name.includes("..")) throw new Error("Invalid path");
    const data = await readFile(resolve(root, "dist", name));
    res.writeHead(200, { "Content-Type": types[extname(name)] || "application/octet-stream" }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const url = `http://127.0.0.1:${server.address().port}/hamster/`;
const browser = await chromium.launch({ headless: true });
const errors = [], badLocal = [], network = [], report = { views: [], audits: [], contrast: {}, errors, badLocal, network };
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light", reducedMotion: "reduce" });
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", (response) => {
  const address = new URL(response.url());
  if (address.origin === new URL(url).origin && response.status() >= 400) badLocal.push(response.url());
  else if (address.origin !== new URL(url).origin) network.push({ host: address.host, path: address.pathname, status: response.status() });
});
const ratio = (a, b) => {
  const lum = (color) => color.slice(0, 3).map((v) => { const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
  const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
};
try {
  await page.goto(url);
  await page.waitForFunction(() => !document.getElementById("refresh-button").disabled, null, { timeout: 25000 });
  report.liveState = await page.evaluate(() => Object.fromEntries(["hamster-state", "rpm", "speed", "distance", "block-height", "block-percent", "cumulative-work", "published-supply", "chain-supply", "published-exact", "chain-exact", "token-decimals", "rpc-block", "supply-badge", "status-stamp", "core-stamp", "economy-stamp", "rpc-stamp"].map((id) => [id, document.getElementById(id).textContent])));
  assert.notEqual(report.liveState["hamster-state"], "WAITING");
  console.log("Real service state:", JSON.stringify(report.liveState, null, 2));
  await page.locator("#refresh-button").click();
  await page.waitForFunction(() => !document.getElementById("refresh-button").disabled, null, { timeout: 25000 });
  await page.locator("#pause-button").click();
  await page.locator("#pause-button").click();
  await page.waitForFunction(() => !document.getElementById("refresh-button").disabled, null, { timeout: 25000 });
  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [320, 360, 390, 768, 1040, 1440]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      const metrics = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth, heroBottom: document.querySelector(".wheel-panel").getBoundingClientRect().bottom, actionBottom: document.getElementById("refresh-button").getBoundingClientRect().bottom }));
      assert(metrics.scrollWidth <= metrics.viewport, `${theme} ${width}: overflow`);
      if (width === 390) { assert(metrics.heroBottom > 0 && metrics.heroBottom < 844); assert(metrics.actionBottom > 0 && metrics.actionBottom < 844); }
      report.views.push({ theme, ...metrics });
      if ([390, 1440].includes(width)) {
        const name = `hamster-pulse-${width}-${theme}.png`;
        await page.screenshot({ path: resolve(root, "artifacts", name), fullPage: true });
        if (width === 390) await page.screenshot({ path: resolve(root, "artifacts", `hamster-pulse-390-${theme}-first-screen.png`) });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#supply-details summary").click();
    await page.locator("#data-sources summary").click();
    const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    report.audits.push({ theme, violations: audit.violations.map(({ id, impact, description, nodes }) => ({ id, impact, description, targets: nodes.map((node) => node.target) })), passes: audit.passes.length });
    assert.equal(audit.violations.length, 0, `${theme} accessibility violations: ${audit.violations.map((v) => v.id).join(", ")}`);
    await page.locator("#supply-details summary").click(); await page.locator("#data-sources summary").click();
    const pairs = await page.evaluate(() => {
      const rgb = (selector, property) => getComputedStyle(document.querySelector(selector))[property].match(/[\d.]+/g).map(Number);
      const pairs = Object.fromEntries([
        ["page", "body", "body"], ["mutedOnPage", ".page-heading .muted", "body"],
        ["mutedOnWheel", ".wheel-state .muted", ".wheel-panel"], ["mutedOnSurface", ".value-label", ".chain-panel"],
        ["primaryAction", ".primary", ".primary"], ["liveBadge", "#wheel-freshness", "#wheel-freshness"],
      ].map(([name, fg, bg]) => [name, [rgb(fg, "color"), rgb(bg, "backgroundColor")]]));
      const probe = document.createElement("span"); probe.style.color = getComputedStyle(document.documentElement).getPropertyValue("--focus");
      document.body.append(probe);
      const focusColor = getComputedStyle(probe).color.match(/[\d.]+/g).map(Number); probe.remove();
      for (const [name, bg] of [["focusOnPage", "body"], ["focusOnSurface", ".chain-panel"], ["focusOnWheel", ".wheel-panel"]]) pairs[name] = [focusColor, rgb(bg, "backgroundColor")];
      return pairs;
    });
    report.contrast[theme] = Object.fromEntries(Object.entries(pairs).map(([name, [fg, bg]]) => [name, Number(ratio(fg, bg).toFixed(2))]));
    console.log(theme, "axe:", audit.violations.length, "violations;", audit.passes.length, "rules passed; contrast:", report.contrast[theme]);
  }
  assert.deepEqual(errors, []); assert.deepEqual(badLocal, []);
  // Text enlargement and RTL are stress checks, distinct from native browser zoom.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.evaluate(() => window.scrollTo(0, 0));
  report.textEnlargementOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  assert(!report.textEnlargementOverflow, "200% text enlargement overflow");
  await page.screenshot({ path: resolve(output, "text-200-percent.png"), fullPage: true });
  await page.reload(); await page.waitForFunction(() => !document.getElementById("refresh-button").disabled, null, { timeout: 25000 });
  await page.evaluate(() => { document.documentElement.dir = "rtl"; });
  report.rtlOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  assert(!report.rtlOverflow, "RTL mirror overflow");
  console.log("Live interaction, subpath assets, both themes, 12 viewports, axe, 200% text and RTL checks passed.");
} finally {
  await context.close(); await browser.close(); await new Promise((done) => server.close(done));
  await writeFile(resolve(output, "results.json"), JSON.stringify(report, null, 2) + "\n");
}
