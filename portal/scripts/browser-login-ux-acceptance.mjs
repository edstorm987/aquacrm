#!/usr/bin/env node
// LOGIN-UX-001 — real-DOM regression for the standalone authentication routes.
//
// This gate is deliberately loopback-only. It stubs Turnstile's browser API
// before application JavaScript runs, then lets the real BotChallenge component
// choose and render a provider-sized iframe. Nothing calls Cloudflare and no
// credential is submitted.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { findProvisionedChromium } from "./browser-matrix.mjs";

const require = createRequire(import.meta.url);
const BASE = (process.env.AQUA_BASE || "http://127.0.0.1:3013").replace(/\/$/, "");
const parsed = new URL(BASE);
assert.ok(
  parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "::1",
  "browser-login-ux-acceptance is local-only and refuses non-loopback targets",
);

const VIEWPORTS = [
  { id: "small-320", width: 320, height: 568, scale: 1, expectedSize: "compact" },
  { id: "mobile-390", width: 390, height: 844, scale: 1, expectedSize: "flexible" },
  { id: "tablet-768", width: 768, height: 1024, scale: 1, expectedSize: "flexible" },
  { id: "desktop-1440", width: 1440, height: 900, scale: 1, expectedSize: "flexible" },
  // 1280 physical pixels at 200% zoom exposes a 640px CSS viewport.
  { id: "desktop-200-percent", width: 640, height: 400, scale: 2, expectedSize: "flexible" },
  { id: "short-height", width: 768, height: 320, scale: 1, expectedSize: "flexible" },
];

const ROUTES = [
  { path: "/login?brand=aqua", brand: "AquaOasis-Web" },
  { path: "/login/forgot?brand=aqua", brand: "AquaOasis-Web" },
  { path: "/login/reset?brand=aqua&token=browser-fixture", brand: "AquaCRM" },
];

const SKIP_SURFACES = [
  { path: "/login?brand=aqua", kind: "auth" },
  { path: "/for-agencies", kind: "website" },
  { path: "/careers", kind: "standalone", id: "careers-320" },
  { path: "/signup/setup", kind: "standalone" },
  { path: "/connect/missing-browser-fixture", kind: "standalone" },
  { path: "/proposal/missing-browser-fixture", kind: "standalone", expectedNotFound: true },
  { path: "/embed/account", kind: "standalone" },
  { path: "/client-preview/missing", kind: "auth-redirect", expectedPath: "/login" },
  { path: "/portal/dev-workspace", kind: "auth-redirect", expectedPath: "/login" },
  { path: "/missing-browser-fixture", kind: "standalone", expectedNotFound: true },
];
const SKIP_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 1440, height: 900 },
];
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

async function launchBrowser() {
  const { chromium } = await import("playwright-core");
  const candidates = [
    process.env.AQUA_BROWSER_EXECUTABLE,
    findProvisionedChromium(process.env.PLAYWRIGHT_BROWSERS_PATH),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  for (const executablePath of candidates) {
    if (!existsSync(executablePath)) continue;
    try {
      return await chromium.launch({ executablePath });
    } catch {
      // Try the next already-provisioned local browser.
    }
  }
  return chromium.launch();
}

async function installTurnstileFixture(context) {
  await context.addInitScript(() => {
    window.__aquaTurnstileRenders = [];
    window.turnstile = {
      render(el, options) {
        const size = options.size ?? "normal";
        const iframeWidth = size === "compact" ? 150 : 300;
        const iframeHeight = size === "compact" ? 140 : 65;
        const iframe = document.createElement("iframe");
        iframe.title = "Turnstile verification fixture";
        iframe.width = String(iframeWidth);
        iframe.height = String(iframeHeight);
        iframe.style.border = "0";
        iframe.srcdoc = "<!doctype html><button style='width:100%;height:100%'>Verify</button>";
        el.replaceChildren(iframe);
        window.__aquaTurnstileRenders.push({ size, iframeWidth, iframeHeight });
        queueMicrotask(() => options.callback?.("local-browser-fixture-token"));
        return `fixture-${window.__aquaTurnstileRenders.length}`;
      },
      reset() {},
      remove() {},
    };
  });
}

function captureExternalRequests(context) {
  const externalRequests = [];
  context.on("request", request => {
    const url = new URL(request.url());
    if ((url.protocol === "http:" || url.protocol === "https:") && url.origin !== parsed.origin) {
      externalRequests.push(url.href);
    }
  });
  return externalRequests;
}

function assertNoExternalRequests(externalRequests, label) {
  assert.deepEqual(externalRequests, [], `${label}: browser gate made no external HTTP requests`);
}

async function verifySkipTarget(page, surface, viewport) {
  const route = typeof surface === "string" ? surface : surface.path;
  const kind = typeof surface === "string" ? "auth" : surface.kind;
  const errors = [];
  const onPageError = error => errors.push(error.message);
  const onConsole = message => {
    if (message.type() === "error") errors.push(message.text());
  };
  page.on("pageerror", onPageError);
  page.on("console", onConsole);
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
  // Next's development-only toolbar is injected ahead of the application and
  // participates in Tab order through a shadow root. It is absent from the
  // production document, so remove only that test-runner artefact before
  // asserting the application's first keyboard destination.
  await page.locator("nextjs-portal").evaluate(element => element.remove()).catch(() => undefined);
  const before = await page.evaluate(() => ({
    href: document.querySelector("a[href='#main-content']")?.getAttribute("href"),
    tabIndex: document.getElementById("main-content")?.getAttribute("tabindex"),
    historyLength: history.length,
    pathname: window.location.pathname,
    url: window.location.href,
    target: Boolean(document.getElementById("main-content")),
    portalMain: document.getElementById("main-content")?.classList.contains("mm-private-surface") ?? false,
    activeElement: `${document.activeElement?.tagName ?? ""}#${document.activeElement?.id ?? ""}`,
  }));
  await page.keyboard.press("Tab");
  const firstTab = await page.evaluate(() => ({
    element: `${document.activeElement?.tagName ?? ""}#${document.activeElement?.id ?? ""}`,
    text: document.activeElement?.textContent?.trim().slice(0, 80) ?? "",
  }));
  assert.equal(
    await page.locator("a").filter({ hasText: "Skip to content" }).evaluate(el => el === document.activeElement),
    true,
    `${route} at ${viewport.width}x${viewport.height} focuses the skip link first; before ${before.activeElement}, after ${JSON.stringify(firstTab)}`,
  );
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  const focus = await page.evaluate(() => ({
    activeElement: document.activeElement?.id,
    hash: window.location.hash,
    target: Boolean(document.getElementById("main-content")),
    tabIndex: document.getElementById("main-content")?.getAttribute("tabindex"),
    historyLength: history.length,
    pathname: window.location.pathname,
    url: window.location.href,
    portalMain: document.getElementById("main-content")?.classList.contains("mm-private-surface") ?? false,
  }));
  assert.equal(before.href, "#main-content", `${route} keeps a native fragment href`);
  assert.equal(focus.target, true, `${route} exposes #main-content; before ${JSON.stringify(before)}, after ${JSON.stringify(focus)}`);
  assert.equal(focus.activeElement, "main-content", `${route} moves keyboard focus to #main-content`);
  assert.equal(focus.hash, "#main-content", `${route} records the skip destination in the URL`);
  assert.equal(focus.tabIndex, "-1", `${route} has robust programmatic focus semantics`);
  assert.ok(focus.historyLength >= before.historyLength, `${route} retains native history semantics`);
  assert.equal(
    await page.locator("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay").count(),
    0,
    `${route} exposes no framework error overlay`,
  );
  const unexpectedErrors = errors.filter(message => !(
    surface.expectedNotFound
    && (
      /Failed to load resource: the server responded with a status of 404/.test(message)
      || /Encountered a script tag while rendering React component/.test(message)
    )
  ));
  assert.deepEqual(unexpectedErrors, [], `${route} emits no unexpected browser errors`);
  if (kind === "website" || kind === "portal") {
    assert.equal(before.tabIndex, null, `${route} exercises a genuinely non-focusable main`);
  }
  if (kind === "standalone") {
    assert.equal(before.target, false, `${route} exercises the target-absent fallback`);
  }
  if (kind === "website") assert.equal(focus.pathname, "/for-agencies");
  if (surface.expectedPath) assert.equal(focus.pathname, surface.expectedPath);
  if (kind === "portal") {
    assert.match(focus.pathname, /^\/portal\//, `${route} reached a real portal surface`);
    assert.equal(focus.portalMain, true, `${route} focused the portal shell rather than an auth fallback`);
  }
  page.off("pageerror", onPageError);
  page.off("console", onConsole);
  return kind === "portal" ? 12 : kind === "website" ? 11 : 9;
}

async function main() {
  const browser = await launchBrowser();
  let checks = 0;
  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.scale,
      });
      const externalRequests = captureExternalRequests(context);
      await installTurnstileFixture(context);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => {
        if (message.type() === "error") errors.push(message.text());
      });

      await page.goto(`${BASE}/login?brand=aqua`, { waitUntil: "networkidle" });
      await page.locator("[data-testid=bot-challenge] iframe").waitFor();
      await page.waitForFunction(expected => window.__aquaTurnstileRenders?.at(-1)?.size === expected, viewport.expectedSize);
      const facts = await page.evaluate(() => {
        const challenge = document.querySelector("[data-testid=bot-challenge]");
        const iframe = challenge?.querySelector("iframe");
        const challengeRect = challenge?.getBoundingClientRect();
        const iframeRect = iframe?.getBoundingClientRect();
        const controls = [...document.querySelectorAll(".mm-input, .mm-btn-primary, .mm-btn-google")]
          .map(el => ({ className: el.className, height: el.getBoundingClientRect().height }));
        return {
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
          size: window.__aquaTurnstileRenders?.at(-1)?.size,
          challenge: challengeRect && { left: challengeRect.left, right: challengeRect.right, width: challengeRect.width },
          iframe: iframeRect && { left: iframeRect.left, right: iframeRect.right, width: iframeRect.width, height: iframeRect.height },
          controls,
        };
      });
      assert.equal(facts.documentWidth, facts.viewportWidth, `${viewport.id}: no document horizontal overflow`);
      assert.equal(facts.size, viewport.expectedSize, `${viewport.id}: provider receives the expected size`);
      assert.ok(facts.iframe && facts.challenge, `${viewport.id}: provider iframe rendered`);
      assert.ok(facts.iframe.left >= facts.challenge.left - 1, `${viewport.id}: challenge is not clipped on the left`);
      assert.ok(facts.iframe.right <= facts.challenge.right + 1, `${viewport.id}: challenge is not clipped on the right`);
      assert.ok(facts.iframe.right <= facts.viewportWidth + 1, `${viewport.id}: challenge stays inside the viewport`);
      assert.ok(facts.controls.every(control => control.height >= 44), `${viewport.id}: form controls remain at least 44px high`);
      assert.deepEqual(errors, [], `${viewport.id}: no page/console errors`);
      if (viewport.id === "mobile-390") {
        await page.addScriptTag({ content: axeSource });
        const axe = await page.evaluate(async () => window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        }));
        assert.deepEqual(axe.violations.map(violation => violation.id), [], `${viewport.id}: axe WCAG A/AA`);
        checks += 1;
      }
      assertNoExternalRequests(externalRequests, viewport.id);
      checks += 9;
      await context.close();
    }

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const externalRequests = captureExternalRequests(context);
    await installTurnstileFixture(context);
    const page = await context.newPage();
    for (const route of ROUTES) {
      checks += await verifySkipTarget(page, route.path, { width: 390, height: 844 });
      const brand = await page.locator(".mm-auth-card .mm-auth-logo-name").textContent();
      assert.equal(brand?.trim(), route.brand, `${route.path}: visible tenant lockup is retained`);
      checks += 1;
    }
    assertNoExternalRequests(externalRequests, "auth route matrix");
    checks += 1;
    await context.close();

    const reducedMotionContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    const reducedMotionExternalRequests = captureExternalRequests(reducedMotionContext);
    await installTurnstileFixture(reducedMotionContext);
    const reducedMotionPage = await reducedMotionContext.newPage();
    await reducedMotionPage.goto(`${BASE}/login?brand=aqua`, { waitUntil: "networkidle" });
    await reducedMotionPage.locator(".mm-btn-primary").hover();
    const reducedMotion = await reducedMotionPage.evaluate(() => ({
      requested: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      transform: getComputedStyle(document.querySelector(".mm-btn-primary")).transform,
      transitionDuration: getComputedStyle(document.querySelector(".mm-btn-primary")).transitionDuration,
    }));
    assert.equal(reducedMotion.requested, true, "reduced-motion browser context exposes the user preference");
    assert.equal(reducedMotion.transform, "none", "reduced-motion primary action does not animate on hover");
    assert.equal(reducedMotion.transitionDuration, "0s", "reduced-motion primary action has no transition duration");
    assertNoExternalRequests(reducedMotionExternalRequests, "reduced-motion login");
    checks += 4;
    await reducedMotionContext.close();

    for (const viewport of SKIP_VIEWPORTS) {
      for (const surface of SKIP_SURFACES) {
        const skipContext = await browser.newContext({ viewport });
        const skipExternalRequests = captureExternalRequests(skipContext);
        await installTurnstileFixture(skipContext);
        const skipPage = await skipContext.newPage();
        checks += await verifySkipTarget(skipPage, surface, viewport);
        assertNoExternalRequests(skipExternalRequests, `${surface.path} at ${viewport.width}x${viewport.height}`);
        checks += 1;
        await skipContext.close();
      }
    }

    // Establish the public showcase once and keep its exact cookie/realm for
    // every portal assertion. Re-entering /showcase in disposable contexts
    // raced fixture hydration and intermittently tested the login fallback.
    const showcaseContext = await browser.newContext({ viewport: SKIP_VIEWPORTS[0] });
    const showcaseExternalRequests = captureExternalRequests(showcaseContext);
    await installTurnstileFixture(showcaseContext);
    const showcasePage = await showcaseContext.newPage();
    await showcasePage.goto(`${BASE}/showcase`, { waitUntil: "networkidle" });
    assert.equal(new URL(showcasePage.url()).pathname, "/portal/agency",
      "showcase setup reaches the real portal before skip acceptance");
    checks += 1;
    for (const viewport of SKIP_VIEWPORTS) {
      await showcasePage.setViewportSize(viewport);
      checks += await verifySkipTarget(showcasePage, { path: "/portal/agency", kind: "portal" }, viewport);
    }
    await showcasePage.setViewportSize(SKIP_VIEWPORTS[0]);
    checks += await verifySkipTarget(showcasePage, {
      path: "/portal/missing-browser-fixture",
      kind: "standalone",
      expectedNotFound: true,
    }, SKIP_VIEWPORTS[0]);
    assertNoExternalRequests(showcaseExternalRequests, "showcase portal matrix");
    checks += 1;
    await showcaseContext.close();
  } finally {
    await browser.close();
  }
  console.log(`LOGIN-UX-001 browser acceptance: ${checks}/${checks} checks passed`);
  console.log(`Browser: playwright-core ${require("playwright-core/package.json").version}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
