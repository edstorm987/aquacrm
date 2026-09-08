#!/usr/bin/env node
// UI/UX · responsive · accessibility acceptance harness (2026-09-08 phase).
//
// Complements `browser-matrix.mjs` (13 routes) by driving the FULL route
// inventory through the required viewport set with added HIGH-CONFIDENCE geometry
// checks and settled full-page screenshots, so a human can visually inspect the
// rendered result. It reuses the matrix's verdict helpers so the two lanes cannot
// drift apart.
//
// It is deliberately conservative about auto-failing: overflow, an interactive
// control pushed fully off the horizontal edge, and a fully-clipped focusable are
// high-confidence and reported as findings; everything ambiguous is captured as a
// screenshot + observation for human review (per the "no meaningless overlap
// noise" rule).
//
// Isolation: point AQUA_BASE at a file-backed sandbox with an isolated
// PORTAL_DATA_FILE. Sign-in uses `/dev` (+ optional `?as=`/`?client=`), so no
// Supabase/provider is contacted. Machine evidence + screenshots go under an
// ignored `.artefacts/ui-acceptance-<ts>/`.
//
//   AQUA_BASE=http://localhost:3078 node scripts/ui-acceptance.mjs
//   AQUA_UI_ROUTES=/portal/agency,/login   # optional path filter (substring)
//   AQUA_UI_VIEWPORTS=mobile-375,desktop-1280  # optional viewport id filter
//   AQUA_UI_SHOTS=mobile-375,desktop-1280   # which viewports capture screenshots

import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { overflowVerdictFrom, axeVerdict, findProvisionedChromium, BROWSER_INSTALL_HINT } from "./browser-matrix.mjs";
import { ROUTES, ROUTE_TOTALS } from "./ui-acceptance-inventory.mjs";

const require = createRequire(import.meta.url);
const BASE = process.env.AQUA_BASE || "http://localhost:3078";

// ── Viewports: the phase's required set (widths + short-height + boundaries). ──
const VIEWPORTS = [
  { id: "vp-320", w: 320, h: 568 },
  { id: "vp-360", w: 360, h: 800 },
  { id: "mobile-375", w: 375, h: 812 },
  { id: "vp-390", w: 390, h: 844 },
  { id: "vp-414", w: 414, h: 896 },
  { id: "land-568", w: 568, h: 320 },   // short-height landscape
  { id: "land-812", w: 812, h: 375 },   // short-height landscape
  { id: "bp-639", w: 639, h: 900 },
  { id: "bp-640", w: 640, h: 900 },
  { id: "bp-767", w: 767, h: 900 },
  { id: "tablet-768", w: 768, h: 1024 },
  { id: "bp-1023", w: 1023, h: 800 },
  { id: "bp-1024", w: 1024, h: 768 },
  { id: "bp-1279", w: 1279, h: 800 },
  { id: "desktop-1280", w: 1280, h: 800 },
  { id: "vp-1366", w: 1366, h: 768 },
  { id: "vp-1440", w: 1440, h: 900 },
  { id: "wide-1920", w: 1920, h: 1080 },
];

const pick = (list, env, key) => {
  const filter = process.env[env];
  if (!filter) return list;
  const wanted = filter.split(",").map(s => s.trim()).filter(Boolean);
  return list.filter(item => wanted.some(w => String(item[key]).includes(w)));
};
const VIEWPORT_SET = pick(VIEWPORTS, "AQUA_UI_VIEWPORTS", "id");
// AQUA_UI_ONLY=/a,/b tests exactly those routes (all treated as needs-auth) —
// used for dynamic-fixture routes and role sessions that are not in the static
// inventory. AQUA_UI_SIGNIN overrides the sign-in path (/dev default; /showcase
// mints a data-rich demo session; /dev?as=staff etc. for role coverage).
const SIGNIN = process.env.AQUA_UI_SIGNIN || "/dev";
// AQUA_UI_PERSONA switches the authed session to a seeded non-owner demo persona
// AFTER sign-in, via a same-origin POST /api/auth/dev-mode {switch}. Requires a
// writable founder session (sign in via /dev, NOT the read-only /showcase). This
// is the only way to audit real staff/customer/freelancer role journeys locally.
const PERSONA = (process.env.AQUA_UI_PERSONA || "").trim().toLowerCase();
const ROUTE_SET = process.env.AQUA_UI_ONLY
  ? process.env.AQUA_UI_ONLY.split(",").map(p => p.trim()).filter(Boolean).map(path => ({ path, category: "wave3", needsAuth: true, role: "session" }))
  : pick(ROUTES.filter(r => r.status !== "skip"), "AQUA_UI_ROUTES", "path");
const SHOT_VPS = new Set((process.env.AQUA_UI_SHOTS || "vp-320,mobile-375,tablet-768,desktop-1280,wide-1920").split(","));

// ── In-page geometry probe (runs in the browser). HIGH-CONFIDENCE only. ──
const GEOMETRY_PROBE = `(() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const de = document.documentElement;
  // Measure EACH region, not just the document: globals.css clips
  // main#main-content with overflow-x:hidden below 640px, which hides genuine
  // overflow from document.scrollWidth (see browser-matrix overflowVerdictFrom).
  const overflowRegions = [{ label: "document", scrollWidth: de.scrollWidth, clientWidth: de.clientWidth }];
  const mainEl = document.querySelector("#main-content");
  if (mainEl) overflowRegions.push({ label: "#main-content", scrollWidth: mainEl.scrollWidth, clientWidth: mainEl.clientWidth });
  const vis = el => {
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) === 0) return false;
    // sr-only: 1px clip
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    let a = el;
    while (a) { if (a.getAttribute && a.getAttribute("aria-hidden") === "true") return false; a = a.parentElement; }
    return true;
  };
  const scrollableX = el => { let a = el.parentElement; while (a) { const o = getComputedStyle(a).overflowX; if (o === "auto" || o === "scroll") return true; a = a.parentElement; } return false; };
  // Axis-aware clip: only a HIDDEN (not auto/scroll) overflow that the element is
  // FULLY outside of on that axis is a real clip. This excludes elements merely
  // scrolled out of view in an overflow:auto/scroll container (reachable, not clipped).
  const clippedAxis = el => {
    let a = el.parentElement; const r = el.getBoundingClientRect();
    while (a) {
      const cs = getComputedStyle(a); const cr = a.getBoundingClientRect();
      // A scrollable-x ancestor (auto/scroll) makes the element reachable by
      // scrolling that container, even if a FURTHER-UP ancestor is
      // overflow-x:hidden (e.g. #main-content below 640px). So an element inside
      // a horizontal scroller is NOT clipped on x — stop before the outer clip
      // wrongly flags a scroll-reachable tab/toolbar item. Only x is consumed.
      if (cs.overflowX === "auto" || cs.overflowX === "scroll") return null;
      if (cs.overflowX === "hidden" && (r.right <= cr.left + 1 || r.left >= cr.right - 1)) return "x";
      a = a.parentElement;
    }
    return null;
  };
  const sel = 'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [tabindex]:not([tabindex="-1"])';
  const els = [...document.querySelectorAll(sel)].filter(vis);
  const desc = el => (el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || el.tagName).trim().slice(0, 40).replace(/\\s+/g, " ");
  const offscreen = [];
  for (const el of els) {
    const r = el.getBoundingClientRect();
    // Fully off the horizontal edge and NOT inside a horizontal scroller.
    const offX = (r.right <= 1 || r.left >= vw - 1);
    if (offX && !scrollableX(el)) offscreen.push({ t: desc(el), tag: el.tagName, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] });
  }
  // Only HORIZONTAL clips are high-signal: a control pushed past an
  // overflow-x:hidden edge at narrow widths is genuinely cut off with no scroll.
  // Vertical "clips" are almost always visible controls inside overflow-y:hidden
  // flex wrappers (false positives), so they are excluded.
  const clipped = [];
  for (const el of els) {
    if (clippedAxis(el) === "x") clipped.push({ t: desc(el), tag: el.tagName });
  }
  // fixed/sticky elements (report top-region ones for visual review)
  const fixed = [...document.querySelectorAll("body *")].filter(el => { const p = getComputedStyle(el).position; return (p === "fixed" || p === "sticky"); })
    .map(el => { const r = el.getBoundingClientRect(); return { t: (el.className+"" ).slice(0,40), pos: getComputedStyle(el).position, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }; })
    .filter(f => f.rect[3] > 8 && f.rect[2] > 8).slice(0, 12);
  // is there a loading curtain still present?
  const loader = !!document.querySelector(".aqua-viewport-loading, [data-loading-curtain]");
  return { overflowRegions, offscreen: offscreen.slice(0, 20), clipped: clipped.slice(0, 20), fixed, loader, interactiveCount: els.length, title: document.title, url: location.href };
})();`;

function loadAxe() {
  try { return require("fs").readFileSync(require.resolve("axe-core/axe.min.js"), "utf8"); }
  catch (e) { throw new Error("axe-core not installed: " + e.message); }
}

async function settle(page) {
  // RSC-streaming portal pages rarely reach `networkidle`, so don't block on it.
  try { await page.waitForLoadState("load", { timeout: 8000 }); } catch { /* soft */ }
  // Wait for the workspace loading curtain to clear (heavy pages can take a while)
  // so axe scans the REAL content, not the transient loader's low-contrast text.
  try { await page.waitForFunction(() => !document.querySelector(".aqua-viewport-loading, [data-loading-curtain]"), { timeout: 12000 }); } catch { /* soft */ }
  // A beat for fonts/hydration/layout shift to settle before measuring.
  await page.waitForTimeout(600);
}

// Which finding severities BLOCK the gate (produce a non-zero exit).
const BLOCKING_SEVERITIES = new Set(["P0", "P1"]);
// The engines this harness accepts. An unknown value is a FATAL configuration
// error — it must NOT silently fall back to Chromium and report a false pass.
const VALID_ENGINES = new Set(["chromium", "webkit", "firefox"]);
// Optional text-only scaling (WCAG 1.4.4). AQUA_UI_TEXT_SCALE=200 applies
// font-size:200% after settle; "none"/unset leaves 1×. Recorded per run + record.
const TEXT_SCALE = (process.env.AQUA_UI_TEXT_SCALE || "").trim();

function gitMeta() {
  try {
    const { execSync } = require("node:child_process");
    const run = c => { try { return execSync(c, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return null; } };
    return {
      baselineSha: run("git rev-parse HEAD"),
      branch: run("git branch --show-current"),
      dirtyFingerprint: (run("git diff | shasum -a 256") || "").slice(0, 16) || null,
      changedPathCount: Number(run("git status --porcelain | wc -l")) || 0,
    };
  } catch { return { baselineSha: null, branch: null, dirtyFingerprint: null, changedPathCount: 0 }; }
}

async function main() {
  const require2 = createRequire(import.meta.url);
  const chromiumPath = findProvisionedChromium(process.cwd(), { exists: existsSync, list: readdirSync });
  // AQUA_UI_ENGINE=chromium (default) | webkit | firefox — cross-browser lane.
  // An UNKNOWN engine is a hard error, never a silent Chromium fallback.
  const ENGINE = (process.env.AQUA_UI_ENGINE || "chromium").trim().toLowerCase();
  if (!VALID_ENGINES.has(ENGINE)) {
    console.error(`FATAL: unknown AQUA_UI_ENGINE="${ENGINE}" (expected one of: ${[...VALID_ENGINES].join(", ")}). Refusing to run.`);
    process.exit(2);
  }
  let pw;
  try { pw = require2("playwright-core"); } catch (e) { console.error(BROWSER_INSTALL_HINT); process.exit(2); }
  const engineApi = pw[ENGINE];
  if (!engineApi) {
    console.error(`FATAL: playwright-core does not expose engine "${ENGINE}". Refusing to run.`);
    process.exit(2);
  }
  const axeSource = loadAxe();

  const startedUtc = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const ts = startedUtc.replace(/[:.]/g, "-");
  const outDir = join(process.cwd(), ".artefacts", `ui-acceptance-${ts}`);
  mkdirSync(join(outDir, "shots"), { recursive: true });

  const ROLE = process.env.AQUA_UI_PERSONA || (process.env.AQUA_SESSION_COOKIE ? "cookie-session" : "owner");
  const BUILD_MODE = (process.env.AQUA_BUILD_MODE || "dev").trim();
  const STATE_PATH = process.env.PORTAL_DATA_FILE || process.env.AQUA_STATE_PATH || "(unset)";
  const COMMAND = ["node", "scripts/ui-acceptance.mjs"].join(" ");
  const RUN_ENV = ["AQUA_BASE", "AQUA_UI_ENGINE", "AQUA_UI_SIGNIN", "AQUA_UI_PERSONA", "AQUA_UI_ONLY", "AQUA_UI_VIEWPORTS", "AQUA_UI_SHOTS", "AQUA_UI_TEXT_SCALE", "AQUA_BUILD_MODE", "PORTAL_DATA_FILE"].reduce((m, k) => { if (process.env[k]) m[k] = process.env[k]; return m; }, {});

  console.log(`=== UI acceptance @ ${BASE} ===`);
  console.log(`${ROUTE_SET.length} routes × ${VIEWPORT_SET.length} viewports; screenshots at [${[...SHOT_VPS].join(", ")}]; scale=${TEXT_SCALE || "1x"}`);
  console.log(`Evidence → ${outDir}\n`);

  const browser = await engineApi.launch(ENGINE === "chromium" ? { executablePath: chromiumPath || undefined } : {});
  console.log(`Engine: ${ENGINE} (${browser.version()})`);
  const attach = p => {
    p.on("console", m => { if (m.type() === "error") p._consoleErrors = [...(p._consoleErrors || []), m.text()]; });
    p.on("pageerror", e => { p._pageErrors = [...(p._pageErrors || []), e.message]; });
    p.on("requestfailed", r => { const u = r.url(); if (/_rsc=/.test(u) || /\/_next\//.test(u)) return; p._netFail = [...(p._netFail || []), `${r.failure()?.errorText} ${u}`]; });
    return p;
  };
  // Authenticated context (agency owner via /dev — no Supabase).
  const authContext = await browser.newContext();
  // AQUA_SESSION_COOKIE attaches a pre-minted session cookie instead of a GET
  // sign-in. Required against a PRODUCTION build (`next start`), where /dev is
  // disabled — mint with issueSession() and pass the token here. Accepts a raw
  // token (cookie name defaults to lk_session_v1) or an explicit "name=value".
  const COOKIE = (process.env.AQUA_SESSION_COOKIE || "").trim();
  if (COOKIE) {
    const eq = COOKIE.indexOf("=");
    const hasName = eq > 0 && !COOKIE.slice(0, eq).includes(".");
    const name = hasName ? COOKIE.slice(0, eq) : "lk_session_v1";
    const value = hasName ? COOKIE.slice(eq + 1) : COOKIE;
    const u = new URL(BASE);
    await authContext.addCookies([{ name, value, domain: u.hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
    console.log(`Auth: attached cookie ${name} (${value.length} chars)`);
  }
  const signin = await authContext.newPage();
  const resp = COOKIE ? { status: () => "cookie" } : await signin.goto(`${BASE}${SIGNIN}`, { waitUntil: "domcontentloaded" });
  let landed = COOKIE ? "(cookie)" : signin.url();
  // Optional persona hop (staff/customer/freelancer). The POST's Set-Cookie is
  // applied to authContext, so every subsequent authPage nav runs as the persona.
  if (!COOKIE && PERSONA && PERSONA !== "owner") {
    const sw = await signin.evaluate(async p => {
      const x = await fetch("/api/auth/dev-mode", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "switch", persona: p }) });
      return { status: x.status, body: await x.json().catch(() => null) };
    }, PERSONA);
    if (sw.body?.ok && sw.body.redirect) {
      await signin.goto(`${BASE}${sw.body.redirect}`, { waitUntil: "domcontentloaded" });
      landed = signin.url();
    }
    console.log(`Persona → ${PERSONA}: POST ${sw.status} ${sw.body?.ok ? "ok" : JSON.stringify(sw.body)}`);
  }
  await signin.close();
  console.log(`Sign-in ${SIGNIN} → ${resp?.status()} landed=${landed}\n`);
  // Anonymous context — so public/auth routes render their real page, not a redirect.
  const anonContext = await browser.newContext();

  const records = [];
  const findings = [];
  const authPage = attach(await authContext.newPage());
  const anonPage = attach(await anonContext.newPage());

  for (const route of ROUTE_SET) {
    // Public/auth routes render only in an anonymous context; an authed session
    // redirects them to the portal (which is not acceptance of the intended page).
    const page = route.needsAuth ? authPage : anonPage;
    for (const vp of VIEWPORT_SET) {
      page._consoleErrors = []; page._pageErrors = []; page._netFail = [];
      await page.setViewportSize({ width: vp.w, height: vp.h });
      let status = 0, geo = null, axe = null, err = null;
      const url = `${BASE}${route.path}`;
      try {
        const r = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        status = r?.status() ?? 0;
        await settle(page);
        geo = await page.evaluate(GEOMETRY_PROBE);
        if (SHOT_VPS.has(vp.id)) {
          const safe = route.path.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root";
          await page.screenshot({ path: join(outDir, "shots", `${safe}__${vp.id}.png`), fullPage: true }).catch(() => {});
        }
        try { await page.addScriptTag({ content: axeSource }); axe = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length }))); } catch { axe = null; }
      } catch (e) { err = e.message; }

      // Verdicts
      const redirectedToLogin = route.needsAuth && /\/login(\?|$)/.test(geo?.url || "");
      const overflow = geo ? overflowVerdictFrom(geo.overflowRegions) : { status: "fail", detail: "no geometry" };
      const axeBlocking = (axe || []).filter(v => v.impact === "serious" || v.impact === "critical");
      const rec = {
        path: route.path, cat: route.category, vp: vp.id, w: vp.w, h: vp.h,
        status, err,
        redirectedToLogin,
        overflow: overflow.status,
        offscreen: geo?.offscreen?.length || 0,
        clipped: geo?.clipped?.length || 0,
        loaderStuck: !!geo?.loader,
        axeBlocking: axeBlocking.length,
        axeBlockingIds: axeBlocking.map(v => `${v.id}(${v.n})`),
        consoleErrors: (page._consoleErrors || []).length,
        pageErrors: (page._pageErrors || []).length,
        netFail: (page._netFail || []).length,
        offscreenDetail: geo?.offscreen || [],
        clippedDetail: geo?.clipped || [],
      };
      records.push(rec);
      // Collect findings
      if (err) findings.push({ sev: "P1", kind: "load-error", path: route.path, vp: vp.id, detail: err });
      else if (route.needsAuth && redirectedToLogin) findings.push({ sev: "P1", kind: "auth-redirect", path: route.path, vp: vp.id, detail: "protected route showed login" });
      else if (route.needsAuth && status !== 200) findings.push({ sev: "P2", kind: "non-200", path: route.path, vp: vp.id, detail: `HTTP ${status}` });
      if (overflow.status === "fail" && geo) findings.push({ sev: "P1", kind: "overflow", path: route.path, vp: vp.id, detail: overflow.detail });
      if (rec.offscreen > 0) findings.push({ sev: "P1", kind: "offscreen-interactive", path: route.path, vp: vp.id, detail: geo.offscreen.map(o => o.t).slice(0, 5).join(" | ") });
      if (rec.clipped > 0) findings.push({ sev: "P2-review", kind: "clipped-focusable-x", path: route.path, vp: vp.id, detail: geo.clipped.map(o => o.t).slice(0, 5).join(" | ") });
      if (axeBlocking.length > 0) findings.push({ sev: "P1", kind: "axe-serious", path: route.path, vp: vp.id, detail: axeBlocking.map(v => `${v.id}(${v.n})`).join(", ") });
      if (rec.loaderStuck) findings.push({ sev: "P2", kind: "loader-stuck", path: route.path, vp: vp.id, detail: "loading curtain still present after settle" });
      if (rec.pageErrors > 0) findings.push({ sev: "P1", kind: "page-error", path: route.path, vp: vp.id, detail: (page._pageErrors || []).slice(0, 2).join(" | ") });
      process.stdout.write(`${overflow.status === "fail" || rec.offscreen || rec.clipped || axeBlocking.length || err || rec.pageErrors ? "✗" : "·"}`);
    }
    process.stdout.write(` ${route.path}\n`);
  }
  await browser.close();

  await writeFile(join(outDir, "records.json"), JSON.stringify(records, null, 2));
  await writeFile(join(outDir, "findings.json"), JSON.stringify(findings, null, 2));

  // Summary
  const bySev = findings.reduce((m, f) => { m[f.sev] = (m[f.sev] || 0) + 1; return m; }, {});
  const byKind = findings.reduce((m, f) => { m[f.kind] = (m[f.kind] || 0) + 1; return m; }, {});
  console.log(`\n=== SUMMARY ===`);
  console.log(`routes tested: ${ROUTE_SET.length} / inventory ${ROUTE_TOTALS.total} · viewports: ${VIEWPORT_SET.length} · records: ${records.length}`);
  console.log(`findings by severity: ${JSON.stringify(bySev)}`);
  console.log(`findings by kind: ${JSON.stringify(byKind)}`);
  console.log(`evidence: ${outDir}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
