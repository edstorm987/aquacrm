#!/usr/bin/env node
// The repeatable responsive/accessibility browser gate.  → issues #137
//
// ── Why this exists ──────────────────────────────────────────────────────────
//
// `scripts/smoke-ux.mjs` calls itself a viewport walk, but its "viewport" is a
// substring in a User-Agent header and its assertions are `String.includes` over
// server HTML. No layout is ever computed, so it cannot see an overflow, a lost
// focus ring, a console error or an axe violation — the four things the house
// browser-acceptance rule actually requires. Everything we knew about those came
// from hand-driven passes (2026-08-25, -26, -27). Those found real defects, and
// they are not repeatable: nobody can re-run one, diff it, or fail a release on
// it.
//
// This script is that gate. It drives a real Chromium through the same `PAGES`
// list `smoke-ux.mjs` uses — imported, not copied, so the two layers cannot
// drift onto different routes — across the full viewport matrix the house rules
// name, and records a verdict per page per viewport.
//
// ── The honesty contract ─────────────────────────────────────────────────────
//
// A gate that answers "green" when it did not look is worse than no gate. So:
//
//   * `summarise()` fails a run with a MISSING required check, not just a
//     failing one. A crash halfway through is a red run, never a short green.
//   * `axeVerdict(null)` is a failure, not a pass. "No scan ran" is not "no
//     violations".
//   * With no browser binary the process exits non-zero with the install
//     command. There is no flag that turns a browser-less run green.
//
// ── Running it ───────────────────────────────────────────────────────────────
//
//   # one-off, on any machine:
//   npx playwright-core install chromium        # ~150MB, not an npm postinstall
//   npm run sandbox:fork -- gate 3041           # isolated state + build dir
//   PORTAL_DATA_FILE=.data/portal-state.gate.json NEXT_DIST_DIR=.next-gate-turbo \
//     npm run dev:worker -- -p 3041
//
//   AQUA_BASE=http://localhost:3041 npm run browser:matrix
//
// Sign-in defaults to `/dev`, which mints a real writable session with NO
// credentials on a file/memory backend — so the local lane needs no founder
// password. Set FOUNDER_PASSWORD (or AQUA_AUTH=password) to drive a deployed
// target through `/api/auth/login` instead.
//
// Narrow a run while iterating:
//   AQUA_VIEWPORTS=mobile-portrait,desktop AQUA_PAGES=/portal/agency npm run browser:matrix

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { PAGES } from "./smoke-ux.mjs";

const require = createRequire(import.meta.url);

// ─────────────────────────────────────────────────────────────────────────────
// The matrix
// ─────────────────────────────────────────────────────────────────────────────

// docs/development/tests.md and CLAUDE.md name the same six primary sizes, plus
// 320x568, 200% zoom and "real breakpoint-boundary probes". The boundaries are
// Tailwind's, which is what globals.css and every `sm:`/`md:`/`lg:`/`xl:` class
// in the app switch on: a probe sits either side of each, because an off-by-one
// media query is invisible at any width that is not adjacent to it.
export const TAILWIND_BREAKPOINTS = [640, 768, 1024, 1280];

export const MATRIX = [
  { id: "mobile-portrait", label: "Mobile portrait", width: 375, height: 812, zoom: 1, kind: "primary" },
  { id: "mobile-landscape", label: "Mobile landscape", width: 812, height: 375, zoom: 1, kind: "primary" },
  { id: "tablet-portrait", label: "Tablet portrait", width: 768, height: 1024, zoom: 1, kind: "primary" },
  { id: "tablet-landscape", label: "Tablet landscape", width: 1024, height: 768, zoom: 1, kind: "primary" },
  { id: "desktop", label: "Desktop", width: 1280, height: 800, zoom: 1, kind: "primary" },
  { id: "wide", label: "Wide", width: 1920, height: 1080, zoom: 1, kind: "primary" },
  { id: "small", label: "Small phone", width: 320, height: 568, zoom: 1, kind: "primary" },
  // 200% zoom is a WCAG 1.4.4 requirement and the single most reliable way to
  // find a layout that only survives because nobody scaled it. A browser has no
  // zoom API; zooming to 200% halves the CSS viewport at twice the device
  // scale, which is exactly what `cssViewport` computes.
  { id: "desktop-zoom-200", label: "Desktop @ 200% zoom", width: 1280, height: 800, zoom: 2, kind: "zoom" },
  { id: "mobile-zoom-200", label: "Mobile portrait @ 200% zoom", width: 375, height: 812, zoom: 2, kind: "zoom" },
  ...TAILWIND_BREAKPOINTS.flatMap(bp => [
    { id: `boundary-${bp - 1}`, label: `Boundary ${bp - 1}px (below ${bp})`, width: bp - 1, height: 900, zoom: 1, kind: "boundary" },
    { id: `boundary-${bp}`, label: `Boundary ${bp}px (at ${bp})`, width: bp, height: 900, zoom: 1, kind: "boundary" },
  ]),
];

/**
 * CSS viewport + device scale for one matrix entry.
 *
 * Zoom is emulated rather than declared: at 200% a 1280px-wide window exposes
 * 640 CSS pixels to the page at a device pixel ratio of 2. Rounding down keeps
 * an odd width from reporting half a pixel of overflow that no user can see.
 */
export function cssViewport(entry) {
  const zoom = entry.zoom ?? 1;
  return {
    width: Math.floor(entry.width / zoom),
    height: Math.floor(entry.height / zoom),
    deviceScaleFactor: zoom,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Verdicts — pure, so they are testable without a browser
// ─────────────────────────────────────────────────────────────────────────────

export const REQUIRED_CHECKS = ["render", "overflow", "console", "network", "focus", "axe"];

// Only assertable when a suspension is actually observed. A fast route that
// never suspends must not be scored either way — see `loadingStatusVerdict`.
//
// NOT YET DRIVEN. `loadingStatusVerdict` is the contract and is proven in the
// smoke; the driver below does not yet produce its input, because a suspension
// only appears on a CLIENT-SIDE transition (a `page.goto` re-renders on the
// server and never suspends), which means clicking real in-app navigation and
// racing the loader. That is the one part of issue #136's browser half still
// open here, and it is listed as unrun rather than reported as passing.
export const OPPORTUNISTIC_CHECKS = ["loading-status"];

export const BLOCKING_AXE_IMPACTS = ["serious", "critical"];

/** A sub-CSS-pixel of overflow is layout rounding, not a defect. 2px is not. */
export const OVERFLOW_TOLERANCE_PX = 1;

export function renderVerdict({ status, url, needsAuth }) {
  if (status !== 200) return { status: "fail", detail: `HTTP ${status}` };
  // A protected route that quietly answered the login page is not a render.
  // The SSR smoke cannot tell these apart; the browser can, because it followed
  // the redirect and knows where it landed.
  if (needsAuth && /\/login(\?|$)/.test(url ?? "")) {
    return { status: "fail", detail: `redirected to login — the session was not accepted (${url})` };
  }
  return { status: "pass", detail: `HTTP 200 ${url ?? ""}`.trim() };
}

export function overflowVerdict({ scrollWidth, clientWidth, tolerance = OVERFLOW_TOLERANCE_PX }) {
  if (typeof scrollWidth !== "number" || typeof clientWidth !== "number") {
    return { status: "fail", detail: "no layout measurement was taken" };
  }
  const overflow = scrollWidth - clientWidth;
  if (overflow > tolerance) {
    return { status: "fail", detail: `${overflow}px of the page sits off the right edge (${scrollWidth} > ${clientWidth})` };
  }
  // Saying "376 ≤ 375" on the tolerated-rounding path is a false statement in
  // the evidence log. Name the tolerance instead of asserting an untruth.
  return {
    status: "pass",
    detail: overflow > 0
      ? `no horizontal overflow beyond the ${tolerance}px rounding tolerance (${scrollWidth} vs ${clientWidth})`
      : `no horizontal overflow (${scrollWidth} ≤ ${clientWidth})`,
  };
}

/**
 * The document is NOT the only thing that can overflow, and at the widths this
 * gate exists for it is the wrong thing to measure.
 *
 * `globals.css` clips the portal's own scroll region below the `sm` breakpoint:
 *
 *   @media (max-width: 639px) { .mm-portal-root main#main-content { overflow-x: hidden } }
 *
 * A clipped overflow never reaches `document.scrollingElement.scrollWidth`, so
 * measuring the document alone reports "no horizontal overflow" for content
 * that is genuinely cut off and unreachable — at 320, 375, 639 and both 200%
 * zoom rows, i.e. every mobile viewport in the matrix. Verified against a real
 * Chromium on 2026-08-30: a 2000px child inside a clipped `main#main-content`
 * at a 375px viewport scored `✓ no horizontal overflow (375 ≤ 375)`.
 *
 * So each region is measured on its own and the worst one decides. A nested
 * `overflow-x: auto` scroller (a wide table, a board) does not inflate its
 * ancestor's `scrollWidth`, so deliberate horizontal scrollers stay quiet.
 */
export function overflowVerdictFrom(measurements, { tolerance = OVERFLOW_TOLERANCE_PX } = {}) {
  if (!Array.isArray(measurements) || measurements.length === 0) {
    return { status: "fail", detail: "no layout measurement was taken" };
  }
  const usable = measurements.filter(
    m => typeof m?.scrollWidth === "number" && typeof m?.clientWidth === "number",
  );
  if (usable.length !== measurements.length) {
    return { status: "fail", detail: "no layout measurement was taken" };
  }
  const worst = usable.reduce((a, b) =>
    (b.scrollWidth - b.clientWidth > a.scrollWidth - a.clientWidth ? b : a));
  const verdict = overflowVerdict({ scrollWidth: worst.scrollWidth, clientWidth: worst.clientWidth, tolerance });
  return { ...verdict, detail: `${worst.label ?? "document"}: ${verdict.detail}` };
}

/**
 * URLs that only a `next dev` server serves.
 *
 * `/_next/static/**` is Turbopack's chunk graph, which it cancels wholesale on
 * every recompile. `/__nextjs_font/**` is the dev-only font route — a built app
 * serves its fonts from `/_next/static/media/`, so this path cannot 404 in
 * production because it does not exist there. Neither is evidence about the
 * application, and neither is an allowlist: both are ignored ONLY when the
 * target has identified itself as a dev server through its own HMR socket.
 */
export function isDevOnlyAsset(url) {
  return typeof url === "string" && (url.includes("/_next/static/") || url.includes("/__nextjs_font/"));
}

export function consoleVerdict({ consoleErrors = [], pageErrors = [], navigated = true, devServer = false } = {}) {
  // A page that never loaded emits no console errors. Scoring that empty log as
  // "clean" is the same lie as `axeVerdict(null)` returning a pass, and it was
  // reachable: the driver records console/network outside the navigation
  // try/catch, so a `goto` that threw used to score `✓ clean console`.
  if (!navigated) {
    return { status: "fail", detail: "the page never loaded — an empty console log is not a clean one" };
  }
  // A cancelled chunk logs "Failed to load resource: …" against the chunk's own
  // URL. The same recompilation is already an observation in the network
  // verdict; failing the console for its echo reports one dev-server artefact
  // twice. Only errors LOCATED at a dev-only asset are set aside — an error
  // from application code at any URL still fails, dev server or not.
  const errors = consoleErrors.map(e => (typeof e === "string" ? { text: e, url: undefined } : e));
  const noise = devServer ? errors.filter(e => isDevOnlyAsset(e.url)) : [];
  const all = [...errors.filter(e => !noise.includes(e)).map(e => e.text), ...pageErrors];
  if (all.length > 0) {
    return { status: "fail", detail: `${all.length} console error(s): ${all.slice(0, 3).join(" | ")}` };
  }
  if (noise.length > 0) {
    return {
      status: "observation",
      detail: `${noise.length} console error(s) from cancelled dev-server assets — `
        + "recompilation noise, not proof of anything; re-run against a production build for a release gate",
    };
  }
  return { status: "pass", detail: "clean console" };
}

/**
 * Failed requests.
 *
 * One caveat, and it is a caveat rather than an allowlist. Turbopack cancels
 * in-flight `/_next/static/**` chunk requests whenever it recompiles, so a dev
 * server produces a stream of failed asset requests that do not exist in a
 * built app. Those are downgraded to observations ONLY when the target has been
 * identified as a dev server from its own HMR socket — not from a flag anyone
 * can set — and the reason is printed on every one. Against a production
 * target (`npm run build && npm start`, which is the release lane) every failed
 * request fails the gate, `/_next/` included.
 */
export function networkVerdict({ failedRequests = [], devServer = false, navigated = true } = {}) {
  // Same rule as the console: no navigation means no observation. A `goto` that
  // times out on `networkidle` leaves this log empty even though the page was
  // never proven to render, and an empty log must not read as a clean one.
  if (!navigated) {
    return { status: "fail", detail: "the page never loaded — an empty request log is not a clean one" };
  }
  const noise = devServer ? failedRequests.filter(r => isDevOnlyAsset(r.url)) : [];
  const real = failedRequests.filter(r => !noise.includes(r));
  if (real.length > 0) {
    const shown = real.slice(0, 3).map(r => `${r.status ?? "failed"} ${r.url}`).join(" | ");
    return { status: "fail", detail: `${real.length} failed request(s): ${shown}` };
  }
  if (noise.length > 0) {
    return {
      status: "observation",
      detail: `${noise.length} cancelled dev-server asset request(s) — dev-server recompilation, `
        + "not proof of anything; re-run against a production build for a release gate",
    };
  }
  return { status: "pass", detail: "clean network log" };
}

/**
 * Is this box-shadow actually a visible ring?
 *
 * Tailwind emits a placeholder shadow — `rgba(0,0,0,0) 0px 0px 0px 0px, …` — on
 * anything carrying a ring utility, focused or not. Treating "boxShadow is not
 * none" as a focus indicator therefore passes every such control whether or not
 * it shows a thing, which is precisely the defect this gate is meant to catch.
 */
export function shadowIsVisible(value) {
  if (!value || value === "none") return false;
  // Split on top-level commas only; the ones inside rgb()/rgba() are not layers.
  return value.split(/,(?![^(]*\))/).some(layer => {
    if (/rgba?\([^)]*,\s*0(?:\.0+)?\s*\)/.test(layer)) return false;   // fully transparent
    return /(?:^|\s)(?:[1-9]\d*|0?\.\d*[1-9])(?:\.\d+)?px/.test(layer); // some non-zero length
  });
}

/**
 * The computed-style half of the focus check, kept out of the page so it is
 * testable.
 *
 * A visible box-shadow is only an INDICATOR if it appeared with the focus.
 * Most controls in this app carry a resting `shadow-sm`, and counting that as a
 * focus ring would pass every unringed button in the portal. So the shadow is
 * compared against the same element's resting shadow, captured before the walk
 * began; an outline needs no such comparison, since a resting outline is
 * vanishingly rare and would itself be a defect.
 */
export function focusIndicatorIsVisible({ outlineStyle, outlineWidth, boxShadow, restingBoxShadow } = {}) {
  if (outlineStyle && outlineStyle !== "none" && parseFloat(outlineWidth || "0") > 0) return true;
  if (!shadowIsVisible(boxShadow)) return false;
  // No baseline (an element added after the page settled) — fall back to
  // "there is a visible shadow", which is the weaker but still honest answer.
  if (restingBoxShadow === undefined || restingBoxShadow === null) return true;
  return boxShadow !== restingBoxShadow;
}

/**
 * How long to wait before a focus indicator can be judged ABSENT.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * This gate reported 204 focus-indicator failures across the matrix, and every
 * one of them was wrong. The chrome controls carry `transition-property: all`
 * with a 0.14s duration, so `getComputedStyle` read in the same task as the Tab
 * press returns the START of the transition — `outline: solid 0px` — for an
 * element whose ring is on its way in. Measured directly on a live page:
 *
 *     IMMEDIATE   : solid 0px
 *     AFTER 600ms : solid 2px
 *
 * A gate that fails working code is worse than no gate: the obvious response is
 * to "fix" the CSS, which changes correct code to satisfy a broken measurement.
 * So an apparent absence is re-sampled after the element's OWN declared
 * transition has had time to finish, and only a still-absent indicator fails.
 *
 * Returns 0 when nothing is transitioning, so the overwhelmingly common case
 * (an indicator visible on the first read) costs nothing. The cap keeps a
 * pathological `transition: all 10s` from stalling a 1,326-check matrix.
 */
export const FOCUS_SETTLE_CAP_MS = 700;

/** Parse a CSS time list ("0.14s, 0s" / "140ms") to the largest value in ms. */
export function longestCssTimeMs(value) {
  if (typeof value !== "string" || value.trim() === "") return 0;
  let longest = 0;
  for (const part of value.split(",")) {
    const match = /^\s*(-?[\d.]+)(ms|s)\s*$/.exec(part);
    if (!match) continue;
    const ms = parseFloat(match[1]) * (match[2] === "s" ? 1000 : 1);
    if (Number.isFinite(ms) && ms > longest) longest = ms;
  }
  return longest;
}

/**
 * The settle BUDGET for one focus stop, in ms — how long the walk may keep
 * re-reading before it will call an indicator genuinely absent. `0` means "the
 * first read is final": either the indicator was already visible, or nothing is
 * animating, so waiting could not change the answer.
 *
 * The budget has a floor well above the declared duration. A first attempt used
 * `duration + 40ms` and still reported the topbar's "Working as" button ringless
 * at 1920×1080 — the ring is there, and reads `solid 2px` if you look again;
 * the transition simply had not started yet. A CSS duration says how long the
 * animation runs, not when the browser gets round to starting it, and on a dev
 * server under a full-page axe scan that gap is not small. The walk polls
 * within the budget, so the floor costs nothing once the ring appears.
 */
export const FOCUS_SETTLE_FLOOR_MS = 250;

export function focusSettleDelayMs(step = {}) {
  if (focusIndicatorIsVisible(step)) return 0;
  const total = longestCssTimeMs(step.transitionDuration) + longestCssTimeMs(step.transitionDelay);
  if (total <= 0) return 0;
  return Math.min(Math.max(Math.ceil(total) + 40, FOCUS_SETTLE_FLOOR_MS), FOCUS_SETTLE_CAP_MS);
}

// `next dev` injects its error overlay as a custom element that takes a Tab
// stop of its own. It does not exist in a built app, so counting it as a focus
// stop (or failing it for having no ring) would report a defect that ships to
// nobody.
export const DEV_OVERLAY_TAGS = ["nextjs-portal"];

/**
 * The keyboard walk.
 *
 * `steps` is one entry per Tab press: `{ signature, isBody, visibleFocus }`.
 * Three ways of being broken that all look fine in a screenshot:
 *   - nothing is reachable by keyboard at all;
 *   - focus lands somewhere with no visible indicator (WCAG 2.4.7);
 *   - focus stops moving, i.e. an unescapable trap.
 */
export function focusWalkVerdict(steps, { minimumStops = 3 } = {}) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return { status: "fail", detail: "no keyboard walk was recorded" };
  }
  const stops = steps.filter(step => !step.isBody);
  if (stops.length < minimumStops) {
    return { status: "fail", detail: `Tab reached only ${stops.length} focusable stop(s); expected at least ${minimumStops}` };
  }
  const invisible = stops.filter(step => !step.visibleFocus);
  if (invisible.length > 0) {
    return {
      status: "fail",
      detail: `${invisible.length} focus stop(s) show no visible indicator: ${invisible.slice(0, 3).map(s => s.signature).join(" | ")}`,
    };
  }
  let repeats = 1;
  for (let i = 1; i < steps.length; i += 1) {
    repeats = steps[i].signature === steps[i - 1].signature ? repeats + 1 : 1;
    if (repeats >= 3) {
      return { status: "fail", detail: `focus stopped moving at ${steps[i].signature} — a keyboard trap` };
    }
  }
  return { status: "pass", detail: `${stops.length} focus stops, all with a visible indicator` };
}

/**
 * Accessibility scan.
 *
 * `null` means the scan did not run, and that is a failure — the distinction
 * between "found nothing" and "did not look" is the whole point of this file.
 * Moderate and minor findings are reported as observations rather than
 * silently dropped, because dropping them is how they become permanent.
 */
export function axeVerdict(violations) {
  if (!Array.isArray(violations)) {
    return { status: "fail", detail: "no accessibility scan ran — that is not the same as no violations" };
  }
  const blocking = violations.filter(v => BLOCKING_AXE_IMPACTS.includes(v.impact));
  if (blocking.length > 0) {
    const shown = blocking.slice(0, 4).map(v => `${v.impact}:${v.id}(${v.nodes?.length ?? 0})`).join(" | ");
    return { status: "fail", detail: `${blocking.length} serious/critical finding(s): ${shown}` };
  }
  const lesser = violations.length;
  return {
    status: "pass",
    detail: lesser === 0
      ? "zero axe violations"
      : `zero serious/critical (${lesser} moderate/minor recorded as observations)`,
  };
}

/**
 * The suspense status. → issue #136
 *
 * `observed: false` means this route resolved without ever suspending, which is
 * neither a pass nor a failure and is recorded as exactly that. Scoring it as a
 * pass would let a route that lost its status announcement look proven.
 */
export function loadingStatusVerdict({ observed, hasLiveRegion, exposedToAccessibilityTree } = {}) {
  if (!observed) {
    return { status: "not-observed", detail: "the route resolved without a visible suspension" };
  }
  if (!hasLiveRegion) {
    return { status: "fail", detail: "a loading state appeared with no polite status to announce it" };
  }
  if (!exposedToAccessibilityTree) {
    return { status: "fail", detail: "the loading status is inside an aria-hidden subtree, so it announces nothing" };
  }
  return { status: "pass", detail: "a polite loading status was announced and removed" };
}

/**
 * Roll the records up into one verdict.
 *
 * The load-bearing rule is `missing`: every expected page/viewport pair owes
 * every required check. A run that crashed, timed out, or skipped a route
 * reports red, because the alternative is a green built out of silence.
 */
export function summarise(records, { expected = [] } = {}) {
  const seen = new Set(records.map(r => `${r.page}@${r.viewport}#${r.check}`));
  const missing = [];
  for (const pair of expected) {
    for (const check of REQUIRED_CHECKS) {
      const key = `${pair.page}@${pair.viewport}#${check}`;
      if (!seen.has(key)) missing.push(key);
    }
  }
  const failed = records.filter(r => r.status === "fail");
  const passed = records.filter(r => r.status === "pass");
  const observations = records.filter(r => r.status === "observation" || r.status === "not-observed");
  return {
    total: records.length,
    passed: passed.length,
    failed: failed.length,
    observations: observations.length,
    missing,
    failures: failed,
    // No expectations and no records is a run that did nothing. It is not green.
    ok: failed.length === 0 && missing.length === 0 && passed.length > 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependency resolution — loud, and never optional
// ─────────────────────────────────────────────────────────────────────────────

export const BROWSER_INSTALL_HINT =
  "Chromium is not installed for playwright-core.\n"
  + "  npm run browser:install        # npx playwright-core install chromium\n"
  + "(playwright-core is a devDependency precisely so `npm install` never has to\n"
  + " download 150MB of browser; provisioning is this one explicit command.)\n"
  + "Already have a Chromium? Point at it: AQUA_BROWSER_EXECUTABLE=/path/to/chrome";

/**
 * Find a Chromium that is already on this machine.
 *
 * CI images, devcontainers and sandboxes commonly ship a browser under
 * `PLAYWRIGHT_BROWSERS_PATH` at whatever revision they were built with, which
 * is rarely the exact revision this playwright-core asks for — and asking the
 * CDN for the matching one is exactly what an offline or policy-restricted
 * environment cannot do. Using the browser that is present is far better
 * evidence than not running at all, so long as the run SAYS which browser it
 * used; `main()` prints it. This is a fallback, never the first choice.
 */
export function findProvisionedChromium(root, { exists = existsSync, list = readdirSync } = {}) {
  if (!root || root === "0") return undefined;
  if (!exists(root)) return undefined;
  const symlinked = join(root, "chromium");
  if (exists(symlinked)) return symlinked;
  const revisions = list(root)
    .filter(name => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const revision of revisions) {
    for (const relative of [["chrome-linux", "chrome"], ["chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"]]) {
      const candidate = join(root, revision, ...relative);
      if (exists(candidate)) return candidate;
    }
  }
  return undefined;
}

async function loadChromium() {
  try {
    const { chromium } = await import("playwright-core");
    return chromium;
  } catch (error) {
    throw new Error(
      `playwright-core is not installed.\n  npm install\n  ${BROWSER_INSTALL_HINT}\n\n(${error.message})`,
    );
  }
}

function loadAxeSource() {
  try {
    return readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  } catch (error) {
    throw new Error(`axe-core is not installed — run \`npm install\`. (${error.message})`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Driver
// ─────────────────────────────────────────────────────────────────────────────

const BASE = process.env.AQUA_BASE || "http://localhost:3041";
const ARTEFACTS = process.env.AQUA_ARTEFACTS || join(".artefacts", "browser-matrix");
const TAB_PRESSES = Number(process.env.AQUA_TAB_PRESSES || 12);

export function selectMatrix(filter) {
  if (!filter) return MATRIX;
  const wanted = new Set(filter.split(",").map(s => s.trim()).filter(Boolean));
  const chosen = MATRIX.filter(entry => wanted.has(entry.id) || wanted.has(entry.kind));
  if (chosen.length === 0) {
    throw new Error(`AQUA_VIEWPORTS matched nothing. Known ids: ${MATRIX.map(m => m.id).join(", ")}`);
  }
  return chosen;
}

export function selectPages(filter) {
  if (!filter) return PAGES;
  const wanted = filter.split(",").map(s => s.trim()).filter(Boolean);
  // Prefix matching, EXCEPT for "/" — every path starts with it, so treating it
  // as a prefix silently turns a one-page run into the whole list.
  const chosen = PAGES.filter(page => wanted.some(w => page.path === w || (w !== "/" && page.path.startsWith(w))));
  if (chosen.length === 0) {
    throw new Error(`AQUA_PAGES matched nothing. Known paths: ${PAGES.map(p => p.path).join(", ")}`);
  }
  return chosen;
}

// `/dev` mints a real writable session on a file/memory backend with no
// credentials, which is what makes this gate runnable by anyone on a
// `sandbox:fork` lane. A deployed target has no `/dev`, so it uses the same
// credential flow the SSR smoke uses.
async function signIn(page) {
  const email = process.env.FOUNDER_EMAIL || "edwardhallam07@gmail.com";
  const password = process.env.FOUNDER_PASSWORD || "";
  const mode = process.env.AQUA_AUTH || (password ? "password" : "dev");

  if (mode === "password") {
    const response = await page.request.post(`${BASE}/api/auth/login`, {
      data: { email, password },
      headers: { "content-type": "application/json" },
    });
    if (!response.ok()) {
      throw new Error(`sign-in failed: POST /api/auth/login → ${response.status()}`);
    }
    return "password";
  }

  const response = await page.goto(`${BASE}/dev`, { waitUntil: "domcontentloaded" });
  if (!response || response.status() >= 400) {
    throw new Error(
      `sign-in failed: GET /dev → ${response?.status() ?? "no response"}.\n`
      + "Dev mode needs a file or memory backend — start the target with `npm run dev:worker`,\n"
      + "or set FOUNDER_PASSWORD to drive a deployed target through /api/auth/login instead.",
    );
  }
  return "dev";
}

/**
 * Runs inside the page. Kept as a string-free function for readability.
 *
 * Measures the document AND the portal's own scroll region, because the latter
 * is clipped with `overflow-x: hidden` below 640px and therefore hides its
 * overflow from the document — see `overflowVerdictFrom`.
 */
function measureLayout() {
  const doc = document.scrollingElement || document.documentElement;
  const measurements = [{ label: "document", scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth }];
  const main = document.querySelector("#main-content");
  if (main) {
    measurements.push({ label: "#main-content", scrollWidth: main.scrollWidth, clientWidth: main.clientWidth });
  }
  return measurements;
}

/**
 * Runs inside the page. Reports raw computed values and lets Node decide what
 * counts as a visible indicator — the judgement belongs with the other
 * verdicts, where it can be tested without a browser.
 */
//
// The baseline is held in a page-global Map keyed by the element, NOT in a
// `data-` attribute. An attribute was the first implementation and it made the
// gate lie about the app: writing an instrumentation attribute onto React-owned
// nodes produced a hydration-mismatch diff on the next dev recompile, which the
// console verdict then reported as an application defect. A measurement that
// mutates the thing it is measuring is not a measurement.
const RESTING_SHADOW_KEY = "__aquaRestingShadows";

/**
 * Snapshot every focusable control's UNFOCUSED shadow, and give each one a
 * stable per-page ordinal.
 *
 * ── Why the ordinal ─────────────────────────────────────────────────────
 *
 * A keyboard trap is "focus keeps landing on the SAME element". The detector
 * compared signature strings, and the signature was tag + id + visible text —
 * which is empty for an `<input>`. Nine consecutive unlabelled checkboxes on
 * the notification settings therefore all signed as `input`, and the gate
 * reported a keyboard trap on four viewports. There is no trap: Tab moves
 * through all nine perfectly well.
 *
 * String identity was the wrong tool. The ordinal makes the comparison mean
 * what the check claims to mean — the same NODE, not the same description.
 */
function captureRestingShadows(key) {
  const selector = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const state = { shadows: new Map(), ordinals: new Map(), next: 1 };
  for (const el of document.querySelectorAll(selector)) {
    state.shadows.set(el, getComputedStyle(el).boxShadow);
    state.ordinals.set(el, state.next);
    state.next += 1;
  }
  window[key] = state;
}

function clearRestingShadows(key) {
  delete window[key];
}

function describeFocus(key) {
  const el = document.activeElement;
  if (!el || el === document.body) return { tag: "body", signature: "body", isBody: true };
  const style = getComputedStyle(el);
  const state = window[key] && window[key].ordinals instanceof Map ? window[key] : null;

  // The element's accessible name, resolved the way a screen reader would
  // rather than by reading `textContent` and hoping. An `<input>` has no text
  // of its own; its name comes from a wrapping or associated `<label>`, and a
  // report that cannot name the control it failed is a report nobody can act
  // on.
  const labelledBy = (el.getAttribute("aria-labelledby") || "")
    .split(/\s+/).filter(Boolean)
    .map(id => document.getElementById(id)?.textContent?.trim() || "")
    .filter(Boolean).join(" ");
  const associated = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : "";
  const wrapping = typeof el.closest === "function" ? el.closest("label")?.textContent : "";
  const label = (
    el.getAttribute("aria-label")
    || labelledBy
    || (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA"
      ? (associated || wrapping || el.getAttribute("placeholder") || el.getAttribute("title") || el.getAttribute("name") || "")
      : el.textContent || "")
  ).trim().replace(/\s+/g, " ").slice(0, 40);

  // Node identity, so "the same signature three times" means the same node
  // three times. An element that appeared after the snapshot is assigned one
  // now rather than sharing the anonymous bucket with every other newcomer.
  let ordinal = state?.ordinals.get(el);
  if (state && ordinal === undefined) {
    ordinal = state.next;
    state.next += 1;
    state.ordinals.set(el, ordinal);
  }

  return {
    tag: el.tagName.toLowerCase(),
    signature: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${label ? `[${label}]` : ""}`
      + (ordinal === undefined ? "" : `@${ordinal}`),
    isBody: false,
    outlineStyle: style.outlineStyle,
    outlineWidth: style.outlineWidth,
    boxShadow: style.boxShadow,
    restingBoxShadow: state && state.shadows.has(el) ? state.shadows.get(el) : null,
    // Read so Node can tell "no indicator" from "the indicator is 140ms into
    // arriving". See focusSettleDelayMs.
    transitionDuration: style.transitionDuration,
    transitionDelay: style.transitionDelay,
  };
}

const FOCUS_POLL_MS = 50;

async function walkKeyboard(page, presses) {
  const steps = [];
  await page.evaluate(captureRestingShadows, RESTING_SHADOW_KEY);
  for (let i = 0; i < presses; i += 1) {
    await page.keyboard.press("Tab");
    let raw = await page.evaluate(describeFocus, RESTING_SHADOW_KEY);
    // An indicator that is mid-transition reads as absent. Poll ONLY on an
    // apparent absence, and stop the moment the ring appears — so the common
    // case (already visible) costs nothing and a real absence costs the budget
    // once rather than on every stop.
    const budget = raw.isBody ? 0 : focusSettleDelayMs(raw);
    for (let waited = 0; waited < budget; waited += FOCUS_POLL_MS) {
      await page.waitForTimeout(FOCUS_POLL_MS);
      const settled = await page.evaluate(describeFocus, RESTING_SHADOW_KEY);
      // Only trust the re-read if focus is still on the same control — a page
      // that moves focus on its own must not have another element's ring
      // credited to this stop.
      if (settled.signature !== raw.signature) break;
      raw = settled;
      if (focusIndicatorIsVisible(raw)) break;
    }
    steps.push({
      ...raw,
      isBody: raw.isBody || DEV_OVERLAY_TAGS.includes(raw.tag),
      visibleFocus: focusIndicatorIsVisible(raw),
    });
  }
  await page.evaluate(clearRestingShadows, RESTING_SHADOW_KEY);
  return steps;
}

async function scanAxe(page, axeSource) {
  try {
    await page.addScriptTag({ content: axeSource });
    return await page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      const results = await window.axe.run(document, {
        resultTypes: ["violations"],
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
      });
      return results.violations.map(v => ({
        id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => n.target.join(" ")),
      }));
    });
  } catch (error) {
    // Deliberately NOT swallowed into a pass: `axeVerdict(null)` fails.
    console.error(`    ! axe scan failed: ${error.message}`);
    return null;
  }
}

async function main() {
  const chromium = await loadChromium();
  const axeSource = loadAxeSource();
  const viewports = selectMatrix(process.env.AQUA_VIEWPORTS);
  const pages = selectPages(process.env.AQUA_PAGES);

  console.log(`\n=== AquaCRM browser matrix @ ${BASE} ===`);
  console.log(`${pages.length} pages × ${viewports.length} viewports\n`);

  let browser;
  let browserNote = "playwright-core's own Chromium";
  const pinned = process.env.AQUA_BROWSER_EXECUTABLE;
  try {
    browser = await chromium.launch(pinned ? { executablePath: pinned } : {});
    if (pinned) browserNote = `AQUA_BROWSER_EXECUTABLE=${pinned}`;
  } catch (error) {
    const provisioned = pinned ? undefined : findProvisionedChromium(process.env.PLAYWRIGHT_BROWSERS_PATH);
    if (!provisioned) throw new Error(`${BROWSER_INSTALL_HINT}\n\n(${error.message})`);
    browser = await chromium.launch({ executablePath: provisioned });
    browserNote = `${provisioned} (pre-provisioned; NOT the revision playwright-core pins)`;
  }
  console.log(`Browser: ${browserNote} — ${browser.version()}\n`);

  const records = [];
  const expected = [];
  let devServer = false;
  const add = (page, viewport, check, verdict) => {
    records.push({ page, viewport, check, status: verdict.status, detail: verdict.detail });
    const tag = { pass: "✓", fail: "✗", "not-observed": "·", observation: "·" }[verdict.status] ?? "?";
    console.log(`  ${tag} [${viewport}] ${page} ${check} — ${verdict.detail}`);
  };

  try {
    for (const entry of viewports) {
      const context = await browser.newContext({ viewport: cssViewport(entry), reducedMotion: "no-preference" });
      const session = await context.newPage();
      // Attached before sign-in, not per target. `signIn` navigates to /dev,
      // which opens the HMR socket — but the listener used to go on inside the
      // target loop, so the FIRST page of the run was always judged with
      // `devServer` still false and its cancelled chunks scored as real
      // failures. It reported `/` red on one viewport out of seventeen, which
      // is exactly the shape of a gate defect rather than an app defect.
      session.on("websocket", ws => { if (/hmr|_next\/webpack/.test(ws.url())) devServer = true; });
      const authMode = await signIn(session);
      // Whether the target is a dev server is a property of the TARGET, so it
      // must be settled BEFORE anything is judged rather than discovered
      // part-way through the run. Attaching the listener early was not enough:
      // the socket opens shortly after `domcontentloaded`, which is after
      // sign-in returns and can be after the first page has already been
      // scored. Waiting for it explicitly, bounded, makes the first page and
      // the seventeenth judged by the same rule. A production target has no
      // such socket and simply spends the timeout once per viewport.
      if (!devServer) {
        await session.waitForEvent("websocket", {
          predicate: ws => /hmr|_next\/webpack/.test(ws.url()),
          timeout: 4000,
        }).then(() => { devServer = true; }).catch(() => {});
      }
      console.log(`\n— ${entry.label} (${entry.width}×${entry.height} @${entry.zoom}×, auth=${authMode})`);

      for (const target of pages) {
        expected.push({ page: target.path, viewport: entry.id });

        const consoleErrors = [];
        const pageErrors = [];
        const failedRequests = [];
        // The location URL is what separates a cancelled dev chunk from an
        // application error; without it every console error looks alike.
        const onConsole = msg => {
          if (msg.type() !== "error") return;
          consoleErrors.push({ text: msg.text(), url: msg.location()?.url });
        };
        const onPageError = err => pageErrors.push(err.message);
        const onResponse = res => { if (res.status() >= 400) failedRequests.push({ url: res.url(), status: res.status() }); };
        const onRequestFailed = req => failedRequests.push({ url: req.url(), status: null });
        session.on("console", onConsole);
        session.on("pageerror", onPageError);
        session.on("response", onResponse);
        session.on("requestfailed", onRequestFailed);

        let navigated = false;
        try {
          const response = await session.goto(`${BASE}${target.path}`, { waitUntil: "networkidle", timeout: 45_000 });
          navigated = true;
          add(target.path, entry.id, "render", renderVerdict({
            status: response?.status() ?? 0,
            url: session.url(),
            needsAuth: target.needsAuth,
          }));
          add(target.path, entry.id, "overflow", overflowVerdictFrom(await session.evaluate(measureLayout)));
          add(target.path, entry.id, "focus", focusWalkVerdict(await walkKeyboard(session, TAB_PRESSES)));
          add(target.path, entry.id, "axe", axeVerdict(await scanAxe(session, axeSource)));
        } catch (error) {
          add(target.path, entry.id, "render", { status: "fail", detail: error.message });
        } finally {
          session.off("console", onConsole);
          session.off("pageerror", onPageError);
          session.off("response", onResponse);
          session.off("requestfailed", onRequestFailed);
        }

        add(target.path, entry.id, "console", consoleVerdict({ consoleErrors, pageErrors, navigated, devServer }));
        add(target.path, entry.id, "network", networkVerdict({ failedRequests, devServer, navigated }));

        await mkdir(ARTEFACTS, { recursive: true }).catch(() => {});
        const slug = `${entry.id}${target.path.replace(/\//g, "_") || "_root"}`;
        await session.screenshot({ path: join(ARTEFACTS, `${slug}.png`), fullPage: true }).catch(() => {});
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  const result = summarise(records, { expected });
  await mkdir(ARTEFACTS, { recursive: true }).catch(() => {});
  // The browser identity is part of the evidence, not a log line: a green run
  // means nothing if nobody can tell what rendered it.
  await writeFile(
    join(ARTEFACTS, "records.json"),
    JSON.stringify({ base: BASE, browser: browserNote, ranAt: new Date().toISOString(), result, records }, null, 2),
  );

  console.log(`\nResults: ${result.passed} passed · ${result.failed} failed · ${result.observations} observations`);
  if (result.missing.length > 0) {
    console.log(`\n${result.missing.length} required check(s) never ran — this run proves nothing about them:`);
    result.missing.slice(0, 20).forEach(key => console.log(`  - ${key}`));
  }
  if (result.failures.length > 0) {
    console.log("\nFailures:");
    result.failures.forEach(f => console.log(`  - [${f.viewport}] ${f.page} ${f.check}: ${f.detail}`));
  }
  console.log(`\nArtefacts: ${ARTEFACTS}\n`);
  if (!result.ok) process.exit(1);
  console.log("✓ browser matrix green\n");
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch(err => {
    console.error(`\nbrowser matrix could not run:\n${err.message}\n`);
    // Non-zero, always. There is no configuration in which "we never opened a
    // browser" is reported as a pass.
    process.exit(2);
  });
}
