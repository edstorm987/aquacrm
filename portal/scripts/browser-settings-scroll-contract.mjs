#!/usr/bin/env node
// SETTINGS-SCROLL-001 permanent browser evidence.
//
// This is deliberately a hermetic layout-contract fixture, not an assertion
// that the authenticated Settings route was opened. It reproduces the real
// ancestor chain and responsive rules pinned by smoke-settings-scroll.test.ts:
// 100dvh/overflow-hidden shell -> min-h-0 inner frame -> overflow-y-auto main
// -> Settings two-column grid -> sticky, bounded, internally scrolling rail.
// It binds only to 127.0.0.1 and makes no application, provider or live calls.

// Run from portal/: npm run browser:settings-scroll

// A missing browser is a hard failure, never a skipped or false-green run.

import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";

const VIEWPORTS = [
  { id: "1440x900", width: 1440, height: 900, desktop: true },
  { id: "768x1024", width: 768, height: 1024, desktop: false },
  { id: "390x844", width: 390, height: 844, desktop: false },
  { id: "320x568", width: 320, height: 568, desktop: false },
  { id: "1440x420-short", width: 1440, height: 420, desktop: true, short: true },
  // A 1440x900 physical viewport at 200% exposes about 720x450 CSS pixels.
  { id: "1440x900-at-200-percent", width: 720, height: 450, scale: 2, desktop: false },
];

const TAB_LABELS = [
  "Business details",
  "My account",
  "Workspaces & modules",
  "Defaults",
  "Appearance & branding",
  "Sidebar & saved tabs",
  "Team, roles & access",
  "Connections",
  "Radar triggers",
  "API & MCP keys",
  "Environment",
  "Notifications",
  "What's new",
  "Activity log",
  "Setup & launch",
  "Help",
];

const tabRows = TAB_LABELS.map((label, index) => {
  const id = `section-${index + 1}`;
  return `<button id="tab-${id}" type="button" data-tab="${id}">${label}</button>`;
}).join("");

const options = TAB_LABELS.map((label, index) => {
  const id = `section-${index + 1}`;
  return `<option value="${id}">${label}</option>`;
}).join("");

const HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Settings scroll contract fixture</title>
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; font-family: system-ui, sans-serif; }
    button, input, select { font: inherit; }
    .shell { display: flex; height: 100dvh; overflow: hidden; background: #f4f4f2; }
    .sidebar { width: 12rem; flex: 0 0 12rem; background: #102437; }
    .frame { display: flex; min-width: 0; min-height: 0; flex: 1 1 auto; flex-direction: column; overflow: hidden; }
    .topbar { height: 3.5rem; flex: 0 0 3.5rem; border-bottom: 1px solid #ddd; background: white; }
    #main-content { min-width: 0; min-height: 0; flex: 1 1 auto; overflow-y: auto; overscroll-behavior: contain; padding: 1.5rem 2rem; }
    .page { width: 100%; max-width: 64rem; margin: 0 auto; }
    .intro { min-height: 10rem; padding: 1rem; border: 1px solid #ddd; border-radius: .5rem; background: white; }
    .mobile-picker { display: grid; gap: .375rem; margin-top: 1rem; font-size: .8rem; }
    .mobile-picker select { min-width: 0; width: 100%; min-height: 2.75rem; }
    .settings-grid { display: grid; gap: 1.5rem; margin-top: 1.5rem; }
    #settings-rail { display: none; }
    .content { display: flex; min-width: 0; flex-direction: column; gap: 1.25rem; }
    .content-card { min-width: 0; min-height: 150rem; padding: 1rem; border: 1px solid #ddd; border-radius: .5rem; background: white; overflow-wrap: anywhere; }
    #settings-rail input { width: calc(100% - 1rem); min-height: 2.25rem; margin: 0 .5rem .75rem; }
    #settings-rail button { display: flex; width: 100%; min-height: 2.25rem; align-items: center; border: 0; border-radius: .375rem; padding: 0 .5rem; background: transparent; text-align: left; }
    #settings-rail button:focus-visible, select:focus-visible, input:focus-visible { outline: 3px solid #117f79; outline-offset: 2px; }
    #settings-rail button[aria-current="page"] { background: #e1eeec; font-weight: 700; }
    @media (min-width: 1024px) {
      .mobile-picker { display: none; }
      .settings-grid { grid-template-columns: 15rem minmax(0, 1fr); align-items: start; }
      #settings-rail { display: block; position: sticky; top: 1.5rem; max-height: calc(100vh - 8rem); overflow-y: auto; overscroll-behavior: contain; padding-bottom: .5rem; }
    }
    @media (max-width: 1023.98px) {
      .sidebar { display: none; }
      #main-content { padding: 1.25rem 1rem; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <aside class="sidebar" aria-hidden="true"></aside>
    <div class="frame">
      <header class="topbar"></header>
      <main id="main-content">
        <div class="page">
          <section class="intro"><h1>Agency Settings</h1><p>Contract fixture for the real inner-main scroll chain.</p></section>
          <label class="mobile-picker">Settings section
            <select id="settings-select" aria-label="Settings section">${options}</select>
          </label>
          <div class="settings-grid">
            <nav id="settings-rail" aria-label="Settings sections">
              <label><span>Search settings</span><input id="settings-search" type="search"></label>
              ${tabRows}
            </nav>
            <div class="content">
              <section class="content-card"><h2 id="pane-heading">${TAB_LABELS[0]}</h2><p id="long-token">A-long-but-valid-setting-value-that-must-wrap-instead-of-forcing-the-grid-wider-than-the-scroll-container</p></section>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
  <script>
    const labels = ${JSON.stringify(TAB_LABELS)};
    const select = document.querySelector('#settings-select');
    const buttons = [...document.querySelectorAll('[data-tab]')];
    const valid = new Set(buttons.map(button => button.dataset.tab));
    function activate(id, updateUrl = true) {
      if (!valid.has(id)) id = 'section-1';
      select.value = id;
      buttons.forEach(button => button.setAttribute('aria-current', button.dataset.tab === id ? 'page' : 'false'));
      document.querySelector('#pane-heading').textContent = labels[Number(id.slice(8)) - 1];
      if (updateUrl) history.replaceState(null, '', '#' + id);
    }
    select.addEventListener('change', event => activate(event.target.value));
    buttons.forEach(button => button.addEventListener('click', () => activate(button.dataset.tab)));
    activate(location.hash.slice(1), false);
  </script>
</body>
</html>`;

function browserCandidates(root) {
  if (!root || !existsSync(root)) return [];
  const revisions = readdirSync(root)
    .filter(name => /^(chromium|chromium_headless_shell)-\d+$/.test(name))
    .sort((a, b) => Number(b.split("-").at(-1)) - Number(a.split("-").at(-1)));
  const relativePaths = [
    ["chrome-linux", "chrome"],
    ["chrome-linux64", "chrome"],
    ["chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"],
    ["chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"],
    ["chrome-mac-x64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"],
    ["chrome-headless-shell-linux64", "chrome-headless-shell"],
    ["chrome-headless-shell-mac-arm64", "chrome-headless-shell"],
    ["chrome-headless-shell-mac-x64", "chrome-headless-shell"],
  ];
  return revisions.flatMap(revision => relativePaths.map(parts => join(root, revision, ...parts))).filter(existsSync);
}

async function launchBrowser() {
  const { chromium } = await import("playwright-core");
  const explicit = process.env.AQUA_BROWSER_EXECUTABLE || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (explicit) {
    return { browser: await chromium.launch({ headless: true, executablePath: explicit }), note: `configured ${explicit}` };
  }
  try {
    const browser = await chromium.launch({ headless: true });
    return { browser, note: `playwright-core Chromium ${browser.version()}` };
  } catch (defaultError) {
    const roots = [
      process.env.PLAYWRIGHT_BROWSERS_PATH,
      join(homedir(), "Library", "Caches", "ms-playwright"),
      join(homedir(), ".cache", "ms-playwright"),
    ].filter(Boolean);
    for (const candidate of roots.flatMap(browserCandidates)) {
      try {
        const browser = await chromium.launch({ headless: true, executablePath: candidate });
        return { browser, note: `provisioned ${candidate} (${browser.version()})` };
      } catch {
        // Try the next already-provisioned executable without touching network.
      }
    }
    throw new Error(`No local Chromium could launch: ${defaultError.message}. Run npm run browser:install or set AQUA_BROWSER_EXECUTABLE.`);
  }
}

function startFixture() {
  const server = createServer((request, response) => {
    if (request.method !== "GET" || request.url !== "/") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
      return;
    }
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
      "content-type": "text/html; charset=utf-8",
    });
    response.end(HTML);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("fixture did not receive a TCP port"));
        return;
      }
      resolve({ server, base: `http://127.0.0.1:${address.port}` });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function measure(page) {
  return page.evaluate(() => {
    const main = document.querySelector("#main-content");
    const grid = document.querySelector(".settings-grid");
    const rail = document.querySelector("#settings-rail");
    const picker = document.querySelector(".mobile-picker");
    const doc = document.documentElement;
    const body = document.body;
    return {
      documentClientWidth: doc.clientWidth,
      documentScrollWidth: doc.scrollWidth,
      bodyClientWidth: body.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      mainClientWidth: main.clientWidth,
      mainScrollWidth: main.scrollWidth,
      mainClientHeight: main.clientHeight,
      mainScrollHeight: main.scrollHeight,
      mainOverflowY: getComputedStyle(main).overflowY,
      gridColumns: getComputedStyle(grid).gridTemplateColumns,
      gridClientWidth: grid.clientWidth,
      gridScrollWidth: grid.scrollWidth,
      railDisplay: getComputedStyle(rail).display,
      railPosition: getComputedStyle(rail).position,
      railTopCss: getComputedStyle(rail).top,
      railOverflowY: getComputedStyle(rail).overflowY,
      railMaxHeight: getComputedStyle(rail).maxHeight,
      railClientHeight: rail.clientHeight,
      railScrollHeight: rail.scrollHeight,
      pickerDisplay: getComputedStyle(picker).display,
      windowScrollY: window.scrollY,
    };
  });
}

async function assertNoHorizontalOverflow(page, viewport) {
  const layout = await measure(page);
  assert.ok(layout.documentScrollWidth <= layout.documentClientWidth + 1, `${viewport}: document overflowed horizontally`);
  assert.ok(layout.bodyScrollWidth <= layout.bodyClientWidth + 1, `${viewport}: body overflowed horizontally`);
  assert.ok(layout.mainScrollWidth <= layout.mainClientWidth + 1, `${viewport}: inner main overflowed horizontally`);
  assert.ok(layout.gridScrollWidth <= layout.gridClientWidth + 1, `${viewport}: Settings grid overflowed horizontally`);
  assert.equal(layout.windowScrollY, 0, `${viewport}: the window must remain locked while inner main owns vertical scroll`);
  return layout;
}

async function assertDesktop(page, viewport) {
  const before = await assertNoHorizontalOverflow(page, viewport.id);
  assert.equal(before.mainOverflowY, "auto", `${viewport.id}: inner main must own scrolling`);
  assert.equal(before.railDisplay, "block", `${viewport.id}: desktop rail must be visible`);
  assert.equal(before.pickerDisplay, "none", `${viewport.id}: compact select must be hidden`);
  assert.equal(before.railPosition, "sticky", `${viewport.id}: rail must compute to sticky`);
  assert.equal(before.railTopCss, "24px", `${viewport.id}: sticky top must be 1.5rem`);
  assert.equal(before.railOverflowY, "auto", `${viewport.id}: tall rail must own internal scrolling`);
  assert.match(before.gridColumns, /^240px /, `${viewport.id}: Settings grid must retain a 15rem desktop rail`);
  assert.ok(before.mainScrollHeight > before.mainClientHeight, `${viewport.id}: the actual inner main must be scrollable`);

  await page.locator("#main-content").evaluate(element => { element.scrollTop = 500; });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const sticky = await page.evaluate(() => {
    const main = document.querySelector("#main-content");
    const rail = document.querySelector("#settings-rail");
    const mainPaddingTop = Number.parseFloat(getComputedStyle(main).paddingTop);
    const stickyOffset = Number.parseFloat(getComputedStyle(rail).top);
    return {
      mainScrollTop: main.scrollTop,
      // A sticky child inside this padded scrollport pins after the main's
      // content inset plus its own top offset (24px + 24px in this fixture).
      expectedTop: main.getBoundingClientRect().top + mainPaddingTop + stickyOffset,
      railTop: rail.getBoundingClientRect().top,
      windowScrollY: window.scrollY,
    };
  });
  assert.ok(sticky.mainScrollTop >= 499, `${viewport.id}: inner main did not scroll`);
  assert.ok(Math.abs(sticky.railTop - sticky.expectedTop) <= 1.5, `${viewport.id}: rail did not stick against inner main (${sticky.railTop} vs ${sticky.expectedTop})`);
  assert.equal(sticky.windowScrollY, 0, `${viewport.id}: sticky test moved the window instead of inner main`);

  await page.locator("#settings-search").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "tab-section-2", `${viewport.id}: desktop focus order did not reach the second section button`);
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("#tab-section-2").getAttribute("aria-current"), "page", `${viewport.id}: keyboard activation did not select the section`);
  assert.equal(await page.locator("#pane-heading").textContent(), "My account", `${viewport.id}: desktop selection did not update the pane`);
  assert.equal(await page.evaluate(() => location.hash), "#section-2", `${viewport.id}: desktop selection was not reflected in the URL`);

  if (viewport.short) {
    const bounded = await measure(page);
    assert.ok(bounded.railScrollHeight > bounded.railClientHeight, `${viewport.id}: short viewport did not produce internal rail overflow`);
    assert.ok(bounded.railClientHeight <= viewport.height - 128 + 1, `${viewport.id}: rail exceeded its viewport cap`);
    const mainBefore = await page.locator("#main-content").evaluate(element => element.scrollTop);
    await page.locator("#settings-rail").evaluate(element => { element.scrollTop = 120; });
    const railAfter = await page.locator("#settings-rail").evaluate(element => element.scrollTop);
    const mainAfter = await page.locator("#main-content").evaluate(element => element.scrollTop);
    assert.ok(railAfter > 0, `${viewport.id}: the bounded rail did not scroll internally`);
    assert.equal(mainAfter, mainBefore, `${viewport.id}: internal rail scroll unexpectedly moved inner main`);
  }
}

async function assertCompact(page, viewport) {
  const layout = await assertNoHorizontalOverflow(page, viewport.id);
  assert.equal(layout.railDisplay, "none", `${viewport.id}: desktop rail must be hidden below lg`);
  assert.equal(layout.pickerDisplay, "grid", `${viewport.id}: grouped select must replace the rail below lg`);
  assert.ok(!layout.gridColumns.includes(" "), `${viewport.id}: Settings grid must compute to one column (${layout.gridColumns})`);

  const picker = page.locator("#settings-select");
  await picker.focus();
  assert.equal(await page.evaluate(() => document.activeElement?.id), "settings-select", `${viewport.id}: native section select could not retain focus`);
  await picker.selectOption("section-5");
  assert.equal(await picker.inputValue(), "section-5", `${viewport.id}: native section select did not update`);
  assert.equal(await page.locator("#pane-heading").textContent(), "Appearance & branding", `${viewport.id}: compact selection did not update the pane`);
  assert.equal(await page.evaluate(() => location.hash), "#section-5", `${viewport.id}: compact selection was not reflected in the URL`);
  await page.reload({ waitUntil: "load" });
  assert.equal(await page.locator("#settings-select").inputValue(), "section-5", `${viewport.id}: URL-backed compact selection did not survive reload`);
  assert.equal(await page.locator("#pane-heading").textContent(), "Appearance & branding", `${viewport.id}: reloaded pane did not match the selected section`);
}

async function main() {
  const { server, base } = await startFixture();
  let browser;
  const failures = [];
  try {
    const launched = await launchBrowser();
    browser = launched.browser;
    console.log(`Browser: ${launched.note}`);
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.scale ?? 1,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      const unexpected = [];
      page.on("console", message => { if (message.type() === "error") unexpected.push(`console: ${message.text()}`); });
      page.on("pageerror", error => unexpected.push(`pageerror: ${error.message}`));
      page.on("request", request => {
        const url = new URL(request.url());
        if (url.hostname !== "127.0.0.1") unexpected.push(`external request: ${request.url()}`);
      });
      page.on("requestfailed", request => unexpected.push(`request failed: ${request.url()} ${request.failure()?.errorText ?? ""}`));
      page.on("response", response => { if (response.status() >= 400) unexpected.push(`HTTP ${response.status()}: ${response.url()}`); });
      try {
        const response = await page.goto(base, { waitUntil: "load" });
        assert.ok(response?.ok(), `${viewport.id}: fixture returned ${response?.status()}`);
        if (viewport.desktop) await assertDesktop(page, viewport);
        else await assertCompact(page, viewport);
        await assertNoHorizontalOverflow(page, viewport.id);
        assert.deepEqual(unexpected, [], `${viewport.id}: browser emitted unexpected errors or requests`);
        console.log(`PASS ${viewport.id}`);
      } catch (error) {
        failures.push(`${viewport.id}: ${error.stack ?? error.message}`);
        console.error(`FAIL ${viewport.id}: ${error.message}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    await closeServer(server);
  }
  if (failures.length > 0) throw new Error(`${failures.length} Settings browser contract(s) failed:\n${failures.join("\n\n")}`);
  console.log(`SETTINGS-SCROLL-001 browser contract green: ${VIEWPORTS.length}/${VIEWPORTS.length} viewports`);
}

main().catch(error => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
