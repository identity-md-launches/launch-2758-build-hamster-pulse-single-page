# Hamster Pulse

A static, live Squeekchain dashboard: wheel telemetry, confirmed chain progress, session work, SQK supply verification, mining, staking and recent events. Plain HTML, CSS and vanilla JavaScript; no backend, runtime dependencies, API keys, tracking or wallet connection.

## Run and host

**Installation: none.** Serve `index.html`, `style.css`, `script.js`, `favicon.svg` and `social-card.png` together from any static HTTP(S) host. The checked-in `dist/` contains those exact files, ready to upload. All asset URLs are relative, including at a gateway subpath. Opening the source directly also works where the browser permits cross-origin requests from local files; HTTP is recommended.

Optional development commands require Node.js 20+ and npm, with no package installation:

```sh
npm run build       # Copy the five unchanged runtime files into dist/
npm run preview     # http://localhost:4173; Ctrl+C to stop
npm run check       # Syntax, metadata, relative assets, export equality and size
npm run typecheck   # Strict JSDoc/JavaScript checking with TypeScript 5.9.3, no emit
```

The site needs no build step to run. `build` only packages the static export. `typecheck` downloads a pinned compiler to npm’s external cache; the package manifest and lockfile contain no dependencies. No `node_modules/` or registry archives belong in this repository.

Ignore-file path budget: `.gitignore` only excludes nested `node_modules/`, `.npm/`, `.cache/`, `.playwright-mcp/` and `test/scratch/`. It explicitly includes `dist/**` and `artifacts/**`; both count in the delivery-size check.

## Public sources

| Source | Readings |
| --- | --- |
| [GET /v1/status](https://api.squeekchain.com/v1/status) | `measurement.coreStatus`, `rpmMilli`, `speedMmPerSecond`, `distanceMm`, provenance, freshness and settlement queue |
| [GET /v1/core](https://api.squeekchain.com/v1/core) | Block height/progress, cumulative work, work per 1,000 blocks, settled round and latest events |
| [GET /v1/economy/state](https://api.squeekchain.com/v1/economy/state) | SQK `liveSupplyBaseUnits`, cap, mining issued, staking principal and rewards paid |
| [Sepolia public JSON-RPC](https://ethereum-sepolia-rpc.publicnode.com) | `eth_chainId`, latest block, `eth_call` to `totalSupply()` (`0x18160ddd`) and `decimals()` (`0x313ce567`) |

SQK: [`0x5501e1fa81be1c3f49225fa7668da0245d07db60`](https://sepolia.etherscan.io/token/0x5501e1fa81be1c3f49225fa7668da0245d07db60). RPC reads verify chain ID **11155111** and use the same explicit latest block for both contract calls. Supply comparisons use exact `BigInt` base units; displayed SQK amounts round to two places. Even a one-base-unit difference produces **Mismatch**. The exact values and block are expandable. The API’s confirmed index can trail the latest chain state, so a transient mismatch is possible.

## Updates and failure handling

All four sources refresh every 15 seconds, independently, with 9-second timeouts per fetch and no overlapping refresh cycles. Pause/Resume controls automatic requests; Refresh now works while paused. In-flight requests finish. Background tabs may have their timers throttled by the browser.

Successful public responses are saved only in this browser under `hamster-pulse:readings:v1`. Errors, malformed responses and older sensor/economy snapshots preserve the last successful values, with explicit stale reasons and UTC timestamps. Reloaded cache entries remain stale until that source succeeds. When storage is blocked, values stay in memory. A first visit without any successful readings shows unknown/unverified states rather than invented values.

Responses older than 60 seconds are stale. Sensor freshness also follows its published flag, observation time and `staleAfterSeconds`. Core indexing that does not advance for 10 minutes, an economy index over 10 minutes behind, or a Sepolia head over 3 minutes old is flagged. Core’s API has no generation timestamp in the observed schema: its timestamp is the actual check time, with the separate index-progress watchdog. An unchanged settled round alone is not treated as stale.

The chart records only fresh core readings in the current tab, capped at 240 samples / one hour. Missed intervals leave gaps. Reload starts a new chart; cached counters remain visible. No demonstration data is served. The captured fixtures in `tests/` are used only by intercepted browser tests and are excluded from `dist/`.

## Verification

Checked on 2026-10-31: production export, strict typecheck and integrity checks passed; **34 browser checks passed** across Chromium and WebKit; the pinned design probe passed **16/16**; axe reported **zero violations** in both themes. Live public APIs and Sepolia supply verification worked. Results, the six-domain review and limits (including no physical-device or screen-reader session) are in [artifacts/validation.md](artifacts/validation.md). Final tokens and components are in [DESIGN.md](DESIGN.md); screenshots are in `artifacts/`.

Optional reproducible browser tooling can be installed **outside the repository**:

```sh
npm install --prefix /tmp/hp-checks --cache /tmp/hp-npm-cache --no-audit --no-fund playwright@1.58.2 @axe-core/playwright@4.11.1
PLAYWRIGHT_BROWSERS_PATH=/tmp/hp-browsers /tmp/hp-checks/node_modules/.bin/playwright install chromium webkit
PLAYWRIGHT_BROWSERS_PATH=/tmp/hp-browsers node tests/validate.mjs /tmp/hp-checks/node_modules/playwright/index.mjs
PLAYWRIGHT_BROWSERS_PATH=/tmp/hp-browsers node tests/live-check.mjs /tmp/hp-checks/node_modules/playwright/index.mjs /tmp/hp-checks/node_modules/@axe-core/playwright/dist/index.mjs
```

Browser engines need their normal operating-system libraries. Test servers run only for each check and close afterward. The first suite intercepts public requests for deterministic edge cases; the second uses real services, measures both themes and runs axe. Neither is part of the production site. Hosting or publication is not performed by these scripts.
