#!/usr/bin/env node
// Browser acceptance for the two settled-but-unproven UX items:
//
//   #54  Notepad autosave — refused/offline saves keep the newest draft, Retry
//        save converges, exits flush, and a reload lands on the exact content.
//   #120 Agency Finance settings — the values saved in Settings drive the NEXT
//        invoice, while an existing invoice keeps its immutable seller snapshot.
//   #136 (evidence only) — the viewport loader during a genuinely delayed route
//        transition: one polite atomic live status, present in the accessibility
//        tree, gone after commit, chrome preserved, focus attached, reduced motion.
//
// ── Why a separate script ────────────────────────────────────────────────────
//
// `scripts/browser-matrix.mjs` walks pages; it never types into an editor,
// cuts the network mid-save, or downloads an invoice. The unit suites prove the
// service layer converges (`smoke-notepad`, `smoke-finance-settings-convergence`)
// but cannot see a browser draft, a keepalive request or a `type="date"` default.
// Those are exactly the residuals issues #54 and #120 are still open for.
//
// ── The honesty contract (same as the house matrix) ──────────────────────────
//
//   * Every required story × viewport is enumerated up front. A story that never
//     ran is MISSING and fails the run; a crash halfway is red, never short green.
//   * Any console error, page error, failed request or HTTP ≥ 400 that was not
//     DECLARED by the story as an injected fault fails the story. Declared faults
//     are counted as evidence, by URL, inside their window.
//   * Horizontal overflow of the document or `#main-content` fails a layout check.
//   * Transactional stories and layout checks are counted separately.
//   * The loader group records what the browser exposed. It does not claim a
//     screen-reader announcement: no assistive technology is driven here.
//
// ── Running it ───────────────────────────────────────────────────────────────
//
//   Self-hosted (default) — seeds a disposable file-backend state, starts the
//   EXACT production build on its own port, drives it, stops it:
//
//     AQUA_UX_PORT=3173 AQUA_UX_DIST=.next-ux-3173 \
//     AQUA_UX_STATE_DIR=/private/tmp/aquacrm-ux-3173 \
//     node scripts/browser-notepad-finance-acceptance.mjs
//
//   Add AQUA_UX_BUILD=1 to build that dist first (webpack, throwaway tsconfig,
//   next-env.d.ts snapshot/restore — mirrors scripts/benchmark-production.mjs).
//
//   Attach — drive an already running target with a seed record this script wrote:
//
//     AQUA_BASE=http://127.0.0.1:3173 AQUA_SEED_JSON=/private/tmp/aquacrm-ux-3173/seed.json \
//     node scripts/browser-notepad-finance-acceptance.mjs
//
//   Narrow while iterating: AQUA_STORIES=notepad,finance,layout,loader and
//   AQUA_STORY_VIEWPORTS=390x844,1280x800. AQUA_UX_SERVE_ONLY=1 seeds, starts
//   the server, prints the attach command and keeps serving until SIGTERM.
//
// Nothing here touches `.data/`, port 3032, or any shared state: the state file,
// build directory, session secret and port are all private to the lane.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";

import { findProvisionedChromium } from "./browser-matrix.mjs";
import { captureBenchmarkNextEnv, restoreBenchmarkNextEnv, snapshotNextEnv } from "./lib/production-benchmark-next-env.mjs";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NEXT_BIN = join(ROOT, "node_modules", "next", "dist", "bin", "next");
const TSX_LOADER = require.resolve("tsx");

// ─────────────────────────────────────────────────────────────────────────────
// Lane configuration
// ─────────────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.AQUA_UX_PORT || 3173);
const DIST = process.env.AQUA_UX_DIST || `.next-ux-${PORT}`;
const STATE_DIR = resolve(process.env.AQUA_UX_STATE_DIR || join(tmpdir(), `aquacrm-ux-${PORT}`));
const ARTEFACTS = resolve(process.env.AQUA_ARTEFACTS || join(STATE_DIR, "artefacts"));
const ATTACH_BASE = process.env.AQUA_BASE?.replace(/\/$/, "");
const SESSION_SECRET = process.env.AQUA_UX_SESSION_SECRET || randomBytes(32).toString("hex");
// Titles carry a run id so a rerun against retained state (attach mode) still
// proves "exactly one note with this title".
const RUN_ID = randomBytes(3).toString("hex");
const BUSINESS_TIME_ZONE = "Europe/London";

export const STORY_VIEWPORTS = [
  { id: "390x844", width: 390, height: 844 },
  { id: "1280x800", width: 1280, height: 800 },
];

export const LAYOUT_VIEWPORTS = [
  { id: "375x812", width: 375, height: 812 },
  { id: "390x844", width: 390, height: 844 },
  { id: "812x375", width: 812, height: 375 },
  { id: "768x1024", width: 768, height: 1024 },
  { id: "1024x768", width: 1024, height: 768 },
  { id: "1280x800", width: 1280, height: 800 },
  { id: "1920x1080", width: 1920, height: 1080 },
];

export const NOTEPAD_STORIES = [
  { id: "N1", name: "create, edit, autosave, reload to exact title and body" },
  { id: "N2", name: "rapid revisions: the newest content wins over a slower earlier save" },
  { id: "N3", name: "injected 503 keeps the newest draft, shows an accessible failure, settles busy, offers Retry save" },
  { id: "N4", name: "fault removed: Retry save converges and reload shows one exact note" },
  { id: "N5", name: "browser offline then online: retained draft, retry, exact reload" },
  { id: "N6", name: "leaving a note before the debounce fires flushes it" },
  { id: "N7", name: "mobile Back to notes flushes the open note", mobileOnly: true },
  { id: "N8", name: "closing the page with pending content: keepalive or honest local-draft recovery, then retry" },
  { id: "N9", name: "before-unload protection while a draft is pending" },
];

export const FINANCE_STORIES = [
  { id: "F1", name: "save clearly identifiable OLD identity, tax number, tax default and 10-day terms" },
  { id: "F2", name: "create invoice A through the Finance UI with the old defaults" },
  { id: "F3", name: "open and download A: old identity, tax result and due date" },
  { id: "F4", name: "change Settings to NEW identity, 20% tax and 45-day terms" },
  { id: "F5", name: "reload, refuse one save (no false success), then create invoice B with the new defaults" },
  { id: "F6", name: "download B: new identity and 45-day due date" },
  { id: "F7", name: "reopen and download A: still the old immutable snapshot" },
  { id: "F8", name: "no duplicate invoices, unique numbers, exact count" },
];

export const LAYOUT_PAGES = [
  { id: "notepad", label: "Notepad (note open)", controls: ["Capture an idea...", "New note"] },
  { id: "settings-account", label: "Settings › Business details", controls: ["Legal or trading name", "Save settings"] },
  { id: "settings-defaults", label: "Settings › Defaults", controls: ["Payment terms", "Save settings"] },
  { id: "invoices", label: "Finance › Invoices", controls: ["Create invoice"] },
  { id: "invoice-form", label: "Finance › New invoice dialog", controls: ["Save invoice"] },
  { id: "invoice-detail", label: "Finance › Invoice detail", controls: ["Download"] },
];

const GROUPS = new Set((process.env.AQUA_STORIES || "notepad,finance,layout,loader").split(",").map(s => s.trim()).filter(Boolean));
const STORY_VIEWPORT_FILTER = process.env.AQUA_STORY_VIEWPORTS
  ? new Set(process.env.AQUA_STORY_VIEWPORTS.split(",").map(s => s.trim()))
  : null;

function selectedStoryViewports() {
  return STORY_VIEWPORT_FILTER ? STORY_VIEWPORTS.filter(v => STORY_VIEWPORT_FILTER.has(v.id)) : STORY_VIEWPORTS;
}

/** Every required (group, story, viewport) key. A key that never runs fails the run. */
export function requiredKeys({ storyViewports = STORY_VIEWPORTS, layoutViewports = LAYOUT_VIEWPORTS, groups = GROUPS } = {}) {
  const keys = [];
  if (groups.has("notepad")) {
    for (const viewport of storyViewports) {
      for (const story of NOTEPAD_STORIES) {
        if (story.mobileOnly && viewport.width >= 768) continue;
        keys.push(`notepad:${story.id}:${viewport.id}`);
      }
    }
  }
  if (groups.has("finance")) {
    for (const viewport of storyViewports) for (const story of FINANCE_STORIES) keys.push(`finance:${story.id}:${viewport.id}`);
  }
  if (groups.has("layout")) {
    for (const viewport of layoutViewports) for (const page of LAYOUT_PAGES) keys.push(`layout:${page.id}:${viewport.id}`);
  }
  return keys;
}

/** The verdict. Missing required keys are failures, not absences. */
export function summarise(records, required) {
  const seen = new Map(records.map(record => [record.key, record]));
  const missing = required.filter(key => !seen.has(key));
  const byGroup = {};
  for (const record of records) {
    const group = byGroup[record.group] ??= { passed: 0, failed: 0, evidenced: 0, observations: 0 };
    if (record.status === "pass") group.passed += 1;
    else if (record.status === "fail") group.failed += 1;
    group.evidenced += record.evidenced?.length ?? 0;
    group.observations += record.observations?.length ?? 0;
  }
  const failures = records.filter(record => record.status === "fail");
  return { ok: failures.length === 0 && missing.length === 0, byGroup, failures, missing };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lane environment, seed, server
// ─────────────────────────────────────────────────────────────────────────────

function laneEnvironment() {
  return {
    ...process.env,
    NODE_ENV: "production",
    NEXT_DIST_DIR: DIST,
    PORTAL_BACKEND: "file",
    PORTAL_DATA_FILE: join(STATE_DIR, "portal-state.json"),
    INBOX_LOCAL_DATA_FILE: join(STATE_DIR, "inbox-local.json"),
    DEV_THOUGHTS_FILE: join(STATE_DIR, "dev-thoughts.json"),
    PORTAL_SESSION_SECRET: SESSION_SECRET,
    PORTAL_VAULT_ENCRYPTION_KEY: "aqua-ux-acceptance-disposable-vault-key-2026",
    NEXT_PUBLIC_PORTAL_BASE_URL: "http://127.0.0.1",
    TSX_TSCONFIG_PATH: join(ROOT, "tsconfig.json"),
    // Never inherit a deployment or provider identity into a disposable lane.
    VERCEL: "", VERCEL_ENV: "", DATABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "",
    OPENAI_API_KEY: "", RESEND_API_KEY: "", STRIPE_SECRET_KEY: "", TWILIO_ACCOUNT_SID: "",
    META_APP_SECRET: "", GITHUB_TOKEN: "", VERCEL_TOKEN: "",
  };
}

const SEED_SOURCE = String.raw`
const [storageM, bootstrapM, tenantsM, usersM, tokenM] = await Promise.all([
  import(process.env.AQUA_M_STORAGE),
  import(process.env.AQUA_M_BOOTSTRAP),
  import(process.env.AQUA_M_TENANTS),
  import(process.env.AQUA_M_USERS),
  import(process.env.AQUA_M_TOKEN),
]);
const pick = m => m.default && typeof m.default === "object" && !m.ensureHydrated && !m.bootstrapAgency && !m.createClient && !m.createUser && !m.signSessionPayload ? m.default : m;
const storage = pick(storageM), bootstrap = pick(bootstrapM), tenants = pick(tenantsM), users = pick(usersM), token = pick(tokenM);
await storage.ensureHydrated({ fresh: true });
const { agency } = await bootstrap.bootstrapAgency({ name: "UX Acceptance Agency", slug: "ux-acceptance-" + process.env.AQUA_UX_PORT }, "system");
const owner = users.createUser({
  email: "ux-owner-" + process.env.AQUA_UX_PORT + "@acceptance.test",
  name: "UX Owner",
  role: "agency-owner",
  agencyId: agency.id,
  password: "ux-acceptance-disposable-" + process.env.AQUA_UX_PORT,
});
const client = tenants.createClient(agency.id, { name: "Acceptance Client Ltd" });
await storage.flushPendingWrites();
const now = Math.floor(Date.now() / 1000);
const session = token.signSessionPayload({
  userId: owner.id, email: owner.email, role: owner.role,
  agencyId: agency.id, agencyIds: [agency.id], activeAgencyId: agency.id,
  sessionRev: owner.sessionRev ?? 0, accessRev: owner.accessRev ?? 0, aal: "aal1",
  iat: now, exp: now + 6 * 3600,
});
process.stdout.write(JSON.stringify({ ok: true, token: session, agencyId: agency.id, userId: owner.id, clientId: client.id, clientName: client.name }));
`;

function moduleUrl(path) {
  return pathToFileURL(join(ROOT, path)).href;
}

function runChild(args, { env, label, timeoutMs }) {
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); rejectChild(new Error(`${label} exceeded ${timeoutMs}ms`)); }, timeoutMs);
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.on("error", error => { clearTimeout(timer); rejectChild(error); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code !== 0) rejectChild(new Error(`${label} exited ${code}:\n${stderr || stdout}`));
      else resolveChild({ stdout, stderr });
    });
  });
}

const OWNED_STATE_FILES = ["portal-state.json", "inbox-local.json", "dev-thoughts.json", "seed.json", "server.log", "server.pid"];

async function seedLane() {
  // Only the files this lane writes are removed — never the whole directory,
  // which may hold the caller's logs and this run's artefacts.
  await mkdir(STATE_DIR, { recursive: true });
  for (const name of OWNED_STATE_FILES) await rm(join(STATE_DIR, name), { force: true });
  for (const entry of await readdir(STATE_DIR)) {
    if (/^portal-state\..*\.json$/.test(entry)) await rm(join(STATE_DIR, entry), { force: true });
  }
  const { stdout } = await runChild([
    "--conditions", "react-server", "--import", TSX_LOADER, "--input-type=module", "--eval", SEED_SOURCE,
  ], {
    label: "lane seed",
    timeoutMs: 120_000,
    env: {
      ...laneEnvironment(),
      AQUA_UX_PORT: String(PORT),
      AQUA_M_STORAGE: moduleUrl("src/server/storage.ts"),
      AQUA_M_BOOTSTRAP: moduleUrl("src/server/agencyBootstrap.ts"),
      AQUA_M_TENANTS: moduleUrl("src/server/tenants.ts"),
      AQUA_M_USERS: moduleUrl("src/server/users.ts"),
      AQUA_M_TOKEN: moduleUrl("src/lib/server/auth/sessionToken.ts"),
    },
  });
  const jsonStart = stdout.lastIndexOf("{\"ok\"");
  const seed = JSON.parse(stdout.slice(jsonStart));
  seed.base = `http://127.0.0.1:${PORT}`;
  await writeFile(join(STATE_DIR, "seed.json"), `${JSON.stringify({ ...seed }, null, 2)}\n`, { mode: 0o600 });
  return seed;
}

async function buildLane() {
  const configDir = join(ROOT, ".aqua-production-benchmark");
  const configName = `tsconfig.ux-${PORT}.json`;
  const nextEnvPath = join(ROOT, "next-env.d.ts");
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  await writeFile(join(configDir, configName), `${JSON.stringify({ extends: "../tsconfig.json" }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  const before = await snapshotNextEnv(nextEnvPath);
  try {
    console.log(`[lane] building ${DIST} (webpack) …`);
    await runChild([NEXT_BIN, "build", "--webpack"], {
      label: "production build",
      timeoutMs: 20 * 60_000,
      env: { ...laneEnvironment(), NEXT_TYPESCRIPT_CONFIG_PATH: `.aqua-production-benchmark/${configName}` },
    });
  } finally {
    const generated = await captureBenchmarkNextEnv(nextEnvPath, DIST);
    await restoreBenchmarkNextEnv({ path: nextEnvPath, distName: DIST, before, generated });
    await rm(join(configDir, configName), { force: true });
    await rmdir(configDir).catch(() => undefined);
    await rm(join(ROOT, DIST, "cache", "webpack"), { recursive: true, force: true });
  }
}

const activeChildren = new Set();

async function startServer(seed) {
  const log = await import("node:fs").then(fs => fs.createWriteStream(join(STATE_DIR, "server.log"), { flags: "a" }));
  const child = spawn(process.execPath, [NEXT_BIN, "start", "-H", "127.0.0.1", "-p", String(PORT)], {
    cwd: ROOT,
    env: laneEnvironment(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  activeChildren.add(child);
  child.once("exit", () => activeChildren.delete(child));
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  await writeFile(join(STATE_DIR, "server.pid"), `${child.pid}\n`);
  const base = `http://127.0.0.1:${PORT}`;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next start exited ${child.exitCode} — see ${join(STATE_DIR, "server.log")}`);
    try {
      const response = await fetch(`${base}/api/auth/me`, { headers: { cookie: `lk_session_v1=${seed.token}` } });
      if (response.status === 200) return { child, base, pid: child.pid };
    } catch {
      // not listening yet
    }
    await sleep(400);
  }
  throw new Error("next start did not become ready within 90s");
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  const exited = await Promise.race([new Promise(r => child.once("exit", () => r(true))), sleep(8_000).then(() => false)]);
  if (!exited) child.kill("SIGKILL");
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => { for (const child of activeChildren) child.kill("SIGKILL"); process.exit(130); });
}
// A crash inside a Playwright event handler must never leave the lane's server running.
process.on("uncaughtException", error => {
  console.error(`\nacceptance crashed:\n${error.stack || error.message}\n`);
  for (const child of activeChildren) child.kill("SIGKILL");
  process.exit(2);
});

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
 * Watches one page. A story DECLARES the failures it injects (`expect`); a
 * matching console/request/HTTP event inside that window is evidence, anything
 * else is a failure. Aborted RSC prefetches are observations, as the house
 * matrix treats them.
 */
class Monitor {
  constructor(page, label) {
    this.label = label;
    this.failures = [];
    this.evidenced = [];
    this.observations = [];
    this.expectations = [];
    page.on("console", message => {
      if (message.type() !== "error") return;
      this.classify("console", message.text(), message.location()?.url ?? "");
    });
    page.on("pageerror", error => this.classify("pageerror", error.message, page.url()));
    page.on("requestfailed", request => this.classify("requestfailed", request.failure()?.errorText ?? "failed", request.url()));
    page.on("response", response => {
      if (response.status() >= 400) this.classify("http", `HTTP ${response.status()}`, response.url(), response.status());
    });
  }

  /** Declare an injected fault. Returns a release function that ends the window after a grace period. */
  expect(label, predicate) {
    const entry = { label, predicate, hits: 0, until: Number.POSITIVE_INFINITY };
    this.expectations.push(entry);
    return (graceMs = 1_500) => {
      entry.until = Date.now() + graceMs;
      return entry;
    };
  }

  classify(kind, detail, url, status) {
    const now = Date.now();
    const expectation = this.expectations.find(entry => now <= entry.until && entry.predicate({ kind, detail, url, status }));
    if (expectation) {
      expectation.hits += 1;
      this.evidenced.push({ kind, detail: detail.slice(0, 200), url, label: expectation.label });
      return;
    }
    if (isRscPrefetchAbort(url, detail)) {
      this.observations.push({ kind, detail: detail.slice(0, 200), url });
      return;
    }
    this.failures.push({ kind, detail: detail.slice(0, 300), url });
  }

  /** Take everything recorded so far; the monitor keeps watching. */
  drain() {
    const taken = { failures: this.failures, evidenced: this.evidenced, observations: this.observations };
    this.failures = [];
    this.evidenced = [];
    this.observations = [];
    return taken;
  }
}

const sessionCookie = (seed, base) => ({
  name: "lk_session_v1",
  value: seed.token,
  domain: new URL(base).hostname,
  path: "/",
  httpOnly: true,
  sameSite: "Lax",
});

async function openContext(browser, seed, base, viewport, extra = {}) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, acceptDownloads: true, ...extra });
  await context.addCookies([sessionCookie(seed, base)]);
  return context;
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

async function screenshot(page, name) {
  const path = join(ARTEFACTS, `${name}-${stamp()}.png`);
  await page.screenshot({ path, fullPage: false }).catch(() => undefined);
  return path;
}

function businessDate(ms, timeZone = BUSINESS_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  const part = type => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addBusinessDays(days, from = Date.now()) {
  const [year, month, day] = businessDate(from).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function longUtcDate(ms) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(haystack, needle, label) {
  assert(haystack.includes(needle), `${label}: expected to find ${JSON.stringify(needle)}`);
}

function assertExcludes(haystack, needle, label) {
  assert(!haystack.includes(needle), `${label}: must NOT contain ${JSON.stringify(needle)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Story runner
// ─────────────────────────────────────────────────────────────────────────────

const records = [];

async function story({ group, id, name, viewport, page, monitor, run }) {
  const key = `${group}:${id}:${viewport.id}`;
  const record = { key, group, id, name, viewport: viewport.id, status: "pass", detail: "", evidence: {}, startedAt: Date.now() };
  console.log(`  ▶ ${key} — ${name}`);
  try {
    // Every story starts with a clean network: a fault the previous story
    // injected (or failed to clear) must not leak into this one.
    if (!page.isClosed()) await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => undefined);
    await run(record);
    // Let late console lines for declared windows land before judging.
    await sleep(250);
    const drained = monitor.drain();
    record.evidenced = drained.evidenced;
    record.observations = drained.observations;
    if (drained.failures.length) {
      record.status = "fail";
      record.detail = `unexpected browser failure(s): ${drained.failures.map(f => `${f.kind} ${f.detail} @ ${f.url}`).join(" | ")}`;
    }
  } catch (error) {
    const drained = monitor.drain();
    record.evidenced = drained.evidenced;
    record.observations = drained.observations;
    record.status = "fail";
    record.detail = `${error.message}${drained.failures.length ? ` | browser: ${drained.failures.map(f => `${f.kind} ${f.detail} @ ${f.url}`).join(" | ")}` : ""}`;
    record.screenshot = await screenshot(page, `fail-${group}-${id}-${viewport.id}`);
  }
  record.ms = Date.now() - record.startedAt;
  records.push(record);
  console.log(`    ${record.status === "pass" ? "✓" : "✗"} ${record.status}${record.detail ? ` — ${record.detail}` : ""}${record.evidenced?.length ? ` (${record.evidenced.length} declared fault event(s) evidenced)` : ""}`);
  return record;
}

// ─────────────────────────────────────────────────────────────────────────────
// Notepad helpers
// ─────────────────────────────────────────────────────────────────────────────

const NOTEPAD_API = "/api/portal/notepad";
const quickCapture = page => page.getByPlaceholder("Capture an idea...");
const titleInput = page => page.getByPlaceholder("Untitled note");
const bodyArea = page => page.getByPlaceholder("Start writing...");
const retryButton = page => page.getByRole("button", { name: "Retry save" });
const backButton = page => page.getByRole("button", { name: "Back to notes" });
// The portal chrome keeps an always-mounted, usually empty `role="alert"`
// region, so "no failure shown" means no alert WITH TEXT, not no alert at all.
const noteAlert = page => page.getByRole("alert").filter({ hasText: /\S/ });

async function waitForIndicator(page, expected, timeout = 8_000) {
  await page.waitForFunction(text => {
    const nodes = Array.from(document.querySelectorAll("span, button"));
    return nodes.some(node => node.textContent?.trim() === text);
  }, expected, { timeout });
}

async function indicatorText(page) {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("span, button"));
    const hit = nodes.find(node => ["Saved", "Saving", "Unsaved", "Retry save"].includes(node.textContent?.trim() ?? ""));
    return hit?.textContent?.trim() ?? "";
  });
}

async function serverNotes(page, base) {
  const response = await page.request.get(`${base}${NOTEPAD_API}`);
  assert(response.status() === 200, `GET ${NOTEPAD_API} → ${response.status()}`);
  const json = await response.json();
  return json.notes;
}

async function serverNote(page, base, id) {
  return (await serverNotes(page, base)).find(note => note.id === id) ?? null;
}

async function openNote(page, base, id) {
  await page.goto(`${base}/portal/agency/notepad?note=${encodeURIComponent(id)}`, { waitUntil: "load" });
  await bodyArea(page).waitFor({ state: "visible", timeout: 15_000 });
}

async function createNote(page, base, title) {
  await page.goto(`${base}/portal/agency/notepad`, { waitUntil: "load" });
  await quickCapture(page).waitFor({ state: "visible", timeout: 15_000 });
  await quickCapture(page).fill(title);
  const created = page.waitForResponse(response => response.url().endsWith(NOTEPAD_API) && response.request().method() === "POST" && response.request().postData()?.includes("create-note"), { timeout: 15_000 });
  await quickCapture(page).press("Enter");
  const response = await created;
  assert(response.status() === 201, `create-note → ${response.status()}`);
  const { note } = await response.json();
  await bodyArea(page).waitFor({ state: "visible", timeout: 10_000 });
  assert((await titleInput(page).inputValue()) === title, "editor did not open on the created note");
  return note;
}

async function typeBody(page, text) {
  const area = bodyArea(page);
  await area.click();
  await page.keyboard.press("End");
  await area.pressSequentially(text, { delay: 12 });
}

/** Predicate over a Playwright Request: is this the update-note POST for `noteId`? */
function isUpdateOf(noteId) {
  return request => request.method() === "POST" && request.url().endsWith(NOTEPAD_API) && (request.postData() ?? "").includes("\"update-note\"") && (request.postData() ?? "").includes(noteId);
}

/** `page.route` predicates receive a URL, not a Request: route the endpoint, decide inside the handler. */
const NOTEPAD_URL = url => url.pathname === NOTEPAD_API;

function updateResponseOf(noteId, status = 200) {
  const matches = isUpdateOf(noteId);
  return response => matches(response.request()) && response.status() === status;
}

function notepadFault(kind) {
  return ({ url, detail, status }) => url.includes(NOTEPAD_API) && (
    kind === "503" ? (status === 503 || /503/.test(detail))
      : kind === "offline" ? /ERR_INTERNET_DISCONNECTED|Failed to fetch|ERR_FAILED/.test(detail)
        : /ERR_ABORTED|ERR_FAILED/.test(detail));
}

async function expectConverged(page, base, note, expectedBody, expectedTitle) {
  await openNote(page, base, note.id);
  const alert = noteAlert(page);
  if (await alert.count()) {
    const text = (await alert.first().textContent()) ?? "";
    if (/recovered from this browser/.test(text)) {
      await retryButton(page).click();
      await waitForIndicator(page, "Saved");
      await openNote(page, base, note.id);
      return { path: "local-draft-recovered-then-retried" };
    }
  }
  const body = await bodyArea(page).inputValue();
  const title = await titleInput(page).inputValue();
  assert(body === expectedBody, `reload body mismatch\n  expected: ${JSON.stringify(expectedBody)}\n  actual:   ${JSON.stringify(body)}`);
  assert(title === expectedTitle, `reload title mismatch: ${JSON.stringify(title)}`);
  const server = await serverNote(page, base, note.id);
  assert(server?.body === expectedBody, `server body mismatch: ${JSON.stringify(server?.body)}`);
  assert(server?.title === expectedTitle, `server title mismatch: ${JSON.stringify(server?.title)}`);
  const sameTitle = (await serverNotes(page, base)).filter(item => item.title === expectedTitle);
  assert(sameTitle.length === 1, `expected exactly one note titled ${JSON.stringify(expectedTitle)}, found ${sameTitle.length}`);
  return { path: "server-truth" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Notepad stories
// ─────────────────────────────────────────────────────────────────────────────

async function runNotepadStories(browser, seed, base, viewport) {
  const context = await openContext(browser, seed, base, viewport);
  const mobile = viewport.width < 768;
  const title = `Acceptance note ${viewport.id} ${RUN_ID}`;
  let expected = "";
  let note = null;
  let page = await context.newPage();
  let monitor = new Monitor(page, `notepad ${viewport.id}`);
  const fresh = async () => {
    page = await context.newPage();
    monitor = new Monitor(page, `notepad ${viewport.id}`);
  };
  const runStory = (id, run) => story({ group: "notepad", id, name: NOTEPAD_STORIES.find(s => s.id === id).name, viewport, page, monitor, run });

  await runStory("N1", async record => {
    note = await createNote(page, base, title);
    await typeBody(page, "First line of the body.");
    expected = "First line of the body.";
    await waitForIndicator(page, "Saved");
    await titleInput(page).fill(`${title}`);
    await waitForIndicator(page, "Saved");
    const outcome = await expectConverged(page, base, note, expected, title);
    record.evidence = { noteId: note.id, ...outcome };
  });

  await runStory("N2", async record => {
    await openNote(page, base, note.id);
    // A slow SERVER, not a reordered network: the first save reaches the
    // server in order, but its acknowledgement is held for a second while the
    // next revision is typed and saved. The client must not let that late,
    // stale acknowledgement win over the newer content.
    let slowed = 0;
    const timeline = [];
    const isUpdate = isUpdateOf(note.id);
    // Unrouting while a handler still holds a request makes Playwright re-issue
    // that ORIGINAL request, which would land the stale body after the newer
    // one — a harness artefact, not the client under test. Wait for the held
    // acknowledgement to be released before touching the routes.
    let releaseHeld = () => undefined;
    const held = new Promise(resolveHeld => { releaseHeld = resolveHeld; });
    await page.route(NOTEPAD_URL, async route => {
      if (!isUpdate(route.request())) return route.fallback();
      slowed += 1;
      const body = JSON.parse(route.request().postData() ?? "{}").body;
      if (slowed === 1) {
        const response = await route.fetch();
        timeline.push({ at: Date.now(), event: "first save reached the server", sent: body, status: response.status(), serverNow: (await serverNote(page, base, note.id))?.body });
        await sleep(1_000);
        timeline.push({ at: Date.now(), event: "first acknowledgement released to the client" });
        await route.fulfill({ response }).catch(() => undefined);
        releaseHeld();
        return undefined;
      }
      timeline.push({ at: Date.now(), event: `save #${slowed} continued`, sent: body });
      return route.continue().catch(() => undefined);
    });
    await typeBody(page, " alpha");
    await waitForIndicator(page, "Saving");
    timeline.push({ at: Date.now(), event: "indicator Saving seen; typing the next revision" });
    await typeBody(page, " beta");
    expected = `${expected} alpha beta`;
    await waitForIndicator(page, "Saved", 12_000);
    timeline.push({ at: Date.now(), event: "indicator Saved seen", serverNow: (await serverNote(page, base, note.id))?.body });
    await Promise.race([held, sleep(5_000)]);
    await sleep(150);
    timeline.push({ at: Date.now(), event: "after the stale acknowledgement", editor: await bodyArea(page).inputValue(), indicator: await indicatorText(page), serverNow: (await serverNote(page, base, note.id))?.body });
    await page.unroute(NOTEPAD_URL).catch(() => undefined);
    record.evidence = { slowedSaves: slowed, timeline };
    assert(slowed >= 2, `expected two update saves during the race, saw ${slowed}`);
    assert((await bodyArea(page).inputValue()) === expected, "editor lost the newest revision");
    const server = await serverNote(page, base, note.id);
    assert(server.body === expected, `server kept a stale revision: ${JSON.stringify(server.body)}`);
    const outcome = await expectConverged(page, base, note, expected, title);
    record.evidence = { slowedSaves: slowed, timeline, ...outcome };
  });

  let release503 = null;
  let refuseUpdate = null;
  await runStory("N3", async record => {
    await openNote(page, base, note.id);
    release503 = monitor.expect("injected 503 on update-note", notepadFault("503"));
    refuseUpdate = isUpdateOf(note.id);
    await page.route(NOTEPAD_URL, route => (refuseUpdate(route.request())
      ? route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "Injected 503: the notepad could not be updated." }),
      })
      : route.fallback()).catch(() => undefined));
    await typeBody(page, " gamma");
    expected = `${expected} gamma`;
    await retryButton(page).waitFor({ state: "visible", timeout: 10_000 });
    assert((await bodyArea(page).inputValue()) === expected, "the newest draft was lost after the refused save");
    const alert = noteAlert(page).first();
    await alert.waitFor({ state: "visible", timeout: 3_000 });
    const alertText = (await alert.textContent()) ?? "";
    assertIncludes(alertText, "Injected 503", "failure alert");
    assert((await alert.getAttribute("role")) === "alert", "failure is not exposed with role=alert");
    const indicator = await indicatorText(page);
    assert(indicator === "Retry save", `busy state did not settle: indicator reads ${JSON.stringify(indicator)}`);
    assert(await retryButton(page).isEnabled(), "Retry save is not enabled");
    const draft = await page.evaluate(id => window.localStorage.getItem(`aquacrm:notepad-draft:${id}`), note.id);
    assert(draft && JSON.parse(draft).body === expected, "browser draft does not hold the newest content");
    record.screenshot = await screenshot(page, `notepad-N3-refused-${viewport.id}`);
    record.evidence = { alertText, indicator, draftRetained: true };
  });

  await runStory("N4", async record => {
    await page.unroute(NOTEPAD_URL);
    const saved = page.waitForResponse(updateResponseOf(note.id), { timeout: 10_000 });
    await retryButton(page).click();
    await saved;
    release503?.();
    await waitForIndicator(page, "Saved");
    assert((await noteAlert(page).count()) === 0, "the failure alert did not clear after a successful retry");
    const outcome = await expectConverged(page, base, note, expected, title);
    record.evidence = outcome;
  });

  await runStory("N5", async record => {
    await openNote(page, base, note.id);
    const releaseOffline = monitor.expect("browser offline (every request is disconnected)", ({ detail }) => /ERR_INTERNET_DISCONNECTED|Failed to fetch|ERR_FAILED/.test(detail));
    let alertText = "";
    try {
      await context.setOffline(true);
      await typeBody(page, " delta");
      expected = `${expected} delta`;
      await retryButton(page).waitFor({ state: "visible", timeout: 10_000 });
      assert((await bodyArea(page).inputValue()) === expected, "draft lost while offline");
      alertText = (await noteAlert(page).first().textContent()) ?? "";
      assert(alertText.length > 0, "no accessible failure while offline");
    } finally {
      await context.setOffline(false);
    }
    const saved = page.waitForResponse(updateResponseOf(note.id), { timeout: 10_000 });
    await retryButton(page).click();
    await saved;
    releaseOffline();
    await waitForIndicator(page, "Saved");
    const outcome = await expectConverged(page, base, note, expected, title);
    record.evidence = { offlineAlert: alertText, ...outcome };
  });

  let second = null;
  await runStory("N6", async record => {
    second = await createNote(page, base, `Second note ${viewport.id} ${RUN_ID}`);
    await openNote(page, base, note.id);
    const flushed = page.waitForResponse(updateResponseOf(note.id), { timeout: 5_000 });
    await typeBody(page, " epsilon");
    expected = `${expected} epsilon`;
    const leftAt = Date.now();
    if (mobile) {
      await backButton(page).click();
    } else {
      await page.getByRole("button", { name: new RegExp(`^${second.title}`) }).first().click();
    }
    const response = await flushed;
    const flushMs = Date.now() - leftAt;
    assert(flushMs < 650, `the flush waited for the debounce (${flushMs}ms) instead of firing on leave`);
    const server = await serverNote(page, base, note.id);
    assert(server.body === expected, `server did not receive the flushed body: ${JSON.stringify(server.body)}`);
    // Part two: a FULL navigation before the debounce — unmount + pagehide keepalive.
    await openNote(page, base, second.id);
    const releaseExit = monitor.expect("exit during keepalive update", notepadFault("exit"));
    await typeBody(page, "Second body zeta");
    await page.goto(`${base}/portal/agency`, { waitUntil: "load" });
    await sleep(800);
    releaseExit();
    const secondServer = await serverNote(page, base, second.id);
    const keepaliveDelivered = secondServer.body === "Second body zeta";
    const outcome = await expectConverged(page, base, second, "Second body zeta", second.title);
    record.evidence = { inAppFlushMs: flushMs, inAppFlushStatus: response.status(), fullNavigationKeepaliveDelivered: keepaliveDelivered, ...outcome };
  });

  if (mobile) {
    await runStory("N7", async record => {
      await openNote(page, base, note.id);
      await backButton(page).waitFor({ state: "visible" });
      const flushed = page.waitForResponse(updateResponseOf(note.id), { timeout: 5_000 });
      await typeBody(page, " eta");
      expected = `${expected} eta`;
      await backButton(page).click();
      await flushed;
      await page.getByPlaceholder("Search notes").waitFor({ state: "visible", timeout: 3_000 });
      assert(!(await bodyArea(page).isVisible()), "editor stayed open after Back to notes");
      const server = await serverNote(page, base, note.id);
      assert(server.body === expected, "Back to notes did not flush the open note");
      // The list is a real way back into the note.
      await page.getByRole("button", { name: new RegExp(`^${title}`) }).first().click();
      await bodyArea(page).waitFor({ state: "visible" });
      assert((await bodyArea(page).inputValue()) === expected, "reopened note differs from the flushed content");
      record.evidence = { listVisibleAfterBack: true };
    });
  }

  await runStory("N8", async record => {
    await page.close();
    await fresh();
    await openNote(page, base, note.id);
    const releaseExit = monitor.expect("page closed during keepalive update", notepadFault("exit"));
    await typeBody(page, " theta");
    expected = `${expected} theta`;
    await page.close();
    await sleep(800);
    releaseExit();
    await fresh();
    const persisted = (await serverNote(page, base, note.id)).body === expected;
    const outcome = await expectConverged(page, base, note, expected, title);
    record.evidence = { keepalivePersistedBeforeReopen: persisted, ...outcome };
  });

  await runStory("N9", async record => {
    await openNote(page, base, note.id);
    await typeBody(page, " iota");
    expected = `${expected} iota`;
    const protectedWhilePending = await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert(protectedWhilePending, "beforeunload was not prevented while a draft was pending");
    await waitForIndicator(page, "Saved");
    const protectedAfterSave = await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert(!protectedAfterSave, "beforeunload still prevented after everything was saved");
    // The real thing, where the browser exposes it: close with a pending draft.
    const releaseExit = monitor.expect("page closed with runBeforeUnload", notepadFault("exit"));
    await typeBody(page, " kappa");
    expected = `${expected} kappa`;
    let dialogType = null;
    page.once("dialog", dialog => { dialogType = dialog.type(); void dialog.accept(); });
    await page.close({ runBeforeUnload: true });
    await sleep(1_500);
    releaseExit();
    await fresh();
    const outcome = await expectConverged(page, base, note, expected, title);
    record.evidence = { syntheticPreventedWhilePending: protectedWhilePending, syntheticPreventedAfterSave: protectedAfterSave, browserExposedBeforeUnloadDialog: dialogType === "beforeunload", dialogType, ...outcome };
  });

  await context.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// Finance helpers
// ─────────────────────────────────────────────────────────────────────────────

const FINANCE_API = "/api/portal/agency-finance";

async function openSettingsTab(page, base, tab) {
  await page.goto(`${base}/portal/agency/settings#${tab}`, { waitUntil: "load" });
  if (tab === "account") await page.getByLabel("Legal or trading name").waitFor({ state: "visible", timeout: 15_000 });
  if (tab === "defaults") await page.getByLabel("Payment terms").waitFor({ state: "visible", timeout: 15_000 });
}

async function saveForm(page, anchorLabel, expectedStatus) {
  const form = page.locator("form", { has: page.getByLabel(anchorLabel) });
  const saved = page.waitForResponse(response => response.url().endsWith("/api/portal/settings") && response.request().method() === "POST", { timeout: 10_000 });
  await form.getByRole("button", { name: "Save settings" }).click();
  const response = await saved;
  assert(response.status() === 200, `POST /api/portal/settings → ${response.status()}`);
  await form.locator('p[role="status"]', { hasText: expectedStatus }).waitFor({ state: "visible", timeout: 5_000 });
  return response.json();
}

async function serverSettings(page, base) {
  const response = await page.request.get(`${base}/api/portal/settings`);
  assert(response.status() === 200, `GET /api/portal/settings → ${response.status()}`);
  return (await response.json()).settings;
}

async function serverInvoices(page, base) {
  const response = await page.request.get(`${base}${FINANCE_API}/invoices`);
  assert(response.status() === 200, `GET ${FINANCE_API}/invoices → ${response.status()}`);
  const json = await response.json();
  return json.invoices ?? json.items ?? json.data ?? [];
}

async function openInvoices(page, base) {
  await page.goto(`${base}/portal/agency/agency-finance/invoices`, { waitUntil: "load" });
  await page.getByRole("button", { name: "Create invoice" }).waitFor({ state: "visible", timeout: 20_000 });
}

async function openInvoiceForm(page) {
  await page.getByRole("button", { name: "Create invoice" }).click();
  const dialog = page.locator('[role="dialog"]', { has: page.locator("#new-invoice-heading") });
  await dialog.waitFor({ state: "visible", timeout: 5_000 });
  return dialog;
}

async function fillInvoiceForm(dialog, { clientName, description, netAmount }) {
  await dialog.locator('select[name="clientId"]').selectOption({ label: clientName });
  await dialog.locator('input[name="description"]').fill(description);
  await dialog.locator('input[name="netAmount"]').fill(String(netAmount));
}

const INVOICES_URL = url => url.pathname === `${FINANCE_API}/invoices`;

/**
 * The page reloads itself the moment a create succeeds, which discards the
 * response body before `waitForResponse` can read it. Capture the body on the
 * way through the route instead.
 */
async function submitInvoiceForm(page, dialog) {
  let captured = null;
  const capture = new Promise(resolveCapture => {
    void page.route(INVOICES_URL, async route => {
      if (route.request().method() !== "POST") return route.fallback().catch(() => undefined);
      const response = await route.fetch();
      captured = { status: response.status(), json: await response.json().catch(() => null) };
      resolveCapture(captured);
      return route.fulfill({ response }).catch(() => undefined);
    });
  });
  const reloaded = page.waitForEvent("load", { timeout: 20_000 });
  await dialog.getByRole("button", { name: "Save invoice" }).click();
  const result = await Promise.race([capture, sleep(15_000).then(() => null)]);
  await page.unroute(INVOICES_URL).catch(() => undefined);
  assert(result, "no create-invoice POST was observed");
  assert(result.status === 201, `POST invoices → ${result.status}`);
  const invoice = result.json?.invoice;
  assert(invoice?.id, "create response carried no invoice");
  await reloaded;
  await page.getByRole("link", { name: invoice.number, exact: true }).first().waitFor({ state: "visible", timeout: 20_000 });
  return invoice;
}

async function openInvoice(page, base, id) {
  await page.goto(`${base}/portal/agency/agency-finance/invoices/${encodeURIComponent(id)}`, { waitUntil: "load" });
  await page.getByRole("link", { name: "Download" }).waitFor({ state: "visible", timeout: 20_000 });
}

async function downloadInvoice(page, monitor, label) {
  // Chromium turns a `content-disposition: attachment` navigation into a
  // download and then reports that navigation request as net::ERR_ABORTED.
  // The file still arrives; declare the abort so it is evidence, not a failure.
  const release = monitor.expect("attachment navigation becomes a download", ({ url, detail }) => url.includes(`${FINANCE_API}/invoices/download`) && /ERR_ABORTED/.test(detail));
  const downloading = page.waitForEvent("download", { timeout: 15_000 });
  await page.getByRole("link", { name: "Download" }).click();
  const download = await downloading;
  release();
  const path = await download.path();
  const html = await readFile(path, "utf8");
  const keep = join(ARTEFACTS, `${label}-${download.suggestedFilename()}`);
  await writeFile(keep, html);
  return { html, filename: download.suggestedFilename(), saved: keep };
}

function exportDue(html) {
  return /<span>Due<\/span><strong>([^<]*)<\/strong>/.exec(html)?.[1] ?? null;
}

function identity(vp, era) {
  const key = `${era}-${vp}`;
  return {
    legalName: `${era === "old" ? "Old" : "New"} Identity ${vp} Ltd`,
    address: era === "old" ? `1 Original Road\nOldtown ${vp}` : `2 Current Road\nNewtown ${vp}`,
    taxNumber: `GB-${key.toUpperCase()}`,
    taxPercent: era === "old" ? 10 : 20,
    termsDays: era === "old" ? 10 : 45,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Finance stories
// ─────────────────────────────────────────────────────────────────────────────

const shared = { invoiceA: null, noteForLayout: null };

async function runFinanceStories(browser, seed, base, viewport) {
  const context = await openContext(browser, seed, base, viewport);
  const page = await context.newPage();
  const monitor = new Monitor(page, `finance ${viewport.id}`);
  const runStory = (id, run) => story({ group: "finance", id, name: FINANCE_STORIES.find(s => s.id === id).name, viewport, page, monitor, run });
  const old = identity(viewport.id, "old");
  const fresh = identity(viewport.id, "new");
  let invoicesBefore = 0;
  let invoiceA = null;
  let invoiceB = null;
  let exportA = null;
  let expectedDueA = null;
  let expectedDueB = null;

  await runStory("F1", async record => {
    await openSettingsTab(page, base, "account");
    await page.getByLabel("Legal or trading name").fill(old.legalName);
    await page.getByLabel("Business address").fill(old.address);
    await page.getByLabel("VAT or tax number").fill(old.taxNumber);
    await saveForm(page, "Legal or trading name", "Business details saved.");
    await openSettingsTab(page, base, "defaults");
    await page.getByLabel("Default tax %").fill(String(old.taxPercent));
    await page.getByLabel("Payment terms").fill(String(old.termsDays));
    await saveForm(page, "Payment terms", "Workspace defaults saved.");
    const settings = await serverSettings(page, base);
    assert(settings.legalName === old.legalName, `legalName not stored: ${settings.legalName}`);
    assert(settings.taxNumber === old.taxNumber, `taxNumber not stored: ${settings.taxNumber}`);
    assert(settings.defaultTaxRatePercent === old.taxPercent, `tax default not stored: ${settings.defaultTaxRatePercent}`);
    assert(settings.defaultPaymentTermsDays === old.termsDays, `terms not stored: ${settings.defaultPaymentTermsDays}`);
    record.evidence = { stored: { legalName: settings.legalName, taxNumber: settings.taxNumber, tax: settings.defaultTaxRatePercent, terms: settings.defaultPaymentTermsDays } };
  });

  await runStory("F2", async record => {
    invoicesBefore = (await serverInvoices(page, base)).length;
    await openInvoices(page, base);
    const dialog = await openInvoiceForm(page);
    const copy = (await dialog.textContent()) ?? "";
    assertIncludes(copy, `Workspace defaults: ${old.termsDays} day terms and ${old.taxPercent}% tax.`, "new-invoice copy");
    expectedDueA = addBusinessDays(old.termsDays);
    const dueDefault = await dialog.locator('input[name="dueAt"]').inputValue();
    const taxDefault = await dialog.locator('input[name="taxRate"]').inputValue();
    assert(dueDefault === expectedDueA, `Payment due default ${dueDefault} ≠ today + ${old.termsDays} days (${expectedDueA})`);
    assert(Number(taxDefault) === old.taxPercent, `Tax rate default ${taxDefault} ≠ ${old.taxPercent}`);
    await fillInvoiceForm(dialog, { clientName: seed.clientName, description: `Acceptance work A ${viewport.id}`, netAmount: 100 });
    invoiceA = await submitInvoiceForm(page, dialog);
    shared.invoiceA ??= invoiceA;
    assert(invoiceA.issuerSnapshot?.legalName === old.legalName, `invoice A snapshot legalName: ${invoiceA.issuerSnapshot?.legalName}`);
    assertIncludes(invoiceA.issuerSnapshot?.businessDetails ?? "", old.taxNumber, "invoice A snapshot business details");
    assert(invoiceA.taxCents === 1_000, `invoice A taxCents ${invoiceA.taxCents} ≠ 1000`);
    assert(invoiceA.totalCents === 11_000, `invoice A totalCents ${invoiceA.totalCents} ≠ 11000`);
    assert(businessDate(invoiceA.dueAt) === expectedDueA, `invoice A dueAt ${businessDate(invoiceA.dueAt)} ≠ ${expectedDueA}`);
    record.evidence = { number: invoiceA.number, id: invoiceA.id, dueDefault, taxDefault, snapshot: invoiceA.issuerSnapshot };
  });

  await runStory("F3", async record => {
    await openInvoice(page, base, invoiceA.id);
    const heading = await page.getByRole("heading", { level: 1 }).first().textContent();
    assert(heading?.trim() === invoiceA.number, `detail heading ${heading} ≠ ${invoiceA.number}`);
    const dueOnScreen = longUtcDate(invoiceA.dueAt);
    assertIncludes((await page.locator("article").textContent()) ?? "", dueOnScreen, "on-screen due date");
    const previewSeller = (await page.locator("article h2").first().textContent())?.trim() ?? "";
    const previewText = (await page.locator("article").textContent()) ?? "";
    assert(previewSeller === old.legalName, `the mounted preview shows ${JSON.stringify(previewSeller)} as the seller, the export shows ${JSON.stringify(old.legalName)}`);
    assertIncludes(previewText, old.taxNumber, "on-screen preview business details");
    exportA = await downloadInvoice(page, monitor, `invoice-A-${viewport.id}-first`);
    assertIncludes(exportA.html, old.legalName, "export A seller");
    assertIncludes(exportA.html, old.taxNumber, "export A tax number");
    assertIncludes(exportA.html, "Oldtown", "export A address");
    assertExcludes(exportA.html, fresh.legalName, "export A");
    assert(exportDue(exportA.html) === expectedDueA, `export A due ${exportDue(exportA.html)} ≠ ${expectedDueA}`);
    assertIncludes(exportA.html, "<span>Tax</span><span>10.00 GBP</span>", "export A tax line");
    assertIncludes(exportA.html, "<strong>110.00 GBP</strong>", "export A total");
    record.evidence = { filename: exportA.filename, saved: exportA.saved, previewSeller, exportSeller: old.legalName, previewMatchesSnapshot: previewSeller === old.legalName };
  });

  await runStory("F4", async record => {
    await openSettingsTab(page, base, "account");
    await page.getByLabel("Legal or trading name").fill(fresh.legalName);
    await page.getByLabel("Business address").fill(fresh.address);
    await page.getByLabel("VAT or tax number").fill(fresh.taxNumber);
    await saveForm(page, "Legal or trading name", "Business details saved.");
    await openSettingsTab(page, base, "defaults");
    await page.getByLabel("Default tax %").fill(String(fresh.taxPercent));
    await page.getByLabel("Payment terms").fill(String(fresh.termsDays));
    await saveForm(page, "Payment terms", "Workspace defaults saved.");
    const settings = await serverSettings(page, base);
    assert(settings.legalName === fresh.legalName && settings.taxNumber === fresh.taxNumber, "new identity not stored");
    assert(settings.defaultTaxRatePercent === fresh.taxPercent && settings.defaultPaymentTermsDays === fresh.termsDays, "new defaults not stored");
    record.evidence = { stored: { legalName: settings.legalName, taxNumber: settings.taxNumber, tax: settings.defaultTaxRatePercent, terms: settings.defaultPaymentTermsDays } };
  });

  await runStory("F5", async record => {
    await openInvoices(page, base);
    await page.reload({ waitUntil: "load" });
    await page.getByRole("button", { name: "Create invoice" }).waitFor({ state: "visible", timeout: 20_000 });
    const dialog = await openInvoiceForm(page);
    const copy = (await dialog.textContent()) ?? "";
    assertIncludes(copy, `Workspace defaults: ${fresh.termsDays} day terms and ${fresh.taxPercent}% tax.`, "new-invoice copy after settings change");
    expectedDueB = addBusinessDays(fresh.termsDays);
    const dueDefault = await dialog.locator('input[name="dueAt"]').inputValue();
    const taxDefault = await dialog.locator('input[name="taxRate"]').inputValue();
    assert(dueDefault === expectedDueB, `Payment due default ${dueDefault} ≠ today + ${fresh.termsDays} days (${expectedDueB})`);
    assert(Number(taxDefault) === fresh.taxPercent, `Tax rate default ${taxDefault} ≠ ${fresh.taxPercent}`);
    await fillInvoiceForm(dialog, { clientName: seed.clientName, description: `Acceptance work B ${viewport.id}`, netAmount: 200 });
    // Refuse the first save: no false success, no reload, no row.
    const countBefore = (await serverInvoices(page, base)).length;
    const release = monitor.expect("injected 503 on invoice create", ({ url, status, detail }) => url.includes(`${FINANCE_API}/invoices`) && (status === 503 || /503/.test(detail)));
    let loads = 0;
    const onLoad = () => { loads += 1; };
    page.on("load", onLoad);
    let refused = 0;
    await page.route(INVOICES_URL, route => {
      if (route.request().method() !== "POST" || refused > 0) return route.fallback().catch(() => undefined);
      refused += 1;
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Injected 503: invoice storage unavailable." }) }).catch(() => undefined);
    });
    await dialog.getByRole("button", { name: "Save invoice" }).click();
    const alert = page.getByRole("alert").filter({ hasText: /503/ }).first();
    await alert.waitFor({ state: "visible", timeout: 5_000 });
    const alertText = (await alert.textContent()) ?? "";
    assert(/Injected 503|HTTP 503/.test(alertText), `refused save did not surface: ${alertText}`);
    await sleep(500);
    release();
    page.off("load", onLoad);
    assert(loads === 0, "the page reloaded after a refused save (false success)");
    assert(await dialog.isVisible(), "the form closed after a refused save");
    assert((await serverInvoices(page, base)).length === countBefore, "a refused save still created an invoice");
    await page.unroute(INVOICES_URL);
    assert(refused === 1, `expected exactly one refused POST, saw ${refused}`);
    // Same mounted form, same intent, now accepted.
    invoiceB = await submitInvoiceForm(page, dialog);
    assert(invoiceB.issuerSnapshot?.legalName === fresh.legalName, `invoice B snapshot legalName: ${invoiceB.issuerSnapshot?.legalName}`);
    assertIncludes(invoiceB.issuerSnapshot?.businessDetails ?? "", fresh.taxNumber, "invoice B snapshot business details");
    assert(invoiceB.taxCents === 4_000 && invoiceB.totalCents === 24_000, `invoice B money ${invoiceB.taxCents}/${invoiceB.totalCents}`);
    assert(businessDate(invoiceB.dueAt) === expectedDueB, `invoice B dueAt ${businessDate(invoiceB.dueAt)} ≠ ${expectedDueB}`);
    record.evidence = { refusedAlert: alertText, reloadsDuringRefusal: loads, number: invoiceB.number, id: invoiceB.id, dueDefault, taxDefault };
  });

  await runStory("F6", async record => {
    await openInvoice(page, base, invoiceB.id);
    const exportB = await downloadInvoice(page, monitor, `invoice-B-${viewport.id}`);
    assertIncludes(exportB.html, fresh.legalName, "export B seller");
    assertIncludes(exportB.html, fresh.taxNumber, "export B tax number");
    assertIncludes(exportB.html, "Newtown", "export B address");
    assertExcludes(exportB.html, old.legalName, "export B");
    assertExcludes(exportB.html, old.taxNumber, "export B");
    assert(exportDue(exportB.html) === expectedDueB, `export B due ${exportDue(exportB.html)} ≠ ${expectedDueB}`);
    assertIncludes(exportB.html, "<span>Tax</span><span>40.00 GBP</span>", "export B tax line");
    assertIncludes(exportB.html, "<strong>240.00 GBP</strong>", "export B total");
    record.evidence = { filename: exportB.filename, saved: exportB.saved };
  });

  await runStory("F7", async record => {
    await openInvoice(page, base, invoiceA.id);
    const previewSeller = (await page.locator("article h2").first().textContent())?.trim() ?? "";
    assert(previewSeller === old.legalName, `after the settings change the mounted preview of A shows ${JSON.stringify(previewSeller)}`);
    assertExcludes((await page.locator("article").textContent()) ?? "", fresh.taxNumber, "on-screen preview of A after the change");
    const again = await downloadInvoice(page, monitor, `invoice-A-${viewport.id}-after-change`);
    assertIncludes(again.html, old.legalName, "export A after change");
    assertIncludes(again.html, old.taxNumber, "export A after change");
    assertExcludes(again.html, fresh.legalName, "export A after change");
    assertExcludes(again.html, fresh.taxNumber, "export A after change");
    assert(exportDue(again.html) === expectedDueA, `export A due drifted to ${exportDue(again.html)}`);
    assert(again.html === exportA.html, "export A bytes changed after the settings change");
    const stored = (await serverInvoices(page, base)).find(invoice => invoice.id === invoiceA.id);
    assert(stored && JSON.stringify(stored.issuerSnapshot) === JSON.stringify(invoiceA.issuerSnapshot), "stored snapshot for A changed");
    assert(stored.dueAt === invoiceA.dueAt, "stored dueAt for A changed");
    record.evidence = { byteIdentical: true, previewSeller, previewMatchesSnapshot: previewSeller === old.legalName };
  });

  await runStory("F8", async record => {
    const invoices = await serverInvoices(page, base);
    assert(invoices.length === invoicesBefore + 2, `expected ${invoicesBefore + 2} invoices, found ${invoices.length}`);
    const numbers = invoices.map(invoice => invoice.number);
    assert(new Set(numbers).size === numbers.length, `duplicate invoice numbers: ${numbers.join(", ")}`);
    assert(new Set(invoices.map(invoice => invoice.id)).size === invoices.length, "duplicate invoice ids");
    assert(invoices.filter(invoice => invoice.id === invoiceA.id).length === 1 && invoices.filter(invoice => invoice.id === invoiceB.id).length === 1, "A or B is not listed exactly once");
    await openInvoices(page, base);
    const rowsA = await page.getByRole("link", { name: invoiceA.number, exact: true }).count();
    const rowsB = await page.getByRole("link", { name: invoiceB.number, exact: true }).count();
    assert(rowsA >= 1 && rowsB >= 1, "A or B missing from the mounted list");
    record.evidence = { total: invoices.length, numbers, listLinksA: rowsA, listLinksB: rowsB };
  });

  await context.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout checks — separate count from the transactional stories
// ─────────────────────────────────────────────────────────────────────────────

function loadAxeSource() {
  try {
    return readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  } catch {
    return null;
  }
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const main = document.getElementById("main-content");
    return {
      document: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      main: main ? Math.max(0, main.scrollWidth - main.clientWidth) : 0,
    };
  });
}

async function controlSizes(page, names) {
  const sizes = [];
  for (const name of names) {
    const locator = page.getByRole("button", { name, exact: true }).or(page.getByRole("link", { name, exact: true })).or(page.getByPlaceholder(name)).or(page.getByLabel(name)).first();
    const visible = await locator.isVisible().catch(() => false);
    const box = visible ? await locator.boundingBox() : null;
    sizes.push({ name, visible, width: box ? Math.round(box.width) : null, height: box ? Math.round(box.height) : null });
  }
  return sizes;
}

async function runLayoutChecks(browser, seed, base, viewport, axeSource) {
  const context = await openContext(browser, seed, base, viewport);
  const page = await context.newPage();
  const monitor = new Monitor(page, `layout ${viewport.id}`);
  const noteId = shared.noteForLayout;
  const invoiceId = shared.invoiceA?.id;
  const targets = {
    notepad: async () => {
      await page.goto(`${base}/portal/agency/notepad${noteId ? `?note=${encodeURIComponent(noteId)}` : ""}`, { waitUntil: "load" });
      await quickCapture(page).waitFor({ state: "visible", timeout: 15_000 });
      if (viewport.width < 768) await backButton(page).waitFor({ state: "visible", timeout: 5_000 });
      else await page.getByPlaceholder("Search notes").waitFor({ state: "visible", timeout: 5_000 });
    },
    "settings-account": () => openSettingsTab(page, base, "account"),
    "settings-defaults": () => openSettingsTab(page, base, "defaults"),
    invoices: () => openInvoices(page, base),
    "invoice-form": async () => {
      await openInvoices(page, base);
      await openInvoiceForm(page);
    },
    "invoice-detail": async () => {
      assert(invoiceId, "no invoice from the finance stories to inspect");
      await openInvoice(page, base, invoiceId);
    },
  };

  for (const target of LAYOUT_PAGES) {
    const key = `layout:${target.id}:${viewport.id}`;
    const record = { key, group: "layout", id: target.id, name: target.label, viewport: viewport.id, status: "pass", detail: "", evidence: {}, startedAt: Date.now() };
    try {
      await targets[target.id]();
      await sleep(300);
      const overflow = await measureOverflow(page);
      const controls = await controlSizes(page, target.controls);
      let axe = null;
      if (axeSource) {
        await page.addScriptTag({ content: axeSource });
        axe = await page.evaluate(async () => {
          const result = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
          return result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map(n => n.target.join(" ")) }));
        });
      }
      const drained = monitor.drain();
      record.evidenced = drained.evidenced;
      record.observations = drained.observations;
      const problems = [];
      if (overflow.document > 1 || overflow.main > 1) problems.push(`horizontal overflow document=${overflow.document}px main=${overflow.main}px`);
      for (const control of controls) if (!control.visible) problems.push(`control ${JSON.stringify(control.name)} not visible`);
      if (drained.failures.length) problems.push(`browser: ${drained.failures.map(f => `${f.kind} ${f.detail} @ ${f.url}`).join(" | ")}`);
      // House rule: zero serious or critical accessibility findings. Recorded
      // AND failed — "we did not look" is not "nothing found", so a missing
      // axe bundle is itself a failure.
      if (!axe) problems.push("axe-core did not run");
      const blocking = (axe ?? []).filter(v => v.impact === "serious" || v.impact === "critical");
      if (blocking.length) problems.push(`axe serious/critical: ${blocking.map(v => `${v.id}(${v.impact}) ${v.targets.join(";")}`).join(" | ")}`);
      record.evidence = { overflow, controls, axeSeriousOrCritical: blocking, axeOther: (axe ?? []).filter(v => !blocking.includes(v)).map(v => `${v.id}(${v.impact})`) };
      if (problems.length) {
        record.status = "fail";
        record.detail = problems.join(" | ");
        record.screenshot = await screenshot(page, `fail-layout-${target.id}-${viewport.id}`);
      }
    } catch (error) {
      const drained = monitor.drain();
      record.status = "fail";
      record.detail = `${error.message}${drained.failures.length ? ` | browser: ${drained.failures.map(f => `${f.kind} ${f.detail}`).join(" | ")}` : ""}`;
      record.screenshot = await screenshot(page, `fail-layout-${target.id}-${viewport.id}`);
    }
    record.ms = Date.now() - record.startedAt;
    records.push(record);
    const small = (record.evidence.controls ?? []).filter(c => c.visible && (c.width < 44 || c.height < 44)).map(c => `${c.name} ${c.width}×${c.height}`);
    console.log(`  ${record.status === "pass" ? "✓" : "✗"} ${key}${record.detail ? ` — ${record.detail}` : ""}${small.length ? ` (targets under 44px: ${small.join(", ")})` : ""}${record.evidence.axeSeriousOrCritical?.length ? ` (axe serious/critical: ${record.evidence.axeSeriousOrCritical.map(v => v.id).join(", ")})` : ""}`);
  }
  await context.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// Loader evidence (#136) — recorded, never claimed as an AT announcement
// ─────────────────────────────────────────────────────────────────────────────

async function runLoaderEvidence(browser, seed, base, viewport, reducedMotion) {
  const context = await openContext(browser, seed, base, viewport, { reducedMotion: reducedMotion ? "reduce" : "no-preference" });
  const page = await context.newPage();
  const monitor = new Monitor(page, `loader ${viewport.id}`);
  const id = reducedMotion ? "L2" : "L1";
  const name = reducedMotion ? "delayed route transition under prefers-reduced-motion" : "delayed route transition exposes one polite atomic status, then removes it";
  await story({ group: "loader", id, name, viewport, page, monitor, run: async record => {
    await page.goto(`${base}/portal/agency/notepad`, { waitUntil: "load" });
    await quickCapture(page).waitFor({ state: "visible", timeout: 15_000 });
    // Finance is deliberately not a sidebar row (the "ops" panel is hidden by
    // the agency override); Operations is a rendered row and a dynamic route.
    const link = page.locator('aside[aria-label="Primary navigation"] a[href="/portal/agency/operations"]').first();
    await link.waitFor({ state: "visible", timeout: 5_000 });
    await page.evaluate(() => {
      document.querySelector('aside[aria-label="Primary navigation"]')?.setAttribute("data-ux-mark", "sidebar");
      document.querySelector("header")?.setAttribute("data-ux-mark", "topbar");
    });
    let delayed = 0;
    await page.route(url => /^\/portal\/agency\/operations/.test(url.pathname), async route => {
      if (route.request().headers().rsc !== "1") return route.fallback().catch(() => undefined);
      delayed += 1;
      await sleep(1_600);
      return route.continue().catch(() => undefined);
    });
    await link.focus();
    await link.click();
    const loader = page.locator("[data-aqua-viewport-loader]");
    let appeared = false;
    let snapshot = null;
    let attributes = null;
    let computed = null;
    const deadline = Date.now() + 2_500;
    while (Date.now() < deadline) {
      if (await loader.count()) {
        appeared = true;
        attributes = await loader.first().evaluate(node => ({
          role: node.getAttribute("role"),
          ariaLive: node.getAttribute("aria-live"),
          ariaAtomic: node.getAttribute("aria-atomic"),
          liveStatusesInside: node.querySelectorAll('[aria-live="polite"][role="status"]').length + (node.matches('[aria-live="polite"][role="status"]') ? 1 : 0),
          loadersOnPage: document.querySelectorAll("[data-aqua-viewport-loader]").length,
          visibleText: node.querySelector(".sr-only")?.textContent ?? "",
          decorativeHidden: node.querySelector(".aqua-viewport-loading__content")?.getAttribute("aria-hidden") === "true",
        }));
        computed = await loader.first().evaluate(node => {
          const style = window.getComputedStyle(node);
          const spinner = node.querySelector(".aqua-viewport-loading__spinner");
          return { animationName: style.animationName, opacity: style.opacity, spinnerAnimation: spinner ? window.getComputedStyle(spinner).animationName : null };
        });
        snapshot = await loader.first().ariaSnapshot().catch(() => null);
        break;
      }
      await sleep(40);
    }
    assert(appeared, `no viewport loader appeared during a ${delayed}× delayed transition`);
    assert(attributes.role === "status" && attributes.ariaLive === "polite" && attributes.ariaAtomic === "true", `loader attributes ${JSON.stringify(attributes)}`);
    assert(attributes.liveStatusesInside === 1 && attributes.loadersOnPage === 1, `expected exactly one polite status, got ${JSON.stringify(attributes)}`);
    assert(snapshot && /status/.test(snapshot), `loader is not in the accessibility tree as a status: ${snapshot}`);
    await loader.waitFor({ state: "detached", timeout: 15_000 });
    await page.getByRole("heading", { level: 1 }).first().waitFor({ state: "visible", timeout: 15_000 });
    const after = await page.evaluate(() => {
      const active = document.activeElement;
      const curtain = document.querySelector('[data-testid="aqua-loading-curtain"]');
      return {
        sidebarPreserved: document.querySelector('aside[aria-label="Primary navigation"][data-ux-mark="sidebar"]') !== null,
        topbarPreserved: document.querySelector('header[data-ux-mark="topbar"]') !== null,
        activeElement: active ? `${active.tagName.toLowerCase()}${active.getAttribute("href") ? `[href=${active.getAttribute("href")}]` : ""}` : null,
        activeConnected: Boolean(active && active.isConnected && active !== document.body),
        curtainPresentNow: curtain !== null,
        curtainDisplay: curtain ? window.getComputedStyle(curtain).display : null,
        loadersNow: document.querySelectorAll("[data-aqua-viewport-loader]").length,
      };
    });
    assert(after.loadersNow === 0, "loader still present after commit");
    assert(after.sidebarPreserved && after.topbarPreserved, `chrome not preserved: ${JSON.stringify(after)}`);
    assert(after.activeConnected, `focus detached after navigation: ${JSON.stringify(after)}`);
    if (reducedMotion) {
      assert(computed.animationName === "none" && computed.opacity === "1", `reduced motion not honoured on loader: ${JSON.stringify(computed)}`);
      assert(computed.spinnerAnimation === "none", `spinner still animates under reduced motion: ${computed.spinnerAnimation}`);
    }
    record.evidence = { delayedRequests: delayed, attributes, ariaSnapshot: snapshot, computed, after, assistiveTechnologyDriven: false };
  } });
  await context.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(ARTEFACTS, { recursive: true });
  let seed;
  let base;
  let server = null;
  if (ATTACH_BASE) {
    const seedPath = process.env.AQUA_SEED_JSON;
    if (!seedPath || !existsSync(seedPath)) throw new Error("attach mode needs AQUA_SEED_JSON pointing at a seed.json this script wrote");
    seed = JSON.parse(await readFile(seedPath, "utf8"));
    base = ATTACH_BASE;
    console.log(`[lane] attaching to ${base}`);
  } else {
    if (process.env.AQUA_UX_BUILD === "1") await buildLane();
    if (!existsSync(join(ROOT, DIST, "BUILD_ID"))) throw new Error(`no production build at ${DIST} — set AQUA_UX_BUILD=1 or build it first`);
    console.log(`[lane] seeding a disposable state under ${STATE_DIR}`);
    seed = await seedLane();
    console.log(`[lane] starting next start on 127.0.0.1:${PORT} from ${DIST}`);
    server = await startServer(seed);
    base = server.base;
    console.log(`[lane] server pid ${server.pid} ready at ${base}`);
    if (process.env.AQUA_UX_SERVE_ONLY === "1") {
      console.log(`[lane] serve-only: attach with AQUA_BASE=${base} AQUA_SEED_JSON=${join(STATE_DIR, "seed.json")}; stop pid ${server.pid} when done`);
      await new Promise(() => undefined);
    }
  }

  const { browser, note: browserNote } = await launchBrowser();
  const storyViewports = selectedStoryViewports();
  const required = requiredKeys({ storyViewports, groups: GROUPS });
  const startedAt = new Date().toISOString();
  try {
    if (GROUPS.has("notepad")) {
      for (const viewport of storyViewports) {
        console.log(`\nNotepad stories @ ${viewport.id}`);
        await runNotepadStories(browser, seed, base, viewport);
      }
    }
    if (GROUPS.has("finance")) {
      for (const viewport of storyViewports) {
        console.log(`\nFinance stories @ ${viewport.id}`);
        await runFinanceStories(browser, seed, base, viewport);
      }
    }
    if (GROUPS.has("layout")) {
      // A note for the mobile editor state, whichever group created one.
      const probe = await openContext(browser, seed, base, LAYOUT_VIEWPORTS[5]);
      const probePage = await probe.newPage();
      const notes = await serverNotes(probePage, base).catch(() => []);
      shared.noteForLayout = notes.find(item => item.status === "active")?.id ?? null;
      if (!shared.invoiceA) shared.invoiceA = (await serverInvoices(probePage, base).catch(() => []))[0] ?? null;
      await probe.close();
      const axeSource = loadAxeSource();
      for (const viewport of LAYOUT_VIEWPORTS) {
        console.log(`\nLayout checks @ ${viewport.id}${axeSource ? "" : " (axe-core unavailable — no accessibility scan)"}`);
        await runLayoutChecks(browser, seed, base, viewport, axeSource);
      }
    }
    if (GROUPS.has("loader")) {
      console.log("\nLoader evidence @ 1280x800");
      await runLoaderEvidence(browser, seed, base, LAYOUT_VIEWPORTS[5], false);
      await runLoaderEvidence(browser, seed, base, LAYOUT_VIEWPORTS[5], true);
    }
  } finally {
    await browser.close().catch(() => undefined);
    if (server) {
      await stopChild(server.child);
      console.log(`[lane] stopped server pid ${server.pid}`);
    }
  }

  const result = summarise(records, required);
  await writeFile(join(ARTEFACTS, "records.json"), `${JSON.stringify({ base, browser: browserNote, startedAt, finishedAt: new Date().toISOString(), dist: ATTACH_BASE ? null : DIST, port: ATTACH_BASE ? null : PORT, serverPid: server?.pid ?? null, result: { ok: result.ok, byGroup: result.byGroup, missing: result.missing }, records }, null, 2)}\n`);

  console.log("\nResults");
  for (const [group, counts] of Object.entries(result.byGroup)) {
    console.log(`  ${group.padEnd(8)} ${counts.passed} passed · ${counts.failed} failed · ${counts.evidenced} declared fault event(s) · ${counts.observations} observation(s)`);
  }
  if (result.missing.length) {
    console.log(`\n${result.missing.length} required check(s) never ran — this run proves nothing about them:`);
    result.missing.slice(0, 30).forEach(key => console.log(`  - ${key}`));
  }
  if (result.failures.length) {
    console.log("\nFailures:");
    result.failures.forEach(f => console.log(`  - ${f.key}: ${f.detail}`));
  }
  console.log(`\nArtefacts: ${ARTEFACTS}\n`);
  if (!result.ok) process.exit(1);
  console.log("✓ notepad + finance acceptance green\n");
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch(error => {
    console.error(`\nacceptance could not run:\n${error.stack || error.message}\n`);
    for (const child of activeChildren) child.kill("SIGKILL");
    process.exit(2);
  });
}
