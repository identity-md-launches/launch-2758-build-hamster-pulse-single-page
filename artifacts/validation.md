# Hamster Pulse validation

Status: **Complete for the stated scope.** These are worker-run checks and observations, not an independent certification. Checked on 2026-10-31 against the exported `dist/` files.

| Area | Actual result |
| --- | --- |
| Production export | `npm run build` passed; five unchanged runtime files copied to `dist/` |
| Typecheck | `npm run typecheck` passed: TypeScript 5.9.3, strict JSDoc/JavaScript, `noEmit` |
| Integrity | `npm run check` passed: syntax, source/export equality, metadata, relative assets, share-image dimensions, dependency-free lockfile and delivery budget |
| Browser interactions | **34/34 passed:** 17 in Chromium 145 and 17 in WebKit 26.0 |
| Real public services | All three REST APIs and public Sepolia RPC responded successfully in Chromium; exact SQK supply matched |
| Responsive checks | 320, 360, 390, 768, 1040 and 1440 CSS pixels in light and dark; no page overflow; economy amounts remain on one line at normal text size |
| Accessibility scan | axe-core 4.11.1: **0 violations**, 29 rules passed in each theme, with both disclosures expanded |
| Pinned design probe | **16/16 taste@1 checks passed**, including 320/390/1440, reduced motion and share metadata |
| First screen at 390×844 | Product, Refresh now, wheel state, cadence, speed and distance visible; hero ends around 630px |
| Export / delivery | Runtime export approximately 142 KB; complete delivery under 1.5 MiB, below 8,388,608 bytes. `npm run check` prints exact current byte totals |

## Scope and assumptions

This is one observational page, with refresh, pause/resume, exact-supply disclosure, event expansion and source disclosure. No wallet, transaction flow, backend, authentication or publication is involved. The chosen visual idea is a quiet instrument panel whose warm wheel illustration connects physical telemetry to confirmed chain activity.

The brief did not name a particular Sepolia RPC URL. The implementation uses `https://ethereum-sepolia-rpc.publicnode.com`, without keys, and checks chain ID 11155111. The requested SQK address is used exactly. It calls both `totalSupply()` and `decimals()` at the same explicit latest Sepolia block. The supply badge compares exact base units and decimal counts; rounded display values do not control it. A current mismatch includes an exact signed difference and the possibility of index lag.

The main chain counter uses confirmed `/v1/core` values, rather than optimistic wheel projections. Block progress uses the API’s declared `blockUnitsPerBlock` scale. Cached readings persist in this browser; chart samples belong only to this tab and are never seeded from fabricated or historical values. Fixtures are isolated to intercepted tests and excluded from the export.

Core has no generation time in the observed response. Its visible timestamp is the actual successful check time, and a separate watchdog flags an unchanged indexed block after 10 minutes. The source timestamp policies, storage key, polling behavior and browser-throttling limitation are documented in the README. Optional generated dependency/cache directories and browser downloads were kept outside the repository. The narrowly scoped ignore-file budget is documented below and in the README.

## Requirement coverage

| Requested behavior | Implementation and evidence |
| --- | --- |
| Plain HTML/CSS/vanilla JS, no build dependency | Root `index.html`, `style.css`, `script.js`; identical files in `dist/`; empty dependency lockfile |
| Fetch all three APIs every 15 seconds | Independent requests in `refresh()`; automatic-poll test checks the exact extra core request after advancing 15 seconds |
| Running/idle hero, rpm and speed | `measurement.coreStatus`, `rpmMilli / 1000`, `speedMmPerSecond`; IDLE and RUNNING exercised in both engines |
| Distance, provenance, freshness and settlement | Live fields displayed; queue retains full status endpoint readings on request failure; stale queue has an adjacent observation timestamp |
| Block height and progress bar | Native progress element; captured response gives height 4,973 and 5.3% toward 4,974 |
| Session cumulative-work sparkline | Real core samples only, exact integer deltas, empty/one-point/multiple-point states and missed-interval gaps |
| SQK supply cross-check | Real RPC call matched API supply; fixture delta of one base unit produces Mismatch despite identical rounded totals |
| Token, mining and staking | Live supply/cap, mining issued, processed round, staked SQK, rewards paid and pause states |
| Recent core event table and explorer links | Six latest events, expansion up to 25, exact round/time and validated Sepolia transaction destinations |
| Every endpoint unavailable/stale | Each source failed independently; all sources failed on first visit and after a cached reload; values retained with stale timestamps; unknown stays unknown without prior data |
| 360px and system light/dark | Both engines tested at 320/360/390 and wider sizes in both themes; actual light/dark screenshots preserved |
| Static hosting export and metadata | Relative URLs tested under `/pulse/` and `/hamster/`; title, favicon, description, og:title, og:image, 1200×630 share card present |
| Documentation | README includes install/preview/export/check commands and endpoints; root DESIGN.md describes final tokens and components |

## Better Interface review: six domains

Read the pinned workflow and the core principles of all six domains before implementation, plus applicable details for focus, live regions, data typography, native disclosures, theme contrast and final design documentation.

| Domain | Coverage and evidence | Limits |
| --- | --- | --- |
| Accessibility — Checked | Native buttons, links, progress, details, table, headings and definition lists; skip link; keyboard activation and visible focus; aria names/states; stable polite announcements; reduced motion; axe in both themes; probe target sizes | No real screen-reader or physical-device session. Two non-primary text/brand links are below the 44px comfort target but pass the probe’s 24px/spacing threshold. Forced-colors rules source-reviewed, not manually inspected |
| Layout — Checked | DOM reading order; normal-flow header; shared grid edges; responsive columns; all six widths in both themes/engines; first-screen screenshot; long numbers and addresses; 200% text enlargement and RTL overflow checks | Text enlargement is not native browser 200% zoom. RTL was a stress check, not a translated product |
| Writing — Checked | Verb-first controls; visible UTC labels; distinct source timestamps; unknown/unverified/stale/error text; plain recovery instructions; supply lag explanation; data vs rounded value distinction | English only. Brief-required RUNNING/IDLE and the SQK symbol intentionally retain uppercase |
| Typography — Checked | Six source sizes, two weights; tabular changing values; explicit line heights; actual mobile/desktop screenshots; numeric-line assertions after WebKit finding; selectable full exact amounts | System font faces differ by OS. No claim that a particular downloaded font loaded; none is used |
| Colors — Checked | Semantic light/dark tokens; measured rendered text and focus pairs; axe and taste solid-background contrast checks; state labels accompany color | Contrast numbers below apply to the measured pairs. Decorative illustration is not an information-bearing contrast test |
| UI — Checked | Flat structural panels; primary/secondary actions; hover, pressed, focus, loading, empty, success, error and cached states; native disclosures; static wheel; no looping animation | No overlay, form, wallet or destructive-action review is applicable. No animation-panel slow-motion session; the only motion is a source-reviewed 150ms button press transition |

## Findings fixed and rechecked

1. **Medium — mobile typography: a long economy amount split mid-number in WebKit.** Source: `style.css:274`, `.economy-metrics > div`. Initially a two-column mobile metric left too little width for the captured mining amount; the final digit appeared on a second line in the 390px WebKit RUNNING screenshot. Changed to stacked label/value/caption throughout the mobile breakpoint. Rechecked in both engines at all six widths and both themes; range-based assertions require each normal-size economy amount to occupy one line.

2. **Medium — keyboard focus: unchanged polling replaced all event rows.** Source: `script.js:507`, `const key = core ? JSON.stringify(core.events) ...`. Replacing the table every 15 seconds could remove a focused explorer link. The renderer now keeps unchanged event rows. Both engines focused the first transaction link, advanced a real scheduled poll with the browser clock and confirmed focus remained there.

3. **Medium — stale data needed timestamps closer to secondary values.** Sources: `index.html:88`, `#settlement-stamp`; `index.html:99`, `#work-stamp`; `script.js:438`. The chart and queue relied on other panels’ source times. Added an adjacent work timestamp and a queue timestamp shown for stale/unavailable queue readings. Offline and individual-endpoint failure tests confirm explicit stale times while values remain visible.

4. **Medium — offline signal did not immediately invalidate the supply badge.** Source: `script.js:284`, `if (!navigator.onLine)`. Previously a fresh response could retain Match until its next failed request or timeout. The browser’s offline signal now immediately produces stale readings and a Stale · Match/Mismatch badge. Both engines toggled offline/online and confirmed immediate invalidation and recovery.

5. **Low — definition-list captions used paragraph children.** Source: `index.html:118`, `dd.metric-caption`. Changed mining/staking captions to additional native definitions, retaining the visual hierarchy. The final expanded page passed axe in both themes.

6. **Low — repeated source timestamp copy.** Source: `script.js:436`. Initial taste@1 result was 15/16 because the chain and event panels both repeated “Checked …”. Changed to task-specific “Chain checked”, “Events fetched” and “Work checked” without removing required freshness information. Final probe: 16/16.

7. **Low — wheel copy inferred a break from IDLE.** Source: `script.js:413`, `#wheel-description`. A live response reported IDLE alongside a positive cadence, so describing a “wheel break” added an inference beyond the API. Changed fresh-state copy to “Latest reported wheel state.” The dashboard displays `coreStatus`, cadence and speed independently as reported; it does not infer one from another.

No unresolved requirement, broken primary interaction, fake live value or high-severity design finding remains from this review.

## Actual commands and observations

Run from repository root:

```sh
npm run build
npm --cache /tmp/hamster-pulse-npm-cache run typecheck
npm run check
PLAYWRIGHT_BROWSERS_PATH=/tmp/hamster-pulse-browsers node tests/live-check.mjs /tmp/hamster-pulse-tools/node_modules/playwright/index.mjs /tmp/hamster-pulse-tools/node_modules/@axe-core/playwright/dist/index.mjs
PLAYWRIGHT_BROWSERS_PATH=/tmp/hamster-pulse-browsers IMD_PLAYWRIGHT=/tmp/hamster-pulse-tools/node_modules/playwright/index.mjs node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

The browser suite was run with:

```sh
node tests/validate.mjs /tmp/hamster-pulse-tools/node_modules/playwright/index.mjs
```

For this machine, both-engine validation supplied temporary browser paths and extracted support libraries under `/tmp`, including software Mesa for headless WebKit. WebKit’s system-package preflight was disabled because those libraries were supplied outside standard OS installation paths; the actual browser launched, rendered and completed all 17 tests. No browser checks were skipped in the final successful run. Those temporary libraries, caches and installers are not part of this delivery.

The 17 checks per engine cover initial real-schema parsing and zero values; 15-second polling; stable event focus; RUNNING refresh/chart updates; one-base-unit mismatch; event expansion/links; each endpoint failing; browser offline signal; successful stale payloads; malformed RPC/wrong chain; pause/manual refresh/resume; empty and hostile event text; cached full-outage reload; both themes and widths; keyboard/disclosures; script integrity/reduced motion; first-visit full outage; and disabled storage. Several assertions share a check group; see `tests/validate.mjs` and `interaction-results.json` for the exact grouping.

Live verification returned an exact supply match: both API and chain returned **19790299556933607814226919 base units**, 18 decimals. The observed wheel state, cadence, speed, distance, height and work are preserved in `live-check.json` with their UTC source timestamps. State and numeric telemetry are displayed independently as reported by the API. None of these observation values is embedded in the production page.

The assigned browser tool also loaded the actual export, used Refresh now, paused updates, expanded the exact comparison and expanded recent events. Its network list showed successful local CSS/JS and HTTP 200 for all public source calls; its app console reported zero errors/warnings. The full amount and contract address appeared in its accessibility snapshot. That snapshot is not a screen-reader session.

## Rendered contrast

Computed rendered RGB pairs were measured against their actual solid backgrounds. Ratios are WCAG 2 contrast calculations, rounded to two places.

| Pair | Light | Dark |
| --- | --- | --- |
| Body text / page | 13.36:1 | 15.12:1 |
| Secondary text / page | 5.33:1 | 8.19:1 |
| Secondary text / wheel panel | 5.21:1 | 6.85:1 |
| Secondary text / standard panel | 5.77:1 | 7.33:1 |
| Primary button label / fill | 5.43:1 | 6.69:1 |
| Live badge label / fill | 6.16:1 | 7.29:1 |
| Focus outline / page | 5.54:1 | 9.74:1 |
| Focus outline / standard panel | 5.99:1 | 8.72:1 |
| Focus outline / wheel panel | 5.41:1 | 8.14:1 |

## Preserved evidence and limits

- `interaction-results.json`: the actual 34 successful browser check results.
- `design-probe.json`: the actual 16 successful pinned probe measurements.
- `live-check.json`: real source state/timestamps, request statuses, viewport results, axe results and rendered contrast measurements.
- `hamster-pulse-390-light-first-screen.png` and `hamster-pulse-390-dark-first-screen.png`: first-screen evidence with the product and primary action.
- `hamster-pulse-390-light.png`, `hamster-pulse-390-dark.png`, `hamster-pulse-1440-light.png`, `hamster-pulse-1440-dark.png`: final full-page live captures.

Native Safari/iPhone hardware, screen readers, native browser zoom, forced-colors rendering and long-duration soak testing were not performed. Browser-clock advancement tests polling/pause behavior without a real-time wait. The 10-minute index watchdog was source-reviewed; no separate ten-minute real-time observation is claimed. Live service availability and provider CORS behavior can change after these checks. A stale timestamp is part of the normal recovery behavior, not a guarantee of third-party uptime.

The explicit byte budget in `scripts/check.mjs` covers `.gitignore`, all delivered source/configuration/documents, and `scripts/`, `tests/`, `dist/` and `artifacts/`. It rejects dependency/cache directories and unnecessary archives in those paths. The new `.gitignore` has exactly this path budget: include `dist/**` and `artifacts/**`; exclude nested `node_modules/`, `.npm/`, `.cache/`, `.playwright-mcp/` and `test/scratch/`. Temporary browser output outside scratch was removed. The assignment also removes `test/scratch/` before submission. No Git metadata, GitHub configuration, environment file, dependency directory, submodule or publication command was modified or added.
