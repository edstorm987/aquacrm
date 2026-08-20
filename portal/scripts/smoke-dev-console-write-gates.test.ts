// Dev Console WRITE-route gates — the two POSTs that can change files on disk.
//
//   POST /api/portal/dev-team/docs     → saves any markdown doc in the repo
//   POST /api/portal/dev-team/updates  → inserts an entry in the project's log
//
// Both hang off the same two-layer gate: an agency role (`requireRole`) and then
// `devDocsAccessible` — founder AND Dev Mode. Neither layer had a single test.
// Deleting `if (!devDocsAccessible(session))` from either route left the suite
// green while the write path became reachable by any agency role, including on
// a production-like deployment.
//
// Driven in-process, the runtime-verify way: a minted session + a NextRequest
// against the REAL exported handler. Nothing here is allowed to write:
//   • the refusal cases are asserted to answer 401/404 and to carry no save
//     result in the body;
//   • the POSITIVE control — proving the 404s really come from the gate and not
//     from something incidental — is deliberately steered into a 400 that
//     happens BEFORE any file is opened (a doc path that does not exist; an
//     entry with no title), so a passing gate still touches no bytes.
// The real docs/development/updates.md is never written by this file.

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_SESSION_SECRET ??= "dev-console-write-gates-secret";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Role } from "../src/server/types";

const require_ = createRequire(import.meta.url);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

// ─── the one piece of rigging ───────────────────────────────────────────────
//
// Both routes authenticate through `requireRole` → `getSession()` → `cookies()`
// from next/headers, which throws outside a request scope. Same stub shape as
// smoke-close-deal-route.test.ts: a cookie jar this file controls. Everything
// else — the routes, the HMAC verify, the role gate, `devDocsAccessible` — is
// the shipped code.
let sessionCookie = "";
const headersId = require_.resolve("next/headers");
require_.cache[headersId] = {
  id: headersId,
  filename: headersId,
  loaded: true,
  paths: [],
  children: [],
  exports: {
    cookies: async () => ({
      get: (name: string) =>
        sessionCookie && name === "lk_session_v1" ? { name, value: sessionCookie } : undefined,
      getAll: () => (sessionCookie ? [{ name: "lk_session_v1", value: sessionCookie }] : []),
      has: (name: string) => Boolean(sessionCookie) && name === "lk_session_v1",
    }),
    headers: async () => new Headers(),
    draftMode: async () => ({ isEnabled: false }),
  },
} as never;

// Required after the stub is installed — `import` would hoist above it.
const { NextRequest } = require_("next/server") as typeof import("next/server");
const docsRoute = require_("../src/app/api/portal/dev-team/docs/route") as typeof import("../src/app/api/portal/dev-team/docs/route");
const updatesRoute = require_("../src/app/api/portal/dev-team/updates/route") as typeof import("../src/app/api/portal/dev-team/updates/route");
const { issueSession } = require_("../src/lib/server/auth/auth") as typeof import("../src/lib/server/auth/auth");
const { ensureHydrated } = require_("../src/server/storage") as typeof import("../src/server/storage");
const { createAgency } = require_("../src/server/tenants") as typeof import("../src/server/tenants");
const { createUser } = require_("../src/server/users") as typeof import("../src/server/users");
const { UPDATES_DOC_REL } = require_("../src/lib/server/dev/devTeamUpdates") as typeof import("../src/lib/server/dev/devTeamUpdates");

// ─── helpers ────────────────────────────────────────────────────────────────

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

/** Run fn with Dev Mode's env guards satisfied, then put the env back. */
async function withDevMode<T>(on: boolean, fn: () => Promise<T>): Promise<T> {
  const saved = {
    dev: process.env.PORTAL_DEV_MODE,
    node: process.env.NODE_ENV,
    vercel: process.env.VERCEL_ENV,
  };
  if (on) {
    process.env.PORTAL_DEV_MODE = "true";
    if (process.env.NODE_ENV === "production") process.env.NODE_ENV = "test";
    delete process.env.VERCEL_ENV;
  } else {
    delete process.env.PORTAL_DEV_MODE;
  }
  try {
    return await fn();
  } finally {
    restore("PORTAL_DEV_MODE", saved.dev);
    restore("NODE_ENV", saved.node);
    restore("VERCEL_ENV", saved.vercel);
  }
}

let seq = 0;
async function seedSession(role: Role): Promise<string> {
  await ensureHydrated();
  seq += 1;
  const agency = createAgency({ name: `Gate Co ${seq}`, slug: `gate-co-${seq}-${process.hrtime()[1]}` });
  const user = createUser({
    email: `gate-${seq}-${agency.id}@gate.test`,
    name: "Gate User",
    role,
    agencyId: agency.id,
    password: "gate-user-pass",
  });
  return issueSession({
    userId: user.id,
    email: user.email,
    role,
    agencyId: agency.id,
    agencyIds: [agency.id],
    activeAgencyId: agency.id,
    sessionRev: user.sessionRev ?? 0,
  });
}

function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify(body),
  });
}

/** A doc path that does not exist — a passing gate reaches the save and 400s. */
const PROBE_DOC = "docs/__dev-console-gate-probe__.md";

/** A title `buildUpdateEntry` always rejects — unwritable whatever the gate does. */
const BLANK_TITLE = "   ";

// ─── docs route ─────────────────────────────────────────────────────────────

describe("POST /api/portal/dev-team/docs — the write gate", () => {
  it("401s with no session, and saves nothing", async () => {
    sessionCookie = "";
    const res = await withDevMode(true, () =>
      docsRoute.POST(post("/api/portal/dev-team/docs", { relPath: PROBE_DOC, content: "x" })),
    );
    assert.equal(res.status, 401);
    const body = (await res.json()) as { ok?: boolean; mtimeMs?: number };
    assert.equal(body.ok, false);
    assert.equal(body.mtimeMs, undefined, "it must not have reached the save");
    assert.ok(!existsSync(join(REPO, PROBE_DOC)));
  });

  it("404s for a founder when Dev Mode is unavailable — the production-like case", async () => {
    sessionCookie = await seedSession("agency-owner");
    const res = await withDevMode(false, () =>
      docsRoute.POST(post("/api/portal/dev-team/docs", { relPath: PROBE_DOC, content: "x" })),
    );
    assert.equal(res.status, 404, "outside Dev Mode this route must not exist");
    const body = (await res.json()) as { error?: string; mtimeMs?: number };
    assert.equal(body.error, "not_found");
    assert.equal(body.mtimeMs, undefined);
  });

  it("404s for a non-founder agency role even inside Dev Mode", async () => {
    for (const role of ["agency-manager", "agency-staff"] as Role[]) {
      sessionCookie = await seedSession(role);
      const res = await withDevMode(true, () =>
        docsRoute.POST(post("/api/portal/dev-team/docs", { relPath: PROBE_DOC, content: "x" })),
      );
      assert.equal(res.status, 404, `${role} must not reach the doc write path`);
    }
  });

  it("401s for a client role (never an agency role at all)", async () => {
    sessionCookie = await seedSession("client-owner");
    const res = await withDevMode(true, () =>
      docsRoute.POST(post("/api/portal/dev-team/docs", { relPath: PROBE_DOC, content: "x" })),
    );
    assert.equal(res.status, 401);
  });

  it("CONTROL: a founder in Dev Mode passes the gate and reaches the save", async () => {
    sessionCookie = await seedSession("agency-owner");
    const res = await withDevMode(true, () =>
      docsRoute.POST(post("/api/portal/dev-team/docs", { relPath: PROBE_DOC, content: "x" })),
    );
    // 400 from `saveDevDoc` — the doc does not exist — NOT 401/404 from the
    // gate. That is what makes the refusals above meaningful.
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error?: string };
    assert.match(String(body.error), /no longer exists/);
    assert.ok(!existsSync(join(REPO, PROBE_DOC)), "and it created nothing");
  });

  it("400s a malformed body before any path handling", async () => {
    sessionCookie = await seedSession("agency-owner");
    const res = await withDevMode(true, () => docsRoute.POST(post("/api/portal/dev-team/docs", { relPath: "" })));
    assert.equal(res.status, 400);
  });
});

// ─── updates route ──────────────────────────────────────────────────────────

describe("POST /api/portal/dev-team/updates — the write gate", () => {
  // Every refusal case sends a title that could not be written even if the gate
  // vanished — belt and braces, so a mutation test on the gate can never append
  // to the project's real running record.
  const realDoc = join(REPO, UPDATES_DOC_REL);
  const snapshot = existsSync(realDoc) ? readFileSync(realDoc, "utf8") : null;

  const assertLogUntouched = (): void => {
    if (snapshot === null) return;
    assert.equal(
      readFileSync(realDoc, "utf8").length,
      snapshot.length,
      "no refused request may write to the real updates log",
    );
  };

  it("401s with no session", async () => {
    sessionCookie = "";
    const res = await withDevMode(true, () =>
      updatesRoute.POST(post("/api/portal/dev-team/updates", { title: BLANK_TITLE })),
    );
    assert.equal(res.status, 401);
    assertLogUntouched();
  });

  it("404s for a founder when Dev Mode is unavailable", async () => {
    sessionCookie = await seedSession("agency-owner");
    const res = await withDevMode(false, () =>
      updatesRoute.POST(post("/api/portal/dev-team/updates", { title: BLANK_TITLE })),
    );
    assert.equal(res.status, 404);
    assert.equal(((await res.json()) as { error?: string }).error, "not_found");
    assertLogUntouched();
  });

  it("404s for a non-founder agency role inside Dev Mode", async () => {
    for (const role of ["agency-manager", "agency-staff"] as Role[]) {
      sessionCookie = await seedSession(role);
      const res = await withDevMode(true, () =>
        updatesRoute.POST(post("/api/portal/dev-team/updates", { title: BLANK_TITLE })),
      );
      assert.equal(res.status, 404, `${role} must not reach the updates write path`);
    }
    assertLogUntouched();
  });

  it("CONTROL: a founder in Dev Mode passes the gate and reaches validation", async () => {
    sessionCookie = await seedSession("agency-owner");
    const res = await withDevMode(true, () =>
      updatesRoute.POST(post("/api/portal/dev-team/updates", { title: "   " })),
    );
    // 400 from `buildUpdateEntry`, which runs before the file is ever opened —
    // NOT 404 from the gate.
    assert.equal(res.status, 400);
    assert.match(String(((await res.json()) as { error?: string }).error), /title/i);
    assertLogUntouched();
  });

  it("400s a body with no title at all", async () => {
    sessionCookie = await seedSession("agency-owner");
    const res = await withDevMode(true, () => updatesRoute.POST(post("/api/portal/dev-team/updates", { bullets: [] })));
    assert.equal(res.status, 400);
    assertLogUntouched();
  });
});
