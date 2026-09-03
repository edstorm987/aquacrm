#!/usr/bin/env node
// Release acceptance for the 2026-09-03 integration on an ISOLATED PRODUCTION
// lane: roles and permission gates, workspace element visibility, My Tools
// folders and icons, the personal/business Radar split, Command Calendar
// linked records, the Website Editor newsletter facade, and the responsive
// matrix of every surface those touch.
//
// ── What it is, and is not ───────────────────────────────────────────────────
//
//   * It attaches to a running `next start` of the exact build under test and
//     a seed record the lane wrote (`AQUA_SEED_JSON`): six personas (owner,
//     manager, sales-seat staff, un-granted staff, client-owner, end-customer),
//     two clients, tasks, chat, HR alerts, linked calendar records and one
//     published page carrying a newsletter block. Nothing here touches `.data/`.
//   * Every required (group × story × viewport) key is enumerated up front. A
//     key that never ran is MISSING and fails the run; a crash halfway is red,
//     never a short green.
//   * A console error, page error, failed request or HTTP ≥ 400 the story did
//     not DECLARE (an injected fault, or a refusal the story exists to prove)
//     fails the story. Declared events are counted as evidence, by URL, inside
//     their window. Aborted speculative RSC prefetches are observations, as the
//     house matrix treats them.
//   * Layout checks measure the document and `#main-content` for horizontal
//     overflow, run axe (serious/critical block), walk the keyboard, and count
//     targets under 44×44 as observations. No assistive technology is driven.
//
// ── Running it ───────────────────────────────────────────────────────────────
//
//   AQUA_BASE=http://127.0.0.1:3201 AQUA_SEED_JSON=<lane>/seed.json \
//   AQUA_ARTEFACTS=<lane>/artefacts/release node scripts/browser-release-acceptance.mjs
//
//   Narrow while iterating: AQUA_GROUPS=roles,radar,calendar,tools,newsletter,layout
//   and AQUA_STORY_VIEWPORTS=390x844,1280x800 / AQUA_LAYOUT_VIEWPORTS=<ids>.

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { deflateSync } from "node:zlib";
import { randomBytes } from "node:crypto";

import { findProvisionedChromium } from "./browser-matrix.mjs";

const require = createRequire(import.meta.url);

const BASE = (process.env.AQUA_BASE || "").replace(/\/$/, "");
const SEED_PATH = process.env.AQUA_SEED_JSON || "";
// Read lazily so the story lists and verdict helpers can be imported by the
// smoke that pins them without a lane being present.
let SEED = null;
const ARTEFACTS = resolve(process.env.AQUA_ARTEFACTS || join(".artefacts", "release-acceptance"));
const RUN = randomBytes(3).toString("hex");
const NAV_TIMEOUT = 45_000;

export const STORY_VIEWPORTS = [
  { id: "390x844", width: 390, height: 844, scale: 1 },
  { id: "1280x800", width: 1280, height: 800, scale: 1 },
];

export const LAYOUT_VIEWPORTS = [
  { id: "375x812", width: 375, height: 812, scale: 1, label: "Mobile portrait" },
  { id: "812x375", width: 812, height: 375, scale: 1, label: "Mobile landscape" },
  { id: "768x1024", width: 768, height: 1024, scale: 1, label: "Tablet portrait" },
  { id: "1024x768", width: 1024, height: 768, scale: 1, label: "Tablet landscape" },
  { id: "1280x800", width: 1280, height: 800, scale: 1, label: "Desktop" },
  { id: "1920x1080", width: 1920, height: 1080, scale: 1, label: "Wide desktop" },
  { id: "320x568", width: 320, height: 568, scale: 1, label: "Small phone" },
  // 200% zoom halves the CSS viewport at twice the device scale (WCAG 1.4.4).
  { id: "1280x800@2", width: 640, height: 400, scale: 2, label: "Desktop @ 200% zoom" },
  { id: "375x812@2", width: 187, height: 406, scale: 2, label: "Mobile portrait @ 200% zoom" },
];

export const ROLE_STORIES = [
  { id: "R1", name: "owner lands on the Command Centre with My Radar, Business Radar and Tools" },
  { id: "R2", name: "manager (un-migrated) keeps the legacy whole-business view" },
  { id: "R3", name: "sales-seat staff lands on My Work; My Radar and Calendar open; Business Radar and workload are refused" },
  { id: "R4", name: "un-granted staff is sent to the permissions notice for Calendar" },
  { id: "R5", name: "client-owner lands in the customer portal, labelled Client owner, refused the agency surfaces" },
  { id: "R6", name: "end-customer lands in the customer portal and is refused the agency APIs" },
  { id: "R7", name: "anonymous callers are sent to login and refused every portal API" },
  { id: "R8", name: "calendar API visibility, ownership and link authority per persona" },
  { id: "R9", name: "a canonically governed staff seat without staff.overview is refused My Radar and Calendar by the personal gates" },
];

export const RADAR_STORIES = [
  { id: "D1", name: "owner: My Radar topbar popover is personal, links to Business Radar, closes on Escape and returns focus to its control" },
  { id: "D2", name: "owner: Business Radar quick look is a separate popover; Escape closes it and returns focus to its control" },
  { id: "D3", name: "owner: /my-radar is the personal view, /radar is the business inspector, /radar/workload is Department workload" },
  { id: "D4", name: "sales-seat staff: My Radar without any Business Radar control or link; workload refused" },
  { id: "D5", name: "manager: both radars available" },
];

export const CALENDAR_STORIES = [
  { id: "C1", name: "owner opens the seeded item: participants, client, linked task, document and custom field are all shown; dialog traps focus and restores it" },
  { id: "C2", name: "owner creates a custom item with participants, client, linked task, document and custom field; persisted and shown after reload" },
  { id: "C3", name: "a refused edit keeps the dialog and the typed work, announces an alert, and the retry succeeds" },
  { id: "C4", name: "owner deletes the created item" },
  { id: "C5", name: "staff participant sees the shared item read-only, their own private item, and never the owner's private item" },
  { id: "C6", name: "owner never sees the staff member's private item" },
];

export const TOOLS_STORIES = [
  { id: "T1", name: "add a tool with a built-in icon; the card and the saved record agree" },
  { id: "T2", name: "add a folder, file the tool into it, filter by folder, survive a reload" },
  { id: "T3", name: "upload a private icon; the record carries the asset and the icon route serves it" },
  { id: "T4", name: "rename the folder; the delete confirmation traps focus, cancels on Escape, and deleting moves the card to Unfiled" },
  { id: "T5", name: "a refused save keeps the editor and the typed work; the retry succeeds" },
  { id: "T6", name: "remove the tool through its confirmation; the record is gone and the icon route refuses" },
];

export const NEWSLETTER_STORIES = [
  { id: "W1", name: "the editor preview renders the block inert: no facade request leaves the preview" },
  { id: "W2", name: "the facade accepts one consent-bearing subscription from the lane origin and refuses replay drift, wrong consent, honeypot and missing origin" },
  { id: "W3", name: "the operator read is session-gated and tenant-scoped" },
];

export const LAYOUT_PAGES = [
  { id: "my-radar", persona: "owner", path: "/portal/agency/my-radar", heading: /My Radar/ },
  { id: "calendar", persona: "owner", path: "/portal/agency/calendar", heading: /Calendar/, modal: "calendar" },
  { id: "tools", persona: "owner", path: "/portal/agency/tools", heading: /Tools/ },
  { id: "workload", persona: "owner", path: "/portal/agency/radar/workload", heading: /Department workload/ },
  { id: "business-radar", persona: "owner", path: "/portal/agency?station=radar-inspector", heading: /./ },
  { id: "phases", persona: "owner", path: "/portal/agency/phases", heading: /Phases/ },
  { id: "people-chat", persona: "owner", path: "/portal/agency/people", heading: /./ },
  { id: "notepad", persona: "owner", path: "/portal/agency/notepad", heading: /./ },
  { id: "inbox", persona: "owner", path: "/portal/agency/inbox", heading: /./ },
  { id: "team", persona: "staff", path: "/portal/team", heading: /./ },
  { id: "staff-my-radar", persona: "staff", path: "/portal/agency/my-radar", heading: /My Radar/ },
  { id: "customer", persona: "clientOwner", path: "/portal/customer", heading: /./ },
];

const GROUPS = new Set((process.env.AQUA_GROUPS || "roles,radar,calendar,tools,newsletter,layout").split(",").map(s => s.trim()).filter(Boolean));
const STORY_FILTER = process.env.AQUA_STORY_VIEWPORTS ? new Set(process.env.AQUA_STORY_VIEWPORTS.split(",")) : null;
const LAYOUT_FILTER = process.env.AQUA_LAYOUT_VIEWPORTS ? new Set(process.env.AQUA_LAYOUT_VIEWPORTS.split(",")) : null;
const storyViewports = () => STORY_FILTER ? STORY_VIEWPORTS.filter(v => STORY_FILTER.has(v.id)) : STORY_VIEWPORTS;
const layoutViewports = () => LAYOUT_FILTER ? LAYOUT_VIEWPORTS.filter(v => LAYOUT_FILTER.has(v.id)) : LAYOUT_VIEWPORTS;

/** Every required (group, story, viewport) key. A key that never runs fails the run. */
export function requiredKeys({ groups = GROUPS, story = storyViewports(), layout = layoutViewports() } = {}) {
  const keys = [];
  const add = (group, stories) => { for (const v of story) for (const s of stories) keys.push(`${group}:${s.id}:${v.id}`); };
  if (groups.has("roles")) add("roles", ROLE_STORIES);
  if (groups.has("radar")) add("radar", RADAR_STORIES);
  if (groups.has("calendar")) add("calendar", CALENDAR_STORIES);
  if (groups.has("tools")) add("tools", TOOLS_STORIES);
  if (groups.has("newsletter")) for (const s of NEWSLETTER_STORIES) keys.push(`newsletter:${s.id}:1280x800`);
  if (groups.has("layout")) for (const v of layout) for (const p of LAYOUT_PAGES) keys.push(`layout:${p.id}:${v.id}`);
  return keys;
}

/** The verdict. Missing required keys are failures, not absences. */
export function summarise(records, required) {
  const seen = new Set(records.map(r => r.key));
  const missing = required.filter(key => !seen.has(key));
  const byGroup = {};
  for (const record of records) {
    const g = byGroup[record.group] ??= { passed: 0, failed: 0, evidenced: 0, observations: 0 };
    if (record.status === "pass") g.passed += 1; else if (record.status === "fail") g.failed += 1;
    g.evidenced += record.evidenced?.length ?? 0;
    g.observations += record.observations?.length ?? 0;
  }
  const failures = records.filter(r => r.status === "fail");
  return { ok: failures.length === 0 && missing.length === 0, byGroup, failures, missing };
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser plumbing
// ─────────────────────────────────────────────────────────────────────────────

async function launchBrowser() {
  const { chromium } = await import("playwright-core");
  const pinned = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (pinned) return { browser: await chromium.launch({ executablePath: pinned }), note: `pinned ${pinned}` };
  try {
    const browser = await chromium.launch();
    return { browser, note: `playwright-core ${require("playwright-core/package.json").version} chromium ${browser.version()}` };
  } catch (error) {
    const provisioned = findProvisionedChromium(process.env.PLAYWRIGHT_BROWSERS_PATH);
    if (!provisioned) throw new Error(`no Chromium available (${error.message}). Run: npx playwright-core install chromium`);
    const browser = await chromium.launch({ executablePath: provisioned });
    return { browser, note: `provisioned ${provisioned} ${browser.version()}` };
  }
}

function isRscPrefetchAbort(url, detail) {
  return /[?&]_rsc=/.test(url) && /ERR_ABORTED/.test(detail);
}

/**
 * Watches one page. A story DECLARES the events it causes on purpose (an
 * injected fault, or a refusal it exists to prove); a matching console/request/
 * HTTP event inside that window is evidence, anything else is a failure.
 */
class Monitor {
  constructor(page) {
    this.failures = []; this.evidenced = []; this.observations = []; this.expectations = [];
    page.on("console", message => { if (message.type() === "error") this.classify("console", message.text(), message.location()?.url ?? ""); });
    page.on("pageerror", error => this.classify("pageerror", error.message, page.url()));
    page.on("requestfailed", request => this.classify("requestfailed", request.failure()?.errorText ?? "failed", request.url()));
    page.on("response", response => { if (response.status() >= 400) this.classify("http", `HTTP ${response.status()}`, response.url(), response.status()); });
  }
  /** Declare an expected event. Returns a release function that ends the window after a grace period. */
  expect(label, predicate) {
    const entry = { label, predicate, hits: 0, until: Number.POSITIVE_INFINITY };
    this.expectations.push(entry);
    return (graceMs = 1_500) => { entry.until = Date.now() + graceMs; return entry; };
  }
  /** Declare that HTTP statuses on a URL fragment are the point of the story. */
  expectStatus(urlPart, statuses, label = `${statuses.join("/")} on ${urlPart}`) {
    return this.expect(label, e => (e.kind === "http" && statuses.includes(e.status) && e.url.includes(urlPart))
      || (e.kind === "console" && e.detail.includes("Failed to load resource") && statuses.some(s => e.detail.includes(String(s)))));
  }
  classify(kind, detail, url, status) {
    const now = Date.now();
    const expectation = this.expectations.find(e => now <= e.until && e.predicate({ kind, detail, url, status }));
    if (expectation) { expectation.hits += 1; this.evidenced.push({ kind, detail, url, label: expectation.label }); return; }
    if (kind === "requestfailed" && isRscPrefetchAbort(url, detail)) { this.observations.push({ kind, detail, url }); return; }
    if (kind === "console" && /net::ERR_ABORTED/.test(detail) && /[?&]_rsc=/.test(url)) { this.observations.push({ kind, detail, url }); return; }
    this.failures.push({ kind, detail: detail.slice(0, 300), url, status });
  }
  take() {
    const out = { failures: this.failures, evidenced: this.evidenced, observations: this.observations };
    this.failures = []; this.evidenced = []; this.observations = []; this.expectations = [];
    return out;
  }
}

async function openContext(browser, viewport, persona, extra = {}) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.scale ?? 1,
    reducedMotion: "no-preference",
    ...extra,
  });
  if (persona) {
    await context.addCookies(loopbackBases().map(url => ({ name: "lk_session_v1", value: SEED.users[persona].token, url })));
  }
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(NAV_TIMEOUT);
  return { context, page, monitor: new Monitor(page) };
}

/**
 * The lane binds to 127.0.0.1, but Next reports `req.url` with the host
 * "localhost" for an IP-literal Host header, so a same-origin check inside a
 * route handler (the visitor facades) only passes for pages served as
 * http://localhost:<port>. Both spellings resolve to the same server; cookies
 * are set for both and the origin-checked stories use the localhost one.
 */
function loopbackBases() {
  const url = new URL(BASE);
  if (url.hostname === "127.0.0.1") return [BASE, `${url.protocol}//localhost${url.port ? `:${url.port}` : ""}`];
  if (url.hostname === "localhost") return [BASE, `${url.protocol}//127.0.0.1${url.port ? `:${url.port}` : ""}`];
  return [BASE];
}
const SAME_ORIGIN_BASE = () => loopbackBases().find(b => new URL(b).hostname === "localhost") ?? BASE;

const records = [];
async function screenshot(page, name) {
  try { await page.screenshot({ path: join(ARTEFACTS, `${name}.png`), fullPage: false }); } catch { /* evidence only */ }
}

async function story({ group, id, name, viewport, page, monitor, run, observations = [] }) {
  const key = `${group}:${id}:${viewport.id}`;
  const started = Date.now();
  console.log(`  ▶ ${key} — ${name}`);
  let note = "";
  let error = null;
  try {
    note = (await run()) ?? "";
    await sleep(350);
  } catch (caught) {
    error = caught;
  }
  const taken = monitor.take();
  const unexpected = taken.failures;
  const status = !error && unexpected.length === 0 ? "pass" : "fail";
  const detail = error ? (error.message || String(error)) : unexpected.length ? `unexpected: ${unexpected.map(f => `${f.kind} ${f.detail} @ ${f.url}`).join(" | ")}` : note;
  if (status === "fail") await screenshot(page, `FAIL-${group}-${id}-${viewport.id}`);
  records.push({ key, group, id, name, viewport: viewport.id, status, detail, evidenced: taken.evidenced, observations: [...taken.observations, ...observations], ms: Date.now() - started });
  console.log(`    ${status === "pass" ? "✓" : "✗"} ${status === "pass" ? (note || "pass") : detail}`.slice(0, 700));
}

function assert(condition, message) { if (!condition) throw new Error(message); }
function pathOf(page) { const u = new URL(page.url()); return u.pathname + u.search; }
async function api(page, method, path, body) {
  const response = await page.request.fetch(`${BASE}${path}`, { method, headers: body ? { "content-type": "application/json" } : {}, data: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: response.status(), json, text };
}
async function gotoPath(page, path, monitor, expected = [200]) {
  const response = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  const status = response?.status() ?? 0;
  if (!expected.includes(status)) throw new Error(`GET ${path} → HTTP ${status} (final ${pathOf(page)})`);
  return status;
}
async function activeElementInfo(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { tag: "body", label: "", inDialog: false };
    return {
      tag: el.tagName.toLowerCase(),
      label: (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim().slice(0, 80),
      inDialog: Boolean(el.closest("[role=dialog]")),
      id: el.id,
    };
  });
}
async function tabStaysInside(page, presses = 8) {
  const seen = [];
  for (let i = 0; i < presses; i += 1) {
    await page.keyboard.press("Tab");
    const info = await activeElementInfo(page);
    seen.push(info);
    if (!info.inDialog) throw new Error(`focus left the dialog after ${i + 1} Tab press(es): ${info.tag} "${info.label}"`);
  }
  return seen;
}
async function measureOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const main = document.getElementById("main-content");
    return { docScroll: doc.scrollWidth, docClient: doc.clientWidth, mainScroll: main?.scrollWidth ?? null, mainClient: main?.clientWidth ?? null, hasMain: Boolean(main) };
  });
}
function overflowProblem(m) {
  const doc = m.docScroll - m.docClient;
  const main = m.hasMain ? m.mainScroll - m.mainClient : 0;
  if (doc > 1) return `document overflows by ${doc}px`;
  if (main > 1) return `#main-content overflows by ${main}px`;
  return null;
}
function png(size = 16) {
  const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = buf => { let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(body)); return Buffer.concat([len, body, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) { raw[y * (size * 4 + 1)] = 0; for (let x = 0; x < size; x += 1) { const o = y * (size * 4 + 1) + 1 + x * 4; raw[o] = 30 + x * 12; raw[o + 1] = 120; raw[o + 2] = 200 - y * 8; raw[o + 3] = 255; } }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Roles and permission gates
// ─────────────────────────────────────────────────────────────────────────────

async function chromeFacts(page) {
  return page.evaluate(() => ({
    myRadarButtons: document.querySelectorAll('button[title="My Radar"]').length,
    businessRadarButtons: document.querySelectorAll('button[title="Business Radar"]').length,
    myRadarLinks: document.querySelectorAll('a[href="/portal/agency/my-radar"]').length,
    toolsLinks: document.querySelectorAll('a[href="/portal/agency/tools"]').length,
    settingsLinks: document.querySelectorAll('a[href="/portal/agency/settings"]').length,
    fulfilmentLinks: document.querySelectorAll('a[href="/portal/agency/fulfilment"]').length,
    inboxLinks: document.querySelectorAll('a[href="/portal/agency/inbox"]').length,
    actionsLinks: document.querySelectorAll('a[href="/portal/agency/actions"]').length,
    calendarLinks: document.querySelectorAll('a[href="/portal/agency/calendar"]').length,
    main: Boolean(document.getElementById("main-content")),
  }));
}

async function runRoleStories(browser, viewport) {
  const persona = async (name, run) => {
    const { context, page, monitor } = await openContext(browser, viewport, name);
    try { return await run(page, monitor); } finally { await context.close(); }
  };
  const S = id => ROLE_STORIES.find(s => s.id === id);

  await persona("owner", (page, monitor) => story({ group: "roles", ...S("R1"), viewport, page, monitor, run: async () => {
    await gotoPath(page, "/portal", monitor);
    assert(pathOf(page).startsWith("/portal/agency"), `owner landed on ${pathOf(page)}`);
    const facts = await chromeFacts(page);
    assert(facts.main, "no #main-content on the Command Centre");
    assert(facts.myRadarButtons >= 1, "owner has no My Radar topbar control");
    assert(facts.businessRadarButtons >= 1, "owner has no Business Radar topbar control");
    assert(facts.myRadarLinks >= 1, "owner sidebar has no My Radar row");
    assert(facts.toolsLinks >= 1, "owner sidebar has no Tools row");
    return `landed ${pathOf(page)}; My Radar ×${facts.myRadarButtons}, Business Radar ×${facts.businessRadarButtons}, sidebar my-radar ×${facts.myRadarLinks}, tools ×${facts.toolsLinks}`;
  } }));

  await persona("manager", (page, monitor) => story({ group: "roles", ...S("R2"), viewport, page, monitor, run: async () => {
    await gotoPath(page, "/portal", monitor);
    assert(pathOf(page).startsWith("/portal/agency"), `manager landed on ${pathOf(page)}`);
    const facts = await chromeFacts(page);
    assert(facts.myRadarButtons >= 1, "manager has no My Radar control");
    assert(facts.businessRadarButtons >= 1, "un-migrated manager lost the Business Radar control");
    const calendar = await api(page, "GET", "/api/portal/calendar");
    assert(calendar.status === 200, `manager calendar API → ${calendar.status}`);
    return `landed ${pathOf(page)}; both radar controls present; calendar API 200 with ${calendar.json?.entries?.length ?? 0} entries`;
  } }));

  await persona("staff", (page, monitor) => story({ group: "roles", ...S("R3"), viewport, page, monitor, run: async () => {
    await gotoPath(page, "/portal", monitor);
    assert(pathOf(page).startsWith("/portal/team"), `sales-seat staff landed on ${pathOf(page)}`);
    const team = await chromeFacts(page);
    assert(team.businessRadarButtons === 0, "staff sees a Business Radar topbar control");
    assert(team.myRadarLinks >= 1, "staff navigation has no My Radar row");
    await gotoPath(page, "/portal/agency/my-radar", monitor);
    assert(pathOf(page) === "/portal/agency/my-radar", `my-radar sent staff to ${pathOf(page)}`);
    await page.locator('section[aria-label="My Radar — personal view"]').waitFor();
    const businessLinks = await page.locator('section[aria-label="My Radar — personal view"] a[href="/portal/agency/radar"]').count();
    assert(businessLinks === 0, "staff My Radar links to the Business Radar");
    await gotoPath(page, "/portal/agency/calendar", monitor);
    assert(pathOf(page) === "/portal/agency/calendar", `calendar sent staff to ${pathOf(page)}`);
    await page.getByRole("heading", { level: 1, name: /Calendar/ }).waitFor();
    const refusal = monitor.expectStatus("/portal/agency/radar/workload", [403, 404]);
    await page.goto(`${BASE}/portal/agency/radar/workload`, { waitUntil: "domcontentloaded" }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    const workloadHeadings = await page.getByRole("heading", { name: "Department workload" }).count();
    assert(workloadHeadings === 0, `staff reached Department workload at ${pathOf(page)}`);
    refusal();
    const commandRefusal = monitor.expectStatus("/portal/agency", [403, 404]);
    await page.goto(`${BASE}/portal/agency`, { waitUntil: "domcontentloaded" }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    const command = pathOf(page);
    const businessHeading = await page.locator("#business-radar-heading, #executive-radar-heading").count()
      + await page.getByRole("heading", { name: /Radar inspection/ }).count();
    assert(businessHeading === 0, `staff rendered the Business Radar at ${command}`);
    commandRefusal();
    return `landed /portal/team; My Radar OK without business link; Calendar OK; workload refused (landed ${pathOf(page)}); /portal/agency → ${command}`;
  } }));

  await persona("staffLocked", (page, monitor) => story({ group: "roles", ...S("R4"), viewport, page, monitor, run: async () => {
    await gotoPath(page, "/portal/agency/calendar", monitor);
    assert(pathOf(page).includes("notice=calendar-required"), `un-granted staff calendar landed on ${pathOf(page)}`);
    const calendarApi = monitor.expectStatus("/api/portal/calendar", [403]);
    const refused = await api(page, "GET", "/api/portal/calendar");
    calendarApi();
    assert(refused.status === 403, `un-granted staff calendar API → ${refused.status}`);
    await gotoPath(page, "/portal/agency/my-radar", monitor);
    const legacy = pathOf(page);
    return `calendar → ${legacy.includes("notice") ? "" : ""}permissions notice (calendar-required); API 403; my-radar → ${legacy} (legacy my-day station keeps the personal view)`;
  } }));

  await persona("clientOwner", (page, monitor) => story({ group: "roles", ...S("R5"), viewport, page, monitor, run: async () => {
    await gotoPath(page, "/portal", monitor);
    assert(pathOf(page).startsWith("/portal/customer"), `client-owner landed on ${pathOf(page)}`);
    const account = page.locator('button[aria-label^="Account for"]').first();
    let roleLabel = "(account menu not rendered)";
    if (await account.count()) {
      await account.click();
      await page.getByText("Client owner", { exact: true }).first().waitFor({ timeout: 8_000 });
      roleLabel = "Client owner";
      await page.keyboard.press("Escape");
    }
    const agencyRefusal = monitor.expectStatus("/portal/agency", [403, 404]);
    await page.goto(`${BASE}/portal/agency/my-radar`, { waitUntil: "domcontentloaded" }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    const personal = await page.locator('section[aria-label="My Radar — personal view"]').count();
    assert(personal === 0, `client-owner rendered My Radar at ${pathOf(page)}`);
    agencyRefusal();
    const apiRefusal = monitor.expectStatus("/api/portal/", [401, 403]);
    const calendar = await api(page, "GET", "/api/portal/calendar");
    const layout = await api(page, "GET", "/api/portal/chrome/layout");
    apiRefusal();
    assert([401, 403].includes(calendar.status), `client-owner calendar API → ${calendar.status}`);
    return `landed ${pathOf(page).split("?")[0]}; profile menu "${roleLabel}"; my-radar refused (landed ${pathOf(page)}); calendar API ${calendar.status}; chrome layout API ${layout.status}`;
  } }));

  await persona("endCustomer", (page, monitor) => story({ group: "roles", ...S("R6"), viewport, page, monitor, run: async () => {
    await gotoPath(page, "/portal", monitor);
    assert(pathOf(page).startsWith("/portal/customer"), `end-customer landed on ${pathOf(page)}`);
    const apiRefusal = monitor.expectStatus("/api/portal/", [401, 403]);
    const calendar = await api(page, "GET", "/api/portal/calendar");
    const tasks = await api(page, "GET", "/api/portal/tasks");
    apiRefusal();
    assert([401, 403].includes(calendar.status), `end-customer calendar API → ${calendar.status}`);
    assert([401, 403].includes(tasks.status), `end-customer tasks API → ${tasks.status}`);
    return `landed ${pathOf(page).split("?")[0]}; calendar API ${calendar.status}; tasks API ${tasks.status}`;
  } }));

  await persona(null, (page, monitor) => story({ group: "roles", ...S("R7"), viewport, page, monitor, run: async () => {
    await gotoPath(page, "/portal/agency/my-radar", monitor);
    assert(pathOf(page).startsWith("/login"), `anonymous my-radar landed on ${pathOf(page)}`);
    const refusal = monitor.expectStatus("/api/portal/", [401]);
    const calendar = await api(page, "GET", "/api/portal/calendar");
    const layout = await api(page, "GET", "/api/portal/chrome/layout");
    const created = await api(page, "POST", "/api/portal/calendar", { type: "event", title: "anon", startsAt: Date.now() });
    refusal();
    assert(calendar.status === 401 && layout.status === 401 && created.status === 401, `anonymous APIs → ${calendar.status}/${layout.status}/${created.status}`);
    return `my-radar → ${pathOf(page).split("?")[0]}; calendar GET 401, chrome layout GET 401, calendar POST 401`;
  } }));

  await persona("staffNarrow", (page, monitor) => story({ group: "roles", ...S("R9"), viewport, page, monitor, run: async () => {
    assert(SEED.users.staffNarrow, "seed has no staffNarrow persona (reseed with the narrow seat)");
    await gotoPath(page, "/portal/agency/my-radar", monitor);
    assert(pathOf(page).includes("notice=staff-overview-required"), `narrow seat my-radar landed on ${pathOf(page)}`);
    await gotoPath(page, "/portal/agency/calendar", monitor);
    assert(pathOf(page).includes("notice=calendar-required"), `narrow seat calendar landed on ${pathOf(page)}`);
    await gotoPath(page, "/portal", monitor);
    const facts = await chromeFacts(page);
    assert(facts.myRadarLinks === 0, "narrow seat still has a My Radar navigation row");
    assert(facts.businessRadarButtons === 0, "narrow seat has a Business Radar control");
    const refusal = monitor.expectStatus("/api/portal/calendar", [403]);
    const calendar = await api(page, "GET", "/api/portal/calendar");
    refusal();
    assert(calendar.status === 403, `narrow seat calendar API → ${calendar.status}`);
    return `my-radar → permissions notice (staff-overview-required); calendar → permissions notice (calendar-required); landed ${pathOf(page)} with no My Radar row; calendar API 403`;
  } }));

  // R8 — the API contract per persona, driven through each persona's own context.
  {
    const results = [];
    const ids = SEED.calendar;
    const owner = await openContext(browser, viewport, "owner");
    const staff = await openContext(browser, viewport, "staff");
    try {
      await story({ group: "roles", ...S("R8"), viewport, page: staff.page, monitor: staff.monitor, run: async () => {
        const ownerList = await api(owner.page, "GET", "/api/portal/calendar");
        const ownerIds = new Set((ownerList.json?.entries ?? []).map(e => e.id));
        assert(ownerIds.has(ids.kickoff) && ownerIds.has(ids.ownerPrivate), "owner does not see their own items");
        assert(!ownerIds.has(ids.samPrivate), "owner sees the staff member's private item");
        const staffList = await api(staff.page, "GET", "/api/portal/calendar");
        assert(staffList.status === 200, `staff calendar GET → ${staffList.status}`);
        const staffEntries = staffList.json?.entries ?? [];
        const staffIds = new Set(staffEntries.map(e => e.id));
        assert(staffIds.has(ids.kickoff), "staff participant does not see the shared item");
        assert(staffIds.has(ids.samPrivate), "staff does not see their own item");
        assert(!staffIds.has(ids.ownerPrivate), "staff sees the owner's private item");
        const shared = staffEntries.find(e => e.id === ids.kickoff);
        assert(shared.participantUserIds?.includes(SEED.users.staff.id) && shared.clientId === SEED.clients.a.id && shared.linkedTaskIds?.includes(SEED.tasks.proposal) && shared.documents?.length === 1 && shared.customFields?.length === 1, `shared item lost its links: ${JSON.stringify(shared).slice(0, 300)}`);
        const refusals = staff.monitor.expectStatus("/api/portal/calendar", [403, 404]);
        const notOwner = await api(staff.page, "PATCH", "/api/portal/calendar", { id: ids.kickoff, title: "hijacked" });
        assert(notOwner.status === 404, `staff editing the owner's item → ${notOwner.status}`);
        const hiddenTask = await api(staff.page, "POST", "/api/portal/calendar", { type: "event", title: `link-hidden-${RUN}`, startsAt: Date.now() + 3_600_000, linkedTaskIds: [SEED.tasks.other] });
        assert(hiddenTask.status === 403, `staff linking another client's task → ${hiddenTask.status}`);
        const people = await api(staff.page, "POST", "/api/portal/calendar", { type: "event", title: `people-${RUN}`, startsAt: Date.now() + 3_600_000, participantUserIds: [SEED.users.owner.id] });
        assert(people.status === 403, `staff naming another person without staff.people → ${people.status}`);
        refusals();
        const own = await api(staff.page, "POST", "/api/portal/calendar", { type: "reminder", title: `own-${RUN}`, startsAt: Date.now() + 7_200_000, linkedTaskIds: [SEED.tasks.hosting], participantUserIds: [SEED.users.staff.id] });
        assert(own.status === 201, `staff creating their own linked item → ${own.status} ${own.text.slice(0, 200)}`);
        const removed = await api(staff.page, "DELETE", `/api/portal/calendar?id=${own.json.entry.id}`);
        assert(removed.status === 200, `staff deleting their own item → ${removed.status}`);
        results.push(`owner sees ${ownerIds.size} (not staff-private), staff sees ${staffIds.size} (shared+own, not owner-private), PATCH other's 404, hidden task 403, other person 403, own linked 201/DELETE 200`);
        return results.join("; ");
      } });
    } finally { await owner.context.close(); await staff.context.close(); }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Radar split
// ─────────────────────────────────────────────────────────────────────────────

async function openTopbarDialog(page, title, dialogLabel) {
  const button = page.locator(`button[title="${title}"]`).first();
  if (!(await button.count())) throw new Error(`no ${title} control in the DOM`);
  if (!(await button.isVisible())) return null;
  await button.click();
  const dialog = page.locator(`[role="dialog"][aria-label="${dialogLabel}"]`).first();
  await dialog.waitFor({ timeout: 10_000 });
  return { button, dialog };
}

// The two topbar quick looks are NON-modal popovers (role="dialog" without
// aria-modal): they close on Escape and on an outside click, and Tab may leave
// them. Their keyboard contract is therefore: Escape from inside closes the
// popover and hands focus back to the trigger. How far Tab travels inside is
// recorded, not judged.
async function popoverContract(page, button, dialog, presses = 6) {
  const label = await button.getAttribute("aria-label");
  const title = await button.getAttribute("title");
  await sleep(200);
  let inside = 0;
  for (let i = 0; i < presses; i += 1) {
    await page.keyboard.press("Tab");
    const info = await activeElementInfo(page);
    if (!info.inDialog) break;
    inside += 1;
  }
  // Escape is judged from inside the popover: move focus back onto its first control.
  const firstControl = dialog.locator("a[href], button").first();
  if (await firstControl.count()) await firstControl.focus();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden", timeout: 5_000 });
  const after = await activeElementInfo(page);
  const restored = after.label === label || after.label === title;
  return { walk: inside, restored, after: after.label };
}

async function runRadarStories(browser, viewport) {
  const S = id => RADAR_STORIES.find(s => s.id === id);
  const persona = async (name, run) => {
    const { context, page, monitor } = await openContext(browser, viewport, name);
    try { return await run(page, monitor); } finally { await context.close(); }
  };

  await persona("owner", (page, monitor) => story({ group: "radar", ...S("D1"), viewport, page, monitor, run: async () => {
    await gotoPath(page, "/portal/agency", monitor);
    const opened = await openTopbarDialog(page, "My Radar", "My Radar");
    if (!opened) return `N/A at ${viewport.id}: the My Radar control is in the DOM but not visible at this width (mobile nesting); the page is exercised in D3`;
    const { button, dialog } = opened;
    await dialog.locator('a[href="/portal/agency/my-radar"]').first().waitFor({ timeout: 15_000 });
    const business = await dialog.locator('a[href="/portal/agency/radar"]').count();
    assert(business >= 1, "owner's My Radar dialog has no Business Radar link");
    const contract = await popoverContract(page, button, dialog);
    assert(contract.restored, `focus not restored to the My Radar control (now on "${contract.after}")`);
    return `popover opened; personal link + Business Radar link present; Tab stayed inside for ${contract.walk} press(es) (non-modal, recorded); Escape closed and returned focus to the control`;
  } }));

  await persona("owner", (page, monitor) => story({ group: "radar", ...S("D2"), viewport, page, monitor, run: async () => {
    await gotoPath(page, "/portal/agency", monitor);
    const opened = await openTopbarDialog(page, "Business Radar", "Business Radar quick look");
    if (!opened) return `N/A at ${viewport.id}: the Business Radar control is in the DOM but not visible at this width; the inspector page is exercised in D3`;
    const { button, dialog } = opened;
    const contract = await popoverContract(page, button, dialog);
    assert(contract.restored, `focus not restored to the Business Radar control (now on "${contract.after}")`);
    return `Business Radar quick look opened; Tab stayed inside for ${contract.walk} press(es) (non-modal, recorded); Escape closed and returned focus to the control`;
  } }));

  await persona("owner", (page, monitor) => story({ group: "radar", ...S("D3"), viewport, page, monitor, run: async () => {
    await gotoPath(page, "/portal/agency/my-radar", monitor);
    const section = page.locator('section[aria-label="My Radar — personal view"]');
    await section.waitFor();
    await page.getByRole("heading", { name: "Your actions, goals, wellbeing and pace" }).waitFor();
    assert((await section.locator('a[href="/portal/agency/radar"]').count()) >= 1, "owner's My Radar page has no Business Radar link");
    await gotoPath(page, "/portal/agency/radar", monitor);
    assert(pathOf(page).startsWith("/portal/agency?station=radar-inspector"), `/radar landed on ${pathOf(page)}`);
    await page.getByRole("heading", { name: /Radar inspection|Data inspector/ }).first().waitFor({ timeout: 20_000 });
    await gotoPath(page, "/portal/agency/radar/workload", monitor);
    await page.getByRole("heading", { level: 1, name: "Department workload" }).waitFor();
    return "my-radar personal view with business link; /radar → Command Centre radar-inspector station (Radar inspection); workload page renders";
  } }));

  await persona("staff", (page, monitor) => story({ group: "radar", ...S("D4"), viewport, page, monitor, run: async () => {
    await gotoPath(page, "/portal/agency/my-radar", monitor);
    const section = page.locator('section[aria-label="My Radar — personal view"]');
    await section.waitFor();
    const facts = await chromeFacts(page);
    assert(facts.businessRadarButtons === 0, "staff page carries a Business Radar control");
    assert((await section.locator('a[href="/portal/agency/radar"]').count()) === 0, "staff My Radar links to the Business Radar");
    let dialogNote = "My Radar control not visible at this width";
    const opened = await openTopbarDialog(page, "My Radar", "My Radar").catch(() => null);
    if (opened) {
      const business = await opened.dialog.locator('a[href="/portal/agency/radar"]').count();
      assert(business === 0, "staff My Radar dialog links to the Business Radar");
      await page.keyboard.press("Escape");
      dialogNote = "My Radar dialog has no Business Radar link";
    }
    const refusal = monitor.expectStatus("/portal/agency/radar/workload", [403, 404]);
    await page.goto(`${BASE}/portal/agency/radar/workload`, { waitUntil: "domcontentloaded" }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    assert((await page.getByRole("heading", { name: "Department workload" }).count()) === 0, "staff reached Department workload");
    refusal();
    return `personal view only; no Business Radar control/link; ${dialogNote}; workload refused (${pathOf(page)})`;
  } }));

  await persona("manager", (page, monitor) => story({ group: "radar", ...S("D5"), viewport, page, monitor, run: async () => {
    await gotoPath(page, "/portal/agency/my-radar", monitor);
    const section = page.locator('section[aria-label="My Radar — personal view"]');
    await section.waitFor();
    assert((await section.locator('a[href="/portal/agency/radar"]').count()) >= 1, "manager's My Radar has no Business Radar link");
    await gotoPath(page, "/portal/agency/radar/workload", monitor);
    await page.getByRole("heading", { level: 1, name: "Department workload" }).waitFor();
    return "manager: personal view links to Business Radar; workload renders";
  } }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendar linked records
// ─────────────────────────────────────────────────────────────────────────────

function dayOfEntry(startsAt) { return new Date(startsAt); }

async function selectDay(page, date) {
  const dayNumber = String(date.getDate());
  const button = page.locator('button.mm-actions-calendar-day[data-current-month="true"]').filter({ has: page.locator("span.mm-actions-calendar-date", { hasText: new RegExp(`^${dayNumber}$`) }) }).first();
  await button.waitFor({ timeout: 15_000 });
  await button.click();
  const aside = page.locator("aside.mm-calendar-day-inspector");
  await aside.waitFor();
  return aside;
}

async function goToMonthOf(page, date) {
  // The calendar opens on the current month; the seeded items sit within it
  // unless today is the last day of a month, in which case one step forward.
  const monthLabel = date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  for (let i = 0; i < 2; i += 1) {
    if ((await page.getByText(monthLabel, { exact: false }).count()) > 0) return;
    const next = page.locator("div.mm-actions-calendar-toolbar button").nth(3);
    if (await next.count()) await next.click();
    await sleep(300);
  }
}

// A day row carries two buttons: the icon-only complete/reopen toggle (whose
// accessible name also contains the title) and the text button that opens the
// editor. Match on visible text so the toggle is never mistaken for the opener.
function rowOpener(aside, title) {
  return aside.locator("button").filter({ hasText: title }).first();
}

async function openEditorFor(page, aside, title) {
  const opener = rowOpener(aside, title);
  await opener.waitFor({ timeout: 10_000 });
  await opener.click();
  const dialog = page.locator('form[role="dialog"]');
  return { opener, dialog };
}

async function runCalendarStories(browser, viewport) {
  const S = id => CALENDAR_STORIES.find(s => s.id === id);
  const kickoffDate = dayOfEntry(SEED.calendar.kickoffStartsAt);
  const createdTitle = `Acceptance custom record ${RUN}-${viewport.id}`;
  let createdId = null;

  const owner = await openContext(browser, viewport, "owner");
  try {
    const { page, monitor } = owner;
    await story({ group: "calendar", ...S("C1"), viewport, page, monitor, run: async () => {
      await gotoPath(page, "/portal/agency/calendar", monitor);
      await goToMonthOf(page, kickoffDate);
      const aside = await selectDay(page, kickoffDate);
      const { opener, dialog } = await openEditorFor(page, aside, "Kickoff with Acceptance Client");
      await dialog.waitFor();
      await dialog.getByRole("heading", { name: "Edit plotted item" }).waitFor();
      const sam = dialog.locator("label", { hasText: "Sam Taylor" }).locator('input[type="checkbox"]');
      assert(await sam.isChecked(), "Sam Taylor is not shown as a participant");
      const client = dialog.locator("label", { hasText: "Client" }).locator("select").first();
      assert((await client.inputValue()) === SEED.clients.a.id, `client select shows ${await client.inputValue()}`);
      await dialog.getByText("Prepare proposal for Acceptance Client").first().waitFor();
      await dialog.locator('a[href="/portal/agency/agency-finance"]', { hasText: "Proposal draft" }).waitFor();
      assert((await dialog.locator('input[aria-label="Custom field 1 name"]').inputValue()) === "Room", "custom field name missing");
      assert((await dialog.locator('input[aria-label="Room value"]').inputValue()) === "Boardroom 2", "custom field value missing");
      const walk = await tabStaysInside(page, 8);
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      const after = await activeElementInfo(page);
      const restored = /Kickoff with Acceptance Client/.test(after.label);
      return `editor shows participant, client, linked task, document, custom field; ${walk.length} Tab presses stayed inside; Escape closed; focus ${restored ? "restored to the item" : `on "${after.label}"`}`;
    } });

    await story({ group: "calendar", ...S("C2"), viewport, page, monitor, run: async () => {
      await gotoPath(page, "/portal/agency/calendar", monitor);
      await goToMonthOf(page, kickoffDate);
      const aside = await selectDay(page, kickoffDate);
      await aside.getByRole("button", { name: "Add to selected day" }).click();
      const dialog = page.locator('form[role="dialog"]');
      await dialog.getByRole("heading", { name: "Add to the plan" }).waitFor();
      await dialog.locator('select[name="type"]').selectOption("custom");
      await dialog.locator('input[name="title"]').fill(createdTitle);
      await dialog.locator("label", { hasText: "Sam Taylor" }).click();
      await dialog.locator("label", { hasText: "Client" }).locator("select").first().selectOption(SEED.clients.b.id);
      await dialog.locator("label", { hasText: "Link tasks" }).locator("select").selectOption(SEED.tasks.other);
      await dialog.getByText("Other client quarterly audit").first().waitFor();
      const docs = dialog.locator("fieldset", { has: page.locator("legend", { hasText: "Documents and links" }) });
      await docs.locator("label", { hasText: "Name" }).locator("input").fill("Brief");
      await docs.locator("label", { hasText: "Document URL" }).locator("input").fill("https://example.test/brief");
      await docs.getByRole("button", { name: /^Add/ }).click();
      await docs.locator("a", { hasText: "Brief" }).waitFor();
      await dialog.getByRole("button", { name: "Add custom field" }).click();
      await dialog.locator('input[aria-label="Custom field 1 name"]').fill("Priority");
      await dialog.locator('input[aria-label="Priority value"]').fill("High");
      const [response] = await Promise.all([
        page.waitForResponse(r => r.url().includes("/api/portal/calendar") && r.request().method() === "POST", { timeout: 20_000 }),
        dialog.getByRole("button", { name: "Save to calendar" }).click(),
      ]);
      assert(response.status() === 201, `POST /api/portal/calendar → ${response.status()}`);
      const body = await response.json();
      createdId = body.entry.id;
      await dialog.waitFor({ state: "hidden" });
      await rowOpener(aside, createdTitle).waitFor();
      const server = await api(page, "GET", "/api/portal/calendar");
      const saved = (server.json?.entries ?? []).find(e => e.id === createdId);
      assert(saved && saved.type === "custom" && saved.participantUserIds?.includes(SEED.users.staff.id) && saved.clientId === SEED.clients.b.id && saved.linkedTaskIds?.includes(SEED.tasks.other) && saved.documents?.[0]?.label === "Brief" && saved.customFields?.[0]?.label === "Priority" && saved.customFields?.[0]?.value === "High", `server record incomplete: ${JSON.stringify(saved).slice(0, 400)}`);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
      await goToMonthOf(page, kickoffDate);
      const again = await selectDay(page, kickoffDate);
      await rowOpener(again, createdTitle).waitFor();
      return `custom item ${createdId} created with participant, client B, linked task, document, custom field; persisted and shown after reload`;
    } });

    await story({ group: "calendar", ...S("C3"), viewport, page, monitor, run: async () => {
      assert(createdId, "C2 did not create an item");
      await gotoPath(page, "/portal/agency/calendar", monitor);
      await goToMonthOf(page, kickoffDate);
      const aside = await selectDay(page, kickoffDate);
      const { dialog } = await openEditorFor(page, aside, createdTitle);
      await dialog.getByRole("heading", { name: "Edit plotted item" }).waitFor();
      const title = dialog.locator('input[name="title"]');
      await title.fill(`${createdTitle} edited`);
      const fault = monitor.expect("injected 500 on PATCH", e => e.url.includes("/api/portal/calendar") && ((e.kind === "http" && e.status === 500) || (e.kind === "console" && e.detail.includes("500"))));
      await page.route("**/api/portal/calendar", async route => {
        if (route.request().method() === "PATCH") await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Injected failure." }) });
        else await route.continue();
      });
      await dialog.getByRole("button", { name: "Save to calendar" }).click();
      await dialog.locator('p[role="alert"]').waitFor({ timeout: 10_000 });
      assert(await dialog.isVisible(), "dialog closed after a refused save");
      assert((await title.inputValue()) === `${createdTitle} edited`, "typed title was lost");
      const stale = (await api(page, "GET", "/api/portal/calendar")).json.entries.find(e => e.id === createdId);
      assert(stale.title === createdTitle, "server changed despite the refused save");
      await page.unrouteAll({ behavior: "ignoreErrors" });
      fault();
      const [response] = await Promise.all([
        page.waitForResponse(r => r.url().includes("/api/portal/calendar") && r.request().method() === "PATCH", { timeout: 20_000 }),
        dialog.getByRole("button", { name: "Save to calendar" }).click(),
      ]);
      assert(response.status() === 200, `retry PATCH → ${response.status()}`);
      await dialog.waitFor({ state: "hidden" });
      const fresh = (await api(page, "GET", "/api/portal/calendar")).json.entries.find(e => e.id === createdId);
      assert(fresh.title === `${createdTitle} edited`, "retry did not persist");
      return "injected 500: alert shown, dialog and typed title retained, server unchanged; retry 200 persisted";
    } });

    await story({ group: "calendar", ...S("C4"), viewport, page, monitor, run: async () => {
      assert(createdId, "C2 did not create an item");
      page.once("dialog", d => d.accept());
      await gotoPath(page, "/portal/agency/calendar", monitor);
      await goToMonthOf(page, kickoffDate);
      const aside = await selectDay(page, kickoffDate);
      const { dialog } = await openEditorFor(page, aside, `${createdTitle} edited`);
      await dialog.getByRole("heading", { name: "Edit plotted item" }).waitFor();
      const [response] = await Promise.all([
        page.waitForResponse(r => r.url().includes("/api/portal/calendar") && r.request().method() === "DELETE", { timeout: 20_000 }),
        dialog.getByRole("button", { name: "Delete" }).click(),
      ]);
      assert(response.status() === 200, `DELETE → ${response.status()}`);
      await dialog.waitFor({ state: "hidden" });
      const gone = !(await api(page, "GET", "/api/portal/calendar")).json.entries.some(e => e.id === createdId);
      assert(gone, "item still on the server after delete");
      assert((await aside.locator("button").filter({ hasText: createdTitle }).count()) === 0, "item still listed after delete");
      return "deleted through the editor; server and day list agree";
    } });
  } finally { await owner.context.close(); }

  const staff = await openContext(browser, viewport, "staff");
  try {
    const { page, monitor } = staff;
    await story({ group: "calendar", ...S("C5"), viewport, page, monitor, run: async () => {
      await gotoPath(page, "/portal/agency/calendar", monitor);
      await goToMonthOf(page, kickoffDate);
      const aside = await selectDay(page, kickoffDate);
      const shared = aside.getByText("Kickoff with Acceptance Client", { exact: true }).first();
      await shared.waitFor();
      assert((await page.getByText("Owner private review").count()) === 0, "staff sees the owner's private item");
      assert((await rowOpener(aside, "Kickoff with Acceptance Client").count()) === 0, "a participant's shared item is rendered as an opener button");
      await shared.click();
      await sleep(800);
      assert((await page.locator('form[role="dialog"]').count()) === 0, "a participant could open the owner's editor");
      const { dialog } = await openEditorFor(page, aside, "Sam private focus block");
      await dialog.getByRole("heading", { name: "Edit plotted item" }).waitFor();
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      return "shared item listed as a locked row with no opener and no editor, own item editable, owner's private item absent";
    } });
  } finally { await staff.context.close(); }

  const owner2 = await openContext(browser, viewport, "owner");
  try {
    const { page, monitor } = owner2;
    await story({ group: "calendar", ...S("C6"), viewport, page, monitor, run: async () => {
      await gotoPath(page, "/portal/agency/calendar", monitor);
      await goToMonthOf(page, kickoffDate);
      const aside = await selectDay(page, kickoffDate);
      await rowOpener(aside, "Kickoff with Acceptance Client").waitFor();
      assert((await page.getByText("Sam private focus block").count()) === 0, "owner sees the staff member's private item");
      return "owner's day shows the shared item and never the staff member's private block";
    } });
  } finally { await owner2.context.close(); }
}

// ─────────────────────────────────────────────────────────────────────────────
// My Tools folders and icons
// ─────────────────────────────────────────────────────────────────────────────

async function layoutRecord(page) {
  const r = await api(page, "GET", "/api/portal/chrome/layout");
  assert(r.status === 200, `chrome layout GET → ${r.status}`);
  return r.json.layout;
}

async function runToolsStories(browser, viewport) {
  const S = id => TOOLS_STORIES.find(s => s.id === id);
  const toolLabel = `Acceptance Tool ${RUN}-${viewport.id}`;
  const folderName = `Acceptance Folder ${RUN}-${viewport.id}`;
  const renamed = `${folderName} renamed`;
  let toolId = null; let folderId = null;
  const { context, page, monitor } = await openContext(browser, viewport, "owner");
  const editor = () => page.locator("form", { has: page.locator('[aria-label="Tool editor actions"]') });
  const waitLayoutPut = (action, expected = 200) => Promise.all([
    page.waitForResponse(r => r.url().includes("/api/portal/chrome/layout") && r.request().method() === "PUT", { timeout: 20_000 }),
    action(),
  ]).then(([r]) => { assert(r.status() === expected, `PUT /api/portal/chrome/layout → ${r.status()}`); return r; });
  try {
    await story({ group: "tools", ...S("T1"), viewport, page, monitor, run: async () => {
      await gotoPath(page, "/portal/agency/tools", monitor);
      await page.getByRole("button", { name: "Add a tool" }).click();
      const form = editor();
      await form.waitFor();
      await form.getByLabel("Name").fill(toolLabel);
      await form.getByLabel("Web address").fill(`https://example.test/tools/${RUN}`);
      await form.getByLabel("Description").fill("Used to prove the palette on the release lane.");
      const iconSelect = form.locator("select").nth(1);
      const options = await iconSelect.locator("option").evaluateAll(list => list.map(o => o.value).filter(Boolean));
      await iconSelect.selectOption(options[1] ?? options[0]);
      await waitLayoutPut(() => form.getByRole("button", { name: "Add to palette" }).click());
      await page.locator("a.mm-tool-card", { hasText: toolLabel }).waitFor();
      const layout = await layoutRecord(page);
      const saved = layout.savedTools.find(t => t.label === toolLabel);
      assert(saved && saved.url === `https://example.test/tools/${RUN}` && saved.icon === (options[1] ?? options[0]), `saved tool mismatch: ${JSON.stringify(saved)}`);
      toolId = saved.id;
      return `tool ${toolId} saved with icon "${saved.icon}"; card rendered`;
    } });

    await story({ group: "tools", ...S("T2"), viewport, page, monitor, run: async () => {
      assert(toolId, "T1 did not create a tool");
      await page.getByRole("button", { name: "New folder" }).click();
      await page.locator('input[placeholder="Design tools"]').fill(folderName);
      await waitLayoutPut(() => page.getByRole("button", { name: "Add folder" }).click());
      const filter = page.locator('[aria-label="Filter tools by folder"]');
      await filter.getByRole("button", { name: new RegExp(folderName) }).waitFor();
      let layout = await layoutRecord(page);
      folderId = layout.savedToolFolders.find(f => f.name === folderName)?.id;
      assert(folderId, "folder not saved");
      await filter.locator("button").first().click();
      await page.getByRole("button", { name: `Edit ${toolLabel}` }).click();
      const form = editor();
      await form.waitFor();
      await form.getByLabel("Folder").selectOption(folderId);
      await waitLayoutPut(() => form.getByRole("button", { name: "Save changes" }).click());
      layout = await layoutRecord(page);
      assert(layout.savedTools.find(t => t.id === toolId)?.folderId === folderId, "tool not filed into the folder");
      await filter.getByRole("button", { name: new RegExp(folderName) }).click();
      await page.locator("a.mm-tool-card", { hasText: toolLabel }).waitFor();
      await filter.getByRole("button", { name: /^Unfiled/ }).click();
      await sleep(300);
      assert((await page.locator("a.mm-tool-card", { hasText: toolLabel }).count()) === 0, "filed tool still shows under Unfiled");
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
      await page.locator('[aria-label="Filter tools by folder"]').getByRole("button", { name: new RegExp(folderName) }).click();
      await page.locator("a.mm-tool-card", { hasText: toolLabel }).waitFor();
      return `folder ${folderId} created; tool filed; folder filter shows it, Unfiled hides it; survives reload`;
    } });

    await story({ group: "tools", ...S("T3"), viewport, page, monitor, run: async () => {
      assert(toolId, "T1 did not create a tool");
      await page.locator('[aria-label="Filter tools by folder"] button').first().click();
      await page.getByRole("button", { name: `Edit ${toolLabel}` }).click();
      const form = editor();
      await form.waitFor();
      const upload = page.waitForResponse(r => r.url().includes(`/api/portal/chrome/tools/${toolId}/icon`) && r.request().method() === "POST", { timeout: 30_000 }).catch(() => null);
      await form.locator('input[type="file"]').setInputFiles({ name: "acceptance-icon.png", mimeType: "image/png", buffer: png(64) });
      const uploaded = await upload;
      let layout;
      if (uploaded) {
        assert([200, 201].includes(uploaded.status()), `icon POST → ${uploaded.status()}`);
      }
      const providerRefusal = monitor.expect("private-upload provider absent on this lane", e => e.url.includes(`/api/portal/chrome/tools/${toolId}/icon`) && (e.kind === "http" || e.kind === "console"));
      await waitLayoutPut(() => form.getByRole("button", { name: "Save changes" }).click()).catch(() => undefined);
      for (let i = 0; i < 20; i += 1) {
        layout = await layoutRecord(page);
        if (layout.savedTools.find(t => t.id === toolId)?.iconAsset) break;
        const refused = await page.getByText("Private file storage is not connected", { exact: false }).count();
        if (refused) break;
        await sleep(500);
      }
      const asset = layout.savedTools.find(t => t.id === toolId)?.iconAsset;
      if (!asset) {
        // Under NODE_ENV=production the icon route accepts bytes only through the
        // Supabase private bucket (`privateUploadStorage.ts`); the lane has no
        // provider, so the documented refusal is what this build can prove: it is
        // announced, the editor keeps the prepared icon, and nothing half-saved
        // reaches the record. Upload/read/replace/race/delete bytes are proven by
        // `smoke-my-tools-icon-route` on the file backend.
        const refusal = page.getByText("Private file storage is not connected", { exact: false });
        assert((await refusal.count()) > 0, "no iconAsset on the saved tool after upload, and no provider refusal was announced");
        assert(await form.isVisible(), "the editor closed on a refused upload");
        assert((await form.getByRole("button", { name: /Undo new icon/ }).count()) > 0, "the prepared icon was discarded on refusal");
        await form.getByRole("button", { name: /Undo new icon/ }).click();
        await waitLayoutPut(() => form.getByRole("button", { name: "Save changes" }).click()).catch(() => undefined);
        providerRefusal();
        return "N/A on a production lane without a private-upload provider: upload refused with \"Private file storage is not connected…\", announced in the editor, prepared icon kept until undone, no iconAsset written (fail-closed); bytes are proven by smoke-my-tools-icon-route";
      }
      providerRefusal();
      const icon = await page.request.get(`${BASE}/api/portal/chrome/tools/${toolId}/icon?v=${asset.uploadedAt}`);
      assert(icon.status() === 200 && /^image\//.test(icon.headers()["content-type"] ?? ""), `icon route → ${icon.status()} ${icon.headers()["content-type"]}`);
      const cacheControl = icon.headers()["cache-control"] ?? "";
      return `icon uploaded (${asset.contentType}, ${asset.size} bytes, ${asset.storageProvider}); icon route 200 ${icon.headers()["content-type"]}; cache-control "${cacheControl}"`;
    } });

    await story({ group: "tools", ...S("T4"), viewport, page, monitor, run: async () => {
      assert(folderId, "T2 did not create a folder");
      const filter = page.locator('[aria-label="Filter tools by folder"]');
      await filter.getByRole("button", { name: new RegExp(folderName) }).click();
      const manage = page.locator(`[aria-label="Manage ${folderName} folder"]`);
      await manage.waitFor();
      await manage.getByRole("button", { name: /rename/i }).click();
      const input = page.locator('input[placeholder="Design tools"]');
      await input.fill(renamed);
      await waitLayoutPut(() => page.getByRole("button", { name: "Rename folder" }).click());
      await filter.getByRole("button", { name: new RegExp(renamed) }).waitFor();
      const manageRenamed = page.locator(`[aria-label="Manage ${renamed} folder"]`);
      const deleteButton = manageRenamed.getByRole("button", { name: /delete/i });
      await deleteButton.click();
      const confirm = page.locator('[role="dialog"][aria-modal="true"]', { hasText: `Delete ${renamed}?` });
      await confirm.waitFor();
      const focusedInside = (await activeElementInfo(page)).inDialog;
      const walk = await tabStaysInside(page, 4);
      await page.keyboard.press("Escape");
      await confirm.waitFor({ state: "hidden" });
      const afterCancel = await activeElementInfo(page);
      let layout = await layoutRecord(page);
      assert(layout.savedToolFolders.some(f => f.id === folderId), "Escape deleted the folder");
      await deleteButton.click();
      await confirm.waitFor();
      await waitLayoutPut(() => confirm.getByRole("button", { name: "Delete folder" }).click());
      await confirm.waitFor({ state: "hidden" });
      layout = await layoutRecord(page);
      assert(!layout.savedToolFolders.some(f => f.id === folderId), "folder still saved after delete");
      assert(!layout.savedTools.find(t => t.id === toolId)?.folderId, "tool kept a folderId after its folder was deleted");
      await filter.getByRole("button", { name: /^Unfiled/ }).click();
      await page.locator("a.mm-tool-card", { hasText: toolLabel }).waitFor();
      return `renamed; confirm dialog: initial focus ${focusedInside ? "inside" : "outside"}, ${walk.length} Tab presses stayed inside, Escape cancelled (focus on "${afterCancel.label}"); delete moved the card to Unfiled`;
    } });

    await story({ group: "tools", ...S("T5"), viewport, page, monitor, run: async () => {
      assert(toolId, "T1 did not create a tool");
      await page.locator('[aria-label="Filter tools by folder"] button').first().click();
      await page.getByRole("button", { name: `Edit ${toolLabel}` }).click();
      const form = editor();
      await form.waitFor();
      await form.getByLabel("Description").fill("Description after the refused save.");
      const fault = monitor.expect("injected 503 on PUT", e => e.url.includes("/api/portal/chrome/layout") && ((e.kind === "http" && e.status === 503) || (e.kind === "console" && e.detail.includes("503"))));
      await page.route("**/api/portal/chrome/layout", async route => {
        if (route.request().method() === "PUT") await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Injected outage." }) });
        else await route.continue();
      });
      await form.getByRole("button", { name: "Save changes" }).click();
      await page.locator('[role="alert"]').first().waitFor({ timeout: 10_000 });
      assert(await form.isVisible(), "editor closed after a refused save");
      assert((await form.getByLabel("Description").inputValue()) === "Description after the refused save.", "typed description was lost");
      let layout = await layoutRecord(page);
      assert(layout.savedTools.find(t => t.id === toolId)?.note !== "Description after the refused save.", "server changed despite the refusal");
      await page.unrouteAll({ behavior: "ignoreErrors" });
      fault();
      await waitLayoutPut(() => form.getByRole("button", { name: "Save changes" }).click());
      layout = await layoutRecord(page);
      assert(layout.savedTools.find(t => t.id === toolId)?.note === "Description after the refused save.", "retry did not persist the description");
      return "injected 503: alert, editor and typed work retained, server unchanged; retry persisted";
    } });

    await story({ group: "tools", ...S("T6"), viewport, page, monitor, run: async () => {
      assert(toolId, "T1 did not create a tool");
      await page.locator('[aria-label="Filter tools by folder"] button').first().click();
      await page.getByRole("button", { name: `Remove ${toolLabel}` }).click();
      const confirm = page.locator('[role="dialog"][aria-modal="true"]', { hasText: `Remove ${toolLabel}` });
      await confirm.waitFor();
      await waitLayoutPut(() => confirm.getByRole("button", { name: "Remove tool" }).click());
      await confirm.waitFor({ state: "hidden" });
      const layout = await layoutRecord(page);
      assert(!layout.savedTools.some(t => t.id === toolId), "tool still saved after removal");
      assert((await page.locator("a.mm-tool-card", { hasText: toolLabel }).count()) === 0, "card still rendered after removal");
      const refusal = monitor.expectStatus(`/api/portal/chrome/tools/${toolId}/icon`, [404, 410]);
      const icon = await page.request.get(`${BASE}/api/portal/chrome/tools/${toolId}/icon`);
      refusal();
      return `tool removed; record gone; icon route now ${icon.status()}`;
    } });
  } finally { await context.close(); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Newsletter facade
// ─────────────────────────────────────────────────────────────────────────────

async function runNewsletterStories(browser) {
  const viewport = STORY_VIEWPORTS.find(v => v.id === "1280x800") ?? STORY_VIEWPORTS[STORY_VIEWPORTS.length - 1];
  const S = id => NEWSLETTER_STORIES.find(s => s.id === id);
  const site = SEED.website;
  const facade = `/api/portal/website-editor/visitor/newsletter?agencyId=${encodeURIComponent(SEED.agencyId)}&clientId=${encodeURIComponent(SEED.clients.a.id)}`;
  const ORIGIN_BASE = SAME_ORIGIN_BASE();
  const dto = (overrides = {}) => ({
    version: 1, operationId: `op-${RUN}-1`, siteId: site.siteId, pageId: site.pageId, blockId: site.blockId,
    email: `visitor-${RUN}@example.test`,
    consent: { agreed: true, purpose: "newsletter-subscription", version: site.consentVersion, statementDigest: site.consentDigest },
    honeypot: "", ...overrides,
  });
  const postFromPage = (page, body) => page.evaluate(async ({ url, body }) => {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, { url: facade, body });

  const owner = await openContext(browser, viewport, "owner");
  try {
    const { page, monitor } = owner;
    await story({ group: "newsletter", ...S("W1"), viewport, page, monitor, run: async () => {
      let facadePosts = 0;
      page.on("request", r => { if (r.url().includes("/visitor/newsletter") && r.method() === "POST") facadePosts += 1; });
      await gotoPath(page, site.pagePath, monitor);
      const form = page.locator("form", { has: page.locator('input[type="email"]') }).first();
      await form.waitFor();
      await form.locator('input[type="email"]').fill(`preview-${RUN}@example.test`);
      const consent = form.locator('input[type="checkbox"]').first();
      if (await consent.count()) await consent.check();
      const submit = form.locator('button[type="submit"]');
      const label = (await submit.textContent())?.trim();
      assert(await submit.isDisabled(), `preview submit is enabled ("${label}")`);
      assert(label === "Available when published", `preview submit reads "${label}"`);
      // Belt and braces: a keyboard submit from the email field must also be inert.
      await form.locator('input[type="email"]').press("Enter");
      await sleep(600);
      assert(facadePosts === 0, `the preview sent ${facadePosts} facade request(s)`);
      return `preview renders the block; submit is disabled and reads "${label}"; Enter in the field sends nothing; zero facade requests`;
    } });
  } finally { await owner.context.close(); }

  const anon = await openContext(browser, viewport, null);
  let receiptId = null;
  try {
    const { page, monitor } = anon;
    await story({ group: "newsletter", ...S("W2"), viewport, page, monitor, run: async () => {
      await page.goto(`${ORIGIN_BASE}/login`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
      const first = await postFromPage(page, dto());
      assert(first.status === 201 && first.json?.ok === true && typeof first.json.receiptId === "string", `first subscription → ${first.status} ${JSON.stringify(first.json)}`);
      receiptId = first.json.receiptId;
      const replay = await postFromPage(page, dto());
      assert(replay.status === 200 && replay.json?.receiptId === receiptId, `exact replay → ${replay.status} ${JSON.stringify(replay.json)}`);
      const refusals = monitor.expectStatus("/visitor/newsletter", [400, 403, 409]);
      const drift = await postFromPage(page, dto({ email: `drift-${RUN}@example.test` }));
      assert(drift.status === 409, `changed reuse of the operation id → ${drift.status}`);
      const wrongConsent = await postFromPage(page, dto({ operationId: `op-${RUN}-2`, consent: { agreed: true, purpose: "newsletter-subscription", version: site.consentVersion + 1, statementDigest: site.consentDigest } }));
      assert(wrongConsent.status === 400, `wrong consent version → ${wrongConsent.status}`);
      const honeypot = await postFromPage(page, dto({ operationId: `op-${RUN}-3`, email: `bot-${RUN}@example.test`, honeypot: "http://spam.example" }));
      assert(honeypot.status === 200 && honeypot.json?.receiptId === "accepted", `honeypot → ${honeypot.status} ${JSON.stringify(honeypot.json)}`);
      const noOrigin = await page.request.post(`${ORIGIN_BASE}${facade}`, { headers: { "content-type": "application/json" }, data: JSON.stringify(dto({ operationId: `op-${RUN}-4` })) });
      assert(noOrigin.status() === 403, `missing origin → ${noOrigin.status()}`);
      const foreignOrigin = await page.request.post(`${ORIGIN_BASE}${facade}`, { headers: { "content-type": "application/json", origin: "https://elsewhere.example", referer: "https://elsewhere.example/home" }, data: JSON.stringify(dto({ operationId: `op-${RUN}-5` })) });
      assert(foreignOrigin.status() === 403, `unregistered origin → ${foreignOrigin.status()}`);
      refusals();
      return `201 receipt ${receiptId}; exact replay 200 same receipt; drifted reuse 409; wrong consent 400; honeypot 200 "accepted"; no Origin 403; unregistered origin 403 (driven from ${ORIGIN_BASE}, the host Next reports for this lane)`;
    } });
  } finally { await anon.context.close(); }

  const reader = await openContext(browser, viewport, "owner");
  const readerAnon = await openContext(browser, viewport, null);
  const readerStaff = await openContext(browser, viewport, "staff");
  try {
    const { page, monitor } = reader;
    await story({ group: "newsletter", ...S("W3"), viewport, page, monitor, run: async () => {
      const path = `/api/portal/website-editor/forms/newsletter-subscriptions?clientId=${encodeURIComponent(SEED.clients.a.id)}&limit=10`;
      const list = await api(page, "GET", path);
      assert(list.status === 200, `operator read → ${list.status} ${list.text.slice(0, 200)}`);
      const subs = list.json?.subscriptions ?? [];
      assert(subs.some(s => s.email === `visitor-${RUN}@example.test`), `subscriber missing from ${JSON.stringify(subs).slice(0, 300)}`);
      assert(!subs.some(s => s.email === `bot-${RUN}@example.test`), "honeypot submission was persisted");
      const anonRefusal = readerAnon.monitor.expectStatus("/forms/newsletter-subscriptions", [401, 403]);
      const anonymous = await api(readerAnon.page, "GET", path);
      anonRefusal();
      assert([401, 403].includes(anonymous.status), `anonymous operator read → ${anonymous.status}`);
      const staffRefusal = readerStaff.monitor.expectStatus("/forms/newsletter-subscriptions", [401, 403, 404]);
      const staff = await api(readerStaff.page, "GET", path);
      staffRefusal();
      const otherClient = await api(page, "GET", `/api/portal/website-editor/forms/newsletter-subscriptions?clientId=${encodeURIComponent(SEED.clients.b.id)}&limit=10`);
      return `owner read 200 with ${subs.length} subscriber(s) incl. the visitor, honeypot absent; anonymous ${anonymous.status}; sales-seat staff ${staff.status}; other client ${otherClient.status} with ${(otherClient.json?.subscriptions ?? []).length} row(s)`;
    } });
  } finally { await reader.context.close(); await readerAnon.context.close(); await readerStaff.context.close(); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout matrix
// ─────────────────────────────────────────────────────────────────────────────

function loadAxeSource() {
  return readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
}

async function axeBlocking(page, axeSource) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    const results = await window.axe.run(document, { resultTypes: ["violations"], runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } });
    return results.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map(n => n.target.join(" ")) }));
  });
}

async function smallTargets(page) {
  return page.evaluate(() => {
    const out = [];
    const root = document.getElementById("main-content") ?? document.body;
    for (const el of root.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=button]")) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      if (rect.width < 44 || rect.height < 44) out.push(`${(el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.tagName).trim().slice(0, 30)} ${Math.round(rect.width)}×${Math.round(rect.height)}`);
    }
    return out;
  });
}

async function keyboardWalk(page, presses = 10) {
  const seen = [];
  await page.keyboard.press("Tab");
  for (let i = 0; i < presses; i += 1) {
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return { label: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40), w: r.width, h: r.height, ring: style.outlineStyle !== "none" || style.boxShadow !== "none" };
    });
    if (info) seen.push(info);
    await page.keyboard.press("Tab");
  }
  return seen;
}

async function runLayoutChecks(browser, viewport, axeSource) {
  for (const target of LAYOUT_PAGES) {
    const { context, page, monitor } = await openContext(browser, viewport, target.persona);
    try {
      await story({ group: "layout", id: target.id, name: `${target.path} as ${target.persona} @ ${viewport.label}`, viewport, page, monitor, run: async () => {
        const status = await gotoPath(page, target.path, monitor);
        assert(pathOf(page).split("?")[0] === target.path.split("?")[0] || pathOf(page).startsWith(target.path), `landed on ${pathOf(page)}`);
        const overflow = await measureOverflow(page);
        const problem = overflowProblem(overflow);
        assert(!problem, `${problem} (${JSON.stringify(overflow)})`);
        const violations = await axeBlocking(page, axeSource);
        const blocking = violations.filter(v => ["serious", "critical"].includes(v.impact));
        assert(blocking.length === 0, `axe serious/critical: ${blocking.map(v => `${v.impact}:${v.id}(${v.nodes.join(" | ")})`).join(" ; ")}`);
        const walk = await keyboardWalk(page, 10);
        const distinct = new Set(walk.map(w => w.label)).size;
        assert(distinct >= 3, `keyboard walk reached only ${distinct} distinct control(s)`);
        assert(walk.every(w => w.w > 0 && w.h > 0), "a focused element has no size");
        const small = await smallTargets(page);
        let modalNote = "";
        if (target.modal === "calendar") {
          const aside = page.locator("aside.mm-calendar-day-inspector");
          if (await aside.count()) {
            const add = aside.getByRole("button", { name: "Add to selected day" });
            if (await add.count()) {
              await add.click();
              const dialog = page.locator('form[role="dialog"]');
              await dialog.waitFor();
              const box = await dialog.boundingBox();
              const fits = box && box.width <= viewport.width + 1 && box.x >= -1;
              const inner = await dialog.evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }));
              assert(fits && inner.scroll <= inner.client + 1, `calendar editor overflows at ${viewport.id}: ${JSON.stringify({ box, inner })}`);
              await page.keyboard.press("Escape");
              await dialog.waitFor({ state: "hidden" });
              modalNote = `; editor dialog ${Math.round(box.width)}px wide fits, Escape closes`;
            }
          }
        }
        await screenshot(page, `layout-${target.id}-${viewport.id}`);
        const minor = violations.filter(v => !["serious", "critical"].includes(v.impact)).length;
        return `HTTP ${status}; no overflow (doc ${overflow.docScroll}/${overflow.docClient}); axe 0 blocking (${minor} minor/moderate); keyboard ${distinct} controls${modalNote}${small.length ? `; targets under 44px: ${small.length} (${small.slice(0, 3).join(", ")}${small.length > 3 ? ", …" : ""})` : ""}`;
      }, observations: [] });
    } finally { await context.close(); }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  if (!BASE || !SEED_PATH) {
    console.error("AQUA_BASE and AQUA_SEED_JSON are required.");
    process.exit(2);
  }
  SEED = JSON.parse(readFileSync(SEED_PATH, "utf8"));
  await mkdir(ARTEFACTS, { recursive: true });
  const startedAt = new Date().toISOString();
  const { browser, note } = await launchBrowser();
  console.log(`\n=== Release acceptance @ ${BASE} ===\n${note}\nrun ${RUN}; groups ${[...GROUPS].join(",")}\n`);
  const required = requiredKeys();
  try {
    for (const viewport of storyViewports()) {
      if (GROUPS.has("roles")) { console.log(`\nRoles @ ${viewport.id}`); await runRoleStories(browser, viewport); }
      if (GROUPS.has("radar")) { console.log(`\nRadar @ ${viewport.id}`); await runRadarStories(browser, viewport); }
      if (GROUPS.has("calendar")) { console.log(`\nCalendar @ ${viewport.id}`); await runCalendarStories(browser, viewport); }
      if (GROUPS.has("tools")) { console.log(`\nMy Tools @ ${viewport.id}`); await runToolsStories(browser, viewport); }
    }
    if (GROUPS.has("newsletter")) { console.log("\nNewsletter facade @ 1280x800"); await runNewsletterStories(browser); }
    if (GROUPS.has("layout")) {
      const axeSource = loadAxeSource();
      for (const viewport of layoutViewports()) { console.log(`\nLayout @ ${viewport.id} (${viewport.label})`); await runLayoutChecks(browser, viewport, axeSource); }
    }
  } finally {
    await browser.close();
  }
  const summary = summarise(records, required);
  await writeFile(join(ARTEFACTS, "records.json"), `${JSON.stringify({ base: BASE, browser: note, run: RUN, startedAt, finishedAt: new Date().toISOString(), seed: { agencyId: SEED.agencyId }, summary: { ok: summary.ok, byGroup: summary.byGroup, missing: summary.missing }, records }, null, 2)}\n`);
  console.log("\nResults");
  for (const [group, g] of Object.entries(summary.byGroup)) console.log(`  ${group.padEnd(11)} ${g.passed} passed · ${g.failed} failed · ${g.evidenced} declared event(s) · ${g.observations} observation(s)`);
  if (summary.missing.length) console.log(`  MISSING ${summary.missing.length}: ${summary.missing.join(", ")}`);
  if (summary.failures.length) { console.log("\nFailures"); for (const f of summary.failures) console.log(`  - ${f.key}: ${f.detail}`); }
  console.log(`\nArtefacts: ${ARTEFACTS}\n`);
  console.log(summary.ok ? "✓ release acceptance green" : "✗ release acceptance red");
  process.exit(summary.ok ? 0 : 1);
}

// Only run when executed directly: the smoke that pins the story matrix imports
// this module and must not launch a browser as a side effect.
import { pathToFileURL } from "node:url";
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main().catch(error => { console.error(error); process.exit(2); });
