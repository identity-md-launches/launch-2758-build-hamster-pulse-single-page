// Targeted regression checks for the three independent revision findings.
// Run with --reproduce against the accepted export before editing it.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const pw = await import(pathToFileURL(resolve(process.argv[2])).href);
const reproduce = process.argv.includes("--reproduce");
const fixtures = JSON.parse(await readFile(new URL("fixtures.json", import.meta.url), "utf8"));
const output = resolve(root, "test/scratch/revision");
await mkdir(output, { recursive: true });
const results = [];
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (!path.startsWith("/pulse/") || path.includes("..")) throw Error("Invalid path");
    const name = path.slice(7) || "index.html";
    const data = await readFile(reproduce && name === "script.js" ? resolve(output, "accepted-script.js") : resolve(root, "dist", name));
    const type = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" }[extname(name)];
    res.writeHead(200, { "Content-Type": type || "application/octet-stream" }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const url = `http://127.0.0.1:${server.address().port}/pulse/`;

async function scenario(browser, engine, name, run) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light", reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let now = Date.parse("2026-10-31T04:00:00Z");
  let coreTransform = () => {}, statusTransform = () => {};
  const make = () => {
    const data = structuredClone(fixtures);
    data.core.chain.indexedThroughBlock = "12031000";
    Object.assign(data.core.core, { blockHeight: "5000", cumulativeWork: "60000", settledThroughRound: "655" });
    delete data.core.generatedAt;
    data.status.measurement.observedAt = new Date(now - 1000).toISOString();
    data.status.measurement.freshness = "online";
    data.economy.generatedAt = new Date(now - 1000).toISOString();
    data.economy.chain.safeBlockTimestamp = new Date(now - 2000).toISOString();
    coreTransform(data.core); statusTransform(data.status);
    return data;
  };
  await page.clock.install({ time: new Date(now) });
  // Keep the browser clock entirely under test control in both engines.
  await page.clock.pauseAt(new Date(now));
  await page.route("https://api.squeekchain.com/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: make()[path.endsWith("status") ? "status" : path.endsWith("core") ? "core" : "economy"] });
  });
  await page.route("https://ethereum-sepolia-rpc.publicnode.com/**", (route) => route.fulfill({ json: route.request().postDataJSON().map((call) => ({
    jsonrpc: "2.0", id: call.id,
    result: call.method === "eth_chainId" ? "0xaa36a7" : call.method === "eth_getBlockByNumber" ? { number: "0xb79354", timestamp: `0x${Math.floor(now / 1000).toString(16)}` } : `0x${(call.params[0].data === "0x18160ddd" ? BigInt(fixtures.economy.supply.liveSupplyBaseUnits) : 18n).toString(16).padStart(64, "0")}`,
  })) }));
  await context.route("https://sepolia.etherscan.io/**", (route) => route.fulfill({ body: "Explorer navigation verified" }));
  const idle = () => page.waitForFunction(() => !document.getElementById("refresh-button").disabled);
  const text = async (id) => (await page.locator(`#${id}`).textContent()).trim();
  const snapshot = async () => Object.fromEntries(await Promise.all(["block-height", "cumulative-work", "core-freshness", "core-stamp", "settled-round", "chart-description", "work-gain", "settlement-state", "settlement-stamp", "wheel-freshness", "status-stamp", "connection-note"].map(async (id) => [id, await text(id)])));
  const refresh = async () => { await page.locator("#refresh-button").click(); await idle(); };
  const tick = async (ms = 15000) => { now += ms; await page.clock.runFor(ms); await idle(); };
  const api = { page, context, text, snapshot, refresh, tick, idle,
    core: (fn) => { coreTransform = fn; }, status: (fn) => { statusTransform = fn; }, now: () => now };
  try {
    await page.goto(url); await idle();
    const evidence = await run(api);
    assert.deepEqual(errors, []);
    results.push({ engine, name, passed: true, ...evidence });
    console.log(`${reproduce ? "OBSERVED" : "PASS"} ${engine}: ${name}`);
  } catch (error) {
    results.push({ engine, name, passed: false, error: error.message });
    console.log(`FAIL ${engine}: ${name}: ${error.message}`);
    process.exitCode = 1;
  } finally { await context.close(); }
}

try {
  for (const engine of ["chromium", "webkit"]) {
    const browser = await pw[engine].launch();
    try {
      await scenario(browser, engine, "older core index without generatedAt", async (s) => {
        const before = await s.snapshot();
        s.core((data) => { data.chain.indexedThroughBlock = "12030900"; Object.assign(data.core, { blockHeight: "4900", cumulativeWork: "55000", settledThroughRound: "650" }); data.events = []; });
        await s.tick();
        const after = await s.snapshot();
        if (reproduce) { assert.equal(after["block-height"], "4,900"); assert.equal(after["core-freshness"], "Confirmed"); }
        else {
          assert.equal(after["block-height"], "5,000"); assert.equal(after["cumulative-work"], "60,000"); assert.equal(after["settled-round"], "655");
          assert.equal(after["core-freshness"], "Stale reading"); assert(after["core-stamp"].includes("2026-10-31 04:00:00 UTC"));
          assert.equal(after["chart-description"], before["chart-description"]); assert.equal(await s.page.locator("#event-rows tr").count(), 6);
          assert.equal(await s.page.locator("#connection-note").isHidden(), false);
          const saved = await s.page.evaluate(() => JSON.parse(localStorage.getItem("hamster-pulse:readings:v1")).core);
          assert.equal(saved.raw.core.blockHeight, "5000"); assert.equal(saved.indexChangedAt, Date.parse("2026-10-31T04:00:00Z"));
          await s.page.reload(); await s.idle(); assert.equal(await s.text("block-height"), "5,000"); assert.equal(await s.text("core-freshness"), "Stale reading");
          s.core((data) => { data.chain.indexedThroughBlock = "12031001"; data.core.cumulativeWork = "61000"; });
          await s.refresh(); assert.equal(await s.text("core-freshness"), "Confirmed"); assert.equal(await s.text("cumulative-work"), "61,000");
        }
        return { before, after };
      });
      await scenario(browser, engine, "HTTP 200 core generated two minutes ago", async (s) => {
        const before = await s.snapshot();
        s.core((data) => { data.generatedAt = new Date(s.now() - 120000).toISOString(); data.core.blockHeight = "4900"; data.core.cumulativeWork = "55000"; });
        await s.tick(); const after = await s.snapshot();
        assert.equal(after["core-freshness"], "Stale reading");
        if (reproduce) assert.equal(after["cumulative-work"], "55,000");
        else { assert.equal(after["cumulative-work"], "60,000"); assert.equal(after["chart-description"], before["chart-description"]); assert(after["core-stamp"].includes("2026-10-31 04:00:00 UTC")); }
        return { before, after };
      });
      await scenario(browser, engine, "partial settlement outage and cached reload", async (s) => {
        const before = await s.snapshot();
        s.status((data) => { data.settlementQueue = { status: "unavailable" }; data.measurement.rpmMilli = 18750; });
        await s.tick(); const after = await s.snapshot();
        assert.equal(after["wheel-freshness"], "Live reading"); assert.equal(await s.text("rpm"), "18.75");
        if (reproduce) { assert.equal(after["settlement-state"], "Stale · Unavailable"); assert.equal(await s.page.locator("#connection-note").isHidden(), true); }
        else {
          assert.equal(after["settlement-state"], "Stale · Submitted"); assert(after["settlement-stamp"].includes("2026-10-31 03:59:59 UTC"));
          assert(after["settlement-stamp"].includes("Settlement queue unavailable")); assert(after["status-stamp"].includes("04:00:14 UTC"));
          assert.equal(await s.page.locator("#connection-note").isHidden(), false);
          assert((await s.text("source-status")).includes("Settlement queue unavailable"));
          assert((await s.text("announcement")).includes("1 of 4 sources"));
          for (const theme of ["light", "dark"]) {
            await s.page.emulateMedia({ colorScheme: theme });
            for (const width of [360, 390]) {
              await s.page.setViewportSize({ width, height: 844 });
              assert(await s.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
            }
            await s.page.screenshot({ path: resolve(output, `${engine}-queue-stale-${theme}.png`), fullPage: true });
          }
          await s.page.reload(); await s.idle(); assert.equal(await s.text("settlement-state"), "Stale · Submitted");
          assert((await s.text("settlement-stamp")).includes("03:59:59 UTC"));
          s.status((data) => { data.settlementQueue.state = "confirmed"; }); await s.refresh();
          assert.equal(await s.text("settlement-state"), "Confirmed"); assert.equal(await s.page.locator("#connection-note").isHidden(), true);
        }
        return { before, after };
      });
      await scenario(browser, engine, "incoming events preserve focused transaction and Enter", async (s) => {
        const link = s.page.locator(".event-link").first();
        await link.focus(); const href = await link.getAttribute("href");
        await s.page.evaluate(() => { window.retainedEventLink = document.activeElement; });
        s.core((data) => { const next = structuredClone(data.events[0]); next.blockNumber = (BigInt(next.blockNumber) + 1n).toString(); next.blockTimestamp = (BigInt(next.blockTimestamp) + 15n).toString(); next.transactionHash = "0x" + "ab".repeat(32); data.events.unshift(next); });
        await s.tick();
        const after = await s.page.evaluate(() => ({ tag: document.activeElement.tagName, sameNode: document.activeElement === window.retainedEventLink, connected: window.retainedEventLink.isConnected, href: document.activeElement.getAttribute("href") }));
        if (reproduce) { assert.equal(after.tag, "BODY"); assert.equal(after.connected, false); }
        else {
          assert.equal(after.tag, "A"); assert.equal(after.sameNode, true); assert.equal(after.href, href);
          await s.page.screenshot({ path: resolve(output, `${engine}-event-focus.png`) });
          const popup = s.page.waitForEvent("popup"); await s.page.keyboard.press("Enter"); const opened = await popup;
          await opened.waitForURL(href); assert.equal(opened.url(), href); await opened.close();
        }
        return { after };
      });
      if (!reproduce) {
        await scenario(browser, engine, "older generatedAt within freshness and future timestamps are rejected", async (s) => {
          s.core((data) => { data.generatedAt = new Date(s.now() - 1000).toISOString(); });
          await s.refresh(); const before = await s.snapshot(); const generatedAt = s.now() - 1000;
          s.core((data) => { data.generatedAt = new Date(generatedAt - 5000).toISOString(); data.chain.indexedThroughBlock = "12031001"; data.core.cumulativeWork = "61000"; });
          await s.tick(); const after = await s.snapshot();
          assert.equal(after["cumulative-work"], "60,000"); assert.equal(after["core-freshness"], "Stale reading");
          assert(after["core-stamp"].includes("older chain snapshot")); assert(after["core-stamp"].includes("03:59:59 UTC"));
          assert.equal(after["chart-description"], before["chart-description"]);
          s.core((data) => { data.generatedAt = new Date(s.now() + 120000).toISOString(); });
          await s.refresh(); assert((await s.text("core-stamp")).includes("timestamp is ahead"));
          assert.equal(await s.text("chart-description"), before["chart-description"]);
          s.core((data) => { data.generatedAt = new Date(s.now()).toISOString(); data.chain.indexedThroughBlock = "12031001"; data.core.cumulativeWork = "61000"; });
          await s.refresh(); assert.equal(await s.text("core-freshness"), "Confirmed"); assert.equal(await s.text("work-gain"), "+1,000 this session");
          return { before, after };
        });
        await scenario(browser, engine, "lower core counters require reconciliation even at a newer index", async (s) => {
          const before = await s.snapshot();
          s.core((data) => { data.chain.indexedThroughBlock = "12031001"; data.core.cumulativeWork = "55000"; });
          await s.tick(); const after = await s.snapshot();
          assert.equal(after["cumulative-work"], "60,000"); assert(after["core-stamp"].includes("rollback not reconciled"));
          assert.equal(after["chart-description"], before["chart-description"]);
          return { before, after };
        });
        await scenario(browser, engine, "queue and wheel fail independently, including missing queue objects", async (s) => {
          s.status((data) => { data.measurement.rpmMilli = "invalid"; data.settlementQueue.state = "confirmed"; });
          await s.tick(); assert.equal(await s.text("wheel-freshness"), "Stale reading"); assert.equal(await s.text("settlement-state"), "Confirmed");
          s.status((data) => { delete data.settlementQueue; });
          await s.tick(); assert.equal(await s.text("wheel-freshness"), "Live reading"); assert.equal(await s.text("settlement-state"), "Stale · Confirmed");
          assert((await s.text("settlement-stamp")).includes("04:00:14 UTC")); assert((await s.text("settlement-stamp")).includes("Settlement queue unavailable"));
          return { after: await s.snapshot() };
        });
        await scenario(browser, engine, "unavailable queue on first visit stays unknown", async (s) => {
          s.status((data) => { data.settlementQueue = { status: "unavailable" }; });
          await s.page.evaluate(() => localStorage.clear()); await s.page.reload(); await s.idle();
          assert.equal(await s.text("wheel-freshness"), "Live reading"); assert.equal(await s.text("settlement-state"), "Unavailable");
          assert((await s.text("settlement-stamp")).includes("Settlement queue unavailable"));
          assert(!(await s.text("settlement-stamp")).includes("Queue observed"));
          return { after: await s.snapshot() };
        });
        await scenario(browser, engine, "previous v1 cache migrates its successful queue observation", async (s) => {
          await s.page.evaluate(() => { const key = "hamster-pulse:readings:v1"; const cache = JSON.parse(localStorage.getItem(key)); delete cache.settlement; localStorage.setItem(key, JSON.stringify(cache)); });
          s.status((data) => { data.settlementQueue = { status: "unavailable" }; });
          await s.page.reload(); await s.idle();
          assert.equal(await s.text("settlement-state"), "Stale · Submitted"); assert((await s.text("settlement-stamp")).includes("03:59:59 UTC"));
          return { after: await s.snapshot() };
        });
        await scenario(browser, engine, "changed event metadata and ordering retain the same link node", async (s) => {
          const link = s.page.locator(".event-link").first(); await link.focus(); const href = await link.getAttribute("href");
          await s.page.evaluate(() => { window.retainedEventLink = document.activeElement; });
          s.core((data) => { data.events[0].eventName = "Updated event name"; data.events[0].blockTimestamp = (BigInt(data.events[0].blockTimestamp) + 5n).toString(); data.events[1].blockNumber = (BigInt(data.events[0].blockNumber) + 1n).toString(); });
          await s.tick();
          assert(await s.page.evaluate(() => document.activeElement === window.retainedEventLink));
          assert.equal(await s.page.evaluate(() => document.activeElement.getAttribute("href")), href);
          assert((await s.page.evaluate(() => document.activeElement.getAttribute("aria-label"))).includes("Updated event name"));
          return { retainedHref: href };
        });
        await scenario(browser, engine, "removed or empty events move focus deliberately", async (s) => {
          const link = s.page.locator(".event-link").first(); await link.focus(); const href = await link.getAttribute("href");
          s.core((data) => { data.events.shift(); }); await s.tick();
          assert.equal(await s.page.evaluate(() => document.activeElement.className), "event-link");
          assert.notEqual(await s.page.evaluate(() => document.activeElement.getAttribute("href")), href);
          s.core((data) => { data.events = []; }); await s.tick();
          assert.equal(await s.page.evaluate(() => document.activeElement.id), "events-heading");
          assert.equal(await s.page.locator("#events-toggle").isHidden(), true);
          return { activeElement: "events-heading" };
        });
        await scenario(browser, engine, "focused event remains usable beyond the compact six-row window", async (s) => {
          const link = s.page.locator(".event-link").last(); await link.focus(); const href = await link.getAttribute("href");
          await s.page.evaluate(() => { window.retainedEventLink = document.activeElement; });
          s.core((data) => { const next = structuredClone(data.events[0]); next.blockNumber = (BigInt(next.blockNumber) + 1n).toString(); next.transactionHash = "0x" + "ab".repeat(32); data.events.unshift(next); });
          await s.tick();
          assert(await s.page.evaluate(() => document.activeElement === window.retainedEventLink));
          assert.equal(await s.page.evaluate(() => document.activeElement.getAttribute("href")), href);
          assert.equal(await s.page.locator("#event-rows tr").count(), 7); assert.equal(await s.text("event-count"), "7 of 10 events");
          return { retainedHref: href, visibleEvents: 7 };
        });
        await scenario(browser, engine, "unrelated keyboard focus is not moved by incoming events", async (s) => {
          await s.page.locator("#events-toggle").focus();
          s.core((data) => { data.events.shift(); }); await s.tick();
          assert.equal(await s.page.evaluate(() => document.activeElement.id), "events-toggle");
          return { activeElement: "events-toggle" };
        });
      }
    } finally { await browser.close(); }
  }
} finally {
  await new Promise((done) => server.close(done));
  await writeFile(resolve(output, reproduce ? "reproduction.json" : "regression.json"), JSON.stringify(results, null, 2) + "\n");
}
console.log(`${results.filter((r) => r.passed).length}/${results.length} checks ${reproduce ? "reproduced" : "passed"}.`);
