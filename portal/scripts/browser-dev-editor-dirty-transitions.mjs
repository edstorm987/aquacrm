#!/usr/bin/env node
// The Dev Editor's destructive-transition browser gate.  → issue #19 (browser half)
//
// ── Why this exists ──────────────────────────────────────────────────────────
//
// `unsavedEditorWork.ts` names every kind of work the editor can lose, and the
// source pins in `smoke-dev-editor-project-boundary.test.ts` prove each exit
// ASKS. Neither can see what a real browser does after the answer: whether a
// cancelled prompt really keeps the exact value, whether an accepted one really
// discards it, and whether what belonged to project A ever paints project B.
// Two defects lived precisely in that gap and were found only by driving a real
// Chromium (2026-09-03, on cff24cd):
//
//   • an accepted "Discard the unsaved preview changes on this page?" hid the
//     browser and kept the flag — Back asked again about work that no longer
//     existed and a reload was blocked for the same phantom;
//   • the Aqua Tag handshake was missed whenever the server-rendered preview
//     frame finished loading before React hydrated, so nothing selected until
//     the operator pressed Refresh.
//
// This gate drives the contract for every applicable transition, at the two
// functional viewports, and records a verdict per (transition × target ×
// viewport). Every row must be a pass or an explicit N/A with its reason; a
// row that was never driven is red, never a short green.
//
// ── The contract, per transition ─────────────────────────────────────────────
//
//   1. create genuine unsaved state (typed, not injected);
//   2. trigger the transition;
//   3. cancel the discard dialog → the exact value, target and dirty state remain;
//   4. trigger again and accept → the transition occurs and target-private
//      state does not leak into the next target.
//
// Four kinds of work are exercised independently: the portal draft, the SEO
// fields, one and several repository buffers, and preview changes on a tagged
// page. Cross-project Aqua Editor AI isolation is driven separately: a capture,
// a composer prefill and an attachment are made on project A with its key,
// status and history reads held in flight, and none of it may paint project B
// — including the delayed answers, a delayed 500 and a held reply.
//
// ── What it refuses to do ────────────────────────────────────────────────────
//
//   • It never presses Save or Publish in the code canvas, and aborts any save
//     or publish request it sees (`SAVE_PATHS`) — the lane's projects read the
//     Aqua working tree itself, and every fixture file is hashed before and
//     after the run.
//   • No request may leave the lane: any request to a host other than the
//     lane's own fails the run, so no AI provider can be reached. The reply
//     route is held in the browser and never reaches the server.
//   • It runs only against a Dev Mode lane. The repository buffers read the
//     local working tree, which `requireWholeWorkingTreeFounderAccess` opens
//     only in local Dev Mode — a production build cannot serve that half, so
//     a production login is not attempted rather than half-claimed.
//
// ── Running it ───────────────────────────────────────────────────────────────
//
//   The lane is private: its own state file, dist dir and port. From `portal/`:
//
//   export PORTAL_BACKEND=file PORTAL_DEV_MODE=true \
//     PORTAL_DATA_FILE=/private/tmp/aquacrm-editor-boundaries-3183/state/portal-state.json \
//     INBOX_LOCAL_DATA_FILE=/private/tmp/aquacrm-editor-boundaries-3183/state/inbox-messaging.json \
//     DEV_THOUGHTS_FILE=/private/tmp/aquacrm-editor-boundaries-3183/state/dev-thoughts.json \
//     NEXT_DIST_DIR=.next-editor-boundaries-3183 \
//     NEXT_TYPESCRIPT_CONFIG_PATH=.next-editor-boundaries-3183-tsconfig/tsconfig.json \
//     PORTAL_SESSION_SECRET=<32+ chars> PORTAL_VAULT_ENCRYPTION_KEY=<any> \
//     NEXT_PUBLIC_PORTAL_BASE_URL=http://127.0.0.1:3183
//   unset PORTAL_DEV_AGENCY            # the seed builds the default Bare Co tenant
//   node --import tsx scripts/browser-dev-editor-dirty-transitions.mjs seed
//   node node_modules/next/dist/bin/next dev --webpack -H 127.0.0.1 -p 3183
//   AQUA_BASE=http://localhost:3183 node --import tsx scripts/browser-dev-editor-dirty-transitions.mjs
//
//   `seed` writes a fresh state file (it refuses to touch one that exists, and
//   refuses the shared `.data/portal-state.json`) and records the fixture ids
//   in `<lane>/fixtures.json`. The run phase reads that file. `AQUA_BASE` must
//   name the host the dev server calls itself — `localhost` for `next dev`,
//   whose same-origin checks compare against it. Narrow a run with
//   `AQUA_VIEWPORTS=phone|desktop` and `AQUA_SCENARIOS=project,portal,ai,layout`.
//   Evidence (records, screenshots, fixture hashes) lands in `<lane>/evidence/`.
//   One run at a time per lane: every run signs in as the lane's owner through
//   `/dev`, and a second concurrent sign-in can rotate that session under the
//   first run's feet.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// tsx serves a `.ts` module to an `.mjs` importer as CommonJS, and esbuild's
// export table is not visible to Node's named-export detection — so the module
// is taken whole and the function picked off it (or off `.default`).
import * as unsavedEditorWorkModule from "../src/engines/editor/unsavedEditorWork.ts";

const editorDiscardPrompt = unsavedEditorWorkModule.editorDiscardPrompt ?? unsavedEditorWorkModule.default?.editorDiscardPrompt;
if (typeof editorDiscardPrompt !== "function") throw new Error("editorDiscardPrompt is not exported by unsavedEditorWork.ts");

const require = createRequire(import.meta.url);
const PORTAL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ─────────────────────────────────────────────────────────────────────────────
// The matrix — pure, so the smoke can hold it without a browser
// ─────────────────────────────────────────────────────────────────────────────

/** The two viewports every transition is driven at. */
export const FUNCTIONAL_VIEWPORTS = [
  { id: "phone", label: "Phone 390×844", width: 390, height: 844, mobile: true },
  { id: "desktop", label: "Desktop 1280×800", width: 1280, height: 800, mobile: false },
];

/** The layout pass: overflow, console, network and focus at the house sizes. */
export const LAYOUT_VIEWPORTS = [
  { id: "375x812", width: 375, height: 812, mobile: true },
  { id: "390x844", width: 390, height: 844, mobile: true },
  { id: "812x375", width: 812, height: 375, mobile: true },
  { id: "768x1024", width: 768, height: 1024, mobile: false },
  { id: "1024x768", width: 1024, height: 768, mobile: false },
  { id: "1280x800", width: 1280, height: 800, mobile: false },
  { id: "1920x1080", width: 1920, height: 1080, mobile: false },
];

/** Where the switcher row and the refresh button are hidden, in the source's own words. */
export const NA_REASONS = {
  switcherHidden: "the project switcher row is display:none until the editor is 1280px wide (responsiveEditorToolbar.ts) — there is no A→B control on a phone",
  refreshHidden: "the Refresh preview button is `hidden sm:grid`, so it does not exist below 640px",
  portalOnlyControl: "the second browser is a draft/live portal comparison and is not offered on a repository project",
  projectOnlyState: "a portal target has no tag, so there are no preview changes to discard",
  portalOnlyState: "a repository project has no portal document, lifecycle stage, client or template",
  phoneSeoDrawer: "on a phone the SEO panel is inside the inspector drawer, which covers every toolbar control; closing the drawer unmounts the panel and resets its draft, so no toolbar transition can be reached with SEO fields dirty (recorded as a residual)",
};

/**
 * Every transition the contract covers, and on which target and viewport it
 * exists. `dirty` names the kind of work put at risk before it is triggered;
 * `prompt` says whether the source is expected to ASK about that work (some
 * transitions deliberately never prompt for work that is not at stake, and
 * the gate proves those stay silent AND keep the work).
 */
export const TRANSITIONS = [
  { id: "back", label: "Back", target: "project", dirty: "repository-files:2", prompt: true, viewports: ["phone", "desktop"] },
  { id: "back", label: "Back", target: "portal", dirty: "portal-draft", prompt: true, viewports: ["phone", "desktop"] },
  { id: "all-projects", label: "All projects", target: "project", dirty: "repository-files:1", prompt: true, viewports: ["desktop"], na: { phone: NA_REASONS.switcherHidden } },
  { id: "project-switch", label: "project A → B", target: "project", dirty: "repository-files:1", prompt: true, viewports: ["desktop"], na: { phone: NA_REASONS.switcherHidden } },
  { id: "workspace-switch", label: "project A → This workspace", target: "project", dirty: "repository-files:1", prompt: true, viewports: ["desktop"], na: { phone: NA_REASONS.switcherHidden } },
  { id: "mode-visual", label: "Developer → Visual", target: "project", dirty: "repository-files:1", prompt: true, viewports: ["phone", "desktop"] },
  { id: "mode-assist", label: "Developer → Assist", target: "project", dirty: "repository-files:1", prompt: true, viewports: ["phone", "desktop"] },
  { id: "mode-assist", label: "Visual → Assist", target: "portal", dirty: "seo-fields", prompt: true, viewports: ["desktop"], na: { phone: NA_REASONS.phoneSeoDrawer } },
  { id: "surface", label: "editor surface", target: "project", dirty: "repository-files:1", prompt: false, viewports: ["phone", "desktop"] },
  { id: "surface", label: "editor surface", target: "portal", dirty: "seo-fields", prompt: true, viewports: ["desktop"], na: { phone: NA_REASONS.phoneSeoDrawer } },
  { id: "scope", label: "Template ↔ Client", target: "portal", dirty: "portal-draft", prompt: true, viewports: ["phone", "desktop"] },
  { id: "client", label: "client change", target: "portal", dirty: "portal-draft", prompt: true, viewports: ["phone", "desktop"] },
  { id: "template", label: "template change", target: "portal", dirty: "portal-draft", prompt: true, viewports: ["phone", "desktop"] },
  { id: "lifecycle", label: "lifecycle change", target: "portal", dirty: "portal-draft", prompt: false, viewports: ["phone", "desktop"] },
  { id: "lifecycle", label: "lifecycle change", target: "portal", dirty: "seo-fields", prompt: true, viewports: ["desktop"], na: { phone: NA_REASONS.phoneSeoDrawer } },
  { id: "page", label: "page change", target: "portal", dirty: "portal-draft", prompt: false, viewports: ["phone", "desktop"] },
  { id: "page", label: "page change", target: "portal", dirty: "seo-fields", prompt: true, viewports: ["desktop"], na: { phone: NA_REASONS.phoneSeoDrawer } },
  { id: "page", label: "page change (tag link)", target: "project", dirty: "preview-changes", prompt: true, viewports: ["phone", "desktop"] },
  { id: "browser-hide", label: "browser hide", target: "project", dirty: "preview-changes", prompt: true, viewports: ["phone", "desktop"] },
  { id: "browser-hide", label: "browser hide", target: "portal", dirty: "seo-fields", prompt: false, viewports: ["desktop"], na: { phone: NA_REASONS.phoneSeoDrawer } },
  { id: "split", label: "one ↔ split browser", target: "portal", dirty: "seo-fields", prompt: false, viewports: ["desktop"], na: { phone: NA_REASONS.phoneSeoDrawer } },
  { id: "split", label: "one ↔ split browser", target: "project", dirty: "preview-changes", prompt: false, viewports: [], na: { phone: NA_REASONS.portalOnlyControl, desktop: NA_REASONS.portalOnlyControl } },
  { id: "refresh", label: "preview refresh", target: "project", dirty: "preview-changes", prompt: true, viewports: ["desktop"], na: { phone: NA_REASONS.refreshHidden } },
  { id: "refresh", label: "preview refresh", target: "portal", dirty: "seo-fields", prompt: true, viewports: ["desktop"], na: { phone: NA_REASONS.refreshHidden } },
  { id: "reload", label: "reload (beforeunload)", target: "project", dirty: "repository-files:1", prompt: true, viewports: ["phone", "desktop"] },
  { id: "reload", label: "reload (beforeunload)", target: "portal", dirty: "portal-draft", prompt: true, viewports: ["phone", "desktop"] },
];

/** The rows a complete run must account for: every transition at every functional viewport. */
export function expectedRows(viewportIds = FUNCTIONAL_VIEWPORTS.map(v => v.id)) {
  return TRANSITIONS.flatMap(transition => viewportIds.map(viewport => ({
    key: rowKey(transition, viewport),
    transition: transition.id,
    label: transition.label,
    target: transition.target,
    dirty: transition.dirty,
    viewport,
    applicable: transition.viewports.includes(viewport),
    naReason: transition.na?.[viewport] ?? null,
  })));
}

export function rowKey(transition, viewport) {
  return `${viewport}#${transition.target}#${transition.id}#${transition.dirty}`;
}

/**
 * The sentence the source will put in the dialog for a kind of dirty work —
 * derived from the real `editorDiscardPrompt`, so the gate and the editor
 * cannot disagree about the words.
 */
export function promptFor(dirty) {
  if (dirty === "portal-draft") return editorDiscardPrompt({ portalDraft: true });
  if (dirty === "seo-fields") return editorDiscardPrompt({ seoFields: true });
  if (dirty === "preview-changes") return editorDiscardPrompt({ pagePreview: true });
  const files = /^repository-files:(\d+)$/.exec(dirty);
  if (files) return editorDiscardPrompt({ repositoryFiles: Number(files[1]) });
  throw new Error(`unknown dirty kind ${dirty}`);
}

/** URLs only a `next dev` server serves; never evidence about the application. */
export function isDevOnlyAsset(url) {
  return /\/_next\/(static|webpack-hmr)/.test(url) || /\/__nextjs_/.test(url);
}

/** A request stays in the lane when it targets the lane's own port on a loopback name. */
export function isLaneRequest(url, base) {
  let target;
  let lane;
  try {
    target = new URL(url);
    lane = new URL(base);
  } catch {
    return false;
  }
  if (target.protocol === "data:" || target.protocol === "blob:" || target.protocol === "about:") return true;
  const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
  return target.port === lane.port && loopback.has(target.hostname) && loopback.has(lane.hostname);
}

/** Requests that would write to the repository through the editor. Never allowed here. */
export const SAVE_PATHS = ["/api/portal/site-editor/files", "/api/portal/dev/repo-write"];

export function isForbiddenWrite(request) {
  if (request.method !== "POST") return false;
  let path;
  try {
    path = new URL(request.url).pathname;
  } catch {
    return false;
  }
  if (!SAVE_PATHS.includes(path)) return false;
  // `insert-targets` is the navigator's read of the repository's routes — the
  // one POST on repo-write that writes nothing.
  if (path === "/api/portal/dev/repo-write") {
    try {
      return JSON.parse(request.body ?? "{}")?.action !== "insert-targets";
    } catch {
      return true;
    }
  }
  return true;
}

/** A run is green only when every expected row was driven or explicitly N/A. */
export function summarise(records, expected) {
  const byKey = new Map();
  for (const record of records) {
    if (!record.key) continue;
    const current = byKey.get(record.key) ?? { pass: 0, fail: 0, na: 0 };
    current[record.status] = (current[record.status] ?? 0) + 1;
    byKey.set(record.key, current);
  }
  const failures = records.filter(r => r.status === "fail");
  const missing = [];
  let na = 0;
  for (const row of expected) {
    const seen = byKey.get(row.key);
    if (!seen) { missing.push(row.key); continue; }
    if (seen.na) na += 1;
    if (!row.applicable && !seen.na) missing.push(`${row.key} (expected N/A with a reason)`);
  }
  const passed = records.filter(r => r.status === "pass").length;
  return {
    ok: failures.length === 0 && missing.length === 0,
    passed,
    failed: failures.length,
    na,
    missing,
    failures: failures.map(f => ({ key: f.key, scenario: f.scenario, step: f.step, detail: f.detail })),
  };
}

/** sha256 of every file under the given repo-relative directories. */
export function hashTree(root, directories) {
  const files = {};
  const walk = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.isFile()) continue;
      files[relative(root, full).split("\\").join("/")] = createHash("sha256").update(readFileSync(full)).digest("hex");
    }
  };
  for (const directory of directories) {
    const full = join(root, directory);
    if (existsSync(full) && statSync(full).isDirectory()) walk(full);
  }
  const digest = createHash("sha256")
    .update(Object.keys(files).sort().map(path => `${path}\u0000${files[path]}\n`).join(""))
    .digest("hex");
  return { files, digest, count: Object.keys(files).length };
}

// ─────────────────────────────────────────────────────────────────────────────
// The seed — a fresh, private lane
// ─────────────────────────────────────────────────────────────────────────────

/** Fixture shape written by `seed` and read by the run. */
export const FIXTURE_SCOPES = {
  projectA: ["src/engines/editor/editing"],
  projectB: ["src/components/editing"],
};

// Runs as an inline module under `node --conditions react-server --import tsx`
// from the portal root, against PORTAL_DATA_FILE. Everything it creates is the
// smallest set the matrix needs: the default Dev Mode tenant with its owner,
// the website record (so the public pages carry the tag with a STABLE key),
// two built clients, one product (so the studio offers a second template),
// project A tagged on the lane's own /tools page with project B nested inside
// it (the switcher is scoped to the door's family), and one distinctive AI
// history line per project.
const SEED_PROGRAM = String.raw`
const pick = (m, k) => { const v = m[k] ?? m.default?.[k]; if (typeof v !== "function") throw new Error("seed export " + k + " unavailable"); return v; };
const storage = await import("./src/server/storage.ts");
const tenants = await import("./src/server/tenants.ts");
const users = await import("./src/server/users.ts");
const projects = await import("./src/engines/editor/server/devProjects.ts");
const website = await import("./src/server/agencyWebsite.ts");
const sources = await import("./src/server/websiteSources.ts");
const products = await import("./src/server/agencyProducts.ts");
const history = await import("./src/engines/editor/server/editorAiHistory.ts");
const devMode = await import("./src/lib/server/dev/devMode.ts");
const BASE = process.env.AQUA_SEED_BASE;
const SCOPES = JSON.parse(process.env.AQUA_SEED_SCOPES);
await pick(storage, "ensureHydrated")();
const agency = pick(tenants, "createAgency")({ name: devMode.DEV_AGENCY_NAME ?? devMode.default?.DEV_AGENCY_NAME, slug: devMode.DEV_AGENCY_SLUG ?? devMode.default?.DEV_AGENCY_SLUG });
const owner = pick(users, "createUser")({
  email: devMode.DEV_OWNER_EMAIL ?? devMode.default?.DEV_OWNER_EMAIL, name: "Dev Owner", role: "agency-owner", agencyId: agency.id,
  password: "boundaries-" + Math.random().toString(36).slice(2) + "-" + Date.now(),
});
pick(website, "ensureAgencyWebsite")(agency.id);
const key = pick(sources, "ensureAgencyMasterSiteKey")(agency.id);
const now = Date.now();
const clientOne = pick(tenants, "createClient")(agency.id, { name: "Boundary Client One", stage: "live", metadata: { portalBuiltAt: now } });
const clientTwo = pick(tenants, "createClient")(agency.id, { name: "Boundary Client Two", stage: "live", metadata: { portalBuiltAt: now } });
const product = pick(products, "createAgencyProduct")(agency.id, { name: "Boundary Product", kind: "product", category: "Website", portalRequirement: "required" }, owner.id);
const tagUrl = BASE + "/tools";
const a = pick(projects, "saveDevProject")({ agencyId: agency.id, name: "Editor Boundaries A", kind: "software", allowedPaths: SCOPES.projectA, siteUrl: tagUrl, actorUserId: owner.id });
// Seeded as verified: MAP refuses a loopback snippet by design (a visitor's
// browser could not fetch it), so a real Map can never bind a 127.0.0.1 page.
pick(projects, "recordDevProjectTagCheck")({ agencyId: agency.id, id: a.id, actorUserId: owner.id, tag: { url: tagUrl, finalUrl: tagUrl, reachable: true, tagPresent: true, keyMatches: true, detectedSiteKey: key, scriptSrc: "/aqua-tag.js", checkedAt: now } });
const b = pick(projects, "saveDevProject")({ agencyId: agency.id, name: "Editor Boundaries B", kind: "software", allowedPaths: SCOPES.projectB, parentProjectId: a.id, actorUserId: owner.id });
pick(history, "appendEditorAiMessage")({ agencyId: agency.id, projectId: a.id, role: "user", content: "ALPHA-ONLY history line", actorUserId: owner.id });
pick(history, "appendEditorAiMessage")({ agencyId: agency.id, projectId: b.id, role: "user", content: "BRAVO-ONLY history line", actorUserId: owner.id });
await pick(storage, "flushPendingWrites")();
console.log(JSON.stringify({ agencyId: agency.id, ownerId: owner.id, projectA: a.id, projectB: b.id, clientOne: clientOne.id, clientTwo: clientTwo.id, productId: product.id, siteKey: key, tagUrl }));
`;

async function seed({ laneDir, base }) {
  const dataFile = process.env.PORTAL_DATA_FILE ? resolve(PORTAL_ROOT, process.env.PORTAL_DATA_FILE) : "";
  if (!dataFile) throw new Error("seed needs PORTAL_DATA_FILE — a private state file, never the shared sandbox.");
  if (resolve(PORTAL_ROOT, ".data", "portal-state.json") === dataFile) {
    throw new Error("seed refuses the shared .data/portal-state.json — point PORTAL_DATA_FILE at a private lane.");
  }
  if (existsSync(dataFile)) throw new Error(`seed refuses to overwrite ${dataFile} — delete it yourself if the lane is disposable.`);
  if ((process.env.PORTAL_BACKEND ?? "") !== "file") throw new Error("seed needs PORTAL_BACKEND=file.");
  await mkdir(dirname(dataFile), { recursive: true });
  const output = await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [
      "--conditions", "react-server", "--import", "tsx", "--input-type=module", "--eval", SEED_PROGRAM,
    ], {
      cwd: PORTAL_ROOT,
      env: { ...process.env, AQUA_SEED_BASE: base, AQUA_SEED_SCOPES: JSON.stringify(FIXTURE_SCOPES) },
      stdio: ["ignore", "pipe", "inherit"],
    });
    let stdout = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.once("error", reject);
    child.once("exit", code => (code === 0 ? resolvePromise(stdout) : reject(new Error(`seed exited with ${code}`))));
  });
  const line = output.trim().split("\n").at(-1) ?? "";
  const fixtures = { ...JSON.parse(line), base, scopes: FIXTURE_SCOPES, dataFile, seededAt: new Date().toISOString() };
  await mkdir(laneDir, { recursive: true });
  await writeFile(join(laneDir, "fixtures.json"), `${JSON.stringify(fixtures, null, 2)}\n`);
  console.log(`✓ seeded ${dataFile}\n  fixtures → ${join(laneDir, "fixtures.json")}\n  ${JSON.stringify(fixtures)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Driver
// ─────────────────────────────────────────────────────────────────────────────

export const BROWSER_INSTALL_HINT = "npx playwright-core install chromium";

async function launchChromium() {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch (error) {
    throw new Error(`playwright-core is not installed.\n  npm install\n  ${BROWSER_INSTALL_HINT}\n\n(${error.message})`);
  }
  const pinned = process.env.AQUA_BROWSER_EXECUTABLE;
  try {
    return { browser: await chromium.launch(pinned ? { executablePath: pinned } : {}), note: pinned ?? "playwright-core's own Chromium" };
  } catch (error) {
    throw new Error(`${BROWSER_INSTALL_HINT}\n\n(${error.message})`);
  }
}

const NAV_TIMEOUT = Number(process.env.AQUA_NAV_TIMEOUT_MS || 180_000);
const UI_TIMEOUT = Number(process.env.AQUA_UI_TIMEOUT_MS || 60_000);
const DIALOG_WAIT_MS = 5_000;
const SETTLE_MS = 800;

class Run {
  constructor({ base, laneDir, fixtures, evidenceDir }) {
    this.base = base;
    this.laneDir = laneDir;
    this.fixtures = fixtures;
    this.evidenceDir = evidenceDir;
    this.records = [];
    this.observations = [];
    this.foreignRequests = [];
    this.forbiddenWrites = [];
    this.consoleErrors = [];
    this.pageErrors = [];
    this.failedResponses = [];
    this.unexpectedDialogs = [];
    this.navigations = [];
    /** URLs the gate itself answered with a fabricated failure — not the app's. */
    this.fabricatedFailures = new Set();
    this.screenshots = 0;
  }

  record(entry) {
    this.records.push(entry);
    const tag = { pass: "✓", fail: "✗", na: "·" }[entry.status] ?? "?";
    console.log(`  ${tag} [${entry.viewport}] ${entry.scenario} › ${entry.step} — ${entry.detail}`);
  }

  check(context, condition, detail) {
    this.record({ ...context, status: condition ? "pass" : "fail", detail });
    return condition;
  }

  observe(context, detail) {
    this.observations.push({ ...context, detail });
    console.log(`  ○ [${context.viewport}] ${context.scenario} › ${context.step} — ${detail}`);
  }

  na(context, reason) {
    this.record({ ...context, status: "na", detail: `N/A — ${reason}` });
  }

  async shot(page, name) {
    this.screenshots += 1;
    const file = join(this.evidenceDir, `${String(this.screenshots).padStart(3, "0")}-${name.replace(/[^a-z0-9-]+/gi, "_")}.png`);
    await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  }
}

/**
 * One page, fully instrumented. Every dialog must be expected by the step
 * that triggers it; anything else is recorded as a failure and dismissed.
 */
async function openPage(run, context, viewportEntry) {
  const page = await context.newPage();
  const state = { expect: null, seen: [] };
  page.__gate = state;
  page.on("dialog", async dialog => {
    const entry = { type: dialog.type(), message: dialog.message(), at: Date.now() };
    const expected = state.expect;
    if (expected && expected.type === entry.type && (expected.type === "beforeunload" || expected.message === entry.message)) {
      entry.action = expected.action;
      state.seen.push(entry);
      state.expect = null;
      if (expected.action === "accept") await dialog.accept(); else await dialog.dismiss();
      return;
    }
    entry.action = "dismissed (unexpected)";
    run.unexpectedDialogs.push({ viewport: viewportEntry.id, ...entry, expected });
    state.seen.push(entry);
    await dialog.dismiss();
  });
  page.on("framenavigated", frame => {
    if (frame !== page.mainFrame()) return;
    run.navigations.push({ viewport: viewportEntry.id, url: frame.url(), at: Date.now() });
  });
  page.on("console", message => {
    const text = message.text();
    if (/full reload|Fast Refresh/i.test(text)) run.observations.push({ scenario: "console", viewport: viewportEntry.id, step: "dev-server reload notice", detail: text.slice(0, 300) });
    if (message.type() !== "error") return;
    const url = message.location()?.url ?? "";
    if (isDevOnlyAsset(url)) return;
    // The browser logs a fabricated 500 exactly like a real one; the gate knows which it sent.
    if (run.fabricatedFailures.has(url) && /Failed to load resource/.test(text)) return;
    run.consoleErrors.push({ viewport: viewportEntry.id, text: text.slice(0, 1200), url });
  });
  page.on("pageerror", error => run.pageErrors.push({ viewport: viewportEntry.id, message: error.message.slice(0, 600) }));
  page.on("response", response => {
    if (response.status() < 400 || isDevOnlyAsset(response.url())) return;
    if (response.headers()["x-aqua-gate"] === "fabricated") return;
    run.failedResponses.push({ viewport: viewportEntry.id, url: response.url(), status: response.status() });
  });
  page.on("request", request => {
    if (!isLaneRequest(request.url(), run.base)) run.foreignRequests.push({ viewport: viewportEntry.id, url: request.url() });
  });
  await page.route("**/*", async route => {
    const request = route.request();
    if (!isLaneRequest(request.url(), run.base)) { await route.abort("blockedbyclient"); return; }
    if (isForbiddenWrite({ method: request.method(), url: request.url(), body: request.postData() })) {
      run.forbiddenWrites.push({ viewport: viewportEntry.id, url: request.url(), body: (request.postData() ?? "").slice(0, 200) });
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  return page;
}

/** Trigger something that must raise exactly this dialog, and answer it. */
async function withDialog(page, { type = "confirm", message = "", action }, trigger) {
  const state = page.__gate;
  const before = state.seen.length;
  state.expect = { type, message, action };
  state.focusBefore = await focusState(page);
  await trigger();
  const deadline = Date.now() + DIALOG_WAIT_MS;
  while (state.seen.length === before && Date.now() < deadline) await page.waitForTimeout(50);
  const seen = state.seen.slice(before);
  state.expect = null;
  await page.waitForTimeout(SETTLE_MS);
  return seen;
}

/** Trigger something that must raise NO dialog. */
async function withoutDialog(page, trigger) {
  const state = page.__gate;
  const before = state.seen.length;
  state.expect = null;
  state.focusBefore = await focusState(page);
  await trigger();
  await page.waitForTimeout(SETTLE_MS + 400);
  return state.seen.slice(before);
}

function describeDialogs(seen) {
  return seen.length ? seen.map(d => `${d.type}:"${d.message}"→${d.action}`).join("; ") : "no dialog";
}

const focusState = page => page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { isBody: true, connected: true, label: "body" };
  return {
    isBody: false,
    connected: el.isConnected,
    label: `${el.tagName.toLowerCase()}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : ""}`,
  };
});

// The house rule (browser-matrix.mjs): the document, and the portal's own
// clipped scroll region. The editor shell is measured too but only OBSERVED —
// it is `overflow-hidden` by design and holds deliberate horizontal scrollers
// (the one-line toolbar's context row, the device-sized preview pane), whose
// content width is not a page overflow.
const measureOverflow = page => page.evaluate(() => {
  const doc = document.scrollingElement || document.documentElement;
  const out = [{ label: "document", scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, gated: true }];
  const main = document.querySelector("#main-content");
  if (main) out.push({ label: "#main-content", scrollWidth: main.scrollWidth, clientWidth: main.clientWidth, gated: true });
  const shell = document.querySelector(".mm-dev-editor-shell");
  if (shell) out.push({ label: "editor shell (clipped by design)", scrollWidth: shell.scrollWidth, clientWidth: shell.clientWidth, gated: false });
  return out;
});

function overflowDetail(measurements) {
  const gated = measurements.filter(m => m.gated);
  const worst = gated.reduce((a, b) => (b.scrollWidth - b.clientWidth > a.scrollWidth - a.clientWidth ? b : a));
  const over = worst.scrollWidth - worst.clientWidth;
  const shell = measurements.find(m => !m.gated);
  const shellNote = shell ? `; ${shell.label} ${shell.scrollWidth} vs ${shell.clientWidth}` : "";
  return { ok: over <= 1, detail: over > 1 ? `${worst.label}: ${over}px off the right edge (${worst.scrollWidth} > ${worst.clientWidth})${shellNote}` : `no horizontal overflow (${gated.map(m => `${m.label} ${m.scrollWidth}≤${m.clientWidth}`).join(", ")})${shellNote}` };
}

/**
 * After a cancelled dialog focus must still be on a real, attached control —
 * unless nothing had focus before the trigger (on a phone the field just typed
 * into lives in the drawer, which is closed before the toolbar can be reached),
 * in which case "still on body" is not a control the dialog took away.
 */
async function focusIntact(run, ctx, page) {
  const focus = await focusState(page);
  const before = page.__gate?.focusBefore;
  const ok = focus.connected && (!focus.isBody || Boolean(before?.isBody));
  run.check(ctx, ok, `focus ${focus.connected ? "attached" : "DETACHED"} on ${focus.label}${focus.isBody && before?.isBody ? " (nothing had focus before the transition either)" : ""}`);
}

async function overflowClean(run, ctx, page) {
  const verdict = overflowDetail(await measureOverflow(page));
  run.check(ctx, verdict.ok, verdict.detail);
}

// ── The editor's controls, by their own labels ──────────────────────────────

const SEL = {
  shell: ".mm-dev-editor-shell",
  switcher: "[data-dev-editor-project-switcher] select",
  allProjects: '[data-dev-editor-project-switcher] a:has-text("All projects")',
  back: "[data-dev-editor-toolbar-back]",
  mode: label => `[aria-label="Editor mode"] button:has-text("${label}")`,
  surface: label => `[aria-label="Editor surface"] button:has-text("${label}")`,
  hideBrowser: 'button[aria-label="Hide the browser"]',
  showBrowser: 'button[aria-label="Show the browser"]',
  split: 'button[aria-label="Two browsers side by side"]',
  unsplit: 'button[aria-label="One browser"]',
  refresh: 'button[aria-label="Refresh preview"]',
  scope: label => `[aria-label="Editing scope"] button:has-text("${label}")`,
  client: 'select[aria-label="Preview client"]',
  template: 'select[aria-label="Portal template"]',
  lifecycle: 'select[aria-label="Lifecycle stage"]',
  navigator: 'select[aria-label="Page navigator"]',
  railTab: label => `nav button[aria-label="${label}"]`,
  drawerOpen: 'button[aria-expanded]:has-text("Inspector")',
  drawer: 'aside[aria-label="Dev Editor Engine inspector"]',
  drawerTab: label => `aside[aria-label="Dev Editor Engine inspector"] button[title="${label}"]`,
  drawerClose: 'button[aria-label="Close the inspector"]',
  findFile: 'input[aria-label="Find a file"]',
  fileRow: name => `button[title$="/${name}"]`,
  code: ".cm-content",
  dirtyDots: '[aria-label="Unsaved changes"]',
  canvasPane: label => `[aria-label="Canvas pane"] button:has-text("${label}")`,
  words: "label:has-text('The words') textarea",
  composer: "#aqua-editor-ai-composer",
  loadChip: "button:has-text(\"Load what I'm editing\")",
  fileInput: 'input[type="file"]',
  attachments: 'button[aria-label^="Remove "]',
  notice: 'p[role="status"]',
  headline: "label:has-text('Headline') input",
  seoTitle: "label:has-text('Page title') input",
  iframe: "iframe",
};

/**
 * The VISIBLE match for a field. Below the `lg` breakpoint the desktop
 * inspector stays in the DOM (`hidden lg:flex`) beside the phone drawer, so
 * the first element matching a label is usually the one nobody can see.
 */
const field = (page, selector) => page.locator(selector).filter({ visible: true }).first();

const editorState = page => page.evaluate(() => ({
  url: location.pathname + location.search,
  project: document.querySelector("[data-dev-editor-project-switcher] select")?.value ?? null,
  mode: document.querySelector(".mm-dev-editor-shell")?.getAttribute("data-editing-mode") ?? null,
  surface: [...document.querySelectorAll('[aria-label="Editor surface"] button')].find(b => b.getAttribute("aria-pressed") === "true")?.textContent.trim() ?? null,
  scope: [...document.querySelectorAll('[aria-label="Editing scope"] button')].find(b => b.className.includes("bg-white "))?.textContent.trim() ?? null,
  client: document.querySelector('select[aria-label="Preview client"]')?.value ?? null,
  template: document.querySelector('select[aria-label="Portal template"]')?.value ?? null,
  lifecycle: document.querySelector('select[aria-label="Lifecycle stage"]')?.value ?? null,
  navigator: document.querySelector('select[aria-label="Page navigator"]')?.value ?? null,
  notice: document.querySelector('p[role="status"]')?.textContent ?? null,
  dirtyDots: document.querySelectorAll('[aria-label="Unsaved changes"]').length,
  code: document.querySelector(".cm-content")?.innerText ?? null,
  codeMounted: Boolean(document.querySelector(".cm-content")),
  iframes: [...document.querySelectorAll("iframe")].map(f => f.getAttribute("src")),
  browserShown: Boolean(document.querySelector('button[aria-label="Hide the browser"]')),
  split: Boolean(document.querySelector('button[aria-label="One browser"]')),
  badge: (document.body?.innerText ?? "").match(/Tag connected|Checking for the tag…|No tag answered[^\n]{0,40}/)?.[0] ?? null,
  words: [...document.querySelectorAll("label")].filter(l => /^The words/.test(l.textContent) && l.getClientRects().length > 0)[0]?.querySelector("textarea")?.value ?? null,
  seoTitle: [...document.querySelectorAll("label")].filter(l => /^Page title/.test(l.textContent) && l.getClientRects().length > 0)[0]?.querySelector("input")?.value ?? null,
  headline: [...document.querySelectorAll("label")].filter(l => /^Headline/.test(l.textContent) && l.getClientRects().length > 0)[0]?.querySelector("input")?.value ?? null,
  composer: [...document.querySelectorAll("#aqua-editor-ai-composer")].find(el => el.getClientRects().length > 0)?.value ?? null,
  attachments: [...document.querySelectorAll('button[aria-label^="Remove "]')].filter(b => b.getClientRects().length > 0).map(b => b.getAttribute("aria-label")),
  aiMarkers: (document.body?.innerText ?? "").match(/(ALPHA|BRAVO)-[A-Z-]+[^\n]*/g) ?? [],
  clicked: (document.body?.innerText ?? "").match(/You clicked <[^\n]*/)?.[0] ?? null,
  keyLine: (document.body?.innerText ?? "").match(/(its own key · [^\n]*|no key on this project|checking this project's key|key status unavailable)/)?.[0] ?? null,
  drawerOpen: Boolean(document.querySelector('aside[aria-label="Dev Editor Engine inspector"]')),
  navigatorOptions: [...document.querySelectorAll('select[aria-label="Page navigator"] option')].map(o => o.value).filter(Boolean),
}));

/**
 * Wait for an accepted Back / All projects to finish LEAVING the editor.
 *
 * A Next soft navigation moves the URL first and unmounts the editor only once
 * the destination has rendered — seconds later on a dev server. Until then the
 * editor's `beforeunload` guard still stands, so a fresh `goto` fired in that
 * window is answered with a beforeunload dialog for work that was already
 * discarded. Waiting for the shell to detach is what "the transition occurred"
 * actually means here.
 */
async function leftEditor(page) {
  await page.waitForURL(url => /\/portal\/dev-team\/editor(\?|$)/.test(url.toString()), { timeout: NAV_TIMEOUT }).catch(() => {});
  await page.waitForSelector(SEL.shell, { state: "detached", timeout: NAV_TIMEOUT }).catch(() => {});
  return /\/portal\/dev-team\/editor(\?|$)/.test(page.url());
}

async function gotoEditor(page, path) {
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
  await page.waitForSelector(SEL.shell, { timeout: NAV_TIMEOUT });
}

async function openInspectorTab(page, viewport, label) {
  if (viewport.mobile) {
    if (!(await page.locator(SEL.drawer).count())) await page.click(SEL.drawerOpen);
    await page.click(SEL.drawerTab(label));
  } else {
    await page.click(SEL.railTab(label));
  }
  await page.waitForTimeout(400);
}

async function closeInspector(page, viewport) {
  if (viewport.mobile && (await page.locator(SEL.drawer).count())) {
    await page.click(SEL.drawerClose);
    await page.waitForTimeout(300);
  }
}

async function selectCanvasPane(page, viewport, label) {
  if (!viewport.mobile) return;
  const button = page.locator(SEL.canvasPane(label));
  if (await button.count()) { await button.click(); await page.waitForTimeout(300); }
}

async function openFile(page, viewport, name) {
  await selectCanvasPane(page, viewport, "Code");
  await page.fill(SEL.findFile, name.replace(/\.[a-z]+$/, ""));
  const row = page.locator(SEL.fileRow(name)).first();
  await row.waitFor({ timeout: UI_TIMEOUT });
  await row.click();
  await page.waitForSelector(SEL.code, { timeout: UI_TIMEOUT });
  await page.waitForTimeout(600);
}

/** Type a distinctive line at the top of the open buffer. Never saved. */
async function dirtyBuffer(page, marker) {
  await page.click(SEL.code);
  await page.keyboard.press("Control+Home");
  await page.keyboard.type(`// ${marker}\n`);
  await page.waitForTimeout(400);
}

async function waitForTag(page, viewport) {
  await selectCanvasPane(page, viewport, "Preview");
  return page.waitForFunction(() => /Tag connected/.test(document.body?.innerText ?? ""), null, { timeout: 25_000 }).then(() => true).catch(() => false);
}

function taggedFrame(page) {
  return page.frames().find(frame => /\/tools(\?|$)/.test(frame.url())) ?? null;
}

/**
 * A real pointer click on an element inside the (scaled, clipped) preview
 * frame: the frame renders at device pixels and is composited down, and it
 * can be wider than its pane, so the point is chosen inside the visible part
 * and verified to land on the iframe before the mouse moves.
 */
async function clickInFrame(page, frame, selector) {
  const point = await frame.locator(selector).first().evaluate(el => {
    el.scrollIntoView({ block: "center", inline: "start" });
    const r = el.getBoundingClientRect();
    return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 };
  });
  const geometry = await page.evaluate(({ x, y }) => {
    const f = document.querySelector("iframe");
    const r = f.getBoundingClientRect();
    const zoom = r.width / f.offsetWidth;
    const px = r.left + x * zoom;
    const py = r.top + y * zoom;
    return { px, py, zoom, onFrame: document.elementFromPoint(px, py) === f };
  }, point);
  if (!geometry.onFrame) throw new Error(`the point (${geometry.px.toFixed(0)},${geometry.py.toFixed(0)}) is not on the preview frame`);
  await page.mouse.click(geometry.px, geometry.py);
  return geometry;
}

/** Make preview changes on the tagged page: select the heading and change its words. */
async function dirtyPreview(run, ctx, page, viewport, marker) {
  const connected = await waitForTag(page, viewport);
  if (!connected) { run.check(ctx, false, "the tag never connected"); return null; }
  const frame = taggedFrame(page);
  await frame.waitForSelector("h1", { timeout: UI_TIMEOUT });
  await clickInFrame(page, frame, "h1");
  await page.waitForTimeout(1000);
  const words = field(page, SEL.words);
  if (!(await words.count())) {
    // On a phone the selection opens the drawer on the Element tab; on a
    // desktop it lands on the Element tab of the rail. Either way the words
    // must be there now.
    run.check(ctx, false, "the click on the tagged page did not open the Element panel");
    return null;
  }
  const original = await words.inputValue();
  await words.fill(`${original} ${marker}`);
  await page.waitForTimeout(600);
  const patched = await frame.evaluate(() => document.querySelector("h1")?.textContent ?? "");
  run.check(ctx, patched.endsWith(marker), `the page's heading now reads "${patched.slice(-40)}"`);
  await closeInspector(page, viewport);
  return { frame, original, marker };
}

async function previewStillPatched(page, marker) {
  const frame = taggedFrame(page);
  if (!frame) return false;
  return frame.evaluate(m => (document.querySelector("h1")?.textContent ?? "").endsWith(m), marker).catch(() => false);
}

/** A reload attempt that the page may refuse. `block` = the dialog is dismissed. */
async function attemptReload(page, block) {
  const marker = await page.evaluate(() => { window.__gateMarker = Date.now(); return window.__gateMarker; });
  const seen = await withDialog(page, { type: "beforeunload", action: block ? "dismiss" : "accept" }, () =>
    page.evaluate(() => { setTimeout(() => location.reload(), 0); }));
  if (!block) {
    await page.waitForLoadState("load", { timeout: NAV_TIMEOUT }).catch(() => {});
    await page.waitForSelector(SEL.shell, { timeout: NAV_TIMEOUT }).catch(() => {});
  } else {
    await page.waitForTimeout(1200);
  }
  const stillSamePage = await page.evaluate(m => window.__gateMarker === m, marker).catch(() => false);
  return { seen, stillSamePage };
}

// ─────────────────────────────────────────────────────────────────────────────
// Warm-up: compile every route the matrix touches before any state is dirty
// ─────────────────────────────────────────────────────────────────────────────
//
// On a `next dev` lane each route compiles on first request, and webpack's HMR
// client answers a fresh compilation with a FULL RELOAD of whatever page is
// open — observed twice on this lane, both times the moment an API route
// compiled for the first time. A reload in the middle of a dirty step would
// destroy the state the step is proving. So every door, panel and API the
// matrix uses is visited once here, with nothing at stake, and the run proper
// starts on a warm server. A production build has nothing to warm; the pass
// is then a few seconds of ordinary navigation.
async function warmUp(run, browser, authenticatedState) {
  const { projectA, projectB } = run.fixtures;
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, storageState: authenticatedState });
  const page = await context.newPage();
  page.on("dialog", dialog => dialog.dismiss());
  const quiet = ms => page.waitForTimeout(ms);
  try {
    await gotoEditor(page, `${run.base}/portal/dev-team/editor/studio?project=${projectA}`);
    await page.waitForSelector(SEL.switcher, { state: "attached", timeout: UI_TIMEOUT });
    await page.waitForFunction(() => /Tag connected|No tag answered/.test(document.body?.innerText ?? ""), null, { timeout: 30_000 }).catch(() => {});
    await page.fill(SEL.findFile, "surfaces");
    await page.locator(SEL.fileRow("surfaces.ts")).first().click({ timeout: UI_TIMEOUT }).catch(() => {});
    await page.waitForSelector(SEL.code, { timeout: UI_TIMEOUT }).catch(() => {});
    await page.click(SEL.railTab("Assistant")).catch(() => {});
    await field(page, SEL.composer).waitFor({ timeout: UI_TIMEOUT }).catch(() => {});
    await page.selectOption(SEL.switcher, projectB);
    await quiet(2500);
    await page.selectOption(SEL.switcher, projectA);
    await quiet(2500);
    await page.click(SEL.mode("Visual builder")).catch(() => {});
    await quiet(1500);
    await page.click(SEL.mode("Just tell it")).catch(() => {});
    await quiet(1500);
    await gotoEditor(page, `${run.base}/portal/dev-team/editor/studio`);
    await page.waitForFunction(() => /Editing .* draft/.test(document.querySelector('p[role="status"]')?.textContent ?? ""), null, { timeout: NAV_TIMEOUT }).catch(() => {});
    await page.click(SEL.scope("Template")).catch(() => {});
    await quiet(2500);
    await page.click(SEL.surface("Website")).catch(() => {});
    await page.click(SEL.railTab("SEO")).catch(() => {});
    await quiet(1500);
    await page.click(SEL.split).catch(() => {});
    await quiet(2500);
    await page.goto(`${run.base}/portal/dev-team/editor`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await quiet(1500);
  } finally {
    await page.close();
    await context.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario: the repository project (buffers + preview changes)
// ─────────────────────────────────────────────────────────────────────────────

async function projectScenario(run, context, viewport) {
  const { projectA, projectB } = run.fixtures;
  const page = await openPage(run, context, viewport);
  const scenario = "project";
  const studioA = `${run.base}/portal/dev-team/editor/studio?project=${projectA}`;
  const row = (transition, dirty) => ({ scenario, viewport: viewport.id, key: rowKey({ id: transition, target: "project", dirty }, viewport.id), step: `${transition} · ${dirty}` });
  const step = name => ({ scenario, viewport: viewport.id, step: name });
  const filesA = { one: "surfaces.ts", two: "selectionRouting.ts" };

  const enterA = async () => {
    await gotoEditor(page, studioA);
    await page.waitForSelector(SEL.switcher, { state: "attached", timeout: UI_TIMEOUT });
    await page.waitForTimeout(800);
  };

  await enterA();
  await overflowClean(run, step("opened project A"), page);

  // ── The handshake, on first load, with no Refresh (issue #19 repair) ──────
  {
    const ctx = step("initial Aqua Tag handshake");
    const connected = await waitForTag(page, viewport);
    run.check(ctx, connected, connected ? "Tag connected without pressing Refresh preview" : "the tag never connected on first load");
    await selectCanvasPane(page, viewport, "Code");
  }

  // ── One buffer, then two: Back asks with the exact count ──────────────────
  const dirtyOne = async marker => { await openFile(page, viewport, filesA.one); await dirtyBuffer(page, marker); };

  // Back with TWO dirty files.
  {
    const ctx = row("back", "repository-files:2");
    await dirtyOne("DIRTY-A-ONE");
    await openFile(page, viewport, filesA.two);
    await dirtyBuffer(page, "DIRTY-A-TWO");
    let state = await editorState(page);
    run.check(ctx, state.dirtyDots === 2 && (state.code ?? "").includes("DIRTY-A-TWO"), `two unsaved buffers (${state.dirtyDots} dots), the active buffer carries its marker`);
    let seen = await withDialog(page, { message: promptFor("repository-files:2"), action: "dismiss" }, () => page.click(SEL.back));
    state = await editorState(page);
    run.check(ctx, seen.length === 1 && state.dirtyDots === 2 && (state.code ?? "").includes("DIRTY-A-TWO") && state.url.includes(`project=${projectA}`), `cancel → ${describeDialogs(seen)}; still on A with both buffers dirty`);
    await focusIntact(run, ctx, page);
    seen = await withDialog(page, { message: promptFor("repository-files:2"), action: "accept" }, () => page.click(SEL.back));
    run.check(ctx, seen.length === 1 && (await leftEditor(page)), `accept → ${describeDialogs(seen)}; landed on ${new URL(page.url()).pathname}`);
    await enterA();
    state = await editorState(page);
    run.check(ctx, state.dirtyDots === 0 && !(state.code ?? "").includes("DIRTY-A-"), `re-entered A: ${state.dirtyDots} dirty buffers, no marker in the restored buffer`);
    await run.shot(page, `${viewport.id}-project-back-reentered`);
  }

  // All projects (desktop only — the row is display:none on a phone).
  {
    const ctx = row("all-projects", "repository-files:1");
    if (!viewport.mobile) {
      await dirtyOne("DIRTY-A-ALL");
      let seen = await withDialog(page, { message: promptFor("repository-files:1"), action: "dismiss" }, () => page.click(SEL.allProjects));
      let state = await editorState(page);
      run.check(ctx, seen.length === 1 && state.dirtyDots === 1 && (state.code ?? "").includes("DIRTY-A-ALL") && state.project === projectA, `cancel → ${describeDialogs(seen)}; buffer and project intact`);
      await focusIntact(run, ctx, page);
      seen = await withDialog(page, { message: promptFor("repository-files:1"), action: "accept" }, () => page.click(SEL.allProjects));
      run.check(ctx, seen.length === 1 && (await leftEditor(page)), `accept → ${describeDialogs(seen)}; landed on ${new URL(page.url()).pathname}`);
      await enterA();
      state = await editorState(page);
      run.check(ctx, state.dirtyDots === 0 && !(state.code ?? "").includes("DIRTY-A-"), `re-entered A clean (${state.dirtyDots} dirty buffers)`);
    } else {
      run.na(ctx, NA_REASONS.switcherHidden);
    }
  }

  // Project A → B, then B → A.
  {
    const ctx = row("project-switch", "repository-files:1");
    if (!viewport.mobile) {
      await dirtyOne("DIRTY-A-SWITCH");
      let seen = await withDialog(page, { message: promptFor("repository-files:1"), action: "dismiss" }, () => page.selectOption(SEL.switcher, projectB));
      let state = await editorState(page);
      run.check(ctx, seen.length === 1 && state.project === projectA && state.dirtyDots === 1 && (state.code ?? "").includes("DIRTY-A-SWITCH"), `cancel → ${describeDialogs(seen)}; still A, buffer intact`);
      await focusIntact(run, ctx, page);
      seen = await withDialog(page, { message: promptFor("repository-files:1"), action: "accept" }, () => page.selectOption(SEL.switcher, projectB));
      await page.waitForFunction(() => /\d+ files/.test(document.body?.innerText ?? ""), null, { timeout: UI_TIMEOUT }).catch(() => {});
      state = await editorState(page);
      const bTree = await page.evaluate(() => (document.body?.innerText ?? "").match(/\d+ files/)?.[0] ?? "no count");
      await page.fill(SEL.findFile, "editorAiSkin");
      await page.waitForTimeout(500);
      const bHasOwnFile = (await page.locator(SEL.fileRow("editorAiSkin.ts")).count()) > 0;
      await page.fill(SEL.findFile, "surfaces");
      await page.waitForTimeout(500);
      const bHasAFile = (await page.locator(SEL.fileRow("surfaces.ts")).count()) > 0;
      await page.fill(SEL.findFile, "");
      run.check(ctx, seen.length === 1 && state.project === projectB && state.dirtyDots === 0 && !(state.code ?? "").includes("DIRTY-A-") && bHasOwnFile && !bHasAFile, `accept → ${describeDialogs(seen)}; B open (${bTree}), lists its own scope only, ${state.dirtyDots} dirty buffers, no A marker`);
      seen = await withoutDialog(page, () => page.selectOption(SEL.switcher, projectA));
      await page.waitForFunction(() => /\d+ files/.test(document.body?.innerText ?? ""), null, { timeout: UI_TIMEOUT }).catch(() => {});
      state = await editorState(page);
      run.check(ctx, seen.length === 0 && state.project === projectA && state.dirtyDots === 0 && !(state.code ?? "").includes("DIRTY-A-"), `B → A: ${describeDialogs(seen)}; A clean (${state.dirtyDots} dirty buffers)`);
      await run.shot(page, `${viewport.id}-project-switch-back-on-A`);
    } else {
      run.na(ctx, NA_REASONS.switcherHidden);
    }
  }

  // Project A → This workspace (the portal target), then back.
  {
    const ctx = row("workspace-switch", "repository-files:1");
    if (!viewport.mobile) {
      await dirtyOne("DIRTY-A-WS");
      let seen = await withDialog(page, { message: promptFor("repository-files:1"), action: "dismiss" }, () => page.selectOption(SEL.switcher, ""));
      let state = await editorState(page);
      run.check(ctx, seen.length === 1 && state.project === projectA && state.dirtyDots === 1, `cancel → ${describeDialogs(seen)}; still A, buffer intact`);
      await focusIntact(run, ctx, page);
      seen = await withDialog(page, { message: promptFor("repository-files:1"), action: "accept" }, () => page.selectOption(SEL.switcher, ""));
      await page.waitForFunction(() => /Editing .* draft/.test(document.querySelector('p[role="status"]')?.textContent ?? ""), null, { timeout: UI_TIMEOUT }).catch(() => {});
      state = await editorState(page);
      run.check(ctx, seen.length === 1 && state.project === "" && /Editing .* draft/.test(state.notice ?? "") && state.dirtyDots === 0 && Boolean(state.scope), `accept → ${describeDialogs(seen)}; the portal target is open ("${state.notice}"), scope ${state.scope}, ${state.dirtyDots} dirty buffers`);
      seen = await withoutDialog(page, () => page.selectOption(SEL.switcher, projectA));
      await page.waitForFunction(() => /\d+ files/.test(document.body?.innerText ?? ""), null, { timeout: UI_TIMEOUT }).catch(() => {});
      state = await editorState(page);
      run.check(ctx, seen.length === 0 && state.project === projectA && state.dirtyDots === 0, `workspace → A: ${describeDialogs(seen)}; A clean`);
    } else {
      run.na(ctx, NA_REASONS.switcherHidden);
    }
  }

  // Depth: Developer → Visual, Developer → Assist. The code canvas leaves.
  for (const [transition, label] of [["mode-visual", "Visual builder"], ["mode-assist", "Just tell it"]]) {
    const ctx = row(transition, "repository-files:1");
    await selectCanvasPane(page, viewport, "Code");
    await dirtyOne(`DIRTY-A-${transition.toUpperCase()}`);
    let seen = await withDialog(page, { message: promptFor("repository-files:1"), action: "dismiss" }, () => page.click(SEL.mode(label)));
    let state = await editorState(page);
    run.check(ctx, seen.length === 1 && state.mode === "developer" && state.dirtyDots === 1 && (state.code ?? "").includes(`DIRTY-A-${transition.toUpperCase()}`), `cancel → ${describeDialogs(seen)}; still Dev with the buffer intact`);
    await focusIntact(run, ctx, page);
    seen = await withDialog(page, { message: promptFor("repository-files:1"), action: "accept" }, () => page.click(SEL.mode(label)));
    await page.waitForTimeout(1400);
    state = await editorState(page);
    run.check(ctx, seen.length === 1 && state.mode !== "developer" && !state.codeMounted, `accept → ${describeDialogs(seen)}; now ${state.mode}, code canvas unmounted`);
    seen = await withoutDialog(page, () => page.click(SEL.mode("Dev")));
    await page.waitForTimeout(1400);
    await selectCanvasPane(page, viewport, "Code");
    await page.waitForSelector(SEL.code, { timeout: UI_TIMEOUT }).catch(() => {});
    state = await editorState(page);
    run.check(ctx, seen.length === 0 && state.mode === "developer" && state.dirtyDots === 0 && !(state.code ?? "").includes("DIRTY-A-"), `back to Dev: ${describeDialogs(seen)}; ${state.dirtyDots} dirty buffers, no marker`);
  }

  // Surface: never asks about repository buffers, and keeps them.
  {
    const ctx = row("surface", "repository-files:1");
    await dirtyOne("DIRTY-A-SURFACE");
    const before = await editorState(page);
    const other = before.surface === "Website" ? "Normal" : "Website";
    let seen = await withoutDialog(page, () => page.click(SEL.surface(other)));
    let state = await editorState(page);
    run.check(ctx, seen.length === 0 && state.surface === other && state.dirtyDots === 1 && (state.code ?? "").includes("DIRTY-A-SURFACE"), `${before.surface} → ${other}: ${describeDialogs(seen)}; buffer kept (${state.dirtyDots} dirty)`);
    seen = await withoutDialog(page, () => page.click(SEL.surface(before.surface)));
    state = await editorState(page);
    run.check(ctx, seen.length === 0 && state.surface === before.surface && state.dirtyDots === 1, `back to ${before.surface}: ${describeDialogs(seen)}; buffer kept`);
    await focusIntact(run, ctx, page);
  }

  // Reload: beforeunload. Dismissed keeps the buffer; accepted reloads clean.
  {
    const ctx = row("reload", "repository-files:1");
    let state = await editorState(page);
    if (state.dirtyDots === 0) await dirtyOne("DIRTY-A-RELOAD");
    const blocked = await attemptReload(page, true);
    state = await editorState(page);
    run.check(ctx, blocked.seen.length === 1 && blocked.stillSamePage && state.dirtyDots >= 1, `dismiss → ${describeDialogs(blocked.seen)}; page not reloaded, ${state.dirtyDots} dirty buffer(s) kept`);
    const accepted = await attemptReload(page, false);
    await page.waitForSelector(SEL.switcher, { state: "attached", timeout: UI_TIMEOUT }).catch(() => {});
    await page.waitForTimeout(800);
    state = await editorState(page);
    run.check(ctx, accepted.seen.length === 1 && !accepted.stillSamePage && state.dirtyDots === 0 && !(state.code ?? "").includes("DIRTY-A-"), `accept → ${describeDialogs(accepted.seen)}; reloaded clean (${state.dirtyDots} dirty buffers)`);
  }

  // ── Preview changes on the tagged page ────────────────────────────────────
  // Browser hide: cancel keeps the patch; accept takes the page away AND its
  // preview state (the 2026-09-03 repair) — Back must not ask again.
  {
    const ctx = row("browser-hide", "preview-changes");
    let state = await editorState(page);
    if (!state.browserShown) await page.click(SEL.showBrowser);
    const preview = await dirtyPreview(run, ctx, page, viewport, "PREVIEW-HIDE");
    if (preview) {
      let seen = await withDialog(page, { message: promptFor("preview-changes"), action: "dismiss" }, () => page.click(SEL.hideBrowser));
      state = await editorState(page);
      const patched = await previewStillPatched(page, "PREVIEW-HIDE");
      run.check(ctx, seen.length === 1 && state.browserShown && patched, `cancel → ${describeDialogs(seen)}; browser still shown, heading still patched`);
      await focusIntact(run, ctx, page);
      seen = await withDialog(page, { message: promptFor("preview-changes"), action: "accept" }, () => page.click(SEL.hideBrowser));
      state = await editorState(page);
      run.check(ctx, seen.length === 1 && !state.browserShown && state.iframes.length === 0, `accept → ${describeDialogs(seen)}; browser hidden`);
      if (!viewport.mobile) {
        const wordsAfter = await editorState(page);
        run.check(ctx, wordsAfter.words === null, wordsAfter.words === null ? "the Element panel no longer shows the vanished page's words" : `the Element panel still shows "${wordsAfter.words}"`);
      }
      // The regression: nothing left to discard, so Back must go straight through.
      seen = await withoutDialog(page, () => page.click(SEL.back));
      run.check(ctx, seen.length === 0 && (await leftEditor(page)), `Back after the accepted hide: ${describeDialogs(seen)}; landed on ${new URL(page.url()).pathname}`);
      await enterA();
    }
  }

  // Preview refresh (desktop): cancel keeps the patch; accept reloads the page.
  {
    const ctx = row("refresh", "preview-changes");
    if (viewport.mobile) {
      run.na(ctx, NA_REASONS.refreshHidden);
    } else {
      let state = await editorState(page);
      if (!state.browserShown) await page.click(SEL.showBrowser);
      const preview = await dirtyPreview(run, ctx, page, viewport, "PREVIEW-REFRESH");
      if (preview) {
        let seen = await withDialog(page, { message: promptFor("preview-changes"), action: "dismiss" }, () => page.click(SEL.refresh));
        const patched = await previewStillPatched(page, "PREVIEW-REFRESH");
        state = await editorState(page);
        run.check(ctx, seen.length === 1 && patched && state.words?.endsWith("PREVIEW-REFRESH"), `cancel → ${describeDialogs(seen)}; heading and words still patched`);
        await focusIntact(run, ctx, page);
        seen = await withDialog(page, { message: promptFor("preview-changes"), action: "accept" }, () => page.click(SEL.refresh));
        const reconnected = await waitForTag(page, viewport);
        const fresh = !(await previewStillPatched(page, "PREVIEW-REFRESH"));
        state = await editorState(page);
        run.check(ctx, seen.length === 1 && reconnected && fresh && state.words === null, `accept → ${describeDialogs(seen)}; page reloaded fresh, tag reconnected, selection cleared`);
      }
    }
  }

  // Page change through a link the tag reported.
  {
    const ctx = row("page", "preview-changes");
    let state = await editorState(page);
    if (!state.browserShown) await page.click(SEL.showBrowser);
    const preview = await dirtyPreview(run, ctx, page, viewport, "PREVIEW-PAGE");
    if (preview) {
      await page.waitForFunction(() => document.querySelectorAll('select[aria-label="Page navigator"] option').length > 1, null, { timeout: 10_000 }).catch(() => {});
      state = await editorState(page);
      // A link the tag reported that is NOT this page (a nav's link to itself
      // moves nothing, so it would prove nothing).
      const here = (taggedFrame(page)?.url() ?? "").replace(/\/$/, "");
      const link = state.navigatorOptions.find(value => value.startsWith("page-links:") && value.slice("page-links:".length).replace(/\/$/, "") !== here);
      if (!link) {
        run.na(ctx, `the tag reported no same-origin link to another page (options: ${state.navigatorOptions.join(", ") || "none"})`);
      } else {
        const frameBefore = taggedFrame(page)?.url();
        let seen = await withDialog(page, { message: promptFor("preview-changes"), action: "dismiss" }, () => page.selectOption(SEL.navigator, link));
        const patched = await previewStillPatched(page, "PREVIEW-PAGE");
        run.check(ctx, seen.length === 1 && patched && taggedFrame(page)?.url() === frameBefore, `cancel → ${describeDialogs(seen)}; still on ${frameBefore}, heading still patched`);
        await focusIntact(run, ctx, page);
        seen = await withDialog(page, { message: promptFor("preview-changes"), action: "accept" }, () => page.selectOption(SEL.navigator, link));
        await page.waitForFunction(before => document.querySelector("iframe")?.getAttribute("src") !== before, frameBefore, { timeout: UI_TIMEOUT }).catch(() => {});
        state = await editorState(page);
        run.check(ctx, seen.length === 1 && state.iframes[0] !== frameBefore && state.words === null, `accept → ${describeDialogs(seen)}; browser moved to ${state.iframes[0]}, selection cleared`);
      }
    }
  }

  // The split control does not exist on a project.
  run.na(row("split", "preview-changes"), NA_REASONS.portalOnlyControl);

  await overflowClean(run, step("end of project scenario"), page);
  await run.shot(page, `${viewport.id}-project-end`);
  await page.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario: the portal target (draft + SEO fields)
// ─────────────────────────────────────────────────────────────────────────────

async function portalScenario(run, context, viewport) {
  const { clientOne, clientTwo } = run.fixtures;
  const page = await openPage(run, context, viewport);
  const scenario = "portal";
  const studio = `${run.base}/portal/dev-team/editor/studio`;
  const row = (transition, dirty) => ({ scenario, viewport: viewport.id, key: rowKey({ id: transition, target: "portal", dirty }, viewport.id), step: `${transition} · ${dirty}` });
  const step = name => ({ scenario, viewport: viewport.id, step: name });

  const enter = async (query = "") => {
    await gotoEditor(page, `${studio}${query}`);
    await page.waitForFunction(() => /Editing .* draft/.test(document.querySelector('p[role="status"]')?.textContent ?? ""), null, { timeout: NAV_TIMEOUT });
    await page.waitForTimeout(600);
  };
  const dirtyDraft = async marker => {
    await openInspectorTab(page, viewport, "Content");
    await field(page, SEL.headline).fill(marker);
    await page.waitForTimeout(400);
    await closeInspector(page, viewport);
  };
  const draftDirty = state => /Unsaved draft changes/.test(state.notice ?? "");
  const readHeadline = async () => {
    await openInspectorTab(page, viewport, "Content");
    const value = await field(page, SEL.headline).inputValue().catch(() => null);
    await closeInspector(page, viewport);
    return value;
  };

  await enter();
  await overflowClean(run, step("opened the portal target"), page);

  // Back with the portal draft dirty.
  {
    const ctx = row("back", "portal-draft");
    await dirtyDraft("PORTAL-DRAFT-BACK");
    let state = await editorState(page);
    run.check(ctx, draftDirty(state), `draft dirty: "${state.notice}"`);
    let seen = await withDialog(page, { message: promptFor("portal-draft"), action: "dismiss" }, () => page.click(SEL.back));
    state = await editorState(page);
    const headline = await readHeadline();
    run.check(ctx, seen.length === 1 && draftDirty(state) && headline === "PORTAL-DRAFT-BACK" && state.url.startsWith("/portal/dev-team/editor/studio"), `cancel → ${describeDialogs(seen)}; headline still "${headline}", draft still dirty`);
    await focusIntact(run, ctx, page);
    seen = await withDialog(page, { message: promptFor("portal-draft"), action: "accept" }, () => page.click(SEL.back));
    run.check(ctx, seen.length === 1 && (await leftEditor(page)), `accept → ${describeDialogs(seen)}; landed on ${new URL(page.url()).pathname}`);
    await enter();
    state = await editorState(page);
    const reopened = await readHeadline();
    run.check(ctx, !draftDirty(state) && reopened !== "PORTAL-DRAFT-BACK", `re-entered clean: "${state.notice}", headline "${reopened}"`);
  }

  // Scope: Client → Template (cancel, accept), then the draft on the template.
  {
    const ctx = row("scope", "portal-draft");
    await dirtyDraft("PORTAL-DRAFT-SCOPE");
    let seen = await withDialog(page, { message: promptFor("portal-draft"), action: "dismiss" }, () => page.click(SEL.scope("Template")));
    let state = await editorState(page);
    run.check(ctx, seen.length === 1 && state.scope === "Client" && draftDirty(state) && (await readHeadline()) === "PORTAL-DRAFT-SCOPE", `cancel → ${describeDialogs(seen)}; still Client scope with the draft`);
    await focusIntact(run, ctx, page);
    seen = await withDialog(page, { message: promptFor("portal-draft"), action: "accept" }, () => page.click(SEL.scope("Template")));
    await page.waitForFunction(() => /Editing .* draft/.test(document.querySelector('p[role="status"]')?.textContent ?? ""), null, { timeout: UI_TIMEOUT }).catch(() => {});
    state = await editorState(page);
    const headline = await readHeadline();
    run.check(ctx, seen.length === 1 && state.scope === "Template" && !draftDirty(state) && headline !== "PORTAL-DRAFT-SCOPE", `accept → ${describeDialogs(seen)}; Template scope, "${state.notice}", headline "${headline}"`);
  }

  // Template change (two templates: the master and the product's).
  {
    const ctx = row("template", "portal-draft");
    const options = await page.$$eval(`${SEL.template} option`, list => list.map(o => o.value));
    if (options.length < 2) {
      run.check(ctx, false, `only ${options.length} template(s) offered — the seed's product template is missing`);
    } else {
      await dirtyDraft("PORTAL-DRAFT-TEMPLATE");
      const from = (await editorState(page)).template;
      const to = options.find(value => value !== from);
      let seen = await withDialog(page, { message: promptFor("portal-draft"), action: "dismiss" }, () => page.selectOption(SEL.template, to));
      let state = await editorState(page);
      run.check(ctx, seen.length === 1 && state.template === from && draftDirty(state), `cancel → ${describeDialogs(seen)}; template ${from} kept with the draft`);
      await focusIntact(run, ctx, page);
      seen = await withDialog(page, { message: promptFor("portal-draft"), action: "accept" }, () => page.selectOption(SEL.template, to));
      await page.waitForFunction(() => /Editing .* draft/.test(document.querySelector('p[role="status"]')?.textContent ?? ""), null, { timeout: UI_TIMEOUT }).catch(() => {});
      state = await editorState(page);
      run.check(ctx, seen.length === 1 && state.template === to && !draftDirty(state), `accept → ${describeDialogs(seen)}; template ${to}, "${state.notice}"`);
      await withoutDialog(page, () => page.selectOption(SEL.template, from));
      await page.waitForFunction(() => /Editing .* draft/.test(document.querySelector('p[role="status"]')?.textContent ?? ""), null, { timeout: UI_TIMEOUT }).catch(() => {});
    }
  }

  // Back to the Client scope for the client change.
  await withoutDialog(page, () => page.click(SEL.scope("Client")));
  await page.waitForFunction(() => /Editing .* draft/.test(document.querySelector('p[role="status"]')?.textContent ?? ""), null, { timeout: UI_TIMEOUT }).catch(() => {});

  // Client change.
  {
    const ctx = row("client", "portal-draft");
    const from = (await editorState(page)).client;
    const to = from === clientOne ? clientTwo : clientOne;
    await dirtyDraft("PORTAL-DRAFT-CLIENT");
    let seen = await withDialog(page, { message: promptFor("portal-draft"), action: "dismiss" }, () => page.selectOption(SEL.client, to));
    let state = await editorState(page);
    run.check(ctx, seen.length === 1 && state.client === from && draftDirty(state) && (await readHeadline()) === "PORTAL-DRAFT-CLIENT", `cancel → ${describeDialogs(seen)}; client ${from} kept with the draft`);
    await focusIntact(run, ctx, page);
    seen = await withDialog(page, { message: promptFor("portal-draft"), action: "accept" }, () => page.selectOption(SEL.client, to));
    await page.waitForFunction(() => /Editing .* draft/.test(document.querySelector('p[role="status"]')?.textContent ?? ""), null, { timeout: UI_TIMEOUT }).catch(() => {});
    state = await editorState(page);
    const headline = await readHeadline();
    run.check(ctx, seen.length === 1 && state.client === to && !draftDirty(state) && headline !== "PORTAL-DRAFT-CLIENT", `accept → ${describeDialogs(seen)}; client ${to}, "${state.notice}", headline "${headline}"`);
  }

  // Lifecycle and page changes never touch the portal draft: silent, and kept.
  for (const [transition, selector, pickOther] of [
    ["lifecycle", SEL.lifecycle, current => (current === "onboarding" ? "designing" : "onboarding")],
    ["page", SEL.navigator, current => (current === "portal:home" ? "portal:project" : "portal:home")],
  ]) {
    const ctx = row(transition, "portal-draft");
    await dirtyDraft(`PORTAL-DRAFT-${transition.toUpperCase()}`);
    const before = await editorState(page);
    const to = pickOther(transition === "lifecycle" ? before.lifecycle : before.navigator);
    const seen = await withoutDialog(page, () => page.selectOption(selector, to));
    const state = await editorState(page);
    const moved = transition === "lifecycle" ? state.lifecycle === to : state.navigator === to;
    run.check(ctx, seen.length === 0 && moved && draftDirty(state), `${describeDialogs(seen)}; moved to ${to}, draft still dirty ("${state.notice}")`);
    await focusIntact(run, ctx, page);
  }

  // Reload with the draft dirty.
  {
    const ctx = row("reload", "portal-draft");
    let state = await editorState(page);
    if (!draftDirty(state)) await dirtyDraft("PORTAL-DRAFT-RELOAD");
    const blocked = await attemptReload(page, true);
    state = await editorState(page);
    run.check(ctx, blocked.seen.length === 1 && blocked.stillSamePage && draftDirty(state), `dismiss → ${describeDialogs(blocked.seen)}; page not reloaded, draft still dirty`);
    const accepted = await attemptReload(page, false);
    await page.waitForFunction(() => /Editing .* draft/.test(document.querySelector('p[role="status"]')?.textContent ?? ""), null, { timeout: NAV_TIMEOUT }).catch(() => {});
    state = await editorState(page);
    run.check(ctx, accepted.seen.length === 1 && !accepted.stillSamePage && !draftDirty(state), `accept → ${describeDialogs(accepted.seen)}; reloaded clean ("${state.notice}")`);
  }

  // ── SEO fields (the Website surface) ──────────────────────────────────────
  if (viewport.mobile) {
    // On a phone the SEO panel lives in the inspector drawer, and every toolbar
    // control is UNDER that drawer. Reaching a transition means closing the
    // drawer — which unmounts the panel and resets its draft. Observed, not
    // asserted: it is outside the listed transitions and is reported as a
    // residual rather than repaired here.
    const ctx = step("SEO fields on a phone");
    await withoutDialog(page, () => page.click(SEL.surface("Website")));
    await openInspectorTab(page, viewport, "SEO");
    const seoField = field(page, SEL.seoTitle);
    if (await seoField.count()) {
      await seoField.fill("SEO-PHONE title");
      await page.waitForTimeout(300);
      await closeInspector(page, viewport);
      const otherStage = (await editorState(page)).lifecycle === "onboarding" ? "designing" : "onboarding";
      const seen = await withoutDialog(page, () => page.selectOption(SEL.lifecycle, otherStage));
      await openInspectorTab(page, viewport, "SEO");
      const after = await field(page, SEL.seoTitle).inputValue().catch(() => null);
      await closeInspector(page, viewport);
      run.observe(ctx, `after closing the drawer the lifecycle change raised ${describeDialogs(seen)} and the SEO title read "${after}" — closing the drawer discards the SEO draft silently`);
    }
    await withoutDialog(page, () => page.click(SEL.surface("Normal")));
    for (const [transition] of [["lifecycle"], ["page"], ["surface"], ["mode-assist"], ["browser-hide"], ["split"]]) {
      run.na(row(transition, "seo-fields"), NA_REASONS.phoneSeoDrawer);
    }
    run.na(row("refresh", "seo-fields"), NA_REASONS.refreshHidden);
  } else {
    const dirtySeo = async marker => {
      let state = await editorState(page);
      if (state.surface !== "Website") { await withoutDialog(page, () => page.click(SEL.surface("Website"))); }
      await openInspectorTab(page, viewport, "SEO");
      await field(page, SEL.seoTitle).fill(marker);
      await page.waitForTimeout(400);
      state = await editorState(page);
      return state.seoTitle === marker;
    };
    const seoValue = () => field(page, SEL.seoTitle).inputValue().catch(() => null);

    // Lifecycle: asks, keeps on cancel. (After accept the panel's target is the
    // same page, so the draft is not actually lost — observed and reported.)
    {
      const ctx = row("lifecycle", "seo-fields");
      run.check(ctx, await dirtySeo("SEO-LIFECYCLE"), "SEO title typed");
      const before = await editorState(page);
      const to = before.lifecycle === "onboarding" ? "designing" : "onboarding";
      let seen = await withDialog(page, { message: promptFor("seo-fields"), action: "dismiss" }, () => page.selectOption(SEL.lifecycle, to));
      let state = await editorState(page);
      run.check(ctx, seen.length === 1 && state.lifecycle === before.lifecycle && (await seoValue()) === "SEO-LIFECYCLE", `cancel → ${describeDialogs(seen)}; lifecycle ${before.lifecycle} kept, title intact`);
      await focusIntact(run, ctx, page);
      seen = await withDialog(page, { message: promptFor("seo-fields"), action: "accept" }, () => page.selectOption(SEL.lifecycle, to));
      state = await editorState(page);
      const after = await seoValue();
      run.check(ctx, seen.length === 1 && state.lifecycle === to, `accept → ${describeDialogs(seen)}; lifecycle ${to}`);
      if (after === "SEO-LIFECYCLE") run.observe(ctx, "the accepted prompt did not discard the SEO title: the panel's page target is unchanged by a lifecycle change, so the prompt over-asks (pinned behaviour, reported as a residual)");
    }

    // Page change: asks, keeps on cancel, discards on accept.
    {
      const ctx = row("page", "seo-fields");
      run.check(ctx, await dirtySeo("SEO-PAGE"), "SEO title typed");
      const before = await editorState(page);
      const to = before.navigator === "portal:home" ? "portal:project" : "portal:home";
      let seen = await withDialog(page, { message: promptFor("seo-fields"), action: "dismiss" }, () => page.selectOption(SEL.navigator, to));
      let state = await editorState(page);
      run.check(ctx, seen.length === 1 && state.navigator === before.navigator && (await seoValue()) === "SEO-PAGE", `cancel → ${describeDialogs(seen)}; page ${before.navigator} kept, title intact`);
      await focusIntact(run, ctx, page);
      seen = await withDialog(page, { message: promptFor("seo-fields"), action: "accept" }, () => page.selectOption(SEL.navigator, to));
      await page.waitForTimeout(800);
      state = await editorState(page);
      const after = await seoValue();
      run.check(ctx, seen.length === 1 && state.navigator === to && after !== "SEO-PAGE", `accept → ${describeDialogs(seen)}; page ${to}, title now "${after}"`);
    }

    // Surface: Website → Normal takes the SEO tab away.
    {
      const ctx = row("surface", "seo-fields");
      run.check(ctx, await dirtySeo("SEO-SURFACE"), "SEO title typed");
      let seen = await withDialog(page, { message: promptFor("seo-fields"), action: "dismiss" }, () => page.click(SEL.surface("Normal")));
      let state = await editorState(page);
      run.check(ctx, seen.length === 1 && state.surface === "Website" && (await seoValue()) === "SEO-SURFACE", `cancel → ${describeDialogs(seen)}; still Website, title intact`);
      await focusIntact(run, ctx, page);
      seen = await withDialog(page, { message: promptFor("seo-fields"), action: "accept" }, () => page.click(SEL.surface("Normal")));
      state = await editorState(page);
      run.check(ctx, seen.length === 1 && state.surface === "Normal" && state.seoTitle === null, `accept → ${describeDialogs(seen)}; Normal surface, SEO panel gone`);
    }

    // Depth: Visual → Assist asks about SEO.
    {
      const ctx = row("mode-assist", "seo-fields");
      run.check(ctx, await dirtySeo("SEO-MODE"), "SEO title typed");
      let seen = await withDialog(page, { message: promptFor("seo-fields"), action: "dismiss" }, () => page.click(SEL.mode("Just tell it")));
      let state = await editorState(page);
      run.check(ctx, seen.length === 1 && state.mode === "visual" && (await seoValue()) === "SEO-MODE", `cancel → ${describeDialogs(seen)}; still Visual, title intact`);
      await focusIntact(run, ctx, page);
      seen = await withDialog(page, { message: promptFor("seo-fields"), action: "accept" }, () => page.click(SEL.mode("Just tell it")));
      await page.waitForTimeout(1400);
      state = await editorState(page);
      run.check(ctx, seen.length === 1 && state.mode === "assist", `accept → ${describeDialogs(seen)}; now ${state.mode}`);
      if ((await seoValue()) === "SEO-MODE") {
        run.observe(ctx, "the accepted prompt did not discard the SEO title: the SEO tab is offered at every depth on the Website surface, so the panel stays mounted and the prompt over-asks (pinned behaviour, reported as a residual)");
        // Put the draft back to what is saved, so the way back does not ask again.
        await field(page, SEL.seoTitle).fill("");
        await page.waitForTimeout(300);
      }
      await withoutDialog(page, () => page.click(SEL.mode("Visual builder")));
      await page.waitForTimeout(1400);
    }

    // Split, hide: never about SEO — silent, and the title is kept.
    {
      const ctx = row("split", "seo-fields");
      run.check(ctx, await dirtySeo("SEO-SPLIT"), "SEO title typed");
      let seen = await withoutDialog(page, () => page.click(SEL.split));
      let state = await editorState(page);
      run.check(ctx, seen.length === 0 && state.split && state.iframes.length === 2 && (await seoValue()) === "SEO-SPLIT", `one → split: ${describeDialogs(seen)}; two browsers, title intact`);
      seen = await withoutDialog(page, () => page.click(SEL.unsplit));
      state = await editorState(page);
      run.check(ctx, seen.length === 0 && !state.split && state.iframes.length === 1 && (await seoValue()) === "SEO-SPLIT", `split → one: ${describeDialogs(seen)}; one browser, title intact`);
      await focusIntact(run, ctx, page);
    }
    {
      const ctx = row("browser-hide", "seo-fields");
      run.check(ctx, await dirtySeo("SEO-HIDE"), "SEO title typed");
      let seen = await withoutDialog(page, () => page.click(SEL.hideBrowser));
      let state = await editorState(page);
      run.check(ctx, seen.length === 0 && !state.browserShown && (await seoValue()) === "SEO-HIDE", `hide: ${describeDialogs(seen)}; browser hidden, title intact`);
      seen = await withoutDialog(page, () => page.click(SEL.showBrowser));
      state = await editorState(page);
      run.check(ctx, seen.length === 0 && state.browserShown && (await seoValue()) === "SEO-HIDE", `show: ${describeDialogs(seen)}; browser back, title intact`);
      await focusIntact(run, ctx, page);
    }

    // Refresh: asks about SEO.
    {
      const ctx = row("refresh", "seo-fields");
      run.check(ctx, await dirtySeo("SEO-REFRESH"), "SEO title typed");
      let seen = await withDialog(page, { message: promptFor("seo-fields"), action: "dismiss" }, () => page.click(SEL.refresh));
      run.check(ctx, seen.length === 1 && (await seoValue()) === "SEO-REFRESH", `cancel → ${describeDialogs(seen)}; title intact`);
      await focusIntact(run, ctx, page);
      const frameBefore = (await editorState(page)).iframes[0];
      seen = await withDialog(page, { message: promptFor("seo-fields"), action: "accept" }, () => page.click(SEL.refresh));
      await page.waitForTimeout(1200);
      const state = await editorState(page);
      const after = await seoValue();
      run.check(ctx, seen.length === 1 && state.iframes.length === 1, `accept → ${describeDialogs(seen)}; preview re-keyed (${state.iframes[0] === frameBefore ? "same address" : "new address"})`);
      if (after === "SEO-REFRESH") run.observe(ctx, "the accepted prompt did not discard the SEO title: a preview refresh leaves the panel's page target unchanged, so the prompt over-asks (pinned behaviour, reported as a residual)");
    }
  }

  await overflowClean(run, step("end of portal scenario"), page);
  await run.shot(page, `${viewport.id}-portal-end`);
  await page.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario: Aqua Editor AI isolation across projects
// ─────────────────────────────────────────────────────────────────────────────

async function aiScenario(run, context, viewport) {
  const { projectA, projectB } = run.fixtures;
  const page = await openPage(run, context, viewport);
  const scenario = "ai";
  const step = name => ({ scenario, viewport: viewport.id, step: name });
  const studioA = `${run.base}/portal/dev-team/editor/studio?project=${projectA}`;
  const attachmentPath = join(run.laneDir, "alpha-attachment.txt");
  await writeFile(attachmentPath, "ALPHA-ATTACHMENT contents\n");

  const held = [];
  let holdProject = null;
  const replies = [];
  let fakeStatusFor = null;
  await page.route("**/api/portal/dev/editor-ai**", async route => {
    const request = route.request();
    let body = {};
    try { body = JSON.parse(request.postData() || "{}"); } catch {}
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/reply")) { replies.push({ route, body }); return; } // never reaches the server
    if (holdProject && body.projectId === holdProject) { held.push({ route, body, kind: path.endsWith("/history") ? "history" : "status" }); return; }
    if (fakeStatusFor && body.projectId === fakeStatusFor && body.action === "status") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, status: { projectId: fakeStatusFor, configured: true, model: "ALPHA-FAKE-MODEL", tokenHint: "••••fake" }, reason: "", vaultAvailable: true }) });
      return;
    }
    await route.continue();
  });

  const aiState = async () => {
    const state = await editorState(page);
    return { project: state.project, composer: state.composer, attachments: state.attachments, markers: state.aiMarkers, clicked: state.clicked, keyLine: state.keyLine, words: state.words };
  };
  const leaksIntoB = state => ({
    alpha: state.markers.filter(m => m.startsWith("ALPHA")),
    composer: state.composer && /ALPHA|Editor Boundaries A|<h1>/.test(state.composer) ? state.composer : null,
    attachments: state.attachments.filter(a => /alpha/i.test(a)),
    clicked: state.clicked,
  });
  const noLeak = leak => leak.alpha.length === 0 && !leak.composer && leak.attachments.length === 0 && !leak.clicked;

  await gotoEditor(page, studioA);
  await page.waitForSelector(SEL.switcher, { state: "attached", timeout: UI_TIMEOUT });

  if (viewport.mobile) {
    // The capture, prefill and attachment are made for real; the switch does
    // not exist here (the switcher row is display:none), so the cross-project
    // half is N/A on a phone.
    const ctx = step("capture, prefill and attachment on A");
    const connected = await waitForTag(page, viewport);
    let captured = false;
    if (connected) {
      const frame = taggedFrame(page);
      await frame.waitForSelector("h1", { timeout: UI_TIMEOUT });
      await clickInFrame(page, frame, "h1");
      await page.waitForTimeout(1000);
      captured = Boolean((await editorState(page)).words);
      await closeInspector(page, viewport);
    }
    await openInspectorTab(page, viewport, "Assistant");
    await field(page, SEL.composer).waitFor({ timeout: UI_TIMEOUT });
    await field(page, SEL.loadChip).click();
    await page.locator(SEL.fileInput).last().setInputFiles(attachmentPath);
    await page.waitForTimeout(800);
    const state = await aiState();
    run.check(ctx, captured && /Editor Boundaries A/.test(state.composer ?? "") && state.attachments.length === 1 && Boolean(state.clicked), `capture ${captured ? "landed" : "MISSING"}, composer "${(state.composer ?? "").split("\n")[0]}", ${state.attachments.length} attachment, strip "${state.clicked}"`);
    run.na(step("switch to B while A's reads are in flight"), NA_REASONS.switcherHidden);
    await closeInspector(page, viewport);
    await page.close();
    return;
  }

  // ── Project A: a real capture, a prefill and an attachment ────────────────
  {
    const ctx = step("capture, prefill and attachment on A");
    const connected = await waitForTag(page, viewport);
    let captured = false;
    if (connected) {
      const frame = taggedFrame(page);
      await frame.waitForSelector("h1", { timeout: UI_TIMEOUT });
      await clickInFrame(page, frame, "h1");
      await page.waitForTimeout(1000);
      captured = Boolean((await editorState(page)).words);
    }
    await openInspectorTab(page, viewport, "Assistant");
    await field(page, SEL.composer).waitFor({ timeout: UI_TIMEOUT });
    await page.waitForFunction(() => /ALPHA-ONLY/.test(document.body?.innerText ?? ""), null, { timeout: UI_TIMEOUT });
    const afterCapture = await aiState();
    await field(page, SEL.loadChip).click();
    await page.locator(SEL.fileInput).last().setInputFiles(attachmentPath);
    await page.waitForTimeout(800);
    const state = await aiState();
    run.check(ctx, captured && Boolean(afterCapture.clicked) && /<h1>/.test(state.composer ?? "") && state.attachments.length === 1 && state.markers.includes("ALPHA-ONLY history line"), `capture ${captured ? "landed" : "MISSING"} ("${afterCapture.clicked}"), composer quotes the heading, ${state.attachments.length} attachment, A's history shown`);
    await run.shot(page, `${viewport.id}-ai-A-loaded`);
  }

  // ── Switch to B with nothing in flight: nothing of A's may paint B ────────
  {
    const ctx = step("A → B: capture, prefill, attachment stay behind");
    await withoutDialog(page, () => page.selectOption(SEL.switcher, projectB));
    await page.waitForFunction(() => /BRAVO-ONLY/.test(document.body?.innerText ?? ""), null, { timeout: UI_TIMEOUT });
    const state = await aiState();
    const leak = leaksIntoB(state);
    run.check(ctx, state.project === projectB && noLeak(leak) && state.composer === "" && state.attachments.length === 0 && state.markers.includes("BRAVO-ONLY history line"), noLeak(leak) ? `B shows only its own history; composer empty, no attachment, no capture strip` : `LEAK into B: ${JSON.stringify(leak)}`);
    await run.shot(page, `${viewport.id}-ai-B-after-switch`);
  }

  // ── Back to A with its status and history reads HELD, then to B ───────────
  {
    const ctx = step("A's held status/history land after the switch to B");
    holdProject = projectA;
    await withoutDialog(page, () => page.selectOption(SEL.switcher, projectA));
    await page.waitForTimeout(2000);
    const whileHeld = await aiState();
    run.check(ctx, whileHeld.project === projectA && /checking this project's key/.test(whileHeld.keyLine ?? "") && held.some(h => h.kind === "status"), `A shows "${whileHeld.keyLine}" while ${held.length} read(s) are held (${held.map(h => h.kind).join(", ")})`);
    // Release the status so the thread mounts and its history read is caught too.
    const status = held.find(h => h.kind === "status");
    if (status) { held.splice(held.indexOf(status), 1); await status.route.continue(); }
    await page.waitForFunction(() => /Reading this project's history…/.test(document.body.innerText) || /ALPHA-ONLY/.test(document.body?.innerText ?? ""), null, { timeout: UI_TIMEOUT }).catch(() => {});
    await page.waitForTimeout(500);
    const heldKinds = held.map(h => h.kind);
    await withoutDialog(page, () => page.selectOption(SEL.switcher, projectB));
    await page.waitForFunction(() => /BRAVO-ONLY/.test(document.body?.innerText ?? ""), null, { timeout: UI_TIMEOUT });
    holdProject = null;
    // Now answer A's held reads with DISTINCTIVE payloads — if any of them paints B, it shows.
    for (const h of held.splice(0)) {
      if (h.kind === "history") {
        await h.route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, conversation: { projectId: projectA, agencyId: run.fixtures.agencyId, threads: [{ id: "thr_alpha_delayed", title: "ALPHA-DELAYED thread", createdAt: Date.now(), updatedAt: Date.now(), messages: [{ id: "m1", role: "user", content: "ALPHA-DELAYED history line", createdAt: Date.now() }] }], evictedMessages: 0 }, limits: { threadsPerProject: 12, messagesPerThread: 60, messageChars: 4000 } }) });
      } else {
        await h.route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, status: { projectId: projectA, configured: true, model: "ALPHA-DELAYED-MODEL", tokenHint: "••••alph" }, reason: "", vaultAvailable: true }) });
      }
    }
    await page.waitForTimeout(2500);
    const state = await aiState();
    const leak = leaksIntoB(state);
    run.check(ctx, state.project === projectB && noLeak(leak) && !/ALPHA/.test(state.keyLine ?? "") && state.markers.includes("BRAVO-ONLY history line"), noLeak(leak) && !/ALPHA/.test(state.keyLine ?? "") ? `held reads (${heldKinds.join(", ")}) answered with ALPHA-DELAYED payloads after the switch; B still shows only BRAVO ("${state.keyLine}")` : `LEAK into B: ${JSON.stringify(leak)} key line "${state.keyLine}"`);
  }

  // ── A delayed FAILURE of A's status must not paint B either ──────────────
  {
    const ctx = step("A's delayed status 500 lands after the switch to B");
    holdProject = projectA;
    await withoutDialog(page, () => page.selectOption(SEL.switcher, projectA));
    await page.waitForTimeout(1500);
    await withoutDialog(page, () => page.selectOption(SEL.switcher, projectB));
    await page.waitForFunction(() => /BRAVO-ONLY/.test(document.body?.innerText ?? ""), null, { timeout: UI_TIMEOUT });
    holdProject = null;
    const count = held.length;
    for (const h of held.splice(0)) {
      run.fabricatedFailures.add(h.route.request().url());
      await h.route.fulfill({ status: 500, contentType: "application/json", headers: { "x-aqua-gate": "fabricated" }, body: JSON.stringify({ ok: false, error: "ALPHA-DELAYED-ERROR" }) });
    }
    await page.waitForTimeout(2000);
    const state = await aiState();
    const leak = leaksIntoB(state);
    run.check(ctx, state.project === projectB && noLeak(leak) && !/unavailable|ALPHA/.test(state.keyLine ?? ""), `${count} held read(s) answered 500 after the switch; B shows "${state.keyLine}"`);
  }

  // ── A held REPLY: sent on A (with a fabricated key status), answered on B ─
  {
    const ctx = step("A's held reply lands after the switch to B");
    fakeStatusFor = projectA;
    await withoutDialog(page, () => page.selectOption(SEL.switcher, projectA));
    await page.waitForFunction(() => /ALPHA-FAKE-MODEL/.test(document.body?.innerText ?? ""), null, { timeout: UI_TIMEOUT });
    await page.waitForFunction(() => /ALPHA-ONLY/.test(document.body?.innerText ?? ""), null, { timeout: UI_TIMEOUT });
    await field(page, SEL.composer).fill("ALPHA-SENT question");
    await field(page, 'button:has-text("Send")').click();
    await page.waitForFunction(() => /ALPHA-SENT question/.test(document.body?.innerText ?? ""), null, { timeout: UI_TIMEOUT });
    await page.waitForTimeout(800);
    const sent = await aiState();
    run.check(ctx, replies.length === 1 && replies[0].body.projectId === projectA, `the message was saved on A and its reply request (${replies.length}) is held in the browser — it never reached the server`);
    await withoutDialog(page, () => page.selectOption(SEL.switcher, projectB));
    await page.waitForFunction(() => /BRAVO-ONLY/.test(document.body?.innerText ?? ""), null, { timeout: UI_TIMEOUT });
    for (const r of replies.splice(0)) {
      await r.route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, threadId: "thr_alpha_reply", conversation: { projectId: projectA, agencyId: run.fixtures.agencyId, threads: [{ id: "thr_alpha_reply", title: "ALPHA-REPLY thread", createdAt: Date.now(), updatedAt: Date.now(), messages: [{ id: "m1", role: "user", content: "ALPHA-SENT question", createdAt: Date.now() }, { id: "m2", role: "assistant", content: "ALPHA-REPLY delayed answer", createdAt: Date.now() }] }], evictedMessages: 0 } }) });
    }
    await page.waitForTimeout(2500);
    const state = await aiState();
    const leak = leaksIntoB(state);
    run.check(ctx, state.project === projectB && noLeak(leak) && !/ALPHA/.test(state.keyLine ?? "") && state.composer === "", noLeak(leak) ? `the delayed ALPHA-REPLY landed while B was open; B shows "${state.keyLine}", composer empty, only BRAVO history` : `LEAK into B: ${JSON.stringify(leak)}`);
    fakeStatusFor = null;
    await withoutDialog(page, () => page.selectOption(SEL.switcher, projectA));
    await page.waitForFunction(() => /ALPHA-ONLY/.test(document.body?.innerText ?? ""), null, { timeout: UI_TIMEOUT });
    await page.waitForTimeout(1000);
    const back = await aiState();
    run.check(ctx, back.project === projectA && back.markers.includes("ALPHA-SENT question") && !back.markers.includes("ALPHA-REPLY delayed answer") && !/ALPHA-FAKE/.test(back.keyLine ?? ""), `back on A: its real history has the sent question, the stale reply was dropped, key line "${back.keyLine}"`);
    void sent;
  }

  await run.shot(page, `${viewport.id}-ai-end`);
  await page.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario: layout at the house viewports
// ─────────────────────────────────────────────────────────────────────────────

async function layoutScenario(run, browser, authenticatedState) {
  const { projectA } = run.fixtures;
  let axeSource = null;
  try { axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8"); } catch {}
  for (const viewport of LAYOUT_VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.mobile, hasTouch: viewport.mobile, storageState: authenticatedState, reducedMotion: "no-preference" });
    const page = await openPage(run, context, viewport);
    for (const [door, path] of [["project", `/portal/dev-team/editor/studio?project=${projectA}`], ["portal", "/portal/dev-team/editor/studio"]]) {
      const ctx = { scenario: "layout", viewport: viewport.id, step: `${door} door` };
      try {
        await gotoEditor(page, `${run.base}${path}`);
        await page.waitForTimeout(2500);
        await overflowClean(run, ctx, page);
        // Three Tab stops: focus must land on attached controls, never nowhere.
        const stops = [];
        for (let i = 0; i < 3; i += 1) { await page.keyboard.press("Tab"); stops.push(await focusState(page)); }
        run.check(ctx, stops.every(s => s.connected) && stops.some(s => !s.isBody), `focus stops: ${stops.map(s => s.label).join(" → ")}`);
        if (axeSource) {
          const violations = await page.addScriptTag({ content: axeSource }).then(() => page.evaluate(async () => {
            // eslint-disable-next-line no-undef
            const results = await window.axe.run(document, { resultTypes: ["violations"], runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
            return results.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
          })).catch(() => null);
          const blocking = (violations ?? []).filter(v => v.impact === "serious" || v.impact === "critical");
          run.observe(ctx, violations ? `axe: ${violations.length} violation(s), ${blocking.length} serious/critical${blocking.length ? ` (${blocking.map(v => `${v.id}×${v.nodes}`).join(", ")})` : ""}` : "axe did not run");
        }
        await run.shot(page, `layout-${viewport.id}-${door}`);
      } catch (error) {
        run.check(ctx, false, error.message.slice(0, 200));
      }
    }
    await page.close();
    await context.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const phase = process.argv[2] ?? "run";
  const base = (process.env.AQUA_BASE || "http://localhost:3183").replace(/\/$/, "");
  const port = new URL(base).port || "80";
  const laneDir = process.env.AQUA_LANE_DIR || `/private/tmp/aquacrm-editor-boundaries-${port}`;
  if (phase === "seed") { await seed({ laneDir, base }); return; }
  if (phase !== "run") throw new Error(`unknown phase "${phase}" — use seed or run`);

  const fixturesPath = join(laneDir, "fixtures.json");
  if (!existsSync(fixturesPath)) throw new Error(`no fixtures at ${fixturesPath} — run the seed phase against a fresh private state first.`);
  const fixtures = JSON.parse(readFileSync(fixturesPath, "utf8"));
  const evidenceDir = join(laneDir, "evidence");
  await mkdir(evidenceDir, { recursive: true });
  const scopeDirs = [...fixtures.scopes.projectA, ...fixtures.scopes.projectB];
  const hashesBefore = hashTree(PORTAL_ROOT, scopeDirs);

  const viewports = FUNCTIONAL_VIEWPORTS.filter(v => !process.env.AQUA_VIEWPORTS || process.env.AQUA_VIEWPORTS.split(",").includes(v.id));
  const scenarios = new Set((process.env.AQUA_SCENARIOS || "project,portal,ai,layout").split(","));
  const run = new Run({ base, laneDir, fixtures, evidenceDir });

  console.log(`\n=== Dev Editor dirty-transition gate @ ${base} ===`);
  console.log(`projects A=${fixtures.projectA} B=${fixtures.projectB} · ${hashesBefore.count} fixture files hashed (${hashesBefore.digest.slice(0, 12)})\n`);

  const { browser, note } = await launchChromium();
  console.log(`Browser: ${note} — ${browser.version()}\n`);
  let authenticatedState;
  try {
    const bootstrap = await browser.newContext();
    const page = await bootstrap.newPage();
    const response = await page.goto(`${base}/dev`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    if (!response || response.status() >= 400) {
      throw new Error(`sign-in failed: GET /dev → ${response?.status() ?? "no response"}. This gate runs only against a Dev Mode lane (PORTAL_DEV_MODE=true on a file backend).`);
    }
    authenticatedState = await bootstrap.storageState();
    await bootstrap.close();

    console.log("— Warm-up (compiling every route the matrix touches)");
    await warmUp(run, browser, authenticatedState);

    for (const viewport of viewports) {
      console.log(`\n— ${viewport.label}`);
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.mobile, hasTouch: viewport.mobile, storageState: authenticatedState, reducedMotion: "no-preference" });
      const guarded = async (name, work) => {
        try { await work(); } catch (error) { run.record({ scenario: name, viewport: viewport.id, step: "scenario aborted", status: "fail", detail: error.message.slice(0, 300) }); }
      };
      if (scenarios.has("project")) await guarded("project", () => projectScenario(run, context, viewport));
      if (scenarios.has("portal")) await guarded("portal", () => portalScenario(run, context, viewport));
      if (scenarios.has("ai")) await guarded("ai", () => aiScenario(run, context, viewport));
      await context.close();
    }
    if (scenarios.has("layout")) {
      console.log("\n— Layout viewports");
      await layoutScenario(run, browser, authenticatedState);
    }
  } finally {
    await browser.close();
  }

  // ── The run-wide guards ───────────────────────────────────────────────────
  const guard = (name, ok, detail) => run.record({ scenario: "guards", viewport: "run", step: name, status: ok ? "pass" : "fail", detail });
  const hashesAfter = hashTree(PORTAL_ROOT, scopeDirs);
  const changed = Object.keys({ ...hashesBefore.files, ...hashesAfter.files }).filter(path => hashesBefore.files[path] !== hashesAfter.files[path]);
  guard("fixture files unchanged", changed.length === 0, changed.length ? `CHANGED: ${changed.join(", ")}` : `${hashesAfter.count} files, digest ${hashesAfter.digest.slice(0, 12)} before and after`);
  guard("no code-canvas save or publish reached the server", run.forbiddenWrites.length === 0, run.forbiddenWrites.length ? JSON.stringify(run.forbiddenWrites.slice(0, 3)) : "no save/publish request was attempted");
  guard("zero requests left the lane", run.foreignRequests.length === 0, run.foreignRequests.length ? `${run.foreignRequests.length}: ${[...new Set(run.foreignRequests.map(r => new URL(r.url).host))].join(", ")}` : "every request targeted the lane's own port");
  guard("no unexpected dialog", run.unexpectedDialogs.length === 0, run.unexpectedDialogs.length ? JSON.stringify(run.unexpectedDialogs.slice(0, 3)) : "every dialog was the one its step expected");
  guard("no console error", run.consoleErrors.length === 0, run.consoleErrors.length ? `${run.consoleErrors.length}: ${run.consoleErrors[0].text.slice(0, 200)}` : "clean console (dev-only chunk noise excluded)");
  guard("no page error", run.pageErrors.length === 0, run.pageErrors.length ? run.pageErrors[0].message : "no uncaught exception");
  guard("no failed request", run.failedResponses.length === 0, run.failedResponses.length ? `${run.failedResponses.length}: ${run.failedResponses.slice(0, 3).map(r => `${r.status} ${r.url}`).join("; ")}` : "no 4xx/5xx response");

  const expected = expectedRows(viewports.map(v => v.id)).filter(row => scenarios.has(row.target === "project" ? "project" : "portal"));
  const result = summarise(run.records, expected);
  await writeFile(join(evidenceDir, "dirty-transitions.json"), JSON.stringify({
    base, browser: note, ranAt: new Date().toISOString(), fixtures, result,
    fixtureHashes: { before: hashesBefore, after: hashesAfter },
    records: run.records, observations: run.observations,
    consoleErrors: run.consoleErrors, pageErrors: run.pageErrors, failedResponses: run.failedResponses,
    foreignRequests: run.foreignRequests, forbiddenWrites: run.forbiddenWrites, unexpectedDialogs: run.unexpectedDialogs,
    navigations: run.navigations,
  }, null, 2));

  console.log(`\nResults: ${result.passed} passed · ${result.failed} failed · ${result.na} N/A rows · ${run.observations.length} observations`);
  if (result.missing.length) {
    console.log(`\n${result.missing.length} matrix row(s) never driven — this run proves nothing about them:`);
    result.missing.forEach(key => console.log(`  - ${key}`));
  }
  if (result.failures.length) {
    console.log("\nFailures:");
    result.failures.forEach(f => console.log(`  - [${f.scenario}] ${f.step}: ${f.detail}`));
  }
  if (run.observations.length) {
    console.log("\nObservations (recorded, not gated):");
    run.observations.forEach(o => console.log(`  ○ [${o.viewport}] ${o.scenario} › ${o.step}: ${o.detail}`));
  }
  console.log(`\nEvidence: ${evidenceDir}\n`);
  if (!result.ok) process.exit(1);
  console.log("✓ dirty-transition gate green\n");
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch(error => {
    console.error(`\ndirty-transition gate could not run:\n${error.stack ?? error.message}\n`);
    process.exit(2);
  });
}
