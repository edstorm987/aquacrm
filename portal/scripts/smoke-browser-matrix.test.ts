// The gate that decides whether a browser run counts.
//
// `scripts/smoke-ux.mjs` has always described itself as a three-viewport walk,
// but its viewport is a substring in a User-Agent header and its assertions are
// `String.includes` over server HTML — no layout is ever computed, so it cannot
// see an overflow, a missing focus ring, a console error or an axe violation.
// Everything we knew about those came from hand-driven passes that nobody can
// re-run. `scripts/browser-matrix.mjs` is the repeatable replacement.
//
// A browser gate is worth exactly as much as its willingness to report red, so
// almost every assertion below pins a way of quietly reporting green: scoring a
// run that never looked, treating "no scan" as "no violations", or counting an
// unobserved suspension as proof of one. The pure verdict functions are
// separated from the driver precisely so those rules can be proven here,
// without a browser binary. → issues #137

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  BLOCKING_AXE_IMPACTS,
  MATRIX,
  OVERFLOW_TOLERANCE_PX,
  REQUIRED_CHECKS,
  TAILWIND_BREAKPOINTS,
  axeVerdict,
  consoleVerdict,
  cssViewport,
  findProvisionedChromium,
  focusIndicatorIsVisible,
  focusWalkVerdict,
  shadowIsVisible,
  loadingStatusVerdict,
  networkVerdict,
  overflowVerdict,
  overflowVerdictFrom,
  renderVerdict,
  selectMatrix,
  selectPages,
  summarise,
} from "./browser-matrix.mjs";
import { PAGES } from "./smoke-ux.mjs";

const SOURCE = readFileSync(new URL("./browser-matrix.mjs", import.meta.url), "utf8");
const PACKAGE = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function size(entry: { width: number; height: number }) {
  return `${entry.width}x${entry.height}`;
}

test("the matrix is the one the house rule names, not a convenient subset", () => {
  // CLAUDE.md and docs/development/tests.md name these six as the primary
  // matrix. A gate that quietly drops mobile landscape or 1920 is a gate that
  // has never seen the two layouts most likely to break.
  const primary = MATRIX.filter((entry: { kind: string }) => entry.kind === "primary").map(size);
  for (const required of ["375x812", "812x375", "768x1024", "1024x768", "1280x800", "1920x1080", "320x568"]) {
    assert.ok(primary.includes(required), `the primary matrix must cover ${required}`);
  }
});

test("200% zoom is emulated as a halved CSS viewport, not declared and ignored", () => {
  // This is the assertion that stops the zoom rows being decorative. A browser
  // has no zoom API; if `cssViewport` returned the physical size the "200%"
  // rows would render identically to the 100% rows and prove nothing.
  const zoomed = MATRIX.filter((entry: { kind: string }) => entry.kind === "zoom");
  assert.ok(zoomed.length >= 2, "zoom must be probed at both a phone and a desktop width");

  assert.deepEqual(
    cssViewport({ width: 1280, height: 800, zoom: 2 }),
    { width: 640, height: 400, deviceScaleFactor: 2 },
  );
  // An odd width must round DOWN — rounding up invents a CSS pixel and reports
  // a phantom 1px overflow on every page at that width.
  assert.deepEqual(
    cssViewport({ width: 375, height: 812, zoom: 2 }),
    { width: 187, height: 406, deviceScaleFactor: 2 },
  );
  assert.deepEqual(
    cssViewport({ width: 1280, height: 800 }),
    { width: 1280, height: 800, deviceScaleFactor: 1 },
  );
});

test("every breakpoint is probed on BOTH sides", () => {
  // An off-by-one media query (`max-width: 768px` where `767px` was meant) is
  // invisible at every width except the two adjacent to the boundary. Probing
  // only one side finds none of them.
  const widths = new Set(MATRIX.map((entry: { width: number }) => entry.width));
  for (const bp of TAILWIND_BREAKPOINTS) {
    assert.ok(widths.has(bp), `the matrix must probe exactly ${bp}px`);
    assert.ok(widths.has(bp - 1), `…and ${bp - 1}px, the pixel below it`);
  }
});

test("a run that never looked is red, not green", () => {
  // The load-bearing honesty rule. A crash, a timeout or a filtered run leaves
  // required checks unrecorded; scoring only what was recorded turns silence
  // into a pass. `missing` is what makes that impossible.
  const expected = [{ page: "/portal/agency", viewport: "desktop" }];

  const nothing = summarise([], { expected });
  assert.equal(nothing.ok, false, "zero records against real expectations must not pass");
  assert.equal(nothing.missing.length, REQUIRED_CHECKS.length);

  // Halfway through: render and overflow pass, then the browser died.
  const halfway = summarise([
    { page: "/portal/agency", viewport: "desktop", check: "render", status: "pass", detail: "" },
    { page: "/portal/agency", viewport: "desktop", check: "overflow", status: "pass", detail: "" },
  ], { expected });
  assert.equal(halfway.failed, 0, "nothing actually failed…");
  assert.equal(halfway.ok, false, "…and it is still red, because four checks never ran");
  assert.ok(halfway.missing.some((key: string) => key.endsWith("#axe")));

  const complete = summarise(
    REQUIRED_CHECKS.map((check: string) => ({ page: "/portal/agency", viewport: "desktop", check, status: "pass", detail: "" })),
    { expected },
  );
  assert.equal(complete.ok, true, "a complete clean run is the only way to be green");

  // And a run with no expectations and no evidence at all is not a pass either.
  assert.equal(summarise([], { expected: [] }).ok, false);
});

test("no accessibility scan is a failure, never an implied clean bill", () => {
  assert.equal(axeVerdict(null).status, "fail");
  assert.match(axeVerdict(null).detail, /not the same as no violations/);
  assert.equal(axeVerdict(undefined).status, "fail");

  assert.equal(axeVerdict([]).status, "pass");

  for (const impact of BLOCKING_AXE_IMPACTS) {
    const verdict = axeVerdict([{ id: "color-contrast", impact, nodes: ["a", "b"] }]);
    assert.equal(verdict.status, "fail", `a ${impact} finding must fail the gate`);
    assert.match(verdict.detail, /color-contrast/);
  }

  // Moderate and minor are recorded rather than dropped, but do not fail — the
  // house rule is "zero serious or critical".
  const lesser = axeVerdict([{ id: "region", impact: "moderate", nodes: ["main"] }]);
  assert.equal(lesser.status, "pass");
  assert.match(lesser.detail, /1 moderate\/minor/);
});

test("the 8px overflow that the manual pass found still fails here", () => {
  // 2026-08-25, hand-driven: the Freelancer surface pushed 8px off the right
  // edge at a phone width. That defect is fixed; this is the assertion that
  // would have caught it, and catches the next one.
  const eight = overflowVerdict({ scrollWidth: 383, clientWidth: 375 });
  assert.equal(eight.status, "fail");
  assert.match(eight.detail, /8px/);

  // Sub-pixel layout rounding is not a defect and must not cry wolf.
  assert.equal(overflowVerdict({ scrollWidth: 376, clientWidth: 375 }).status, "pass");
  assert.equal(overflowVerdict({ scrollWidth: 375, clientWidth: 375 }).status, "pass");
  assert.equal(OVERFLOW_TOLERANCE_PX, 1, "the tolerance must stay at one rounding pixel");

  // A page that was never measured is not a page with no overflow.
  assert.equal(overflowVerdict({}).status, "fail");

  // The tolerated-rounding pass must not print a false inequality. "376 ≤ 375"
  // is untrue, and this evidence log is read by people.
  assert.doesNotMatch(overflowVerdict({ scrollWidth: 376, clientWidth: 375 }).detail, /376 ≤ 375/);
  assert.match(overflowVerdict({ scrollWidth: 376, clientWidth: 375 }).detail, /tolerance/);
});

test("overflow clipped inside the portal's own scroll region still fails", () => {
  // The defect this gate would otherwise be blind to, verified in Chromium
  // 141 on 2026-08-30: `globals.css` sets
  //   @media (max-width: 639px) { .mm-portal-root main#main-content { overflow-x: hidden } }
  // so a 2000px-wide child at a 375px viewport is CLIPPED — the document
  // reports 375 ≤ 375 and the old document-only measurement scored it
  // "✓ no horizontal overflow" at every mobile viewport in the matrix, which is
  // exactly the half of the matrix this gate exists for.
  const clipped = [
    { label: "document", scrollWidth: 375, clientWidth: 375 },
    { label: "#main-content", scrollWidth: 2000, clientWidth: 375 },
  ];
  const verdict = overflowVerdictFrom(clipped);
  assert.equal(verdict.status, "fail", "content cut off inside a clipped region is still off the right edge");
  assert.match(verdict.detail, /#main-content/, "the failure must name which region overflowed");
  assert.match(verdict.detail, /1625px/);

  // The document still decides when it is the worse of the two.
  const documentWorse = overflowVerdictFrom([
    { label: "document", scrollWidth: 500, clientWidth: 375 },
    { label: "#main-content", scrollWidth: 375, clientWidth: 375 },
  ]);
  assert.equal(documentWorse.status, "fail");
  assert.match(documentWorse.detail, /document/);

  // Clean is still clean, and a run that measured nothing is still red.
  assert.equal(overflowVerdictFrom([{ label: "document", scrollWidth: 375, clientWidth: 375 }]).status, "pass");
  assert.equal(overflowVerdictFrom([]).status, "fail");
  assert.equal(overflowVerdictFrom(undefined).status, "fail");
  assert.equal(overflowVerdictFrom([{ label: "document" }]).status, "fail");

  // The driver half cannot be proven without a browser, so pin the one line
  // that decides whether the clipped region is measured at all.
  assert.match(SOURCE, /querySelector\("#main-content"\)/,
    "measureLayout must still measure the portal's clipped scroll region, not only the document");
  assert.match(SOURCE, /overflowVerdictFrom\(await session\.evaluate\(measureLayout\)\)/,
    "the driver must score the worst region, not a single document measurement");
});

test("a protected route that answered the login page is not a render", () => {
  // The SSR smoke cannot tell these apart: `/portal/agency` returning the login
  // HTML after a redirect is still a 200 with a skip link in it. The browser
  // knows where it landed.
  assert.equal(
    renderVerdict({ status: 200, url: "http://localhost:3041/login?next=%2Fportal%2Fagency", needsAuth: true }).status,
    "fail",
  );
  assert.equal(renderVerdict({ status: 200, url: "http://localhost:3041/login", needsAuth: false }).status, "pass");
  assert.equal(renderVerdict({ status: 200, url: "http://localhost:3041/portal/agency", needsAuth: true }).status, "pass");
  assert.equal(renderVerdict({ status: 500, url: "http://localhost:3041/portal/agency", needsAuth: true }).status, "fail");
});

test("one console error or one failed request is enough to fail", () => {
  assert.equal(consoleVerdict({ consoleErrors: [], pageErrors: [] }).status, "pass");
  assert.equal(consoleVerdict({ consoleErrors: ["Hydration failed"] }).status, "fail");
  assert.equal(consoleVerdict({ pageErrors: ["TypeError: x is not a function"] }).status, "fail");
  assert.equal(consoleVerdict().status, "pass");

  assert.equal(networkVerdict({ failedRequests: [] }).status, "pass");
  const failed = networkVerdict({ failedRequests: [{ url: "/api/portal/actions", status: 500 }] });
  assert.equal(failed.status, "fail");
  assert.match(failed.detail, /500 \/api\/portal\/actions/);
  // A request that never completed carries no status and must still fail.
  assert.equal(networkVerdict({ failedRequests: [{ url: "/x", status: null }] }).status, "fail");
});

test("an empty log from a page that never loaded is not a clean log", () => {
  // Reproduced against a real Chromium on 2026-08-30: the driver records the
  // console and network verdicts OUTSIDE the navigation try/catch, so a
  // `page.goto` that threw (`net::ERR_EMPTY_RESPONSE`, or a `networkidle`
  // timeout) scored `✓ clean console` — two of the six required checks reported
  // as proven for a page that never rendered. Same family as `axeVerdict(null)`:
  // "nothing was observed" is not "nothing was wrong".
  const consoleLog = consoleVerdict({ consoleErrors: [], pageErrors: [], navigated: false });
  assert.equal(consoleLog.status, "fail");
  assert.match(consoleLog.detail, /never loaded/);

  const network = networkVerdict({ failedRequests: [], devServer: true, navigated: false });
  assert.equal(network.status, "fail", "…and the dev-server caveat must not rescue it either");
  assert.match(network.detail, /never loaded/);

  // A page that did load keeps the ordinary verdicts — the default is unchanged.
  assert.equal(consoleVerdict({ consoleErrors: [], navigated: true }).status, "pass");
  assert.equal(networkVerdict({ failedRequests: [], navigated: true }).status, "pass");

  // And the driver must actually pass the flag through, or the fix is inert.
  assert.match(SOURCE, /consoleVerdict\(\{ consoleErrors, pageErrors, navigated \}\)/);
  assert.match(SOURCE, /networkVerdict\(\{ failedRequests, devServer, navigated \}\)/);
});

test("the keyboard walk fails on the three ways focus goes wrong", () => {
  const good = [
    { signature: "a[Skip to content]", isBody: false, visibleFocus: true },
    { signature: "button[Menu]", isBody: false, visibleFocus: true },
    { signature: "a[Clients]", isBody: false, visibleFocus: true },
    { signature: "body", isBody: true, visibleFocus: false },
  ];
  assert.equal(focusWalkVerdict(good).status, "pass");

  // 1. Nothing reachable at all.
  assert.equal(focusWalkVerdict([{ signature: "body", isBody: true, visibleFocus: false }]).status, "fail");
  assert.equal(focusWalkVerdict([]).status, "fail");

  // 2. Reachable, but invisible when focused — WCAG 2.4.7, and the single most
  //    common regression when someone removes an outline for looks.
  const invisible = focusWalkVerdict(good.map((step, i) => (i === 1 ? { ...step, visibleFocus: false } : step)));
  assert.equal(invisible.status, "fail");
  assert.match(invisible.detail, /button\[Menu\]/);

  // 3. A trap: focus stops moving and never leaves.
  const trapped = focusWalkVerdict([
    { signature: "button[Close]", isBody: false, visibleFocus: true },
    { signature: "button[Close]", isBody: false, visibleFocus: true },
    { signature: "button[Close]", isBody: false, visibleFocus: true },
    { signature: "button[Close]", isBody: false, visibleFocus: true },
  ]);
  assert.equal(trapped.status, "fail");
  assert.match(trapped.detail, /keyboard trap/);
});

test("a transparent zero-size ring is not a focus indicator", () => {
  // Measured in Chromium on 2026-08-30 against a running portal. Every control
  // carrying a Tailwind ring utility computes this placeholder shadow whether
  // or not it is focused:
  const ringPlaceholder = "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px";
  // A naive `boxShadow !== "none"` passes it — and passes every unringed
  // control in the app with it, which would make the whole focus check
  // decorative.
  assert.equal(shadowIsVisible(ringPlaceholder), false, "fully transparent layers draw nothing");
  assert.equal(shadowIsVisible("none"), false);
  assert.equal(shadowIsVisible(""), false);
  assert.equal(shadowIsVisible("rgba(0, 0, 0, 0) 0px 0px 0px 0px"), false);
  // Zero-size is not visible either, however opaque the colour.
  assert.equal(shadowIsVisible("rgb(249, 115, 22) 0px 0px 0px 0px"), false);
  // A real ring is.
  assert.equal(shadowIsVisible("rgb(249, 115, 22) 0px 0px 0px 2px"), true);
  assert.equal(shadowIsVisible(`${ringPlaceholder}, rgb(249, 115, 22) 0px 0px 0px 3px`), true);

  // And the outline half. `outline: solid 0px` is exactly what the topbar's
  // "Working as …" button computed while focused on 2026-08-30 — the defect
  // this gate found on its first real run, sitting between two neighbours that
  // both computed `solid 2px`.
  assert.equal(focusIndicatorIsVisible({ outlineStyle: "solid", outlineWidth: "0px", boxShadow: "none" }), false);
  assert.equal(focusIndicatorIsVisible({ outlineStyle: "none", outlineWidth: "2px", boxShadow: "none" }), false);
  assert.equal(focusIndicatorIsVisible({ outlineStyle: "solid", outlineWidth: "2px", boxShadow: "none" }), true);
  assert.equal(focusIndicatorIsVisible({ outlineStyle: "none", outlineWidth: "0px", boxShadow: ringPlaceholder }), false);
  assert.equal(focusIndicatorIsVisible({}), false);
});

test("a resting drop-shadow is not a focus ring", () => {
  // Nearly every control in this portal carries `shadow-sm`, which computes to
  // a perfectly visible shadow whether or not it is focused. Accepting "there
  // is a visible shadow" as the indicator would therefore pass every unringed
  // button in the app — a gate that reports green because it is looking at
  // decoration. The resting value is captured before the Tab walk starts and
  // the focused value must DIFFER from it.
  const resting = "rgba(0, 0, 0, 0.05) 0px 1px 2px 0px";
  assert.equal(shadowIsVisible(resting), true, "it is a real, visible shadow…");
  assert.equal(
    focusIndicatorIsVisible({ outlineStyle: "none", outlineWidth: "0px", boxShadow: resting, restingBoxShadow: resting }),
    false,
    "…and it is still not a focus indicator, because focusing changed nothing",
  );

  // A ring that genuinely appears on focus, over the same resting shadow, is.
  assert.equal(
    focusIndicatorIsVisible({
      outlineStyle: "none",
      outlineWidth: "0px",
      boxShadow: `rgb(249, 115, 22) 0px 0px 0px 2px, ${resting}`,
      restingBoxShadow: resting,
    }),
    true,
  );

  // No baseline (an element that appeared after the snapshot) falls back to the
  // weaker check rather than inventing a verdict either way.
  assert.equal(
    focusIndicatorIsVisible({ outlineStyle: "none", outlineWidth: "0px", boxShadow: resting, restingBoxShadow: null }),
    true,
  );
});

test("dev-server artefacts are named as such, never scored as proof", () => {
  // Turbopack cancels in-flight chunk requests on every recompile, so a dev
  // lane emits failed `/_next/static/**` requests that no built app produces.
  // Failing on them makes the gate permanently red and therefore ignored;
  // passing on them silently is worse. They become an observation that says
  // what they are — and ONLY when the target announced itself as a dev server
  // through its own HMR socket.
  const chunk = [{ url: "http://localhost:3057/_next/static/chunks/src_0foncmu._.js", status: null }];
  const observed = networkVerdict({ failedRequests: chunk, devServer: true });
  assert.equal(observed.status, "observation");
  assert.match(observed.detail, /production build/);

  // Same request against a production target is a failure, because there it
  // means a real asset did not load.
  assert.equal(networkVerdict({ failedRequests: chunk, devServer: false }).status, "fail");

  // The caveat never reaches an application request, dev server or not.
  const api = [{ url: "http://localhost:3057/api/portal/mfa/enrol", status: 500 }];
  assert.equal(networkVerdict({ failedRequests: api, devServer: true }).status, "fail");
  assert.equal(networkVerdict({ failedRequests: [...api, ...chunk], devServer: true }).status, "fail");

  // An observation is not a pass: it cannot satisfy a required check.
  const expected = [{ page: "/", viewport: "desktop" }];
  const run = summarise([
    ...REQUIRED_CHECKS.filter((c: string) => c !== "network")
      .map((check: string) => ({ page: "/", viewport: "desktop", check, status: "pass", detail: "" })),
    { page: "/", viewport: "desktop", check: "network", status: "observation", detail: "" },
  ], { expected });
  assert.equal(run.missing.length, 0, "the check did run…");
  assert.equal(run.observations, 1, "…and is reported as an observation rather than buried");
  assert.equal(run.ok, true, "an observation does not fail a run");
});

test("an unobserved loading state is recorded as unobserved, not as proof", () => {
  // issue #136. A route that resolves too fast to suspend proves nothing about
  // its status announcement; calling that a pass is how the announcement gets
  // deleted without anyone noticing.
  const unobserved = loadingStatusVerdict({ observed: false });
  assert.equal(unobserved.status, "not-observed");
  assert.notEqual(unobserved.status, "pass");

  assert.equal(loadingStatusVerdict({ observed: true, hasLiveRegion: false }).status, "fail");
  // The exact defect #136 records: the only status sits inside an aria-hidden
  // root, so it renders and announces nothing.
  assert.equal(
    loadingStatusVerdict({ observed: true, hasLiveRegion: true, exposedToAccessibilityTree: false }).status,
    "fail",
  );
  assert.equal(
    loadingStatusVerdict({ observed: true, hasLiveRegion: true, exposedToAccessibilityTree: true }).status,
    "pass",
  );

  // …and it is not one of the checks a run is required to produce, or every
  // fast route would report a false gap.
  assert.ok(!REQUIRED_CHECKS.includes("loading-status"));
});

test("the browser gate and the SSR smoke walk one route list", () => {
  // Two copies of the page list is how the browser gate ends up proving a set
  // of routes the smoke stopped covering three months ago.
  assert.ok(PAGES.length >= 12, "the shared route list must not have been trimmed");
  assert.deepEqual(selectPages(undefined), PAGES, "an unfiltered browser run walks exactly the smoke's routes");
  assert.match(SOURCE, /import \{ PAGES \} from "\.\/smoke-ux\.mjs"/,
    "the browser gate must import the route list, never fork it");

  // Importing the smoke must not fire a login and thirty-nine HTTP requests —
  // this test file has already imported it, so reaching here is the proof.
  assert.match(
    readFileSync(new URL("./smoke-ux.mjs", import.meta.url), "utf8"),
    /if \(invokedDirectly\) \{\s*\n\s*main\(\)/,
    "smoke-ux.mjs must only run itself when invoked directly",
  );
});

test("filters narrow a run without silently emptying it", () => {
  assert.equal(selectMatrix("desktop").length, 1);
  assert.equal(selectMatrix("boundary").every((e: { kind: string }) => e.kind === "boundary"), true);
  assert.equal(selectMatrix(undefined), MATRIX);
  // A typo'd filter is an error, not an empty green run.
  assert.throws(() => selectMatrix("desktopp"), /matched nothing/);
  assert.throws(() => selectPages("/nope"), /matched nothing/);

  // "/" is a prefix of every route. Treating it as one turned a deliberate
  // two-page run into all thirteen on 2026-08-30 — a filter that silently
  // widens is worse than no filter, because the operator believes the smaller
  // number.
  assert.deepEqual(selectPages("/").map((p: { path: string }) => p.path), ["/"]);
  assert.deepEqual(
    selectPages("/portal/account").map((p: { path: string }) => p.path),
    ["/portal/account", "/portal/account/preferences", "/portal/account/permissions"],
  );
});

test("an already-provisioned browser is found rather than re-downloaded", () => {
  // Sandboxes and CI images ship a Chromium at whatever revision they were
  // built with, and the environments that most need this gate are exactly the
  // ones that cannot reach the Playwright CDN to fetch the pinned revision.
  const tree: Record<string, string[]> = {
    "/opt/pw": ["chromium-1194", "chromium-980", "ffmpeg-1011"],
  };
  const files = new Set(["/opt/pw", "/opt/pw/chromium-1194/chrome-linux/chrome", "/opt/pw/chromium-980/chrome-linux/chrome"]);
  const io = { exists: (p: string) => files.has(p), list: (p: string) => tree[p] ?? [] };

  // Newest revision wins — an old one left behind must not be preferred.
  assert.equal(findProvisionedChromium("/opt/pw", io), "/opt/pw/chromium-1194/chrome-linux/chrome");

  // A `chromium` symlink, which is how the layout usually presents itself, is
  // taken directly.
  files.add("/opt/pw/chromium");
  assert.equal(findProvisionedChromium("/opt/pw", io), "/opt/pw/chromium");

  // Nothing there, nothing set, and Playwright's own opt-out are all "no".
  assert.equal(findProvisionedChromium("/nope", io), undefined);
  assert.equal(findProvisionedChromium(undefined, io), undefined);
  assert.equal(findProvisionedChromium("0", io), undefined);
});

test("the gate is wired up and cannot be run without a browser", () => {
  assert.equal(PACKAGE.scripts["browser:matrix"], "node scripts/browser-matrix.mjs");
  assert.equal(PACKAGE.scripts["browser:install"], "playwright-core install chromium");
  assert.ok(PACKAGE.devDependencies["playwright-core"], "the driver must be a pinned devDependency");
  assert.ok(PACKAGE.devDependencies["axe-core"], "the accessibility scanner must be a pinned devDependency");
  // playwright-core rather than playwright: the latter downloads ~150MB of
  // browser in a postinstall, so adding it would make `npm install` fail
  // wherever the CDN is unreachable. Provisioning stays one explicit command.
  assert.ok(!PACKAGE.devDependencies.playwright, "the browser download must not ride on npm install");

  // No flag, env var or fallback turns a browser-less run into a pass.
  assert.match(SOURCE, /process\.exit\(2\)/, "a gate that could not open a browser must exit non-zero");
  assert.doesNotMatch(SOURCE, /allow-missing-browser|SKIP_BROWSER|skipBrowser/i);
});
