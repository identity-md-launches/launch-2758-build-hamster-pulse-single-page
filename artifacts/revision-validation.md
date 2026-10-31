# Hamster Pulse revision validation

Status: **Complete for the three reported findings.** Checked on 2026-10-31 against the revised `dist/` export. These are worker-run observations, not independent certification. The accepted visual system, HTML, CSS, metadata, endpoints, token address and dependency-free package/lockfile remain unchanged.

| Check | Actual result |
| --- | --- |
| Baseline reproduction | **8/8 reproduced:** four scenarios in each of Chromium 145 and WebKit 26.0, using the accepted script and the supplied fixtures at 390×844 |
| Targeted regression suite | **26/26 passed:** 13 checks per engine in `tests/revision.mjs` |
| Existing interaction suite | **34/34 passed:** 17 checks per engine in `tests/validate.mjs` |
| Production export | `npm run build` passed; five runtime files copied unchanged into `dist/`; only `dist/script.js` differs from the accepted export |
| Typecheck | `npm --cache /tmp/hp-revision-npm-cache run typecheck` passed; TypeScript 5.9.3, strict JavaScript/JSDoc checking, no emit |
| Integrity | `npm run check` and `git diff --check` passed; relative assets, source/export equality, metadata, lockfile, syntax and delivery budget verified |
| Pinned design probe, live data | **16/16 passed**, at 320/390/1440 with reduced-motion checks; `revision-design-probe.json` |
| Responsive interactions | Existing suite passed 320/360/390/768/1040/1440 in both themes and engines; partial queue outage additionally checked at 360/390 in both themes |
| Live smoke check | REST readings loaded; published and on-chain supply matched exactly at **20140499911047856253328461 base units**, 18 decimals; refresh and pause/resume worked; all 12 normal-size theme/viewport checks passed |
| Live accessibility scans | axe-core 4.11.1: **0 violations**, 29 rules passed in each theme with both disclosures expanded; measured contrast pairs retained the initial report’s values |
| Extra stress checks | Forced-offline probe: **15/16**, identically on accepted and revised exports. The live smoke script stopped at an inherited 200% text-enlargement overflow; details below. Its later RTL check did not run |

## Reproduced findings and fixes

### Older core snapshots — fixed

Finding `48fd4ff582ecb75294ae9ae0d2e5f9f1c90d8dbdfcbe20fe70a8cbd604bd72f3`.

Before: both engines accepted index 12030900 after 12031000, replacing height 5,000/work 60,000 with 4,900/55,000, showing Confirmed and recording a negative session change. An HTTP 200 payload generated two minutes earlier also replaced the counters while being labelled stale.

Fix: `script.js:377` (`update()`), particularly `script.js:389`, checks the candidate before mutating any accepted state. Lower indices, regressing counters, older generation times, and stale/future generation times retain the last accepted counters, events, cache, timestamp, chart and index watchdog. The stale reason names the regression or stale timestamp. Only a strictly advancing accepted index resets the watchdog.

Rechecked in both engines: scheduled poll, absent `generatedAt`, two-minute-old generation time, generation time that regresses within the freshness window, future timestamp, lower counters at a higher index, unchanged chart samples, preserved event rows, cache/receipt/watchdog preservation, reload and recovery to a consistent newer snapshot. A genuine changed chain history is not automatically reconciled: the dashboard stays explicitly stale until the source again reaches the accepted index and counters. No new reorganization feed or chain-history authority is assumed.

### Partial settlement outage — fixed

Finding `2403efc2ada550806cb965887da82e10f1631b283b0ebc98d582fcc55a418670`.

Before: both engines replaced Submitted with Stale · Unavailable, used the newer wheel timestamp for the queue, and hid the page-level source warning.

Fix: `script.js:125` (`parseSettlement()`), `script.js:409` (`refresh()`), and `script.js:474` (queue rendering) maintain independently parsed, cached wheel and queue readings from the **same status fetch**. Queue failure now shows **Stale · Submitted**, the successful **03:59:59 UTC** observation and **Settlement queue unavailable**, while the wheel advances to **04:00:14 UTC** and remains Live reading. `sourceProblem()` includes the failed queue in the existing four-source warning and polite announcement.

Rechecked in both engines: queue availability failure, absent queue object, healthy wheel updates, unavailable wheel with healthy queue, stale timestamp retention across reload, recovery, migration from the previous v1 cache shape, and first visit without a successful queue reading. The observed API shape supplies no queue observation time; the successful status response’s measurement time is retained with the queue unless the queue supplies its own `observedAt`.

### Incoming events remove focus — fixed

Finding `d38fe029a42a3ee3228535fa74e3fc1698802d79908b083cec0c813aea82453b`.

Before: both engines detached the focused transaction link when a new event arrived, leaving focus on BODY even though that event remained in the response.

Fix: `script.js:546` (`renderEvents()`) reconciles rows by the transaction/log identity from `eventIdentity()` (`script.js:610`), with a block/log fallback. Retained anchors remain the same nodes. If reordering moves a focused node, it regains focus without scrolling. A focused event pushed beyond the six-row window keeps one extra visible row while retained in the response. If the event disappears, `focusEventFallback()` (`script.js:611`) selects a remaining transaction link, or the events heading when no links remain.

Rechecked in both engines: automatic 15-second poll with a prepended event; exact original anchor identity and destination; Enter opening a new tab at that destination; changed event metadata/order; a focused sixth row pushed outside the compact window; removed/empty events; and unchanged focus on a separate control. Popup destinations are intercepted at browser-context level, so explorer uptime is not a test dependency. An initial WebKit test attempted to inspect the popup before navigation; the test was corrected to wait for its destination and intercept new-tab requests. No production workaround was required.

## Better Interface review: six domains

Read the pinned workflow, core principles for all six domains and final design-documentation method. The revision reused the existing components and tokens; it adds no visual feature or dependency.

| Domain | Coverage | Limits |
| --- | --- | --- |
| Accessibility — Checked | Retained link identity, visible focus screenshot, Enter/new-tab activation, deliberate removed-event focus, unrelated keyboard focus, source warning/live announcement and current axe scans in both themes | No screen-reader, native iPhone or physical-device session |
| Layout — Checked | Existing responsive suite in both engines/themes, additional stale-queue views at 360/390, first screen at 390, and rendered queue timestamp wrapping. Current live probe found no overflow or text overlap at its normal-size widths | Inherited 200% root-text-size overflow is recorded below; native browser zoom not tested |
| Writing — Checked | Specific stale/rollback/queue reasons next to retained timestamps; unknown queue state without invented history; healthy wheel remains separately described; existing refresh/retry controls retained | English only; no automatic chain-rollback reconciliation is claimed |
| Typography — Checked | Existing six-size/two-weight scale retained; source stamps and event updates stay selectable; current live probe and both-theme screenshots show readable counters and timestamps | System fonts vary by OS; 200% text stress limit below |
| Colors — Checked | Existing semantic warning/focus tokens reused; state uses text as well as color; live light/dark axe and computed contrast measurements completed | No forced-colors rendering session; measured pairs are not a universal accessibility guarantee |
| UI — Checked | Fresh, stale, unavailable, first-visit unknown, cache/reload, recovery, incoming/empty events, refresh and pause/resume exercised. No added motion; reduced-motion probe passed | No slow-motion animation-panel inspection; no form, overlay, wallet or transaction-signing flow applies |

The 390px first screen was inspected with the assigned browser tool and in saved screenshots. Product name, Refresh now, wheel state and telemetry fit on screen. The tool also exercised Refresh now and Pause and reported no console errors. Final source tokens and updated component behavior are in root `DESIGN.md`.

## Commands and evidence

Production and deterministic checks, from repository root:

```sh
npm run build
npm --cache /tmp/hp-revision-npm-cache run typecheck
npm run check
node tests/revision.mjs /tmp/hp-revision-tools/node_modules/playwright/index.mjs
node tests/validate.mjs /tmp/hp-revision-tools/node_modules/playwright/index.mjs
git diff --check
```

Browser runs set `PLAYWRIGHT_BROWSERS_PATH` to the external temporary browser installation. WebKit initially lacked host libraries. Temporary external libraries and software rendering enabled actual WebKit execution; its downloaded wrapper was adjusted to preserve the external library lookup path, and the host-library preflight was skipped. The browser itself completed every final assertion; no final browser check was skipped. Tooling, browser packages and libraries remain outside the submission.

Baseline reproduction used `tests/revision.mjs ... --reproduce`, serving the accepted script read from Git into scratch. The final design probe used the pinned script with `--out test/scratch/taste-final`; a scratch Playwright transport adapter routed live RPC reads through the provided Sepolia transport. The public RPC named by the site and reports remains `https://ethereum-sepolia-rpc.publicnode.com`. The live smoke check used the existing `tests/live-check.mjs` logic copied into scratch, changing only its output location and transport adapter. It did **not** pass its entire stress sequence: its 200% text assertion failed after the successful service, viewport and axe checks.

Preserved evidence:

- `revision-reproduction.json`: actual baseline before/after observations, eight reproduced scenarios.
- `revision-results.json`: 26 successful regression results and selected retained readings.
- `revision-interaction-results.json`: 34 successful existing interaction results.
- `revision-design-probe.json`: final live-data probe, 16/16 passed.
- `revision-live-check.json`: current public service values, 12 viewport measurements, both axe scans, contrast pairs and the failed text-enlargement flag.
- `revision-queue-stale-light.png`, `revision-queue-stale-dark.png`: intercepted fixture state showing live wheel data beside a retained stale queue.
- `revision-event-focus.png`: WebKit’s visible focus ring on the original event after a new event was prepended.
- `revision-first-screen.png`: current live 390×844 first-screen capture.

## Remaining limitations evaluated against the accepted version

**Forced-offline copy probe:** `revision-offline-probe.json` and `accepted-offline-probe.json` both report the same 15/16 result: seven repeated generic retry lines when every source is blocked and there is no cache. These are the existing adjacent source/value recovery messages. The normal live-data probe passes 16/16. This accepted behavior was preserved within the requested revision scope.

**200% text enlargement:** `revision-text-enlargement.json` compares accepted and revised scripts with identical current public payloads at 390px. Both have **420px** document width; both identify the same existing `.network-link` at `style.css:112`, whose unbroken header label reaches approximately 412px. No HTML/CSS change introduced it. This pre-existing stress limit is retained under the instruction to change only what the reopened findings require. The normal-size 360px requirement passes in both engines and themes. The live smoke script’s subsequent RTL check was not reached in this revision; the initial record remains historical evidence only.

No real-time fifteen-second or ten-minute wait was required: browser clocks advance scheduled polls. Long-duration soak testing, native zoom, forced colors, physical Safari and screen readers remain unperformed. Third-party service availability may change. The revised client conservatively quarantines possible core rollbacks rather than asserting that it has verified a replacement history.

The runtime export is **146,836 bytes**. `npm run check` prints the final complete-delivery byte count, including the required `.imd-responses.json`, source, export, documentation, tests and evidence. It stays below the 8 MiB cap and rejects dependency/cache directories or unnecessary archives. No ignore file, Git metadata, GitHub configuration, environment file, dependency directory or submodule was changed.
