#!/usr/bin/env node
// Aqua Tag routing — mounted browser acceptance on an isolated lane (issues #85).
//
// What it proves, with a real Chromium against a real `next dev` server on its
// OWN port, dist dir and state file (nothing shared, nothing retained touched):
//
//   * "route back to the agency inbox" on the company control (Fulfilment ›
//     Aqua Tags) and on the client control (client › Systems) keeps the
//     registration, its tool injections and its imported form schemas — the
//     server is asked directly after the click, and again after a reload;
//   * permanent removal (Inbox › Channels) stays a separate action: cancelling
//     its confirmation changes nothing; confirming removes the registration,
//     the injections and the schemas, and a reload agrees;
//   * a forced HTTP 500, an unreadable body, a 200 carrying ok:false and a 200
//     carrying a receipt for some OTHER source are each rejected: the row stays,
//     the busy state settles, an alert is announced, and the next click works;
//   * a second activation while a mutation is in flight sends nothing;
//   * a client (end-customer) session and an anonymous caller are refused the
//     mutation, so the agency/client/company/fulfilment boundaries hold;
//   * every story is driven from the keyboard with a visible focus ring, at
//     390×844 and 1280×800, with no horizontal overflow and a clean console
//     and network log (my own injected failures are counted, not hidden).
//
//   node scripts/browser-aqua-tag-routing-acceptance.mjs
//
// Port 3182 · dist .next-aqua-tag-3182 (webpack) · state + evidence /private/tmp/aquacrm-aqua-tag-3182.
// The server it starts is the only process it stops. Exit code 0 only when
// every check passed; the evidence JSON names each one.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.AQUA_TAG_ACCEPTANCE_PORT ?? 3182);
const DIST = process.env.AQUA_TAG_ACCEPTANCE_DIST ?? `.next-aqua-tag-${PORT}`;
const STATE_DIR = process.env.AQUA_TAG_ACCEPTANCE_STATE ?? `/private/tmp/aquacrm-aqua-tag-${PORT}`;
const EVIDENCE_DIR = join(STATE_DIR, "evidence");
const BASE = `http://127.0.0.1:${PORT}`;
const VIEWPORTS = [
  { id: "mobile-390", width: 390, height: 844 },
  { id: "desktop-1280", width: 1280, height: 800 },
];
const SESSION_SECRET = "aqua-tag-routing-acceptance-secret-0123456789abcdef";

const laneEnv = {
  ...process.env,
  NODE_ENV: undefined,
  PORTAL_BACKEND: "file",
  PORTAL_DATA_FILE: join(STATE_DIR, "portal-state.json"),
  INBOX_LOCAL_DATA_FILE: join(STATE_DIR, "inbox-messaging.json"),
  DEV_THOUGHTS_FILE: join(STATE_DIR, "dev-thoughts.json"),
  PORTAL_DEV_MODE: "true",
  PORTAL_DEV_AGENCY: "",
  PORTAL_SESSION_SECRET: SESSION_SECRET,
  NEXT_DIST_DIR: DIST,
  NEXT_PUBLIC_SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  DATABASE_URL: "",
  VERCEL_ENV: "",
  CRON_SECRET: "",
  TSX_TSCONFIG_PATH: join(ROOT, "tsconfig.json"),
};
delete laneEnv.NODE_ENV;

// ─── Evidence ────────────────────────────────────────────────────────────────

const evidence = { startedAt: new Date().toISOString(), base: BASE, viewports: [], checks: [], serverPid: null, residuals: [] };
let failures = 0;
function check(name, ok, detail = "") {
  evidence.checks.push({ name, ok: Boolean(ok), detail: String(detail) });
  if (!ok) failures += 1;
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}
async function saveEvidence() {
  evidence.finishedAt = new Date().toISOString();
  evidence.failures = failures;
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await writeFile(join(EVIDENCE_DIR, "aqua-tag-routing-acceptance.json"), JSON.stringify(evidence, null, 2));
}

// ─── Seed: an isolated state file with exactly the rows the stories need ─────

const SEED_SOURCE = String.raw`
const { createRequire } = await import("node:module");
const { join } = await import("node:path");
const require_ = createRequire(join(process.cwd(), "aqua-tag-acceptance-seed.cjs"));
const serverOnly = require_.resolve("server-only");
require_.cache[serverOnly] = { id: serverOnly, filename: serverOnly, loaded: true, paths: [], children: [], exports: {} };
const storage = require_("./src/server/storage");
const tenants = require_("./src/server/tenants");
const users = require_("./src/server/users");
const companies = require_("./src/server/tradingCompanies");
const sources = require_("./src/server/websiteSources");
const injections = require_("./src/server/websiteInjections");
const schemas = require_("./src/server/websiteFormSchemas");
const dev = require_("./src/lib/server/dev/devMode");
await storage.ensureHydrated();
const agency = Object.values(storage.getState().agencies).find(a => a.slug === dev.DEV_AGENCY_SLUG)
  ?? tenants.createAgency({ name: dev.DEV_AGENCY_NAME, slug: dev.DEV_AGENCY_SLUG });
const owner = users.listUsersForAgency(agency.id).find(u => u.role === "agency-owner")
  ?? users.createUser({ email: dev.DEV_OWNER_EMAIL, name: "Dev Owner", role: "agency-owner", agencyId: agency.id, password: "Acceptance-owner-1!x" });
const client = tenants.createClient(agency.id, { name: "Cedar Dental", websiteUrl: "https://cedar-dental.test" });
const company = companies.createTradingCompany(agency.id, { name: "Zimante Digital", website: "https://zimante-digital.test" }, owner.id);
const fakeFetch = async url => ({ html: '<form id="contact"><input name="email" type="email"><button>Send</button></form>', finalUrl: url, statusCode: 200 });
const make = async (host, routing) => {
  const source = sources.addWebsiteSource({ agencyId: agency.id, host, createdBy: owner.id, ...routing });
  injections.addInjection({ agencyId: agency.id, websiteSourceId: source.id, kind: "ga4", value: "G-ACCEPT01" });
  const imported = await schemas.importFormSchemasForSite({ agencyId: agency.id, websiteSourceId: source.id }, fakeFetch);
  if (!imported.ok) throw new Error("seed import failed: " + imported.error);
  return source.id;
};
const clientSite = await make("cedar-dental.test", { destinationClientId: client.id });
const companySite = await make("zimante-digital.test", { destinationCompanyId: company.id });
const retireSite = await make("retire-me.test", {});
await storage.flushPendingWrites();
process.stdout.write(JSON.stringify({
  agencyId: agency.id, ownerId: owner.id, clientId: client.id, companyId: company.id,
  clientSite, companySite, retireSite,
  clientHost: "cedar-dental.test", companyHost: "zimante-digital.test", retireHost: "retire-me.test",
}));
`;

function runNode(args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, env: laneEnv, stdio: ["ignore", "pipe", "pipe"], ...options });
    let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.on("error", rejectRun);
    child.on("close", code => code === 0 ? resolveRun({ stdout, stderr }) : rejectRun(new Error(`exit ${code}: ${stderr || stdout}`)));
  });
}

async function seed() {
  await mkdir(STATE_DIR, { recursive: true });
  if (existsSync(laneEnv.PORTAL_DATA_FILE)) {
    throw new Error(`${laneEnv.PORTAL_DATA_FILE} already exists; this lane expects a fresh state file. Remove it (it is this harness's own artifact) and rerun.`);
  }
  const tsx = require.resolve("tsx");
  const { stdout } = await runNode(["--conditions=react-server", "--import", tsx, "--input-type=module", "--eval", SEED_SOURCE]);
  const jsonStart = stdout.lastIndexOf("{");
  return JSON.parse(stdout.slice(jsonStart));
}

// ─── Server ──────────────────────────────────────────────────────────────────

let server = null;
async function startServer() {
  const next = join(ROOT, "node_modules", "next", "dist", "bin", "next");
  // Webpack, deliberately: this lane often runs from a git worktree whose
  // node_modules is a symlink into the main checkout, which Turbopack refuses
  // ("points out of the filesystem root"). The dist dir is this lane's own, so
  // the two bundlers never share a cache.
  server = spawn(process.execPath, [next, "dev", "--webpack", "-p", String(PORT), "-H", "127.0.0.1"], {
    cwd: ROOT, env: laneEnv, stdio: ["ignore", "pipe", "pipe"],
  });
  evidence.serverPid = server.pid;
  let log = "";
  server.stdout.setEncoding("utf8").on("data", chunk => { log += chunk; });
  server.stderr.setEncoding("utf8").on("data", chunk => { log += chunk; });
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/auth/me`, { redirect: "manual" });
      if (response.status > 0) { evidence.serverLogHead = log.slice(0, 2000); return; }
    } catch { /* not up yet */ }
    if (server.exitCode !== null) throw new Error(`dev server exited early:\n${log}`);
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
  }
  throw new Error(`dev server did not answer within 240s:\n${log.slice(-4000)}`);
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const pid = server.pid;
  server.kill("SIGTERM");
  const deadline = Date.now() + 10_000;
  while (server.exitCode === null && server.signalCode === null && Date.now() < deadline) {
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  if (server.exitCode === null && server.signalCode === null) server.kill("SIGKILL");
  evidence.serverStopped = { pid, exitCode: server.exitCode, signal: server.signalCode };
}

// ─── Browser helpers ─────────────────────────────────────────────────────────

function newObserver(page, label) {
  const record = { label, consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [], injected: [] };
  page.on("console", message => { if (message.type() === "error") record.consoleErrors.push(message.text()); });
  page.on("pageerror", error => record.pageErrors.push(String(error)));
  page.on("requestfailed", request => record.failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`));
  page.on("response", response => {
    if (response.status() >= 400) record.httpErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });
  return record;
}

/** Everything in the log that is not one of my own injected failures or a dev-only RSC prefetch abort. */
function unexpectedNoise(record) {
  const injected = new Set(record.injected);
  const isInjected = line => [...injected].some(mark => line.includes(mark));
  const prefetchAbort = line => /net::ERR_ABORTED/.test(line) && /_rsc=|\/_next\//.test(line);
  const injectedConsole = line => /the server responded with a status of 500|Failed to load resource/.test(line) && record.injected.length > 0;
  return {
    consoleErrors: record.consoleErrors.filter(line => !injectedConsole(line)),
    pageErrors: record.pageErrors,
    failedRequests: record.failedRequests.filter(line => !isInjected(line) && !prefetchAbort(line)),
    httpErrors: record.httpErrors.filter(line => !isInjected(line) && !/ 500 POST .*website-sources/.test(line)),
  };
}

async function overflow(page) {
  return page.evaluate(() => {
    const measure = (element, label) => ({ label, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth });
    const out = [measure(document.scrollingElement ?? document.documentElement, "document")];
    const main = document.querySelector("main#main-content") ?? document.querySelector("main");
    if (main) out.push(measure(main, "main"));
    return out;
  });
}
function overflowOk(measurements) {
  return measurements.every(entry => entry.scrollWidth - entry.clientWidth <= 1);
}

/** Tab through the document until the element with this accessible name owns focus. */
async function focusByKeyboard(page, name, maxTabs = 400) {
  await page.evaluate(() => { (document.activeElement)?.blur?.(); });
  await page.keyboard.press("Tab");
  for (let index = 0; index < maxTabs; index += 1) {
    const focused = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element) return null;
      const label = element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "";
      const style = getComputedStyle(element);
      return {
        label,
        focusVisible: element.matches(":focus-visible"),
        ring: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0 || style.boxShadow !== "none",
        disabled: element.hasAttribute("disabled"),
      };
    });
    if (focused && focused.label === name) return focused;
    await page.keyboard.press("Tab");
  }
  return null;
}

/**
 * The dev entry mints the session on this origin and then 303s to a
 * `localhost` URL, which the browser treats as a different origin (and a
 * different cookie jar). So: hit /dev, ignore where it lands, and prove the
 * cookie on THIS origin through the session endpoint before any story runs.
 */
async function signIn(page, context, label) {
  await page.goto(`${BASE}/dev`, { waitUntil: "commit" });
  const me = await context.request.get(`${BASE}/api/auth/me`);
  let body = null;
  try { body = await me.json(); } catch { body = null; }
  check(`${label}: owner signed in on ${BASE}`, me.status() === 200 && body && (body.role === "agency-owner" || body.user?.role === "agency-owner"), `HTTP ${me.status()} ${JSON.stringify(body).slice(0, 160)}`);
}

async function registry(context) {
  const response = await context.request.get(`${BASE}/api/portal/website-sources`);
  if (!response.ok()) throw new Error(`registry GET ${response.status()}`);
  return response.json();
}
async function injectionsFor(context) {
  const response = await context.request.get(`${BASE}/api/portal/website-injections`);
  if (!response.ok()) throw new Error(`injections GET ${response.status()}`);
  return response.json();
}
function describeSource(payload, id) {
  const source = payload.sources.find(entry => entry.id === id);
  return source ? { present: true, destinationClientId: source.destinationClientId, destinationCompanyId: source.destinationCompanyId, forms: (payload.formSchemasBySource[id] ?? []).length } : { present: false };
}

/** Count the mutation POSTs for one action as the page sends them, whatever route handlers do with them. */
function countPosts(page, action) {
  const seen = [];
  const listener = request => {
    if (request.method() !== "POST" || !request.url().endsWith("/api/portal/website-sources")) return;
    let body = null;
    try { body = request.postDataJSON(); } catch { body = null; }
    if (body?.action === action) seen.push(body);
  };
  page.on("request", listener);
  return { seen, stop: () => page.off("request", listener) };
}

/** Install a queue of fabricated answers for one action; each entry is consumed by one matching POST. */
async function installFailures(page, record, action, queue) {
  const sent = [];
  const handler = async route => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    let body = null;
    try { body = request.postDataJSON(); } catch { body = null; }
    if (!body || body.action !== action) return route.continue();
    sent.push(body);
    const step = queue.shift();
    if (!step) return route.continue();
    record.injected.push(request.url());
    if (step.delayMs) await new Promise(resolveWait => setTimeout(resolveWait, step.delayMs));
    return route.fulfill({ status: step.status, contentType: step.contentType ?? "application/json", body: step.body });
  };
  // route()/unroute() are asynchronous: an unawaited unroute racing the next
  // route() can leave interception switched off. Always awaited.
  await page.route("**/api/portal/website-sources", handler);
  return { sent, remove: () => page.unroute("**/api/portal/website-sources", handler) };
}

const FAILURE_STEPS = sourceId => [
  { name: "forced HTTP 500", status: 500, body: "internal failure" },
  { name: "malformed body", status: 200, body: "{not json" },
  { name: "false-success 200 (ok:false)", status: 200, body: JSON.stringify({ ok: false, error: "Forced domain refusal from the harness." }) },
  { name: "wrong-source 200", status: 200, body: JSON.stringify({ ok: true, source: { id: "wsrc_someone_else", host: "someone-else.test", label: "someone-else.test" }, removed: { id: "wsrc_someone_else", host: "someone-else.test" } }) },
];

async function activate(page, name) {
  const focused = await focusByKeyboard(page, name);
  if (!focused) return null;
  await page.keyboard.press("Enter");
  return focused;
}

async function settleBusy(page, name, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await page.evaluate(label => {
      const button = [...document.querySelectorAll("button")].find(element => element.getAttribute("aria-label") === label);
      if (!button) return { present: false };
      return { present: true, disabled: button.hasAttribute("disabled"), busyRow: button.closest("li")?.getAttribute("aria-busy") === "true" };
    }, name);
    if (!state.present || (!state.disabled && !state.busyRow)) return state;
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  return { present: true, disabled: true, timedOut: true };
}

async function alertText(page) {
  return page.evaluate(() => [...document.querySelectorAll('[role="alert"]')].map(element => element.textContent?.trim() ?? "").filter(Boolean).join(" | "));
}

async function shot(page, name) {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: join(EVIDENCE_DIR, `${name}.png`), fullPage: false });
}

// ─── Stories ─────────────────────────────────────────────────────────────────

async function storyRouteToInbox({ page, context, record, viewport, url, buttonName, sourceId, expectBefore, kind }) {
  const tag = `${viewport.id} ${kind} route-to-inbox`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.locator(`button[aria-label="${buttonName}"]`).first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => undefined);
  const rendered = await page.locator(`button[aria-label="${buttonName}"]`).count() === 1;
  check(`${tag}: page renders the control`, rendered, rendered ? "" : `no control named "${buttonName}" at ${page.url()}`);
  if (!rendered) { await shot(page, `${viewport.id}-${kind}-missing-control`); return; }
  check(`${tag}: no horizontal overflow on load`, overflowOk(await overflow(page)), JSON.stringify(await overflow(page)));
  const before = describeSource(await registry(context), sourceId);
  check(`${tag}: server state before`, before.present && expectBefore(before) && before.forms >= 1, JSON.stringify(before));

  // Forced failures first: each must keep the row, settle the busy state, announce, and allow a retry.
  const steps = FAILURE_STEPS(sourceId);
  const failures = await installFailures(page, record, "route-to-inbox", steps.map(step => ({ ...step })));
  for (const step of steps) {
    const focused = await activate(page, buttonName);
    check(`${tag}: keyboard reaches the control with a visible focus ring (${step.name})`, focused && focused.focusVisible && focused.ring && !focused.disabled, JSON.stringify(focused));
    const settled = await settleBusy(page, buttonName);
    const alerts = await alertText(page);
    const after = describeSource(await registry(context), sourceId);
    check(`${tag}: ${step.name} keeps the row visible`, settled.present, JSON.stringify(settled));
    check(`${tag}: ${step.name} settles the busy state`, settled.present && !settled.disabled && !settled.timedOut, JSON.stringify(settled));
    check(`${tag}: ${step.name} announces an accessible error`, alerts.length > 0, alerts);
    check(`${tag}: ${step.name} changed nothing on the server`, after.present && expectBefore(after) && after.forms === before.forms, JSON.stringify(after));
  }
  await shot(page, `${viewport.id}-${kind}-after-failures`);

  // Duplicate activation while a slow real request is in flight: exactly one POST.
  await failures.remove();
  const posts = countPosts(page, "route-to-inbox");
  const slowRoute = async route => {
    const request = route.request();
    let body = null; try { body = request.postDataJSON(); } catch { body = null; }
    if (request.method() === "POST" && body?.action === "route-to-inbox") { await new Promise(resolveWait => setTimeout(resolveWait, 1200)); }
    return route.continue();
  };
  await page.route("**/api/portal/website-sources", slowRoute);
  const focused = await activate(page, buttonName);
  check(`${tag}: retry reaches the control from the keyboard`, focused && focused.focusVisible && !focused.disabled, JSON.stringify(focused));
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const settled = await settleBusy(page, buttonName, 20_000);
  await page.unroute("**/api/portal/website-sources", slowRoute);
  posts.stop();
  check(`${tag}: repeated activation during the in-flight mutation sent exactly one request`, posts.seen.length === 1, `${posts.seen.length} route-to-inbox POST(s)`);
  check(`${tag}: successful retry removes the row from this list`, settled.present === false, JSON.stringify(settled));
  const after = describeSource(await registry(context), sourceId);
  check(`${tag}: registration retained with no destination`, after.present && !after.destinationClientId && !after.destinationCompanyId, JSON.stringify(after));
  check(`${tag}: imported form schemas retained`, after.forms === before.forms && after.forms >= 1, `${after.forms} form(s)`);
  const injections = (await injectionsFor(context)).sites.find(site => site.id === sourceId);
  check(`${tag}: tool injections retained`, injections && injections.injections.length >= 1, JSON.stringify(injections?.injections?.map(item => item.value)));
  check(`${tag}: no error announced after success`, (await alertText(page)).length === 0, await alertText(page));

  await page.reload({ waitUntil: "networkidle" });
  check(`${tag}: reload — the control no longer lists the routed site`, await page.locator(`button[aria-label="${buttonName}"]`).count() === 0);
  const reloaded = describeSource(await registry(context), sourceId);
  check(`${tag}: reload — the route is durable on the server`, reloaded.present && !reloaded.destinationClientId && !reloaded.destinationCompanyId && reloaded.forms >= 1, JSON.stringify(reloaded));
  check(`${tag}: no horizontal overflow after reload`, overflowOk(await overflow(page)), JSON.stringify(await overflow(page)));
  await shot(page, `${viewport.id}-${kind}-after-reload`);
}

async function storyRemoval({ page, context, record, viewport, sourceId, host }) {
  const tag = `${viewport.id} removal`;
  const buttonName = `Permanently remove ${host}`;
  await page.goto(`${BASE}/portal/agency/inbox?view=channels`, { waitUntil: "networkidle" });
  await page.locator(`button[aria-label="${buttonName}"]`).first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => undefined);
  const listed = await page.locator(`button[aria-label="${buttonName}"]`).count() === 1;
  check(`${tag}: the channels panel lists the site`, listed, listed ? "" : `no control named "${buttonName}" at ${page.url()}`);
  if (!listed) { await shot(page, `${viewport.id}-removal-missing-control`); return; }
  check(`${tag}: no horizontal overflow on load`, overflowOk(await overflow(page)), JSON.stringify(await overflow(page)));
  const before = describeSource(await registry(context), sourceId);
  const injectionsBefore = (await injectionsFor(context)).sites.find(site => site.id === sourceId);
  check(`${tag}: server state before`, before.present && before.forms >= 1 && injectionsBefore?.injections.length >= 1, JSON.stringify(before));

  // Cancel: the confirmation is dismissed, nothing is sent, nothing changes.
  let dialogs = 0;
  const dismiss = async dialog => { dialogs += 1; await dialog.dismiss(); };
  page.on("dialog", dismiss);
  const watcher = countPosts(page, "remove");
  const focused = await activate(page, buttonName);
  check(`${tag}: keyboard reaches the removal control with a visible focus ring`, focused && focused.focusVisible && focused.ring, JSON.stringify(focused));
  await page.waitForTimeout(500);
  page.off("dialog", dismiss);
  check(`${tag}: cancelling asks for confirmation first`, dialogs === 1, `${dialogs} dialog(s)`);
  watcher.stop();
  check(`${tag}: cancelling sends nothing`, watcher.seen.length === 0, `${watcher.seen.length} POST(s)`);
  const afterCancel = describeSource(await registry(context), sourceId);
  check(`${tag}: cancelling changes nothing`, afterCancel.present && afterCancel.forms === before.forms, JSON.stringify(afterCancel));
  check(`${tag}: the row is still shown after cancel`, await page.locator(`button[aria-label="${buttonName}"]`).count() === 1);

  // Confirm, but the server misbehaves: the row must stay each time.
  const accept = async dialog => { await dialog.accept(); };
  page.on("dialog", accept);
  const steps = FAILURE_STEPS(sourceId);
  const failures = await installFailures(page, record, "remove", steps.map(step => ({ ...step })));
  for (const step of steps) {
    const reached = await activate(page, buttonName);
    check(`${tag}: keyboard reaches the removal control (${step.name})`, reached && reached.focusVisible && !reached.disabled, JSON.stringify(reached));
    const settled = await settleBusy(page, buttonName);
    const alerts = await alertText(page);
    const after = describeSource(await registry(context), sourceId);
    check(`${tag}: ${step.name} keeps the row visible`, settled.present, JSON.stringify(settled));
    check(`${tag}: ${step.name} settles the busy state`, settled.present && !settled.disabled && !settled.timedOut, JSON.stringify(settled));
    check(`${tag}: ${step.name} announces an accessible error`, alerts.length > 0, alerts);
    check(`${tag}: ${step.name} removed nothing on the server`, after.present && after.forms === before.forms, JSON.stringify(after));
  }
  await failures.remove();
  await shot(page, `${viewport.id}-removal-after-failures`);

  // Confirm for real.
  const real = countPosts(page, "remove");
  const reached = await activate(page, buttonName);
  check(`${tag}: successful retry reaches the control from the keyboard`, reached && !reached.disabled, JSON.stringify(reached));
  await page.keyboard.press("Enter");
  const settled = await settleBusy(page, buttonName, 20_000);
  page.off("dialog", accept);
  real.stop();
  check(`${tag}: a second activation during removal sent no extra request`, real.seen.length === 1, `${real.seen.length} remove POST(s)`);
  check(`${tag}: confirmation removes the row`, settled.present === false, JSON.stringify(settled));
  const after = describeSource(await registry(context), sourceId);
  const injectionsAfter = (await injectionsFor(context)).sites.find(site => site.id === sourceId);
  check(`${tag}: registration removed on the server`, after.present === false, JSON.stringify(after));
  check(`${tag}: tool injections removed with it`, injectionsAfter === undefined, JSON.stringify(injectionsAfter));
  check(`${tag}: imported form schemas removed with it`, !(await registry(context)).formSchemasBySource[sourceId]);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  check(`${tag}: reload — the row stays gone`, await page.locator(`button[aria-label="${buttonName}"]`).count() === 0);
  check(`${tag}: reload — still removed on the server`, describeSource(await registry(context), sourceId).present === false);
  check(`${tag}: no horizontal overflow after reload`, overflowOk(await overflow(page)), JSON.stringify(await overflow(page)));
  await shot(page, `${viewport.id}-removal-after-reload`);
}

async function storyBoundaries({ browser, seeded }) {
  const anonymous = await browser.newContext();
  const refusedAnon = await anonymous.request.post(`${BASE}/api/portal/website-sources`, { data: { action: "route-to-inbox", id: seeded.clientSite } });
  check("boundary: an anonymous caller cannot re-route a site", [401, 403].includes(refusedAnon.status()), `HTTP ${refusedAnon.status()}`);
  await anonymous.close();

  const customer = await browser.newContext();
  const page = await customer.newPage();
  const signIn = await page.goto(`${BASE}/dev?client=${encodeURIComponent(seeded.clientId)}`, { waitUntil: "networkidle" });
  check("boundary: a client session signs in through the dev entry", signIn && signIn.status() < 400, `HTTP ${signIn?.status()} → ${page.url()}`);
  const refusedClient = await customer.request.post(`${BASE}/api/portal/website-sources`, { data: { action: "route-to-inbox", id: seeded.clientSite } });
  check("boundary: a client (end-customer) session cannot re-route or read the agency registry", [401, 403, 404].includes(refusedClient.status()), `HTTP ${refusedClient.status()}`);
  const refusedRemove = await customer.request.post(`${BASE}/api/portal/website-sources`, { data: { action: "remove", id: seeded.retireSite } });
  check("boundary: a client session cannot remove a registration", [401, 403, 404].includes(refusedRemove.status()), `HTTP ${refusedRemove.status()}`);
  const readAsClient = await customer.request.get(`${BASE}/api/portal/website-sources`);
  check("boundary: a client session cannot read the agency-wide registry", [401, 403, 404].includes(readAsClient.status()), `HTTP ${readAsClient.status()}`);
  await customer.close();
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { chromium } = require("playwright-core");
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const seeded = await seed();
  evidence.seeded = seeded;
  await startServer();
  console.log(`dev server pid ${server.pid} on ${BASE}`);
  const browser = await chromium.launch({ headless: true });
  try {
    // Owner boundaries checked once, before any mutation, so the seeded rows are intact.
    {
      const owner = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await owner.newPage();
      await signIn(page, owner, "boundary");
      const before = describeSource(await registry(owner), seeded.clientSite);
      check("boundary: the owner session reads the agency registry", before.present, JSON.stringify(before));
      const clientPage = await page.goto(`${BASE}/portal/clients/${encodeURIComponent(seeded.clientId)}?tab=systems`, { waitUntil: "networkidle" });
      check("boundary: the client workspace lists only that client's routed site", clientPage.status() === 200
        && await page.locator('button[aria-label="Route cedar-dental.test back to the agency inbox"]').count() === 1
        && await page.locator('button[aria-label="Route zimante-digital.test back to the agency inbox"]').count() === 0);
      await owner.close();
    }
    await storyBoundaries({ browser, seeded });
    // A fresh source set per viewport keeps every story's "before" honest.
    for (const [index, viewport] of VIEWPORTS.entries()) {
      const lane = index === 0 ? seeded : await extraSources(seeded, index);
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      const record = newObserver(page, viewport.id);
      await signIn(page, context, viewport.id);
      await storyRouteToInbox({
        page, context, record, viewport, kind: "company",
        url: `${BASE}/portal/agency/fulfilment?view=tags`,
        buttonName: `Route ${lane.companyHost} back to the agency inbox`, sourceId: lane.companySite,
        expectBefore: state => state.destinationCompanyId === seeded.companyId,
      });
      await storyRouteToInbox({
        page, context, record, viewport, kind: "client",
        url: `${BASE}/portal/clients/${encodeURIComponent(seeded.clientId)}?tab=systems`,
        buttonName: `Route ${lane.clientHost} back to the agency inbox`, sourceId: lane.clientSite,
        expectBefore: state => state.destinationClientId === seeded.clientId,
      });
      await storyRemoval({ page, context, record, viewport, sourceId: lane.retireSite, host: lane.retireHost });
      const noise = unexpectedNoise(record);
      check(`${viewport.id}: console clean`, noise.consoleErrors.length === 0 && noise.pageErrors.length === 0, JSON.stringify([...noise.consoleErrors, ...noise.pageErrors]).slice(0, 800));
      check(`${viewport.id}: network clean apart from injected failures`, noise.failedRequests.length === 0 && noise.httpErrors.length === 0, JSON.stringify([...noise.failedRequests, ...noise.httpErrors]).slice(0, 800));
      evidence.viewports.push({ ...viewport, injected: record.injected.length, raw: { consoleErrors: record.consoleErrors.length, failedRequests: record.failedRequests.length, httpErrors: record.httpErrors.length } });
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

/** A second set of registrations for the second viewport, created through the real API as the owner. */
async function extraSources(seeded, index) {
  const { chromium } = require("playwright-core");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE}/dev`, { waitUntil: "commit" });
    const make = async (host, routing) => {
      const added = await context.request.post(`${BASE}/api/portal/website-sources`, { data: { action: "add", host, ...routing } });
      const body = await added.json();
      if (!body.ok) throw new Error(`could not add ${host}: ${JSON.stringify(body)}`);
      const injection = await context.request.post(`${BASE}/api/portal/website-injections`, { data: { action: "add", siteId: body.source.id, kind: "ga4", value: `G-ACCEPT0${index}` } });
      if (!injection.ok()) throw new Error(`could not add an injection to ${host}`);
      return body.source.id;
    };
    const lane = {
      companyHost: `zimante-digital-${index}.test`, clientHost: `cedar-dental-${index}.test`, retireHost: `retire-me-${index}.test`,
    };
    lane.companySite = await make(lane.companyHost, { destinationCompanyId: seeded.companyId });
    lane.clientSite = await make(lane.clientHost, { destinationClientId: seeded.clientId });
    lane.retireSite = await make(lane.retireHost, {});
    // Form schemas need a fetch of the live host, which these fixtures do not have; seed them the way the first lane did.
    await seedSchemas([lane.companySite, lane.clientSite, lane.retireSite]);
    await context.close();
    return lane;
  } finally {
    await browser.close();
  }
}

async function seedSchemas(ids) {
  const tsx = require.resolve("tsx");
  const script = String.raw`
const { createRequire } = await import("node:module");
const { join } = await import("node:path");
const require_ = createRequire(join(process.cwd(), "aqua-tag-acceptance-seed.cjs"));
const serverOnly = require_.resolve("server-only");
require_.cache[serverOnly] = { id: serverOnly, filename: serverOnly, loaded: true, paths: [], children: [], exports: {} };
const storage = require_("./src/server/storage");
const schemas = require_("./src/server/websiteFormSchemas");
await storage.ensureHydrated({ fresh: true });
const ids = JSON.parse(process.env.AQUA_IDS);
const fakeFetch = async url => ({ html: '<form id="contact"><input name="email" type="email"><button>Send</button></form>', finalUrl: url, statusCode: 200 });
for (const id of ids) {
  const state = storage.getState();
  const source = state.websiteSources[id];
  const imported = await schemas.importFormSchemasForSite({ agencyId: source.agencyId, websiteSourceId: id }, fakeFetch);
  if (!imported.ok) throw new Error("import failed: " + imported.error);
}
await storage.flushPendingWrites();
process.stdout.write("ok");
`;
  await runNode(["--conditions=react-server", "--import", tsx, "--input-type=module", "--eval", script], { env: { ...laneEnv, AQUA_IDS: JSON.stringify(ids) } });
}

main()
  .catch(error => { failures += 1; evidence.crash = String(error?.stack ?? error); console.error(error); })
  .finally(async () => {
    await stopServer();
    await saveEvidence();
    console.log(`\n${evidence.checks.length} checks, ${failures} failed — evidence: ${join(EVIDENCE_DIR, "aqua-tag-routing-acceptance.json")}`);
    process.exit(failures === 0 ? 0 : 1);
  });
