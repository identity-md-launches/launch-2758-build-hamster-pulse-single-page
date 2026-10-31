// @ts-check
"use strict";

/** @typedef {{ observedAt: number, staleAfterMs: number, freshness: string, state: string, rpm: number, speed: number, distance: number, provenance: string }} WheelData */
/** @typedef {{ observedAt: number, state: string }} SettlementData */
/** @typedef {{ name: string, round: string | null, timestamp: number, transaction: string | null, block: string, log: string }} CoreEvent */
/** @typedef {{ height: string, progress: string, unitsPerBlock: string, work: string, rate: string, round: string, indexedBlock: string, generatedAt: number | null, paused: boolean, events: CoreEvent[] }} CoreData */
/** @typedef {{ generatedAt: number, indexTimestamp: number | null, supply: string, cap: string, decimals: number, mined: string, staked: string, paid: string, processedRound: string, stakingPaused: boolean, paused: boolean }} EconomyData */
/** @typedef {{ supply: string, decimals: number, block: string, blockAt: number }} RpcData */
/** @template T @typedef {{ data: T | null, raw: unknown, receivedAt: number, indexChangedAt: number, cached: boolean, error: string }} Reading */
/** @typedef {"status" | "core" | "economy" | "rpc"} Source */
/** @typedef {Source | "settlement"} ReadingName */

const CONFIG = Object.freeze({
  api: "https://api.squeekchain.com/v1",
  rpc: "https://ethereum-sepolia-rpc.publicnode.com",
  token: "0x5501e1fa81be1c3f49225fa7668da0245d07db60",
  chainId: 11155111n,
  pollMs: 15000,
  timeoutMs: 9000,
  staleMs: 60000,
  indexStaleMs: 600000,
  rpcBlockStaleMs: 180000,
  cacheKey: "hamster-pulse:readings:v1",
});

/** @template T @returns {Reading<T>} */
function emptyReading() {
  return { data: null, raw: null, receivedAt: 0, indexChangedAt: 0, cached: false, error: "" };
}

/** @type {{status: Reading<WheelData>, settlement: Reading<SettlementData>, core: Reading<CoreData>, economy: Reading<EconomyData>, rpc: Reading<RpcData>}} */
const readings = { status: emptyReading(), settlement: emptyReading(), core: emptyReading(), economy: emptyReading(), rpc: emptyReading() };
/** @type {Source[]} */
const sources = ["status", "core", "economy", "rpc"];
/** @type {ReadingName[]} */
const cacheNames = [...sources, "settlement"];
/** @type {{at: number, value: bigint}[]} */
const samples = [];
let refreshing = false;
let paused = false;
let showAllEvents = false;
let nextRefresh = Date.now() + CONFIG.pollMs;
let lastSummary = "";
let renderedEventKey = "";
let renderedExpanded = false;

/** @param {string} id @returns {HTMLElement} */
function element(id) {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing dashboard element: ${id}`);
  return found;
}
/** @param {string} id @param {string} value */
function setText(id, value) {
  const target = element(id);
  if (target.textContent !== value) target.textContent = value;
}
/** @param {string} id @param {string} text @param {string} tone */
function badge(id, text, tone) {
  setText(id, text);
  element(id).className = `badge ${tone}`;
}

class DataError extends Error {}
/** @param {unknown} value @returns {Record<string, unknown>} */
function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DataError("Unexpected response format");
  return /** @type {Record<string, unknown>} */ (value);
}
/** @param {unknown} value @param {string} label @returns {string} */
function string(value, label) {
  if (typeof value !== "string" || !value.length || value.length > 500) throw new DataError(`${label} not reported`);
  return value;
}
/** @param {unknown} value @param {string} label @returns {string} */
function uint(value, label) {
  const result = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof result !== "string" || !/^\d{1,78}$/.test(result)) throw new DataError(`Invalid ${label}`);
  return BigInt(result).toString();
}
/** @param {unknown} value @param {string} label @returns {number} */
function number(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) throw new DataError(`Invalid ${label}`);
  return value;
}
/** @param {unknown} value @param {string} label @returns {number} */
function timestamp(value, label) {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) throw new DataError(`Invalid ${label}`);
  return parsed;
}
/** @param {unknown} value @returns {number | null} */
function optionalTimestamp(value) {
  try { return timestamp(value, "timestamp"); } catch { return null; }
}
/** @param {unknown} value @returns {string | null} */
function transactionHash(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value) ? value : null;
}
/** @param {Record<string, unknown>} payload */
function available(payload) {
  if (payload.status !== "available") throw new DataError("Source reports unavailable");
}
/** @param {unknown} chain */
function sepolia(chain) {
  if (BigInt(uint(object(chain).chainId, "chain ID")) !== CONFIG.chainId) throw new DataError("Source is not on Sepolia");
}
/** @param {unknown} raw @returns {WheelData} */
function parseStatus(raw) {
  const payload = object(raw);
  const m = object(payload.measurement);
  const coreState = string(m.coreStatus, "Wheel state");
  if (coreState !== "RUNNING" && coreState !== "IDLE") throw new DataError("Unrecognized wheel state");
  return {
    observedAt: timestamp(m.observedAt, "wheel observation time"),
    staleAfterMs: Math.min(3600000, Math.max(1000, number(m.staleAfterSeconds, "wheel stale threshold") * 1000)),
    freshness: string(m.freshness, "Sensor freshness"),
    state: coreState, rpm: number(m.rpmMilli, "cadence") / 1000,
    speed: number(m.speedMmPerSecond, "speed"), distance: number(m.distanceMm, "distance"),
    provenance: string(m.provenance, "Sensor provenance"),
  };
}
/** @param {unknown} raw @returns {SettlementData} */
function parseSettlement(raw) {
  const payload = object(raw);
  let q;
  try { q = object(payload.settlementQueue); }
  catch { throw new DataError("Settlement queue unavailable"); }
  if (q.status !== "available" || typeof q.state !== "string" || !q.state.length) throw new DataError("Settlement queue unavailable");
  return {
    state: string(q.state, "Settlement state"),
    // The status schema has no queue time; retain the successful response's observation time.
    observedAt: optionalTimestamp(q.observedAt) ?? timestamp(object(payload.measurement).observedAt, "queue observation time"),
  };
}
/** @param {unknown} raw @returns {CoreData} */
function parseCore(raw) {
  const payload = object(raw);
  available(payload);
  sepolia(payload.chain);
  const core = object(payload.core);
  const config = object(payload.configuration);
  const units = uint(config.blockUnitsPerBlock, "block units");
  const progress = uint(core.blockProgress, "block progress");
  if (BigInt(units) === 0n || BigInt(progress) >= BigInt(units)) throw new DataError("Invalid block progress scale");
  if (!Array.isArray(payload.events)) throw new DataError("Events not reported");
  const events = payload.events.map((item) => {
    const event = object(item);
    const args = Array.isArray(event.arguments) ? event.arguments.map(object) : [];
    const round = args.find((arg) => arg.name === "roundId" || arg.name === "settledThroughRound");
    const seconds = uint(event.blockTimestamp, "event time");
    const eventTime = Number(seconds) * 1000;
    if (!Number.isFinite(eventTime) || eventTime > 8640000000000000) throw new DataError("Invalid event time");
    return {
      name: string(event.eventName, "Event name"), round: round ? uint(round.value, "event round") : null,
      timestamp: eventTime, transaction: transactionHash(event.transactionHash),
      block: uint(event.blockNumber, "event block"), log: uint(event.logIndex, "event log"),
    };
  });
  events.sort((a, b) => {
    const diff = BigInt(b.block) - BigInt(a.block) || BigInt(b.log) - BigInt(a.log);
    return diff > 0n ? 1 : diff < 0n ? -1 : 0;
  });
  // Deduplicate logs without trusting remote HTML or ordering.
  const unique = events.filter((event, i, all) => all.findIndex((item) => item.block === event.block && item.log === event.log) === i).slice(0, 25);
  return {
    height: uint(core.blockHeight, "block height"), progress, unitsPerBlock: units,
    work: uint(core.cumulativeWork, "cumulative work"), rate: uint(core.workPerThousandBlocks, "work rate"),
    round: uint(core.settledThroughRound, "settled round"), indexedBlock: uint(object(payload.chain).indexedThroughBlock, "indexed block"),
    generatedAt: optionalTimestamp(payload.generatedAt), paused: core.paused === true, events: unique,
  };
}
/** @param {unknown} raw @returns {EconomyData} */
function parseEconomy(raw) {
  const payload = object(raw);
  available(payload);
  sepolia(payload.chain);
  const asset = object(payload.asset);
  if (typeof asset.address !== "string" || asset.address.toLowerCase() !== CONFIG.token) throw new DataError("Published token address differs from SQK");
  const decimals = number(asset.decimals, "token decimals");
  if (!Number.isInteger(decimals) || decimals > 36) throw new DataError("Unsupported token decimals");
  const supply = object(payload.supply);
  const staking = object(payload.staking);
  const mining = object(payload.mining);
  return {
    generatedAt: timestamp(payload.generatedAt, "economy generation time"),
    indexTimestamp: optionalTimestamp(object(payload.chain).safeBlockTimestamp),
    supply: uint(supply.liveSupplyBaseUnits, "published supply"), cap: uint(supply.capBaseUnits, "supply cap"), decimals,
    mined: uint(supply.miningMintedBaseUnits, "mining issued"), staked: uint(staking.totalStakedBaseUnits, "total staked"),
    paid: uint(object(staking.rewards).paidBaseUnits, "staking rewards paid"),
    processedRound: uint(mining.processedThroughRound, "mining round"), stakingPaused: staking.paused === true,
    paused: object(payload.lifecycle).paused === true,
  };
}
/** @param {unknown} raw @returns {RpcData} */
function parseRpc(raw) {
  const data = object(raw);
  const decimals = number(data.decimals, "on-chain decimals");
  const blockAt = number(data.blockAt, "RPC block timestamp");
  if (!Number.isInteger(decimals) || decimals > 36) throw new DataError("Unsupported on-chain decimals");
  if (blockAt <= 0 || !Number.isFinite(new Date(blockAt).getTime())) throw new DataError("Invalid RPC block timestamp");
  return { supply: uint(data.supply, "on-chain supply"), decimals, block: uint(data.block, "RPC block"), blockAt };
}

/** @param {string} url @param {RequestInit} [options] @returns {Promise<unknown>} */
async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
    if (!response.ok) throw new DataError(`HTTP ${response.status}; retrying automatically`);
    try { return await response.json(); }
    catch (error) { if (controller.signal.aborted) throw error; throw new DataError("Source returned invalid JSON"); }
  } catch (error) {
    if (controller.signal.aborted) throw new DataError("Request timed out");
    throw error;
  } finally { clearTimeout(timeout); }
}
/** @param {{id: number, method: string, params: unknown[]}[]} calls @returns {Promise<Record<string, unknown>[]>} */
async function rpcBatch(calls) {
  const response = await request(CONFIG.rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(calls.map((call) => ({ jsonrpc: "2.0", ...call }))) });
  if (!Array.isArray(response)) throw new DataError("Unexpected RPC response");
  return response.map(object);
}
/** @param {Record<string, unknown>[]} responses @param {number} id @returns {unknown} */
function rpcResult(responses, id) {
  const response = responses.find((item) => item.id === id);
  if (!response || response.error || response.result == null) throw new DataError("Sepolia RPC could not read the contract");
  return response.result;
}
/** @param {unknown} value @param {string} label @returns {bigint} */
function hexInteger(value, label) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(value)) throw new DataError(`Invalid ${label}`);
  return BigInt(value);
}
/** @param {unknown} value @param {string} label @returns {bigint} */
function contractInteger(value, label) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new DataError(`Invalid ${label}`);
  return BigInt(value);
}
/** @returns {Promise<RpcData>} */
async function readSupply() {
  const head = await rpcBatch([{ id: 1, method: "eth_chainId", params: [] }, { id: 2, method: "eth_getBlockByNumber", params: ["latest", false] }]);
  if (hexInteger(rpcResult(head, 1), "RPC chain ID") !== CONFIG.chainId) throw new DataError("RPC is not on Sepolia");
  const block = object(rpcResult(head, 2));
  const blockNumber = hexInteger(block.number, "RPC block");
  const blockAt = Number(hexInteger(block.timestamp, "RPC timestamp")) * 1000;
  const tag = `0x${blockNumber.toString(16)}`;
  const calls = await rpcBatch([
    { id: 3, method: "eth_call", params: [{ to: CONFIG.token, data: "0x18160ddd" }, tag] },
    { id: 4, method: "eth_call", params: [{ to: CONFIG.token, data: "0x313ce567" }, tag] },
  ]);
  return parseRpc({ supply: contractInteger(rpcResult(calls, 3), "totalSupply()").toString(), decimals: Number(contractInteger(rpcResult(calls, 4), "decimals()")), block: blockNumber.toString(), blockAt });
}

/** @template T @param {Reading<T>} entry @param {(raw: unknown) => T} parse @param {unknown} raw @param {number} receivedAt @param {number} indexChangedAt */
function restore(entry, parse, raw, receivedAt, indexChangedAt) {
  if (!Number.isFinite(receivedAt) || receivedAt <= 0 || receivedAt > Date.now() + 60000) return;
  try {
    entry.data = parse(raw); entry.raw = raw; entry.receivedAt = receivedAt;
    entry.indexChangedAt = Number.isFinite(indexChangedAt) && indexChangedAt > 0 && indexChangedAt <= receivedAt + 60000 ? indexChangedAt : receivedAt; entry.cached = true;
  } catch { /* Ignore corrupt or incompatible saved readings independently. */ }
}
function restoreCache() {
  try {
    const saved = localStorage.getItem(CONFIG.cacheKey);
    if (!saved || saved.length > 300000) return;
    const cache = object(JSON.parse(saved));
    for (const name of cacheNames) {
      try {
        // Migrate v1 caches that predate independently saved queue observations.
        const item = object(name === "settlement" ? cache.settlement ?? cache.status : cache[name]);
        const time = number(item.receivedAt, "saved time");
        const indexed = typeof item.indexChangedAt === "number" ? item.indexChangedAt : time;
        if (name === "status") restore(readings.status, parseStatus, item.raw, time, indexed);
        else if (name === "settlement") restore(readings.settlement, parseSettlement, item.raw, time, indexed);
        else if (name === "core") restore(readings.core, parseCore, item.raw, time, indexed);
        else if (name === "economy") restore(readings.economy, parseEconomy, item.raw, time, indexed);
        else restore(readings.rpc, parseRpc, item.raw, time, indexed);
      } catch { /* A single bad cache entry must not hide other readings. */ }
    }
  } catch { setText("storage-note", "Browser storage is unavailable. Readings are kept in memory until this page closes. No tracking, accounts or wallet connection."); }
}
function saveCache() {
  try {
    const cache = Object.fromEntries(cacheNames.filter((name) => readings[name].data).map((name) => {
      const entry = readings[name];
      return [name, { raw: entry.raw, receivedAt: entry.receivedAt, indexChangedAt: entry.indexChangedAt }];
    }));
    localStorage.setItem(CONFIG.cacheKey, JSON.stringify(cache));
  } catch { setText("storage-note", "Browser storage is unavailable. Readings are kept in memory until this page closes. No tracking, accounts or wallet connection."); }
}

/** @param {ReadingName} name @returns {string} */
function staleReason(name) {
  const entry = readings[name];
  const now = Date.now();
  if (!entry.data) return entry.error || "No successful reading yet";
  if (!navigator.onLine) return "Browser is offline";
  if (entry.error) return entry.error;
  if (entry.cached) return "Saved reading; awaiting reconnection";
  if (now - entry.receivedAt > CONFIG.staleMs) return paused ? "Automatic updates paused" : "No recent response";
  if (name === "settlement" && readings.settlement.data) {
    if (now - readings.settlement.data.observedAt > CONFIG.staleMs) return "Settlement queue observation is stale";
    if (readings.settlement.data.observedAt > now + CONFIG.staleMs) return "Settlement queue timestamp is ahead of this browser";
  }
  if (name === "status" && readings.status.data) {
    const data = readings.status.data;
    if (data.freshness !== "online") return `Sensor reports ${data.freshness}`;
    if (now - data.observedAt > data.staleAfterMs) return "Sensor observation is stale";
    if (data.observedAt > now + 60000) return "Sensor timestamp is ahead of this browser";
  }
  if (name === "core" && readings.core.data) {
    const time = readings.core.data.generatedAt;
    if (time && now - time > CONFIG.staleMs) return "Chain response is stale";
    if (time && time > now + 60000) return "Chain timestamp is ahead of this browser";
    if (now - readings.core.indexChangedAt > CONFIG.indexStaleMs) return "Chain index has not advanced for 10 minutes";
  }
  if (name === "economy" && readings.economy.data) {
    const data = readings.economy.data;
    if (now - data.generatedAt > CONFIG.staleMs) return "Economy response is stale";
    if (data.generatedAt > now + 60000) return "Economy timestamp is ahead of this browser";
    if (data.indexTimestamp && now - data.indexTimestamp > CONFIG.indexStaleMs) return "Economy index is more than 10 minutes behind";
  }
  if (name === "rpc" && readings.rpc.data) {
    if (now - readings.rpc.data.blockAt > CONFIG.rpcBlockStaleMs) return "Sepolia head is more than 3 minutes old";
    if (readings.rpc.data.blockAt > now + 60000) return "RPC timestamp is ahead of this browser";
  }
  return "";
}
/** @param {Source} name @returns {string} */
function sourceProblem(name) {
  return staleReason(name) || (name === "status" ? staleReason("settlement") : "");
}
/** @param {ReadingName} name @returns {number} */
function readingTime(name) {
  if (name === "status" && readings.status.data) return readings.status.data.observedAt;
  if (name === "settlement" && readings.settlement.data) return readings.settlement.data.observedAt;
  if (name === "economy" && readings.economy.data) return readings.economy.data.generatedAt;
  if (name === "core" && readings.core.data?.generatedAt) return readings.core.data.generatedAt;
  if (name === "rpc" && readings.rpc.data) return readings.rpc.data.blockAt;
  return readings[name].receivedAt;
}
/** @param {number} time @returns {string} */
function fullTime(time) {
  return new Date(time).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}
/** @param {number} time @returns {string} */
function clockTime(time) { return new Date(time).toISOString().slice(11, 19); }
/** @param {string | bigint} value @returns {string} */
function integer(value) { return BigInt(value).toLocaleString("en-US"); }
/** @param {number} value @returns {string} */
function decimal(value) { return value.toLocaleString("en-US", { maximumFractionDigits: 2 }); }
/** @param {string | bigint} raw @param {number} decimals @param {number} [places] @returns {string} */
function tokens(raw, decimals, places = 2) {
  const value = BigInt(raw);
  const sign = value < 0n ? "−" : "";
  const absolute = value < 0n ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const precision = 10n ** BigInt(places);
  const rounded = (absolute * precision + scale / 2n) / scale;
  const fraction = places ? "." + (rounded % precision).toString().padStart(places, "0") : "";
  return sign + integer(rounded / precision) + fraction;
}
/** @param {ReadingName} name @param {string} id @param {string} verb */
function stamp(name, id, verb) {
  const data = readings[name];
  const stale = staleReason(name);
  const message = data.data ? `${stale ? "Stale · " : ""}${verb} ${fullTime(readingTime(name))}${stale ? ` · ${stale}` : ""}` : `${data.error || "No successful reading yet"}. ${paused ? "Automatic updates paused." : "Retrying every 15 seconds."}`;
  setText(id, message);
  element(id).classList.toggle("is-stale", Boolean(stale));
  if (name !== "settlement") setText(`source-${name}`, message);
}

/** @template T @param {Reading<T>} entry @param {() => Promise<unknown>} fetcher @param {(raw: unknown) => T} parse @param {ReadingName} name */
async function update(entry, fetcher, parse, name) {
  try {
    const raw = await fetcher();
    const data = parse(raw);
    // An older response must never displace a newer successful observation.
    if (name === "status" && readings.status.data && /** @type {WheelData} */ (data).observedAt < readings.status.data.observedAt) throw new DataError("Source returned an older wheel observation");
    if (name === "settlement" && readings.settlement.data && /** @type {SettlementData} */ (data).observedAt < readings.settlement.data.observedAt) throw new DataError("Source returned an older settlement observation");
    if (name === "economy" && readings.economy.data && /** @type {EconomyData} */ (data).generatedAt < readings.economy.data.generatedAt) throw new DataError("Source returned an older economy snapshot");
    if (name === "core") {
      const core = /** @type {CoreData} */ (data);
      const previous = readings.core.data;
      if (previous) {
        if (BigInt(core.indexedBlock) < BigInt(previous.indexedBlock)) throw new DataError("Chain index moved backwards; rollback not reconciled");
        if (core.generatedAt && previous.generatedAt && core.generatedAt < previous.generatedAt) throw new DataError("Source returned an older chain snapshot");
        if (core.generatedAt && Date.now() - core.generatedAt > CONFIG.staleMs) throw new DataError("Chain response is stale");
        if (core.generatedAt && core.generatedAt > Date.now() + CONFIG.staleMs) throw new DataError("Chain timestamp is ahead of this browser");
        if (BigInt(core.height) < BigInt(previous.height) || BigInt(core.work) < BigInt(previous.work) || BigInt(core.round) < BigInt(previous.round)) throw new DataError("Chain counters moved backwards; rollback not reconciled");
      }
      if (!previous || BigInt(core.indexedBlock) > BigInt(previous.indexedBlock)) entry.indexChangedAt = Date.now();
    }
    entry.data = data; entry.raw = raw; entry.receivedAt = Date.now(); entry.cached = false; entry.error = "";
    if (name === "core" && !staleReason("core")) {
      samples.push({ at: Date.now(), value: BigInt(/** @type {CoreData} */ (data).work) });
      while (samples.length > 240 || (samples.length > 1 && samples[0].at < Date.now() - 3600000)) samples.shift();
      renderChart();
    }
    saveCache();
  } catch (error) {
    entry.error = error instanceof DataError ? error.message : "Could not reach source; check your connection";
  }
  render();
}
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  nextRefresh = Date.now() + CONFIG.pollMs;
  renderControls();
  const statusRequest = request(`${CONFIG.api}/status`);
  await Promise.allSettled([
    update(readings.status, () => statusRequest, parseStatus, "status"),
    update(readings.settlement, () => statusRequest, parseSettlement, "settlement"),
    update(readings.core, () => request(`${CONFIG.api}/core`), parseCore, "core"),
    update(readings.economy, () => request(`${CONFIG.api}/economy/state`), parseEconomy, "economy"),
    update(readings.rpc, readSupply, parseRpc, "rpc"),
  ]);
  refreshing = false;
  render();
  const failed = sources.filter((name) => sourceProblem(name));
  const summary = failed.length ? `${failed.length} of 4 sources need attention. Last known readings are retained.` : "All four sources updated.";
  if (summary !== lastSummary || !paused) setText("announcement", summary);
  lastSummary = summary;
}
function renderControls() {
  /** @type {HTMLButtonElement} */ (element("refresh-button")).disabled = refreshing;
  element("refresh-button").setAttribute("aria-busy", String(refreshing));
  setText("refresh-label", refreshing ? "Refreshing…" : "Refresh now");
  setText("pause-label", paused ? "Resume" : "Pause");
  element("pause-button").setAttribute("aria-pressed", String(paused));
  element("pause-button").setAttribute("aria-label", paused ? "Resume automatic updates" : "Pause automatic updates");
  element("pause-icon").setAttribute("d", paused ? "M5 3l8 5-8 5V3Z" : "M5 3v10M11 3v10");
  setText("poll-note", paused ? "Automatic updates paused" : refreshing ? "Checking all four sources" : `Next update in ${Math.max(1, Math.ceil((nextRefresh - Date.now()) / 1000))}s · every 15s`);
}
function render() {
  renderControls();
  const unavailable = sources.filter((name) => readings[name].error || readings[name].cached || (readings[name].data && sourceProblem(name)) || (name === "status" && (readings.settlement.error || readings.settlement.cached)));
  const note = element("connection-note");
  note.hidden = unavailable.length === 0 && navigator.onLine;
  if (!note.hidden) setText("connection-note", !navigator.onLine ? "You’re offline. Last known readings stay visible; refresh when your connection returns." : `${unavailable.length} of 4 sources are stale or unavailable. Last known values and timestamps are shown below.`);
  const wheel = readings.status.data;
  if (wheel) {
    const stale = Boolean(staleReason("status"));
    setText("hamster-state", wheel.state);
    setText("wheel-description", stale ? "Last known wheel state." : "Latest reported wheel state.");
    setText("provenance", `${wheel.provenance === "hardware" ? "Hardware sensor" : `Source: ${wheel.provenance}`} · ${wheel.freshness}`);
    setText("rpm", decimal(wheel.rpm)); setText("speed", decimal(wheel.speed));
    const km = wheel.distance >= 1000000;
    setText("distance", decimal(wheel.distance / (km ? 1000000 : 1000))); setText("distance-unit", km ? "km" : "m");
    badge("wheel-freshness", stale ? "Stale reading" : "Live reading", stale ? "warning" : "good");
  } else if (readings.status.error) {
    badge("wheel-freshness", "Unavailable", "warning");
    setText("hamster-state", "UNKNOWN"); setText("wheel-description", "No wheel reading yet. Retrying.");
  }
  const core = readings.core.data;
  if (core) {
    const stale = Boolean(staleReason("core"));
    badge("core-freshness", stale ? "Stale reading" : core.paused ? "Chain paused" : "Confirmed", stale ? "warning" : core.paused ? "neutral" : "good");
    setText("block-height", integer(core.height));
    const percent = Number(BigInt(core.progress) * 10000n / BigInt(core.unitsPerBlock)) / 100;
    setText("next-block", `To block ${integer(BigInt(core.height) + 1n)}`); setText("block-percent", `${decimal(percent)}%`);
    /** @type {HTMLProgressElement} */ (element("block-progress")).value = percent;
    setText("progress-note", `${integer(core.progress)} / ${integer(core.unitsPerBlock)} block units`);
    setText("settled-round", integer(core.round)); setText("work-rate", integer(core.rate)); setText("cumulative-work", integer(core.work));
  } else if (readings.core.error) badge("core-freshness", "Unavailable", "warning");
  stamp("status", "status-stamp", "Observed"); stamp("core", "core-stamp", "Chain checked");
  stamp("core", "events-stamp", "Events fetched"); stamp("economy", "economy-stamp", "API generated"); stamp("rpc", "rpc-stamp", "Sepolia block time");
  stamp("core", "work-stamp", "Work checked");
  const queue = readings.settlement.data;
  const queueStale = staleReason("settlement");
  setText("settlement-state", queue ? `${queueStale ? "Stale · " : ""}${humanize(queue.state)}` : readings.settlement.error ? "Unavailable" : "Not received");
  element("settlement-state").classList.toggle("is-stale", Boolean(queueStale));
  stamp("settlement", "settlement-stamp", "Queue observed");
  element("settlement-stamp").hidden = !queueStale;
  if (queueStale) setText("source-status", `${element("status-stamp").textContent} · ${element("settlement-stamp").textContent}`);
  renderSupply(); renderEvents();
}
/** @param {string} value @returns {string} */
function humanize(value) { return value.replace(/[_-]/g, " ").replace(/^./, (c) => c.toUpperCase()); }
function renderSupply() {
  const economy = readings.economy.data;
  const rpc = readings.rpc.data;
  if (economy) {
    setText("published-supply", tokens(economy.supply, economy.decimals));
    setText("supply-cap", tokens(economy.cap, economy.decimals, 0));
    setText("published-exact", economy.supply); setText("mining-issued", tokens(economy.mined, economy.decimals));
    setText("total-staked", tokens(economy.staked, economy.decimals)); setText("staking-paid", tokens(economy.paid, economy.decimals));
    setText("mining-round", `Processed through round ${integer(economy.processedRound)}`);
    setText("staking-state", economy.stakingPaused ? "Staking paused" : "Staking active");
    setText("economy-status", staleReason("economy") ? `Stale · generated ${fullTime(economy.generatedAt)}` : economy.paused ? "Economy paused" : "Economy active · API confirmed");
  }
  if (rpc) {
    setText("chain-supply", tokens(rpc.supply, rpc.decimals)); setText("chain-exact", rpc.supply);
    setText("rpc-block", integer(rpc.block)); setText("token-decimals", `${rpc.decimals} on-chain${economy ? ` / ${economy.decimals} published` : ""}`);
  }
  if (!economy || !rpc) {
    const failed = readings.economy.error || readings.rpc.error;
    badge("supply-badge", "Unverified", failed ? "warning" : "neutral");
    setText("supply-comparison", failed ? "Supply cannot be verified until both sources respond. Retrying automatically; use Refresh now to try again." : "Checking the API against the SQK contract on Sepolia.");
    return;
  }
  const stale = Boolean(staleReason("economy") || staleReason("rpc"));
  const match = economy.supply === rpc.supply && economy.decimals === rpc.decimals;
  badge("supply-badge", `${stale ? "Stale · " : ""}${match ? "Match" : "Mismatch"}`, stale ? "warning" : match ? "good" : "error");
  if (stale) setText("supply-comparison", `Last comparison: ${match ? "exact match" : "mismatch"}. One or both sources are stale; see their timestamps below.`);
  else if (economy.decimals !== rpc.decimals) setText("supply-comparison", "Token decimal counts differ. Open the exact comparison to inspect both sources.");
  else if (match) setText("supply-comparison", `Published supply matches totalSupply() exactly, including all ${rpc.decimals} decimal places.`);
  else setText("supply-comparison", `Supply differs by ${exactTokens(BigInt(rpc.supply) - BigInt(economy.supply), rpc.decimals)} SQK (chain minus API). The published index can lag Sepolia.`);
}
/** @param {bigint} value @param {number} decimals @returns {string} */
function exactTokens(value, decimals) {
  const absolute = value < 0n ? -value : value;
  const base = 10n ** BigInt(decimals);
  const fraction = (absolute % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${value < 0n ? "−" : ""}${integer(absolute / base)}${fraction ? `.${fraction}` : ""}`;
}
function renderChart() {
  if (!samples.length) return;
  const first = samples[0]; const last = samples[samples.length - 1];
  const min = samples.reduce((v, s) => s.value < v ? s.value : v, first.value);
  const max = samples.reduce((v, s) => s.value > v ? s.value : v, first.value);
  const range = max - min;
  const duration = last.at - first.at;
  const coords = samples.map((s) => ({ x: duration ? 6 + (s.at - first.at) / duration * 588 : 6, y: range ? 115 - Number((s.value - min) * 100000n / range) / 1000 : 65, at: s.at }));
  let line = ""; let area = "";
  coords.forEach((point, i) => {
    const start = i === 0 || point.at - coords[i - 1].at > CONFIG.pollMs * 2;
    line += `${start ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)} `;
    if (start) area += `M${point.x.toFixed(2)},125 L${point.x.toFixed(2)},${point.y.toFixed(2)} `;
    else area += `L${point.x.toFixed(2)},${point.y.toFixed(2)} `;
    if (i === coords.length - 1 || coords[i + 1].at - point.at > CONFIG.pollMs * 2) area += `L${point.x.toFixed(2)},125 Z `;
  });
  element("chart-line").setAttribute("d", samples.length > 1 ? line : ""); element("chart-area").setAttribute("d", samples.length > 1 ? area : "");
  const dot = element("chart-dot"); dot.removeAttribute("hidden");
  dot.setAttribute("cx", coords[coords.length - 1].x.toFixed(2)); dot.setAttribute("cy", coords[coords.length - 1].y.toFixed(2));
  const change = last.value - first.value;
  badge("work-gain", `${change >= 0n ? "+" : "−"}${integer(change < 0n ? -change : change)} this session`, "neutral");
  setText("chart-start", `${clockTime(first.at)} UTC`); setText("chart-end", samples.length > 1 ? `${clockTime(last.at)} UTC` : "First sample");
  setText("chart-note", samples.length === 1 ? "First live sample recorded. The next reading extends the chart." : `${samples.length} live samples · gaps indicate missed readings · up to 1 hour`);
  setText("chart-description", `${samples.length} ${samples.length === 1 ? "sample" : "samples"}. From ${integer(first.value)} work units at ${fullTime(first.at)} to ${integer(last.value)} at ${fullTime(last.at)}. Session change ${change.toString()} work units.`);
}
function renderEvents() {
  const core = readings.core.data;
  const key = core ? JSON.stringify(core.events) : readings.core.error ? "error" : "loading";
  if (key === renderedEventKey && showAllEvents === renderedExpanded) return;
  renderedEventKey = key; renderedExpanded = showAllEvents;
  const body = element("event-rows");
  const focused = document.activeElement instanceof HTMLElement && body.contains(document.activeElement) ? document.activeElement : null;
  if (!core || !core.events.length) {
    const row = document.createElement("tr"); const cell = document.createElement("td"); cell.colSpan = 4; cell.className = "empty-state";
    cell.textContent = core ? "No core events have been reported. This table updates automatically." : readings.core.error ? "Core events are unavailable. Retrying automatically; use Refresh now to try again." : "Connecting to the core API. New readings arrive every 15 seconds.";
    row.append(cell); body.replaceChildren(row); element("events-toggle").hidden = true;
    setText("event-count", core ? "0 events" : "Waiting for events");
    if (focused) focusEventFallback();
    return;
  }
  const rows = new Map(Array.from(body.children).filter((row) => row instanceof HTMLElement && row.dataset.eventKey).map((row) => [/** @type {HTMLElement} */ (row).dataset.eventKey, /** @type {HTMLTableRowElement} */ (row)]));
  const events = core.events.slice(0, showAllEvents ? 25 : 6);
  // A new event can push the selected row past the compact six-row window.
  // Keep that one extra row while it is focused and still present in the response.
  const focusedKey = focused?.closest("tr")?.dataset.eventKey;
  const focusedEvent = focusedKey ? core.events.find((event) => eventIdentity(event) === focusedKey) : null;
  if (focusedEvent && !events.includes(focusedEvent)) events.push(focusedEvent);
  const retained = new Set();
  for (const [index, event] of events.entries()) {
    const identity = eventIdentity(event);
    const row = rows.get(identity) || document.createElement("tr");
    row.dataset.eventKey = identity;
    retained.add(row);
    if (!row.cells.length) {
      const name = row.insertCell();
      const dot = document.createElement("span"); dot.className = "event-type-dot"; dot.setAttribute("aria-hidden", "true");
      const label = document.createElement("span"); label.className = "event-name";
      const mobileTime = document.createElement("time"); mobileTime.className = "mobile-event-time";
      name.append(dot, label, mobileTime); row.insertCell();
      const timeCell = row.insertCell(); timeCell.className = "event-time-column"; timeCell.append(document.createElement("time")); row.insertCell();
    }
    const label = /** @type {HTMLElement} */ (row.querySelector(".event-name"));
    if (label.textContent !== event.name) label.textContent = event.name;
    const round = event.round === null ? "Not reported" : integer(event.round);
    if (row.cells[1].textContent !== round) row.cells[1].textContent = round;
    for (const time of Array.from(row.querySelectorAll("time"))) {
      time.dateTime = new Date(event.timestamp).toISOString(); time.textContent = fullTime(event.timestamp).slice(5, 19); time.title = fullTime(event.timestamp);
    }
    const transaction = row.cells[3];
    if (event.transaction) {
      const link = transaction.querySelector("a") || document.createElement("a"); link.className = "event-link"; link.href = `https://sepolia.etherscan.io/tx/${event.transaction}`;
      link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "View tx ↗"; link.title = event.transaction;
      link.setAttribute("aria-label", `View tx for ${event.name}, round ${event.round || "not reported"}, ${event.transaction} on Sepolia (opens in a new tab)`);
      if (link.parentElement !== transaction) transaction.replaceChildren(link);
    } else transaction.textContent = "Not reported";
    // Prepending new rows leaves retained links attached, including the focused one.
    if (body.children[index] !== row) body.insertBefore(row, body.children[index] || null);
  }
  for (const row of Array.from(body.children)) if (!retained.has(row)) row.remove();
  setText("event-count", `${events.length} of ${core.events.length} events`);
  element("events-toggle").hidden = core.events.length <= 6;
  setText("events-toggle", showAllEvents ? "Show fewer events" : `Show all ${core.events.length} events`);
  element("events-toggle").setAttribute("aria-expanded", String(showAllEvents));
  if (focused && document.activeElement !== focused) {
    if (focused.isConnected) focused.focus({ preventScroll: true });
    else focusEventFallback();
  }
}
/** @param {CoreEvent} event @returns {string} */
function eventIdentity(event) { return `${event.transaction?.toLowerCase() || event.block}:${event.log}`; }
function focusEventFallback() {
  const link = /** @type {HTMLElement | null} */ (element("event-rows").querySelector("a"));
  if (link) link.focus({ preventScroll: true });
  else {
    const heading = element("events-heading"); heading.tabIndex = -1; heading.focus({ preventScroll: true });
  }
}

element("refresh-button").addEventListener("click", () => { setText("announcement", "Checking all four data sources."); void refresh(); });
element("pause-button").addEventListener("click", () => {
  paused = !paused;
  setText("announcement", paused ? "Automatic updates paused. Refresh now still works." : "Automatic updates resumed.");
  render(); if (!paused) void refresh();
});
element("events-toggle").addEventListener("click", () => { showAllEvents = !showAllEvents; renderEvents(); });
element("sources-link").addEventListener("click", () => {
  /** @type {HTMLDetailsElement} */ (element("data-sources")).open = true;
});
window.addEventListener("online", () => { if (!paused) void refresh(); });
window.addEventListener("offline", render);
document.addEventListener("visibilitychange", () => { if (!document.hidden && !paused && Date.now() >= nextRefresh) void refresh(); });
restoreCache(); render(); void refresh();
setInterval(() => {
  if (!paused && !refreshing && Date.now() >= nextRefresh) void refresh();
  render();
}, 1000);
