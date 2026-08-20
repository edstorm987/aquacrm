// The Dev Console's edges — the places where the popover told the founder
// something that was not true.
//
// Four verified defects, each pinned by BEHAVIOUR rather than by grepping the
// component:
//
//   1. "Working now" printed the length of a list that is capped at five, so
//      the popover said 5 while the Command Centre station said 6 and listed the
//      sixth worker. Driven here against a fixture with SEVEN check-ins.
//   2. The reload fired after a save discarded the fresh `?part=core` response
//      (`setCore(previous => previous ?? value)`), so the badge moved while the
//      panel's own tile and list kept showing pre-save data — for good, if the
//      slow read then failed.
//   3. Twelve links on two hot surfaces pointed at the restructure's redirect
//      stubs, paying two server renders per click.
//   4. Two of the route's three failures are machine codes, and the founder read
//      the bare word "not_found".
//
// The worker fixture is a TEMP PROJECT ROOT, not `.data/workers/` — this file
// runs in its own process (see `smoke-dev-team-workers`), so a chdir is
// contained, and nothing here writes into the real working tree that seven
// other agents are editing.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

// FIRST, and statically: this module hands Node's AsyncLocalStorage to
// `globalThis` before anything from `next/` is evaluated. Next's own
// async-local-storage module refuses to construct without it, and a dynamic
// import here would run too late. It imports nothing from src/, so it is also
// safe to load before the chdir below.
import { withDevMode, withRequestScope, withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND ??= "memory";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (rel: string) => readFileSync(join(REPO, rel), "utf8");

// ── the fixture root ────────────────────────────────────────────────────────
// Seven workers checked in inside the two-hour window. The console caps its
// list at five; the count must still be seven.
const WORKERS = 7;
const FIXTURE_ROOT = join(tmpdir(), `dev-console-edges-${process.pid}`);
rmSync(FIXTURE_ROOT, { recursive: true, force: true });
mkdirSync(join(FIXTURE_ROOT, ".data", "workers"), { recursive: true });
const CHECKED_IN_AT = Date.now();
for (let i = 0; i < WORKERS; i += 1) {
  writeFileSync(
    join(FIXTURE_ROOT, ".data", "workers", `worker-${i}.json`),
    JSON.stringify({ name: `worker-${i}`, status: "building something", phase: "phase", at: CHECKED_IN_AT - i * 60_000 }),
  );
}
// One long-dead check-in, to prove the window is still honoured by the count.
writeFileSync(
  join(FIXTURE_ROOT, ".data", "workers", "worker-ancient.json"),
  JSON.stringify({ name: "worker-ancient", status: "finished hours ago", at: CHECKED_IN_AT - 6 * 60 * 60 * 1000 }),
);
// `PROJECT_ROOT` is `process.cwd()`, resolved when the module first loads — so
// this must happen before anything under src/ is imported.
process.chdir(FIXTURE_ROOT);

async function founderSession() {
  const { issueSession } = await import("../src/lib/server/auth");
  const { ensureHydrated } = await import("../src/server/storage");
  const { createAgency } = await import("../src/server/tenants");
  const { createUser } = await import("../src/server/users");
  await ensureHydrated();
  const agency = createAgency({ name: "Edges Co", slug: `edges-co-${Date.now()}` });
  const owner = createUser({
    email: `owner-${agency.id}@edges.test`,
    name: "Founder",
    role: "agency-owner",
    agencyId: agency.id,
    password: "edges-owner-pass",
  });
  return {
    agency,
    owner,
    token: issueSession({
      userId: owner.id,
      email: owner.email,
      role: "agency-owner",
      agencyId: agency.id,
      agencyIds: [agency.id],
      activeAgencyId: agency.id,
      sessionRev: owner.sessionRev ?? 0,
    }),
  };
}

describe("Dev Console route — the worker count is the truth, not the list length", () => {
  it("caps the list at five and still reports all seven active workers", async () => {
    const { NextRequest } = await import("next/server");
    const { GET } = await import("../src/app/api/portal/dev-team/console/route");
    const { readCheckIns } = await import("../src/lib/server/devTeamWorkers");
    const { invalidateDevConsoleBadge, ACTIVE_WORKER_WINDOW_MS } = await import("../src/lib/server/devConsoleStatus");

    invalidateDevConsoleBadge();
    const { token } = await founderSession();

    const body = await withDevMode(async () => {
      const response = await withSession(token, () =>
        GET(new NextRequest("http://localhost/api/portal/dev-team/console")));
      assert.equal(response.status, 200, "a founder in Dev Mode gets the full read");
      return await response.json() as { status: { workers: unknown[]; activeWorkers?: number; scannedAtMs: number } };
    });

    const status = body.status;
    assert.equal(status.workers.length, 5, "the list is still a glance — five rows");

    // The number the panel prints. Derived from the same reader the Command
    // Centre station uses, over the same window.
    const cutoff = status.scannedAtMs - ACTIVE_WORKER_WINDOW_MS;
    const trulyActive = (await readCheckIns()).filter(checkIn => checkIn.at >= cutoff).length;
    assert.equal(trulyActive, WORKERS, "the fixture really does have seven live check-ins (and one stale one)");
    assert.equal(status.activeWorkers, WORKERS, "the route reports the UNCAPPED total, not the sliced list length");
    assert.ok(
      (status.activeWorkers ?? 0) >= status.workers.length,
      "the count can never be smaller than the rows it describes — a 'N more' link must not go negative",
    );
  });

  it("the core part stays cheap — no worker walk, and no worker count either", async () => {
    const { NextRequest } = await import("next/server");
    const { GET } = await import("../src/app/api/portal/dev-team/console/route");
    const { token } = await founderSession();

    const body = await withDevMode(async () => {
      const response = await withSession(token, () =>
        GET(new NextRequest("http://localhost/api/portal/dev-team/console?part=core")));
      assert.equal(response.status, 200);
      return await response.json() as { part: string; status: Record<string, unknown> };
    });
    assert.equal(body.part, "core");
    assert.ok(!("workers" in body.status), "the fast read must not carry worker activity");
    assert.ok(!("activeWorkers" in body.status), "…nor pay for counting it");
  });

  it("the gate is re-asserted on the route itself, for both parts", async () => {
    const { NextRequest } = await import("next/server");
    const { GET } = await import("../src/app/api/portal/dev-team/console/route");
    const { issueSession } = await import("../src/lib/server/auth");
    const { createUser } = await import("../src/server/users");
    const { agency } = await founderSession();

    // A manager is a legitimate agency role — `requireRole` lets them past, and
    // only `devDocsAccessible` stops them. Outside Dev Mode the surface does not
    // exist, so the answer is 404, never 403.
    const manager = createUser({
      email: `mgr-${agency.id}@edges.test`, name: "Manager", role: "agency-manager",
      agencyId: agency.id, password: "edges-manager-pass",
    });
    const managerToken = issueSession({
      userId: manager.id, email: manager.email, role: "agency-manager",
      agencyId: agency.id, agencyIds: [agency.id], activeAgencyId: agency.id,
      sessionRev: manager.sessionRev ?? 0,
    });

    await withDevMode(async () => {
      for (const url of [
        "http://localhost/api/portal/dev-team/console",
        "http://localhost/api/portal/dev-team/console?part=core",
      ]) {
        const response = await withSession(managerToken, () => GET(new NextRequest(url)));
        assert.equal(response.status, 404, `a manager does not get ${url}`);
      }
    });

    // No cookie at all.
    const anonymous = await withRequestScope({}, () =>
      GET(new NextRequest("http://localhost/api/portal/dev-team/console")));
    assert.equal(anonymous.status, 401);
  });
});

describe("Dev Console panel — what a load may repaint, and what it must say", () => {
  const status = (openFindings: number, workers: number, activeWorkers?: number) => ({
    openFindings,
    openBlockers: 0,
    attention: openFindings,
    scannedAtMs: Date.now(),
    findings: [],
    blockers: [],
    workers: Array.from({ length: workers }, (_, i) => ({ name: `w${i}`, status: "s", at: Date.now() })),
    activeAreas: [],
    ...(activeWorkers === undefined ? {} : { activeWorkers }),
  });

  function recorder() {
    const seen = {
      core: [] as number[],
      status: [] as number[],
      error: "",
      statusError: "",
      attention: [] as number[],
      updates: 0,
    };
    return {
      seen,
      sinks: {
        setCore: (value: { openFindings: number }) => { seen.core.push(value.openFindings); },
        setStatus: (value: { workers: unknown[] }) => { seen.status.push(value.workers.length); },
        setError: (message: string) => { seen.error = message; },
        setStatusError: (message: string) => { seen.statusError = message; },
        setAttention: (attention: number) => { seen.attention.push(attention); },
        markUpdated: () => { seen.updates += 1; },
      },
    };
  }

  it("a RELOAD repaints the list, not just the badge — the post-save bug", async () => {
    const { runDevConsoleLoad } = await import("../src/components/chrome/devConsoleLoad");
    const token = { current: 0 };
    const record = recorder();

    // First load: nothing captured yet.
    await runDevConsoleLoad({
      read: async () => status(0, 1) as never,
      sinks: record.sinks as never,
      token,
    });
    assert.deepEqual(record.seen.core, [0, 0], "both halves painted the first load");

    // Save a finding, then reload. The fast half now says 1 — and the panel
    // must take it. The old `previous ?? value` guard threw it away, so the
    // badge said 1 while the tile below it still said 0.
    record.seen.core.length = 0;
    record.seen.attention.length = 0;
    await runDevConsoleLoad({
      read: async part => {
        if (part === "full") throw new Error("the slow read failed");
        return status(1, 0) as never;
      },
      sinks: record.sinks as never,
      token,
    });
    assert.deepEqual(record.seen.core, [1], "the fresh core response repaints the findings list");
    assert.deepEqual(record.seen.attention, [1], "…and the badge, together");
    assert.equal(record.seen.error, "", "one half arrived, so the console is still useful");
    // …and the half that failed says so rather than spinning forever.
    assert.equal(record.seen.statusError, "the slow read failed");
  });

  it("a superseded response cannot repaint a fresher one", async () => {
    const { runDevConsoleLoad } = await import("../src/components/chrome/devConsoleLoad");
    const token = { current: 0 };
    const record = recorder();

    let release: (() => void) | null = null;
    const slow = new Promise<void>(resolve => { release = resolve; });

    const first = runDevConsoleLoad({
      read: async () => { await slow; return status(0, 0) as never; },
      sinks: record.sinks as never,
      token,
    });
    // A second load starts (a save landed) and finishes first.
    await runDevConsoleLoad({
      read: async () => status(9, 0) as never,
      sinks: record.sinks as never,
      token,
    });
    release!();
    await first;

    assert.ok(record.seen.core.every(value => value === 9), `stale responses were ignored: ${record.seen.core}`);
    assert.equal(record.seen.error, "", "a superseded load must not raise an error either");
  });

  it("both halves are in flight together, not chained", async () => {
    const { runDevConsoleLoad } = await import("../src/components/chrome/devConsoleLoad");
    const asked: string[] = [];
    let unblock: (() => void) | null = null;
    const gate = new Promise<void>(resolve => { unblock = resolve; });

    const running = runDevConsoleLoad({
      read: async part => { asked.push(part); await gate; return status(0, 0) as never; },
      sinks: recorder().sinks as never,
      token: { current: 0 },
    });
    // Let the two `read()` calls start, but resolve neither.
    await Promise.resolve();
    assert.deepEqual(asked, ["core", "full"], "both parts requested before either resolved");
    unblock!();
    await running;
  });

  it("only a TOTAL failure raises the red bar", async () => {
    const { runDevConsoleLoad } = await import("../src/components/chrome/devConsoleLoad");
    const record = recorder();
    await runDevConsoleLoad({
      read: async () => { throw new Error("Dev Mode is off — reload the page to hide the console."); },
      sinks: record.sinks as never,
      token: { current: 0 },
    });
    assert.equal(record.seen.error, "Dev Mode is off — reload the page to hide the console.");
    assert.deepEqual(record.seen.core, [], "nothing was painted");
  });

  it("machine error codes never reach the founder", async () => {
    const { readableError } = await import("../src/components/chrome/devConsoleLoad");
    // The exact two codes `console/route.ts` returns.
    assert.equal(readableError("not_found", 404), "Dev Mode is off — reload the page to hide the console.");
    assert.equal(readableError("unauthorized", 401), "Your session ended. Sign in again.");
    for (const raw of ["not_found", "unauthorized"]) {
      assert.notEqual(readableError(raw, 404), raw);
      assert.notEqual(readableError(raw, 401), raw);
    }
    // The 500 path already returns a sentence — pass it straight through.
    assert.equal(readableError("Could not read the Dev Console status.", 500), "Could not read the Dev Console status.");
    // And an answer with no body at all still says something.
    assert.equal(readableError(undefined, 502), "Status unavailable (502).");
  });

  it("the printed worker total is the uncapped one, and never below the rows", async () => {
    const { workerTotal } = await import("../src/components/chrome/devConsoleLoad");
    assert.equal(workerTotal(status(0, 5, 7) as never), 7, "seven workers, five rows → say seven");
    assert.equal(workerTotal(status(0, 3, 3) as never), 3);
    // A server that has not been redeployed yet answers without the field.
    assert.equal(workerTotal(status(0, 4) as never), 4, "falls back to the list length");
    // Two reads either side of a new check-in must not produce "-1 more".
    assert.equal(workerTotal(status(0, 5, 2) as never), 5, "never fewer than the rows on screen");
  });
});

describe("Dev Console surfaces — no in-app navigation through the redirect stubs", () => {
  // The 2026-08-20 restructure left eight compatibility stubs. They exist for
  // bookmarks and external links; routing in-app traffic through one costs two
  // server renders (the stub boots the dev-team layout, runs the gate, builds
  // the sidebar, then 307s) and leaves the surface one pruning away from
  // breaking.
  const STUBS = ["working", "auditor", "logs", "updates", "tasks", "inspector", "editor", "api"];

  it("every stub really is a redirect, so this list stays honest", () => {
    for (const stub of STUBS) {
      const page = source(`src/app/portal/dev-team/${stub}/page.tsx`);
      assert.match(page, /redirect\("\/portal\/dev-team\//, `${stub}/page.tsx is a redirect stub`);
    }
  });

  it("the station and the popover link straight to the real surface", () => {
    for (const rel of [
      "src/app/portal/agency/_DevTeamStation.tsx",
      "src/components/chrome/DevConsolePanel.tsx",
    ]) {
      const text = source(rel);
      for (const stub of STUBS) {
        // `href="/portal/dev-team/working"` and friends. Comments explaining
        // WHY the stub is avoided are allowed to name it, so match the link.
        assert.doesNotMatch(
          text,
          new RegExp(`href=(\\{)?"/portal/dev-team/${stub}(\\?|"|/)`),
          `${rel} must not link through the ${stub} stub`,
        );
      }
      assert.match(text, /\/portal\/dev-team\/roadmap\?view=now/, `${rel} addresses the board directly`);
    }
  });
});
