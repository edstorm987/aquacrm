// Live worker signals — the API, the scanner, and the panel's view helpers.
//
// This half of the Dev Team board is meant to be EVIDENCE rather than intent:
// "FILE ACTIVITY (truth)". Nothing in the suite touched it, and two defects
// lived here unnoticed:
//
//   1. `scanWorkerSignals` truncated its recent-file list to 200 BEFORE the
//      callers counted it and grouped it into areas, so the panel printed
//      "200 in 2h" against a real number ten times larger and whole areas of
//      the codebase were missing from the map.
//   2. Check-ins had no staleness contract — every check-in ever written read
//      as a live worker, so one surface said "nobody is active" while another
//      named two workers on the same launch blocker.
//
// Plus the founder gate on the route itself: delete it and the whole suite used
// to stay green while every agency role could read the repo's activity map.

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_SESSION_SECRET ??= "dev-team-workers-smoke-secret";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// ─── The one piece of rigging ────────────────────────────────────────────────
//
// `GET` authenticates through `requireRole` → `getSession()` → `cookies()` from
// next/headers, which throws outside a request scope. Same stub as
// smoke-close-deal-route.test.ts: a cookie jar this file controls. Everything
// else — the route, the HMAC verify, the role gate, the real scanner — is the
// shipped code.
let sessionCookie = "";
const headersId = require.resolve("next/headers");
require.cache[headersId] = {
  id: headersId,
  filename: headersId,
  loaded: true,
  paths: [],
  children: [],
  exports: {
    cookies: async () => ({
      get: (name: string) => (sessionCookie && name === "lk_session_v1" ? { name, value: sessionCookie } : undefined),
      getAll: () => (sessionCookie ? [{ name: "lk_session_v1", value: sessionCookie }] : []),
      has: (name: string) => Boolean(sessionCookie) && name === "lk_session_v1",
    }),
    headers: async () => new Headers(),
    draftMode: async () => ({ isEnabled: false }),
  },
} as never;

// Required after the stub: this file transpiles to CJS, where `import` hoists.
const { GET } = require("../src/app/api/portal/dev-team/workers/route") as typeof import("../src/app/api/portal/dev-team/workers/route");
const { issueSession } = require("../src/lib/server/auth") as typeof import("../src/lib/server/auth");
const { ensureHydrated } = require("../src/server/storage") as typeof import("../src/server/storage");
const { createAgency } = require("../src/server/tenants") as typeof import("../src/server/tenants");
const workers = require("../src/lib/server/devTeamWorkers") as typeof import("../src/lib/server/devTeamWorkers");
const { ACTIVE_WORKER_WINDOW_MS } = require("../src/lib/server/devConsoleStatus") as typeof import("../src/lib/server/devConsoleStatus");
const view = require("../src/app/portal/dev-team/working/_liveWorkerView") as typeof import("../src/app/portal/dev-team/working/_liveWorkerView");

const { ACTIVE_CHECK_IN_WINDOW_MS, areaFor, groupActivity, isCheckInActive, readActiveCheckIns, readCheckIns, scanWorkerSignals } = workers;

// ─── Dev Mode env (the gate's other half) ────────────────────────────────────
const savedEnv = { dev: process.env.PORTAL_DEV_MODE, node: process.env.NODE_ENV, vercel: process.env.VERCEL_ENV };
before(() => {
  process.env.PORTAL_DEV_MODE = "true";
  if (process.env.NODE_ENV === "production") process.env.NODE_ENV = "test";
  delete process.env.VERCEL_ENV;
});
after(() => {
  if (savedEnv.dev === undefined) delete process.env.PORTAL_DEV_MODE; else process.env.PORTAL_DEV_MODE = savedEnv.dev;
  if (savedEnv.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = savedEnv.node;
  if (savedEnv.vercel !== undefined) process.env.VERCEL_ENV = savedEnv.vercel;
});

let seq = 0;
async function cookieFor(role: "agency-owner" | "agency-manager" | "agency-staff"): Promise<string> {
  await ensureHydrated();
  seq += 1;
  const agency = createAgency({ name: `Workers Smoke ${seq}`, ownerEmail: `owner${seq}@example.com` });
  return issueSession({
    userId: `user_${seq}`,
    email: `owner${seq}@example.com`,
    role,
    agencyId: agency.id,
  });
}

interface WorkersPayload {
  ok?: boolean;
  error?: string;
  checkIns?: { name: string; at: number; active?: boolean }[];
  activeCount?: number;
  activeWindowMs?: number;
  activity?: { area: string; count: number; newestMs: number; sample: string[] }[];
  areaCount?: number;
  fileCount?: number;
  newestMs?: number;
  scannedAtMs?: number;
}

async function call(cookie: string): Promise<{ status: number; data: WorkersPayload }> {
  sessionCookie = cookie;
  const response = await GET();
  return { status: response.status, data: (await response.json()) as WorkersPayload };
}

// ---------------------------------------------------------------------------

describe("workers API — founder gate", () => {
  it("404s every non-founder agency role", async () => {
    for (const role of ["agency-manager", "agency-staff"] as const) {
      const { status, data } = await call(await cookieFor(role));
      assert.equal(status, 404, `${role} must not read the repo activity map`);
      assert.equal(data.ok, false);
      assert.equal(data.error, "not_found");
      assert.equal(data.activity, undefined, "not a byte of the map leaks with the 404");
      assert.equal(data.checkIns, undefined);
    }
  });

  it("401s with no session at all", async () => {
    const { status, data } = await call("");
    assert.equal(status, 401);
    assert.equal(data.ok, false);
  });

  it("serves the founder in Dev Mode, with the documented keys", async () => {
    const { status, data } = await call(await cookieFor("agency-owner"));
    assert.equal(status, 200);
    assert.equal(data.ok, true);
    for (const key of ["checkIns", "activity", "fileCount", "newestMs", "scannedAtMs", "activeCount", "activeWindowMs"]) {
      assert.ok(key in data, `payload is missing "${key}"`);
    }
    assert.ok(Array.isArray(data.checkIns));
    assert.ok(Array.isArray(data.activity));
    assert.equal(typeof data.fileCount, "number");
  });

  it("404s the founder too when Dev Mode is not available", async () => {
    const cookie = await cookieFor("agency-owner");
    process.env.PORTAL_DEV_MODE = "false";
    try {
      const { status } = await call(cookie);
      assert.equal(status, 404, "the gate is Dev Mode AND founder, not founder alone");
    } finally {
      process.env.PORTAL_DEV_MODE = "true";
    }
  });
});

describe("workers API — the numbers are the WHOLE truth, not the transported slice", () => {
  it("reports a file count that matches the areas it groups", async () => {
    const { data } = await call(await cookieFor("agency-owner"));
    const grouped = (data.activity ?? []).reduce((n, a) => n + a.count, 0);
    // `activity` is capped at 12 areas for display, so it can only ever be a
    // lower bound — but with the pre-fix truncation `fileCount` was pinned at
    // exactly 200 while the grouping ran over that same slice.
    assert.ok((data.fileCount ?? 0) >= grouped, "fileCount cannot be smaller than the areas it summarises");
    assert.equal(typeof data.areaCount, "number");
    assert.ok((data.areaCount ?? 0) >= (data.activity ?? []).length);
  });

  it("does not clamp the scan at 200 files", async () => {
    // A wide window over this repo is thousands of files. Before the fix
    // `recentFiles` came back sliced to exactly 200 and every caller counted
    // and grouped THAT.
    const signals = await scanWorkerSignals(365 * 24 * 60 * 60 * 1000);
    assert.ok(signals.recentFiles.length > 200,
      `expected the full recent-file list, got ${signals.recentFiles.length}`);
    // …and the area map covers all of them, not just the newest 200.
    const areas = groupActivity(signals.recentFiles);
    const total = areas.reduce((n, a) => n + a.count, 0);
    assert.equal(total, signals.recentFiles.length, "every scanned file lands in exactly one area");
    const newest200 = groupActivity(signals.recentFiles.slice(0, 200));
    assert.ok(areas.length >= newest200.length, "the full scan can only reveal MORE areas");
  });

  it("keeps the list newest-first so `newestMs` means something", async () => {
    const signals = await scanWorkerSignals(365 * 24 * 60 * 60 * 1000);
    for (let i = 1; i < signals.recentFiles.length; i += 1) {
      assert.ok(signals.recentFiles[i - 1].mtimeMs >= signals.recentFiles[i].mtimeMs);
    }
  });
});

describe("areaFor — which part of the app a path belongs to", () => {
  it("slices each tree at the meaningful level", () => {
    assert.equal(areaFor("src/app/portal/clients/page.tsx"), "app/portal/clients");
    assert.equal(areaFor("src/app/api/portal/dev-team/workers/route.ts"), "app/api/portal");
    assert.equal(areaFor("src/built-ins/modules/agency-finance/src/x.ts"), "built-ins/modules/agency-finance");
    assert.equal(areaFor("src/lib/server/devTeamWorkers.ts"), "lib/server");
    assert.equal(areaFor("docs/development/plans/x.md"), "docs/development");
    // A file sitting directly in docs/ is "docs", not an area of its own.
    assert.equal(areaFor("docs/README.md"), "docs");
    assert.equal(areaFor("docs/development.md"), "docs");
    assert.equal(areaFor("scripts/smoke-x.test.ts"), "tests/scripts");
    assert.equal(areaFor("package.json"), "package.json");
  });
});

describe("groupActivity — the area map", () => {
  const file = (relPath: string, mtimeMs: number) => ({ relPath, mtimeMs, area: areaFor(relPath) });

  it("counts every file and keeps at most four samples", () => {
    const files = [
      file("src/lib/server/a.ts", 500),
      file("src/lib/server/b.ts", 400),
      file("src/lib/server/c.ts", 300),
      file("src/lib/server/d.ts", 200),
      file("src/lib/server/e.ts", 100),
      file("docs/context/state.md", 900),
    ];
    const areas = groupActivity(files);
    assert.deepEqual(areas.map(a => a.area), ["docs/context", "lib/server"], "newest area first");
    const lib = areas.find(a => a.area === "lib/server")!;
    assert.equal(lib.count, 5);
    assert.equal(lib.sample.length, 4, "samples are capped, counts are not");
    assert.equal(lib.newestMs, 500);
  });

  it("does not lose areas past the 200th file", () => {
    // 250 fresh files in one area, then one old file in another. Grouping the
    // newest-200 slice loses the second area entirely — the exact way six real
    // areas disappeared off the board.
    const busy = Array.from({ length: 250 }, (_, i) => file(`src/lib/server/f${i}.ts`, 10_000 - i));
    const forgotten = file("src/app/portal/clients/page.tsx", 1);
    const all = [...busy, forgotten];
    assert.equal(groupActivity(all.slice(0, 200)).length, 1, "the old behaviour saw one area…");
    const areas = groupActivity(all);
    assert.equal(areas.length, 2, "…the whole list sees both");
    assert.equal(areas.reduce((n, a) => n + a.count, 0), 251);
  });
});

describe("check-ins — the staleness contract", () => {
  const at = (minsAgo: number) => Date.now() - minsAgo * 60_000;

  it("uses the same window as the console topbar", () => {
    assert.equal(ACTIVE_CHECK_IN_WINDOW_MS, ACTIVE_WORKER_WINDOW_MS,
      "one window for 'working right now' — these two must never drift");
  });

  it("counts a recent check-in as live and an old one as history", () => {
    const now = Date.now();
    assert.equal(isCheckInActive({ name: "a", status: "building", at: at(5) }, now), true);
    assert.equal(isCheckInActive({ name: "b", status: "building", at: at(69) }, now), true);
    assert.equal(isCheckInActive({ name: "c", status: "building", at: at(180) }, now), false,
      "a three-hour-old check-in is not somebody working right now");
    assert.equal(isCheckInActive({ name: "d", status: "building", at: 0 }, now), false);
  });

  it("treats a signed-off worker as history however recent it is", () => {
    const now = Date.now();
    assert.equal(isCheckInActive({ name: "e", status: "handing back", phase: "done", at: at(1) }, now), false);
    assert.equal(isCheckInActive({ name: "f", status: "done — suite green", at: at(1) }, now), false);
    assert.equal(isCheckInActive({ name: "g", status: "routed to auditor", at: at(1) }, now), false);
    // "doing" must not be swallowed by the "done" prefix test.
    assert.equal(isCheckInActive({ name: "h", status: "doing phase 3", at: at(1) }, now), true);
  });

  it("readActiveCheckIns is exactly readCheckIns minus the stale ones", async () => {
    const now = Date.now();
    const [all, active] = await Promise.all([readCheckIns(), readActiveCheckIns(now)]);
    const names = new Set(all.map(c => c.name));
    for (const checkIn of active) {
      assert.ok(names.has(checkIn.name), "never invents a worker");
      assert.ok(isCheckInActive(checkIn, now), `${checkIn.name} must satisfy the contract`);
    }
    assert.ok(active.length <= all.length);
    const expected = all.filter(c => isCheckInActive(c, now)).length;
    assert.equal(active.length, expected);
  });

  it("scanWorkerSignals carries both the history and the live set", async () => {
    const signals = await scanWorkerSignals();
    assert.ok(Array.isArray(signals.activeCheckIns));
    assert.ok(signals.activeCheckIns.length <= signals.checkIns.length);
    for (const checkIn of signals.activeCheckIns) {
      assert.ok(isCheckInActive(checkIn, signals.scannedAtMs));
    }
  });
});

describe("live panel view helpers", () => {
  const MIN = 60_000;

  it("rolls 'ago' over into days", () => {
    const now = 10 * 24 * 60 * MIN;
    assert.equal(view.ago(0, now), "—");
    assert.equal(view.ago(now - 30_000, now), "just now");
    assert.equal(view.ago(now - MIN, now), "1 min ago");
    assert.equal(view.ago(now - 5 * MIN, now), "5 mins ago");
    assert.equal(view.ago(now - 60 * MIN, now), "1 hour ago");
    assert.equal(view.ago(now - 5 * 60 * MIN, now), "5 hours ago");
    assert.equal(view.ago(now - 24 * 60 * MIN, now), "1 day ago", "not '24 hours ago'");
    assert.equal(view.ago(now - 7 * 24 * 60 * MIN, now), "7 days ago", "not '168 hours ago'");
  });

  it("splits live workers from grey ghosts, keeping order", () => {
    const now = 1_000_000_000;
    const rows = [
      { name: "live-flag", status: "on it", at: now - 5 * MIN, active: true },
      { name: "ghost-flag", status: "old", at: now - 5 * MIN, active: false },
      { name: "live-window", status: "on it", at: now - 5 * MIN },
      { name: "ghost-window", status: "old", at: now - 300 * MIN },
    ];
    const { active, older } = view.splitCheckIns(rows, now, 2 * 60 * MIN);
    assert.deepEqual(active.map(r => r.name), ["live-flag", "live-window"],
      "the server's `active` decision wins over the raw timestamp");
    assert.deepEqual(older.map(r => r.name), ["ghost-flag", "ghost-window"]);
  });

  it("never drops a check-in — every row lands on one side", () => {
    const now = Date.now();
    const rows = Array.from({ length: 25 }, (_, i) => ({ name: `w${i}`, status: "x", at: now - i * 30 * MIN }));
    const { active, older } = view.splitCheckIns(rows, now, 2 * 60 * MIN);
    assert.equal(active.length + older.length, rows.length);
  });
});
