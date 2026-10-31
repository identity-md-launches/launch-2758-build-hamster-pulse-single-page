// Browser-only validation tooling; no test package is shipped in the static export.
// Fixtures are captured public API shapes, served only by this test's request interception.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const pw = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : "playwright");
const fixture = JSON.parse(await readFile(new URL("./fixtures.json", import.meta.url), "utf8"));
const out = resolve(root, "test/scratch/validation");
await mkdir(out, { recursive: true });
const results = [];
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (!path.startsWith("/pulse/")) throw new Error("Use the test subpath");
    const relative = path.slice(7) || "index.html";
    if (relative.includes("..")) throw new Error("Invalid path");
    const data = await readFile(resolve(root, "dist", relative));
    const type = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" }[extname(relative)];
    res.writeHead(200, { "Content-Type": type || "application/octet-stream" }); res.end(data);
  } catch { res.writeHead(404); res.end("Not found"); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const url = `http://127.0.0.1:${server.address().port}/pulse/`;
let browser;

async function suite(engine, browserType) {
  browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light", reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  let now = Date.now();
  await page.clock.install({ time: new Date(now) });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const failures = new Set();
  let delta = 0n, running = false, work = 55902n, staleWheel = false, staleEconomy = false;
  let malformedRpc = false, wrongChain = false, emptyEvents = false, hostile = false;
  const calls = { status: 0, core: 0, economy: 0, rpc: 0 };
  const states = () => {
    const data = structuredClone(fixture);
    data.status.measurement.observedAt = new Date(now - 1000).toISOString();
    data.status.measurement.freshness = staleWheel ? "stale" : "online";
    data.status.measurement.coreStatus = running ? "RUNNING" : "IDLE";
    data.status.measurement.rpmMilli = running ? 18750 : 0;
    data.status.measurement.speedMmPerSecond = running ? 140.5 : 0;
    data.core.core.cumulativeWork = work.toString();
    data.economy.generatedAt = new Date(now - (staleEconomy ? 120000 : 2000)).toISOString();
    data.economy.chain.safeBlockTimestamp = new Date(now - 150000).toISOString();
    if (emptyEvents) data.core.events = [];
    if (hostile) { data.core.events[0].eventName = '<img src=x onerror="alert(1)">'; data.core.events[0].transactionHash = "javascript:alert(1)"; }
    return data;
  };
  await page.route("https://api.squeekchain.com/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const key = path.endsWith("/status") ? "status" : path.endsWith("/core") ? "core" : "economy";
    calls[key]++;
    if (failures.has(key)) { await route.fulfill({ status: 503, body: "Unavailable" }); return; }
    await route.fulfill({ json: states()[key] });
  });
  await page.route("https://ethereum-sepolia-rpc.publicnode.com/**", async (route) => {
    calls.rpc++;
    if (failures.has("rpc")) { await route.abort("failed"); return; }
    const request = route.request().postDataJSON();
    const response = request.map((call) => {
      let result;
      if (call.method === "eth_chainId") result = wrongChain ? "0x1" : "0xaa36a7";
      else if (call.method === "eth_getBlockByNumber") result = { number: "0xb79354", timestamp: `0x${Math.floor((now - 3000) / 1000).toString(16)}` };
      else if (call.params[0].data === "0x18160ddd") result = malformedRpc ? "0x" : `0x${(BigInt(fixture.economy.supply.liveSupplyBaseUnits) + delta).toString(16).padStart(64, "0")}`;
      else if (call.params[0].data === "0x313ce567") result = "0x" + (18).toString(16).padStart(64, "0");
      else throw new Error("Unexpected RPC method");
      return { jsonrpc: "2.0", id: call.id, result };
    });
    await route.fulfill({ json: response });
  });
  async function text(id) { return (await page.locator(`#${id}`).textContent()).trim(); }
  async function expectText(id, expected) { await page.waitForFunction(([id, expected]) => document.getElementById(id)?.textContent?.trim() === expected, [id, expected]); }
  async function refresh() { await page.locator("#refresh-button").click(); await page.waitForFunction(() => !document.getElementById("refresh-button").disabled); }
  async function test(name, fn) {
    try { await fn(); results.push({ engine, name, passed: true }); console.log(`PASS ${engine}: ${name}`); }
    catch (error) { results.push({ engine, name, passed: false, error: error.message }); if (!page.isClosed()) await page.screenshot({ path: resolve(out, `${engine}-failure.png`), fullPage: true }); throw error; }
  }
  await page.goto(url);
  await page.waitForFunction(() => !document.getElementById("refresh-button").disabled);

  await test("first screen, exact supply, actual schema and zero values", async () => {
    assert.equal(await text("supply-badge"), "Match"); assert.equal(await text("hamster-state"), "IDLE");
    assert.equal(await text("rpm"), "0"); assert.equal(await text("speed"), "0"); assert.equal(await text("total-staked"), "0.00");
    assert.equal(await text("block-height"), "4,973"); assert.equal(await text("block-percent"), "5.3%");
    assert.equal(await text("published-exact"), fixture.economy.supply.liveSupplyBaseUnits);
    assert.equal(await page.locator("#event-rows tr").count(), 6);
    const mainAction = await page.locator("#refresh-button").boundingBox(); const hero = await page.locator(".wheel-panel").boundingBox();
    assert(mainAction.y + mainAction.height < 844 && hero.y + hero.height < 844);
    assert.equal(await page.locator('script[src="./script.js"]').count(), 1);
  });
  await test("15 second automatic poll and stable event focus", async () => {
    const before = calls.core; await page.locator(".event-link").first().focus();
    now += 15000; await page.clock.runFor(15000); await page.waitForFunction(() => !document.getElementById("refresh-button").disabled);
    assert.equal(calls.core, before + 1);
    assert(await page.locator(".event-link").first().evaluate((el) => document.activeElement === el));
  });
  await test("refresh changes running telemetry and extends real session chart", async () => {
    running = true; work = 61023n; now += 1000;
    await refresh(); assert.equal(await text("hamster-state"), "RUNNING"); assert.equal(await text("rpm"), "18.75"); assert.equal(await text("speed"), "140.5");
    assert.equal(await text("work-gain"), "+5,121 this session"); assert((await page.locator("#chart-line").getAttribute("d")).includes("L"));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: resolve(out, `${engine}-390-running.png`), fullPage: true });
  });
  await test("one base unit mismatch survives display rounding", async () => {
    delta = 1n; await refresh(); assert.equal(await text("supply-badge"), "Mismatch");
    assert((await text("supply-comparison")).includes("0.000000000000000001"));
    await page.locator("#supply-details summary").click();
    assert.equal(await text("chain-exact"), (BigInt(fixture.economy.supply.liveSupplyBaseUnits) + 1n).toString());
    await page.locator("#supply-details summary").click(); delta = 0n; await refresh();
  });
  await test("event expansion and safe explorer links", async () => {
    await page.locator("#events-toggle").click(); assert.equal(await page.locator("#event-rows tr").count(), 9);
    assert.equal(await page.locator("#events-toggle").getAttribute("aria-expanded"), "true");
    const link = page.locator(".event-link").first();
    assert.match(await link.getAttribute("href"), /^https:\/\/sepolia\.etherscan\.io\/tx\/0x[0-9a-f]{64}$/);
    assert.equal(await link.getAttribute("rel"), "noopener noreferrer");
    await page.locator("#events-toggle").click(); assert.equal(await page.locator("#event-rows tr").count(), 6);
  });
  await test("each unavailable source retains values with stale timestamps", async () => {
    const value = await text("cumulative-work"); const supply = await text("published-supply");
    for (const source of ["status", "core", "economy", "rpc"]) {
      failures.add(source); await refresh();
      const stamp = { status: "status-stamp", core: "core-stamp", economy: "economy-stamp", rpc: "rpc-stamp" }[source];
      assert((await text(stamp)).startsWith("Stale ·"), source); assert.match(await text(stamp), /202\d-\d\d-\d\d .* UTC/);
      assert.equal(await text("cumulative-work"), value); assert.equal(await text("published-supply"), supply);
      if (source === "economy" || source === "rpc") assert.equal(await text("supply-badge"), "Stale · Match");
      failures.delete(source); await refresh();
    }
    assert.equal(await text("supply-badge"), "Match");
  });
  await test("browser offline signal immediately marks cached readings stale", async () => {
    await context.setOffline(true);
    await expectText("supply-badge", "Stale · Match");
    assert((await text("status-stamp")).includes("Browser is offline"));
    assert((await text("work-stamp")).startsWith("Stale ·"));
    await context.setOffline(false);
    await page.waitForFunction(() => !document.getElementById("refresh-button").disabled);
    await expectText("supply-badge", "Match");
  });
  await test("successful but stale payloads are explicitly stale", async () => {
    staleWheel = true; staleEconomy = true; await refresh();
    assert.equal(await text("wheel-freshness"), "Stale reading"); assert.equal(await text("supply-badge"), "Stale · Match");
    assert((await text("status-stamp")).includes("Sensor reports stale"));
    staleWheel = false; staleEconomy = false; await refresh();
  });
  await test("RPC malformed data and wrong network cannot falsely verify", async () => {
    malformedRpc = true; await refresh(); assert.equal(await text("supply-badge"), "Stale · Match");
    assert((await text("rpc-stamp")).includes("Invalid totalSupply()"));
    malformedRpc = false; wrongChain = true; await refresh(); assert((await text("rpc-stamp")).includes("RPC is not on Sepolia"));
    wrongChain = false; await refresh(); assert.equal(await text("supply-badge"), "Match");
  });
  await test("pause stops requests, manual refresh works, resume restarts polling", async () => {
    await page.locator("#pause-button").click(); const before = { ...calls };
    now += 65000; await page.clock.runFor(65000);
    assert.deepEqual(calls, before); assert.equal(await text("poll-note"), "Automatic updates paused");
    assert.equal(await text("supply-badge"), "Stale · Match");
    await refresh(); assert(calls.core > before.core); assert.equal(await text("supply-badge"), "Match");
    assert.equal(await page.locator("#pause-button").getAttribute("aria-pressed"), "true");
    await page.locator("#pause-button").click(); await page.waitForFunction(() => !document.getElementById("refresh-button").disabled);
    assert.equal(await page.locator("#pause-button").getAttribute("aria-pressed"), "false");
  });
  await test("empty events and untrusted event text", async () => {
    emptyEvents = true; await refresh(); assert((await text("event-rows")).includes("No core events")); assert(await page.locator("#events-toggle").isHidden());
    emptyEvents = false; hostile = true; await refresh(); assert.equal(await page.locator("#event-rows img").count(), 0);
    assert((await text("event-rows")).includes("<img src=x")); assert.equal(await page.locator("#event-rows tr").first().locator("a").count(), 0);
    hostile = false; await refresh();
  });
  await test("cached reload during complete outage keeps all readings", async () => {
    for (const source of Object.keys(calls)) failures.add(source);
    await page.reload(); await page.waitForFunction(() => !document.getElementById("refresh-button").disabled);
    assert.equal(await text("hamster-state"), "RUNNING"); assert.equal(await text("cumulative-work"), "61,023"); assert.equal(await text("supply-badge"), "Stale · Match");
    for (const id of ["status-stamp", "core-stamp", "economy-stamp", "rpc-stamp"]) assert((await text(id)).startsWith("Stale ·"));
    assert.equal(await page.locator("#event-rows tr").count(), 6); assert.equal(await text("work-gain"), "Awaiting first sample");
    await page.screenshot({ path: resolve(out, `${engine}-390-offline-cache.png`), fullPage: true });
    failures.clear(); await refresh();
  });
  await test("mobile, tablet, desktop and both system themes reflow", async () => {
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme });
      for (const width of [320, 360, 390, 768, 1040, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => window.scrollTo(0, 0));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
        assert(!overflow, `${theme} ${width}: horizontal overflow`);
        for (const id of ["mining-issued", "total-staked", "staking-paid"]) {
          const lines = await page.locator(`#${id}`).evaluate((el) => { const range = document.createRange(); range.selectNodeContents(el); return range.getClientRects().length; });
          assert.equal(lines, 1, `${theme} ${width}: ${id} splits across lines`);
        }
        if ([390, 1440].includes(width)) await page.screenshot({ path: resolve(out, `${engine}-${width}-${theme}.png`), fullPage: true });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "light" });
  });
  await test("keyboard controls and sources disclosure", async () => {
    await page.locator("#pause-button").focus(); await page.keyboard.press("Enter"); assert.equal(await text("pause-label"), "Resume");
    const focus = await page.locator("#pause-button").evaluate((el) => { const css = getComputedStyle(el); return { width: css.outlineWidth, style: css.outlineStyle }; });
    assert.equal(focus.style, "solid"); assert.equal(focus.width, "2px");
    await page.screenshot({ path: resolve(out, `${engine}-keyboard-focus.png`) });
    await page.locator("#sources-link").click(); assert(await page.locator("#data-sources").evaluate((el) => el.open));
    await page.locator("#data-sources summary").focus(); await page.keyboard.press("Enter"); assert(!(await page.locator("#data-sources").evaluate((el) => el.open)));
    await page.locator("#pause-button").click(); await page.waitForFunction(() => !document.getElementById("refresh-button").disabled);
  });
  await test("no script errors or missing local runtime files", async () => {
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('link[rel="icon"]').getAttribute("href"), "./favicon.svg");
    const animationCount = await page.evaluate(() => document.getAnimations().length); assert.equal(animationCount, 0);
  });
  await context.close();

  await test("first visit with all sources down is honest and recoverable", async () => {
    const fresh = await browser.newContext(); const tab = await fresh.newPage();
    await tab.route(/https:\/\/(api\.squeekchain\.com|ethereum-sepolia-rpc\.publicnode\.com)/, (route) => route.fulfill({ status: 503, body: "Unavailable" }));
    await tab.goto(url); await tab.waitForFunction(() => !document.getElementById("refresh-button").disabled);
    assert.equal(await tab.locator("#hamster-state").textContent(), "UNKNOWN"); assert.equal(await tab.locator("#supply-badge").textContent(), "Unverified");
    assert.equal(await tab.locator("#rpm").textContent(), "—"); assert((await tab.locator("#status-stamp").textContent()).includes("HTTP 503"));
    await fresh.close();
  });
  await test("disabled browser storage does not prevent live readings", async () => {
    const storage = await browser.newContext(); const tab = await storage.newPage();
    await tab.addInitScript(() => {
      Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage disabled for test"); } });
    });
    await tab.route("https://api.squeekchain.com/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      const key = path.endsWith("/status") ? "status" : path.endsWith("/core") ? "core" : "economy";
      return route.fulfill({ json: states()[key] });
    });
    await tab.route("https://ethereum-sepolia-rpc.publicnode.com/**", (route) => route.fulfill({ status: 503, body: "Unavailable" }));
    await tab.goto(url); await tab.waitForFunction(() => !document.getElementById("refresh-button").disabled);
    assert.equal(await tab.locator("#hamster-state").textContent(), "RUNNING");
    assert((await tab.locator("#storage-note").textContent()).includes("kept in memory"));
    await storage.close();
  });
  await browser.close(); browser = undefined;
}

try {
  await suite("chromium", pw.chromium);
  try { await suite("webkit", pw.webkit); }
  catch (error) {
    if (error.message.includes("Host system is missing dependencies")) { results.push({ engine: "webkit", name: "browser launch", passed: false, limitation: error.message }); console.log("LIMITATION: WebKit host libraries unavailable."); }
    else throw error;
  }
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
  await writeFile(resolve(out, "results.json"), JSON.stringify(results, null, 2) + "\n");
}
console.log(`${results.filter((item) => item.passed).length} browser checks passed; ${results.filter((item) => !item.passed).length} failures/limitations.`);
if (results.some((item) => !item.passed && !item.limitation)) process.exitCode = 1;
