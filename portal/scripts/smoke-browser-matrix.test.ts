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
  FOCUS_SETTLE_CAP_MS,
  FOCUS_SETTLE_FLOOR_MS,
  focusIndicatorIsVisible,
  focusSettleDelayMs,
  isAbortedRscPrefetch,
  isDevOnlyAsset,
  focusWalkVerdict,
  longestCssTimeMs,
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

test("only aborted non-navigation Next RSC prefetches are transparent", () => {
  const speculativeRsc = {
    url: "http://localhost:3032/portal/agency/settings?_rsc=1a2b3",
    status: null,
    errorText: "net::ERR_ABORTED",
    resourceType: "fetch",
    isNavigationRequest: false,
    method: "GET",
    rsc: "1",
    nextRouterPrefetch: "1",
    purpose: null,
    secPurpose: null,
    pageUrlAtFailure: "http://localhost:3032/portal/agency",
  };
  assert.equal(isAbortedRscPrefetch(speculativeRsc), true);
  const observed = networkVerdict({ failedRequests: [speculativeRsc] });
  assert.equal(observed.status, "observation");
  assert.match(observed.detail, /aborted speculative Next RSC fetch/);
  assert.equal(isAbortedRscPrefetch({
    ...speculativeRsc,
    url: "http://localhost:3032/portal/agency?view=clients&_rsc=1a2b3",
    pageUrlAtFailure: "http://localhost:3032/portal/agency",
    nextRouterPrefetch: null,
    purpose: "prefetch;prerender",
  }), true, "an explicitly marked same-path query prefetch is still speculative");

  const realFailures = [
    {
      ...speculativeRsc,
      url: "http://localhost:3032/api/portal/settings?_rsc=1a2b3",
    },
    {
      ...speculativeRsc,
      resourceType: "document",
      isNavigationRequest: true,
    },
    {
      ...speculativeRsc,
      errorText: "net::ERR_FAILED",
    },
    {
      ...speculativeRsc,
      resourceType: "xhr",
    },
    {
      ...speculativeRsc,
      url: "http://localhost:3032/portal/agency/settings?next=_rsc=1a2b3",
    },
    {
      ...speculativeRsc,
      status: 500,
      errorText: null,
    },
    {
      ...speculativeRsc,
      method: "POST",
    },
    {
      ...speculativeRsc,
      rsc: null,
    },
    {
      ...speculativeRsc,
      nextRouterPrefetch: null,
    },
    {
      ...speculativeRsc,
      pageUrlAtFailure: "https://other.example/portal/agency",
    },
  ];
  for (const failure of realFailures) {
    assert.equal(isAbortedRscPrefetch(failure), false, JSON.stringify(failure));
    assert.equal(networkVerdict({ failedRequests: [failure] }).status, "fail", JSON.stringify(failure));
  }

  const apiFailure = {
    url: "http://localhost:3032/api/portal/settings",
    status: 503,
  };
  assert.equal(
    networkVerdict({ failedRequests: [speculativeRsc, apiFailure] }).status,
    "fail",
    "a transparent prefetch must not hide a real failure in the same page log",
  );

  assert.match(
    SOURCE,
    /const failure = req\.failure\(\);[\s\S]{0,120}?const headers = req\.headers\(\);[\s\S]{0,500}?method: req\.method\(\),[\s\S]{0,160}?nextRouterPrefetch: headers\["next-router-prefetch"\][\s\S]{0,220}?pageUrlAtFailure: session\.url\(\),/,
    "the requestfailed listener must pass method, prefetch headers and current-page evidence to the verdict",
  );
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
  assert.match(SOURCE, /consoleVerdict\(\{ consoleErrors, pageErrors, navigated, devServer \}\)/);
  assert.match(SOURCE, /networkVerdict\(\{ failedRequests, devServer, navigated \}\)/);
});

test("the dev-server caveat reaches the FIRST page of the run", () => {
  // ── A third gate defect of the same shape ───────────────────────────────
  //
  // `devServer` is proven by the target's own HMR socket, but the listener was
  // attached inside the per-page loop — so the first page of the run was always
  // judged before any socket had been seen, and its cancelled Turbopack chunks
  // scored as real failures. It showed up as `/` failing console and network on
  // exactly one viewport out of seventeen, which is the signature of an
  // artefact, not a defect. The listener now goes on the bootstrap page before
  // sign-in, which itself navigates to /dev and opens the socket.
  assert.match(
    SOURCE,
    /const bootstrapSession = await bootstrapContext\.newPage\(\);[\s\S]{0,600}?bootstrapSession\.on\("websocket"[\s\S]{0,200}?authMode = await signIn\(bootstrapSession\);/,
    "the HMR listener must be attached before the first navigation is judged",
  );
  // Still derived from the socket, never from a flag or an environment variable.
  assert.match(SOURCE, /\/hmr\|_next\\\/webpack\/\.test\(ws\.url\(\)\)/);

  // Attaching the listener early was necessary but not sufficient: the socket
  // opens after `domcontentloaded`, so sign-in can return before it exists and
  // the first page still gets judged under the wrong rule. The run waits for
  // it, bounded, so page one and page 119 are judged identically.
  assert.match(SOURCE, /await bootstrapSession\.waitForEvent\("websocket", \{/, "the run must settle the flag before judging");
  assert.match(SOURCE, /timeout: 4000/, "…and bounded, so a production target is not stalled");
});

test("one real login session is reused across every viewport", () => {
  // A 17-viewport production run used to POST the same correct credentials 17
  // times. The app correctly rate-limits the burst after ten attempts, so the
  // gate failed itself before it could inspect the last seven viewports. Auth
  // belongs to the run; layout/runtime isolation still belongs to each row.
  assert.equal(
    (SOURCE.match(/await signIn\(/g) ?? []).length,
    1,
    "the matrix must authenticate once, not once per viewport",
  );
  assert.match(SOURCE, /authenticatedState = await bootstrapContext\.storageState\(\)/,
    "the successfully authenticated bootstrap context must be captured");
  assert.match(
    SOURCE,
    /for \(const entry of viewports\)[\s\S]{0,320}?browser\.newContext\(\{[\s\S]{0,220}?storageState: authenticatedState/,
    "every viewport context must start from the captured authenticated state",
  );
  assert.match(SOURCE, /auth=\$\{authMode\}/, "the evidence log must still identify the authentication mode");

  // This is a harness fix, never an auth bypass: password mode still traverses
  // the real login route exactly once and no cookie is fabricated in-browser.
  assert.match(SOURCE, /page\.request\.post\(`\$\{BASE\}\/api\/auth\/login`/);
  assert.doesNotMatch(SOURCE, /document\.cookie/);
  // The one permitted exception (2026-09-03): an isolated production lane has
  // neither `/dev` nor a Supabase-backed password, so its seed mints the real
  // HMAC session and hands it over as AQUA_SESSION_COOKIE. That path attaches
  // the cookie exactly once, inside the cookie mode, and must prove it against
  // `/api/auth/me` before anything is judged — the same discipline the other
  // lane gates follow. Anything else that sets a cookie is still a bypass.
  assert.equal((SOURCE.match(/addCookies\(/g) ?? []).length, 1, "only the cookie attach mode may set a cookie");
  assert.match(
    SOURCE,
    /mode === "cookie"\) \{[\s\S]{0,900}?addCookies\(\[[\s\S]{0,300}?page\.request\.get\(`\$\{BASE\}\/api\/auth\/me`\)[\s\S]{0,200}?throw new Error/,
    "the attached cookie must be proven against /api/auth/me and rejected loudly",
  );
});

test("a cancelled dev asset is not reported twice, and only when it is one", () => {
  // The same recompilation shows up as a failed request AND as a console error
  // logged against that request's URL. The network verdict already called it an
  // observation; the console verdict failed for the echo.
  const chunk = { text: "Failed to load resource: the server responded with a status of 404 (Not Found)",
    url: "http://localhost:3041/_next/static/chunks/src_abc._.js" };
  const font = { text: "Failed to load resource: net::ERR_ABORTED",
    url: "http://localhost:3041/__nextjs_font/geist-latin.woff2" };

  assert.equal(consoleVerdict({ consoleErrors: [chunk, font], devServer: true }).status, "observation");
  assert.match(consoleVerdict({ consoleErrors: [chunk], devServer: true }).detail, /recompilation noise/);

  // Against a production target — the release lane — the same errors fail.
  assert.equal(consoleVerdict({ consoleErrors: [chunk, font], devServer: false }).status, "fail");

  // An application error at ANY url still fails, dev server or not. This is the
  // half that makes the caveat a caveat rather than an allowlist.
  const real = { text: "Hydration failed", url: "http://localhost:3041/portal/agency" };
  assert.equal(consoleVerdict({ consoleErrors: [real], devServer: true }).status, "fail");
  assert.equal(consoleVerdict({ consoleErrors: [chunk, real], devServer: true }).status, "fail");
  // A page error is never dev noise — it has no asset URL to be located at.
  assert.equal(consoleVerdict({ pageErrors: ["TypeError: x"], devServer: true }).status, "fail");

  // Plain strings (every existing caller and every test above) keep working.
  assert.equal(consoleVerdict({ consoleErrors: ["Hydration failed"], devServer: true }).status, "fail");

  assert.equal(isDevOnlyAsset("http://x/_next/static/chunks/a.js"), true);
  assert.equal(isDevOnlyAsset("http://x/__nextjs_font/geist.woff2"), true);
  assert.equal(isDevOnlyAsset("http://x/_next/static/media/geist.woff2"), true);
  assert.equal(isDevOnlyAsset("http://x/api/portal/mfa/enrol"), false);
  assert.equal(isDevOnlyAsset(undefined), false);
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

test("an indicator that is mid-transition is not reported as absent", () => {
  // ── The gate's own worst bug ────────────────────────────────────────────
  //
  // The matrix reported 204 focus-indicator failures. All 204 were false. The
  // chrome controls declare `transition-property: all` at 0.14s, so reading
  // computed style in the same task as the Tab press samples the START of the
  // transition. Measured on a live page, the SAME element:
  //
  //     IMMEDIATE   : outline solid 0px
  //     AFTER 600ms : outline solid 2px
  //
  // The ring was always there. Had the CSS been "fixed" to satisfy this gate,
  // working code would have been changed to satisfy a broken measurement.
  const midTransition = {
    outlineStyle: "solid",
    outlineWidth: "0px",
    boxShadow: "none",
    transitionDuration: "0.14s",
    transitionDelay: "0s",
  };
  assert.equal(focusIndicatorIsVisible(midTransition), false, "the first read genuinely shows nothing…");
  assert.equal(focusSettleDelayMs(midTransition), FOCUS_SETTLE_FLOOR_MS, "…so the walk gets a budget to re-read within");

  // The budget has a FLOOR above the declared duration. `duration + 40ms` was
  // the first attempt and it still reported the topbar's "Working as" button
  // ringless at 1920×1080 — the ring reads `solid 2px` if you look again; the
  // transition had not started. A CSS duration says how long an animation runs,
  // not when the browser starts it.
  assert.ok(FOCUS_SETTLE_FLOOR_MS > 180, "the floor must exceed a 0.14s transition plus a frame");
  assert.equal(focusSettleDelayMs({ ...midTransition, transitionDuration: "0.01s" }), FOCUS_SETTLE_FLOOR_MS);

  // The walk POLLS within the budget and stops the moment the ring appears, so
  // the floor is paid only by a stop that really has no indicator.
  assert.match(SOURCE, /if \(focusIndicatorIsVisible\(raw\)\) break;/, "a ring that appears ends the wait immediately");

  // The fast path: an indicator already visible is never waited on, however
  // long its transition. 1,326 checks cannot afford a wait per focus stop.
  assert.equal(
    focusSettleDelayMs({ ...midTransition, outlineWidth: "2px" }),
    0,
    "a visible indicator is final on the first read",
  );
  // And an element with no transition at all cannot change by waiting, so a
  // genuinely missing ring still fails immediately.
  assert.equal(focusSettleDelayMs({ ...midTransition, transitionDuration: "0s" }), 0);
  assert.equal(focusSettleDelayMs({ outlineStyle: "none", outlineWidth: "0px" }), 0);

  // A pathological `transition: all 10s` must not stall the matrix.
  assert.equal(focusSettleDelayMs({ ...midTransition, transitionDuration: "10s" }), FOCUS_SETTLE_CAP_MS);
});

test("CSS time lists are parsed to their longest member", () => {
  assert.equal(longestCssTimeMs("0.14s"), 140);
  assert.equal(longestCssTimeMs("140ms"), 140);
  assert.equal(longestCssTimeMs("0.14s, 0.3s, 0s"), 300, "the ring may be the slowest property of several");
  assert.equal(longestCssTimeMs("0s"), 0);
  assert.equal(longestCssTimeMs(""), 0);
  assert.equal(longestCssTimeMs(undefined as unknown as string), 0);
  // Unparseable input must read as "nothing is animating", never as a wait.
  assert.equal(longestCssTimeMs("ease-in-out"), 0);
});

test("the focus walk does not mutate the page it is measuring", () => {
  // The baseline shadow was originally stashed in a `data-` attribute on every
  // focusable node. Writing to React-owned DOM made the next dev recompile
  // report a hydration mismatch — which the console verdict then scored as an
  // application defect. The gate was manufacturing the failure it reported.
  assert.doesNotMatch(SOURCE, /setAttribute\(attribute/, "the baseline must not be written into the DOM");
  assert.doesNotMatch(SOURCE, /data-aqua-resting-shadow/, "no instrumentation attribute may survive in the page");
  assert.match(SOURCE, /window\[key\] = state;/, "the baseline lives in page-global state keyed by element");
});

test("a keyboard trap means the same NODE, not the same description", () => {
  // ── The gate's second false positive ────────────────────────────────────
  //
  // The trap detector compares signature strings, and the signature was
  // tag + id + textContent — all three empty for a bare `<input>`. Nine
  // consecutive unlabelled checkboxes on the notification settings therefore
  // read as ONE element focused nine times, and the gate reported a keyboard
  // trap on four viewports. Tab moves through all nine correctly; a real user
  // is not trapped anywhere.
  //
  // The fix is an ordinal assigned per element in the page, so the comparison
  // means what the check says it means.
  assert.match(SOURCE, /state\.ordinals\.set\(el, state\.next\)/, "every focusable gets a node ordinal");
  assert.match(SOURCE, /`@\$\{ordinal\}`/, "the ordinal is part of the signature");

  // Distinct nodes that describe identically must NOT read as a trap…
  const checkboxes = [1, 2, 3, 4, 5].map(n => ({ signature: `input@${n}`, isBody: false, visibleFocus: true }));
  assert.equal(focusWalkVerdict(checkboxes).status, "pass", "five distinct checkboxes are not a trap");

  // …and one node focused three times still must.
  const stuck = focusWalkVerdict([
    { signature: "input@7", isBody: false, visibleFocus: true },
    { signature: "input@7", isBody: false, visibleFocus: true },
    { signature: "input@7", isBody: false, visibleFocus: true },
  ]);
  assert.equal(stuck.status, "fail");
  assert.match(stuck.detail, /keyboard trap/);
});

test("a focus stop is named the way a screen reader would name it", () => {
  // The report has to say WHICH control failed. `textContent` is empty for
  // every input in the app, so a failure read "input" and named nothing
  // actionable. The name is now resolved through aria-label, aria-labelledby,
  // an associated `label[for]`, a wrapping `<label>`, then placeholder/title/name.
  assert.match(SOURCE, /aria-labelledby/, "aria-labelledby participates in the name");
  assert.match(SOURCE, /label\[for="\$\{CSS\.escape\(el\.id\)\}"\]/, "an associated label participates");
  assert.match(SOURCE, /el\.closest\("label"\)/, "a wrapping label participates");
});

test("the walk re-reads the same element, or not at all", () => {
  // The re-sample is only sound if focus has not moved in the meantime: a page
  // that steals focus during the wait must not have the NEW element's ring
  // credited to this stop, which would turn a real failure green.
  assert.match(
    SOURCE,
    /if \(settled\.signature !== raw\.signature\) break;/,
    "the poll must stop, and keep the original read, when focus moved",
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
