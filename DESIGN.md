# Hamster Pulse design system

## Overview

Hamster Pulse is an observational dashboard for people following Squeekchain’s physical wheel and Sepolia settlement. A quiet instrument panel pairs warm neutral surfaces with one illustrated hamster wheel. The hierarchy is product name and refresh controls, current wheel state and chain progress, work and supply, then economy figures and recent events.

The design is implemented in `index.html` and `style.css`; `script.js` supplies live states. It uses native controls, system fonts and an original inline SVG illustration. The visual direction is an implementation choice for this assignment.

## Colors

`style.css:1` defines primitive colors, semantic roles, typography and spacing. The `prefers-color-scheme: dark` block overrides semantic colors. Components consume roles rather than choosing colors locally. Hex values are canonical; there are no gradients.

| Semantic token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg-page` | `#f7f6f2` | `#191b19` | Page background |
| `--bg-surface` | `#ffffff` | `#222521` | Standard panels and secondary controls |
| `--bg-subtle` | `#eeede7` | `#2c302a` | Neutral badges, progress track, hover |
| `--bg-wheel` | `#fbf2e8` | `#302820` | Wheel telemetry surface |
| `--text-primary` | `#262b24` | `#f0f0e7` | Headings, data, action text |
| `--text-secondary` | `#64675d` | `#b0b4a7` | Labels, timestamps and units |
| `--border` | `#deded5` | `#43483d` | Panel and table structure |
| `--accent-solid` | `#b84322` | `#e88d66` | Primary refresh action and identity |
| `--accent-hover` | `#983519` | `#f3a581` | Primary action hover |
| `--accent-on-solid` | `#ffffff` | `#291b12` | Text on the primary action |
| `--chart-stroke` | `#b84322` | `#e88d66` | Work line, dot and block progress |
| `--chart-fill` | `#f7e7dc` | `#3a2e24` | Solid area under actual samples |
| `--focus` | `#176b8a` | `#79cee8` | Keyboard outline |
| `--status-good-text` / `--status-good-bg` | `#306437` / `#eaf3e9` | `#b1d7a7` / `#2b3d2a` | Fresh/confirmed readings and exact matches |
| `--status-warn-text` / `--status-warn-bg` | `#795300` / `#fff2d6` | `#ebc679` / `#443721` | Stale or unavailable data |
| `--status-error-text` / `--status-error-bg` | `#a5312c` / `#fbece9` | `#f4aca3` / `#4b2b29` | A fresh supply mismatch |

The illustration uses its separate `--art-*` roles, also defined in both theme blocks: wheel, spokes, outline, body, belly and cheek. These colors are decorative; status is conveyed through visible words and numeric readings.

Measured rendered contrast is documented in `artifacts/validation.md`. For example, secondary text on the wheel is 5.21:1 in light mode and 6.85:1 in dark mode; refresh-action text is 5.43:1 and 6.69:1. Values describe measured solid pairs, not a claim about every browser or device.

## Typography

`--font-sans` is `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. It carries headings, labels, data and prose. `--font-mono` is `ui-monospace, "SFMono-Regular", Consolas, monospace` and appears only on expanded exact values and the full contract address. No font files or font services are needed. Actual faces depend on the operating system.

| Token | Default size | Role |
| --- | --- | --- |
| `--text-small` | 13px / `.8125rem` | Captions, units, timestamps, table and controls |
| `--text-body` | 16px / `1rem` | Body and section headings |
| `--text-heading` | 20px / `1.25rem` | Brand and supporting numeric values |
| `--text-title` | 28px / `1.75rem` | The single page heading |
| `--text-value` | 32px / `2rem` | Supply/work totals; wheel state below 65rem |
| `--text-display` | 56px / `3.5rem` | Block height and desktop wheel state |

Weights are 400 and 600. Body line height is 1.5; `h1` uses 1.2; section headings use 1.4; prominent data uses 1.1–1.4. Large values have tight tracking (`-.025em` to `-.045em`); labels use natural spacing and sentence case. The brief’s `RUNNING` / `IDLE` states and SQK symbol retain their required casing.

Changing numbers use tabular digits. Headings balance; short prose uses pretty wrapping. Long amounts, addresses and event names can wrap with `overflow-wrap: anywhere`; they are not visually truncated. Compact token totals are rounded, with exact base units available in the supply disclosure. Descriptive prose is capped at 60–82ch depending on its context.

## Layout

Spacing tokens are 4, 8, 12, 16, 24 and 32px (`--space-1` through `--space-6`). `.shell` shares header, main and footer edges, caps content at 1200px and uses 32px gutters on a wide viewport. `.dashboard-grid` starts as `1.25fr 1fr` with 24px gaps. Panels have 24px padding; the economy strip and event table span both columns.

| Breakpoint | Implemented behavior |
| --- | --- |
| Up to 65rem / 1040px | 24px gutters, equal dashboard columns, 16px gaps/panel padding, 32px wheel-state text |
| Up to 48rem / 768px | 16px gutters, one dashboard column, compact brand, controls below the heading, primary action first visually; each economy metric stacks label, value and caption to preserve long amounts |
| Up to 26rem / 416px | Countdown gets its own line; telemetry labels reserve two lines; panel headings wrap if needed |

The mobile event table retains Event, Round and Transaction columns. Each event’s UTC time moves into its event cell; the desktop time column is hidden. No horizontal table carousel or clipped transaction address is required. Explorer links say “View tx” and expose the exact hash through their accessible name, title and destination. The supply disclosure shows the complete contract address and exact amounts.

The header stays in normal document flow. There are no fixed bars covering content. `.wheel-main` has a minimum height rather than a text-clipping fixed height. Widths 320, 360, 390, 768, 1040 and 1440 were checked in both themes. At 390×844 the product, refresh action, current wheel state and all three telemetry readings fit on the first screen. Initial text-enlargement and RTL checks are recorded separately from native browser zoom. The revision’s 200% text stress check reproduced an existing header overflow in both accepted and revised code; see `artifacts/revision-validation.md` for the measured limit.

## Elevation & Depth

Surfaces are flat: one structural 1px border, no shadows, no glass layers and no nested cards. The wheel’s warm surface distinguishes the physical source. Supply details expand in place without an overlay. Focus and the skip link are the only deliberately elevated indicators (`z-index: 10` for the skip link).

## Shapes

Panels use `--radius-panel: 1.125rem` (18px); buttons use `--radius-control: .625rem` (10px). Badges and status dots use round shapes. Progress is a native element with an 8px track and 4px radius. The decorative wheel uses circular linework; it stays static even when the telemetry says running, so it never implies an unmeasured animation speed.

## Components

| Pattern | Source / reuse point | States and behavior |
| --- | --- | --- |
| Header and shell | `index.html`, `.site-header`, `.shell`, `.brand` | Product at leading edge; Sepolia explorer utility at trailing edge; compact mobile identity |
| Buttons | `.button`, `.primary`, `.secondary`; `renderControls()` | One filled primary action. Minimum 44px height. Refresh disables only while pending, keeps its text and exposes `aria-busy`. Pause/Resume has `aria-pressed` |
| Panel heading | `.panel`, `.panel-heading` | Heading and a concise state/metadata label; wraps at narrow widths |
| Status badge | `.badge`, `.neutral`, `.good`, `.warning`, `.error`; `badge()` | Text carries meaning alongside color. Stale supply comparisons use “Stale · Match/Mismatch”, never a current green confirmation |
| Telemetry metrics | `.wheel-metrics`; `render()` | Labeled cadence, wheel speed and unit-aware distance; unknown values remain unknown; the last state is retained on failure |
| Progress | Native `<progress>`; `render()` | Percent comes from `blockProgress / blockUnitsPerBlock`, using integer arithmetic before presentation; readable exact block units accompany it |
| Session sparkline | `.work-figure`, `.chart-*`; `renderChart()` | SVG title/description, live sample count and timestamps. A dot for one sample, real line segments thereafter, visible gaps after missed intervals. Rejected older core snapshots never append samples |
| Source stamp | `.source-stamp`, `.is-stale`; `stamp()`, `staleReason()`, `sourceProblem()` | Absolute UTC time plus stale reason. Chart has an adjacent stamp. Settlement retains its own successful value/time independently of the wheel, including cached reloads. Queue failure uses existing warning text and the page-level source notice while the wheel can remain live |
| Disclosures | Native `<details>/<summary>` | Exact supply values and data provenance; Enter/Space work natively. Minimum 44px summary target; content stays selectable |
| Event table | Native `<table>`; `renderEvents()`, `eventIdentity()`, `focusEventFallback()` | Six newest events by default; “Show all” expands up to 25. Loading, empty, unavailable and cached states. Validated explorer URLs; remote text is inserted with `textContent`. Transaction/log identities preserve link nodes through incoming events, changed metadata and ordering. A retained focused event can add one row beyond the compact window. Removed events move focus to a remaining link, or the events heading for an empty/unlinked table |
| Dynamic announcements | `#announcement` | Stable polite status region for refresh completion and pause/resume; individual data changes do not announce every second |

Keyboard focus is a 2px solid `--focus` outline with a 4px offset. All actions use native buttons or anchors. The first focusable item is “Skip to dashboard”. Hover styles apply only to hover-capable devices. Under `prefers-reduced-motion: no-preference`, a press can scale a button to `.96` over 150ms using `cubic-bezier(.2, 0, 0, 1)`; reduced motion removes that transition. There are no load or looping animations. Forced-colors mode uses system focus/border colors.

## Do’s and Don’ts

- Reuse `.shell`, `.panel`, the six type sizes and semantic tokens for a matching surface. Keep data labels close to their values.
- Keep Refresh now as the primary action; peer controls use `.secondary`. Use words as well as color for every status.
- Keep exact arithmetic and exact-value access when presenting rounded numbers. Keep each source’s timestamp independent.
- Preserve cached values on failure. Do not seed the chart, imply unknown data is zero, or present stale supply as a current verification.
- Preserve the single-column mobile reading order and the table’s in-cell mobile timestamps. Do not add fixed-width data containers or hide long amounts.

To extend this page, start from a native section inside `.dashboard-grid`, use `.panel-heading` and existing metric/definition-list patterns, then connect its source stamp to the relevant reading. Recheck the 390px first screen and both themes before exporting.

Design guidance was adapted from [Jakub Krehel’s Better Interface](https://github.com/jakubkrehel/skills/tree/267330e1adfc66a718fb65fa6918c1f06d0a689e/skills/better-interface), MIT; documentation method from [Paul Bakaus’s Impeccable](https://github.com/pbakaus/impeccable/blob/9d715cc4f5564a990ca8345abfdd5df6dc9b41c8/skill/reference/document.md), Apache-2.0. The supplied notices and license texts are preserved in `artifacts/DESIGN-GUIDANCE-LICENSE.txt`.
