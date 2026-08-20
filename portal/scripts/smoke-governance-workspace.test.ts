// Governance workspace HTTP smoke — the new /api/portal/governance/** routes.
//
// Why this file exists: the Governance workspace is KNOW-first and its whole
// point is to never show a false green and never claim compliance the app
// cannot prove. That guarantee lives at the HTTP boundary the page actually
// calls, so this drives the REAL exported handlers in-process (the
// runtime-verify convention: a minted session + a NextRequest) against a memory
// backend and a real agency + client.
//
// Each assertion here fails before the change, because none of these routes
// existed — importing them threw. This is the proof the surface is honest and
// gated.
//
// Safety: the erase assertions here only exercise the GATES (a non-owner is
// refused; an owner without the exact typed name is refused). They never reach
// the point where the canonical route builds a live Supabase client, so no test
// ever touches live data. The destructive delete itself is covered by the
// clientErasure suite.

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_SESSION_SECRET ??= "governance-workspace-smoke-secret";

import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// ─── Rig Next's request scope ────────────────────────────────────────────────
// These routes authenticate via `requireRole` → `getSession()` → `cookies()`
// from next/headers, which throws outside a request scope. Stub it with a
// cookie jar this file controls; everything else is the shipped code.
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

// Loaded with require AFTER the stub is in place (this file transpiles to CJS,
// where top-level `import` would hoist above the stub).
const { NextRequest } = require("next/server") as typeof import("next/server");
const { issueSession } = require("../src/lib/server/auth/auth") as typeof import("../src/lib/server/auth/auth");
const { ensureHydrated } = require("../src/server/storage") as typeof import("../src/server/storage");
const { createAgency, createClient, getClientForAgency } = require("../src/server/tenants") as typeof import("../src/server/tenants");
const { COMPLIANCE_DISCLAIMER, HIPAA_HONESTY, GDPR_HONESTY } = require("../src/lib/compliance/compliancePosture") as typeof import("../src/lib/compliance/compliancePosture");

const overviewRoute = require("../src/app/api/portal/governance/route") as typeof import("../src/app/api/portal/governance/route");
const hipaaRoute = require("../src/app/api/portal/governance/hipaa/route") as typeof import("../src/app/api/portal/governance/hipaa/route");
const legalRoute = require("../src/app/api/portal/governance/legal/route") as typeof import("../src/app/api/portal/governance/legal/route");
const previewRoute = require("../src/app/api/portal/governance/erasure/preview/route") as typeof import("../src/app/api/portal/governance/erasure/preview/route");
// The destructive erase reuses the canonical, owner-only clients route rather
// than a governance-owned duplicate (no second service-role call site).
const eraseRoute = require("../src/app/api/portal/clients/[clientId]/erase/route") as typeof import("../src/app/api/portal/clients/[clientId]/erase/route");

let seq = 0;

interface World {
  agencyId: string;
  clientId: string;
  clientName: string;
  ownerCookie: string;
  managerCookie: string;
  staffCookie: string;
}

async function seedWorld(): Promise<World> {
  await ensureHydrated();
  seq += 1;
  const agency = createAgency({ name: `Governance Smoke ${seq}`, ownerEmail: `owner${seq}@example.com` });
  const client = createClient(agency.id, { name: `Erasable Client ${seq}`, stage: "live" });
  const cookieFor = (role: string, suffix: string) => issueSession({
    userId: `user_${role}_${seq}`,
    email: `${suffix}${seq}@example.com`,
    role: role as never,
    agencyId: agency.id,
  });
  return {
    agencyId: agency.id,
    clientId: client.id,
    clientName: client.name,
    ownerCookie: cookieFor("agency-owner", "owner"),
    managerCookie: cookieFor("agency-manager", "manager"),
    staffCookie: cookieFor("agency-staff", "staff"),
  };
}

function get(url: string): InstanceType<typeof NextRequest> {
  return new NextRequest(url, { method: "GET" });
}
function post(url: string, body: Record<string, unknown>): InstanceType<typeof NextRequest> {
  return new NextRequest(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

// ─── Posture reflects real state, honestly ───────────────────────────────────

test("the overview reports GDPR on and HIPAA off by default, and carries the honesty strings", async () => {
  const world = await seedWorld();
  sessionCookie = world.ownerCookie;
  const response = await overviewRoute.GET(get("http://localhost/api/portal/governance"));
  assert.equal(response.status, 200);
  const data = await response.json() as { ok: boolean; snapshot: {
    posture: { disclaimer: string; frameworks: Array<{ id: string; enabled: boolean; honesty: string }> };
    honestyViolations: string[];
    hipaaEnabled: boolean;
    security: unknown[];
    subprocessors: unknown[];
  } };
  assert.equal(data.ok, true);

  const gdpr = data.snapshot.posture.frameworks.find(framework => framework.id === "gdpr");
  const hipaa = data.snapshot.posture.frameworks.find(framework => framework.id === "hipaa");
  assert.ok(gdpr && gdpr.enabled === true, "GDPR is always on");
  assert.ok(hipaa && hipaa.enabled === false, "HIPAA is off by default");
  assert.equal(data.snapshot.hipaaEnabled, false);

  // The disclaimer + honesty strings must be present in the served output.
  assert.equal(data.snapshot.posture.disclaimer, COMPLIANCE_DISCLAIMER);
  assert.equal(gdpr!.honesty, GDPR_HONESTY);
  assert.equal(hipaa!.honesty, HIPAA_HONESTY);

  // The posture must not have slipped a false green past its own honesty checks.
  assert.deepEqual(data.snapshot.honestyViolations, [], "no honesty violations in the served posture");

  // The KNOW panels exist.
  assert.ok(data.snapshot.security.length > 0, "security posture rows are surfaced");
  assert.ok(data.snapshot.subprocessors.length > 0, "the sub-processor register is surfaced");
});

// ─── Gating ──────────────────────────────────────────────────────────────────

test("a non-owner/manager (staff) is refused the overview", async () => {
  const world = await seedWorld();
  sessionCookie = world.staffCookie;
  const response = await overviewRoute.GET(get("http://localhost/api/portal/governance"));
  assert.equal(response.status, 403, "staff cannot read the governance overview");
});

test("only an owner can flip the HIPAA track — a manager is refused", async () => {
  const world = await seedWorld();
  sessionCookie = world.managerCookie;
  const refused = await hipaaRoute.POST(post("http://localhost/api/portal/governance/hipaa", { enabled: true }));
  assert.equal(refused.status, 403, "a manager cannot switch the HIPAA track on");

  sessionCookie = world.ownerCookie;
  const allowed = await hipaaRoute.POST(post("http://localhost/api/portal/governance/hipaa", { enabled: true }));
  assert.equal(allowed.status, 200);
  const data = await allowed.json() as { ok: boolean; enabled: boolean; honesty: string };
  assert.equal(data.ok, true);
  assert.equal(data.enabled, true, "the track is now on");
  assert.equal(data.honesty, HIPAA_HONESTY, "the switch-on response carries the honesty statement");

  // And the overview now reflects it.
  const overview = await overviewRoute.GET(get("http://localhost/api/portal/governance"));
  const snap = (await overview.json() as { snapshot: { hipaaEnabled: boolean; declarations: unknown[] } }).snapshot;
  assert.equal(snap.hipaaEnabled, true, "posture reflects the flipped track");
  assert.ok(snap.declarations.length > 0, "a dated declaration was recorded behind the toggle");
});

// ─── Erasure is a KNOW-then-confirm action, never automatic ──────────────────

test("preview counts what WOULD be removed and deletes nothing", async () => {
  const world = await seedWorld();
  sessionCookie = world.ownerCookie;
  const response = await previewRoute.POST(post("http://localhost/api/portal/governance/erasure/preview", { clientId: world.clientId }));
  assert.equal(response.status, 200);
  const data = await response.json() as { ok: boolean; wouldRemove: number; notice: string };
  assert.equal(data.ok, true);
  assert.equal(typeof data.wouldRemove, "number");
  assert.match(data.notice, /Nothing has been changed/i, "the preview says out loud that it changed nothing");

  // Proof it did not delete: the client is still there.
  assert.ok(getClientForAgency(world.agencyId, world.clientId), "preview did not erase the client");
});

function eraseCall(world: World, body: Record<string, unknown>) {
  return eraseRoute.POST(
    post(`http://localhost/api/portal/clients/${world.clientId}/erase`, body),
    { params: Promise.resolve({ clientId: world.clientId }) },
  );
}

test("the erase path is gated — a non-owner is refused, and no owner erase without the exact typed name", async () => {
  const world = await seedWorld();

  // Manager is refused outright — before any name check, before any scrub.
  sessionCookie = world.managerCookie;
  const managerAttempt = await eraseCall(world, { confirmName: world.clientName });
  assert.equal(managerAttempt.status, 403, "a manager cannot erase");
  assert.ok(getClientForAgency(world.agencyId, world.clientId), "still present after the refused manager attempt");

  // Owner, but wrong/absent confirmation → 400, no deletion. This is the gate
  // that stops an erasure from ever running without an explicit, exact confirm.
  sessionCookie = world.ownerCookie;
  const noName = await eraseCall(world, { confirmName: "" });
  assert.equal(noName.status, 400, "no erase without the typed name");
  const wrongName = await eraseCall(world, { confirmName: "not the name" });
  assert.equal(wrongName.status, 400, "no erase on a mismatched name");
  assert.ok(getClientForAgency(world.agencyId, world.clientId), "still present after the failed confirmations");
});

// ─── Legal register create path ──────────────────────────────────────────────

test("an owner/manager can add a record to the legal register", async () => {
  const world = await seedWorld();
  sessionCookie = world.managerCookie;
  const create = await legalRoute.POST(post("http://localhost/api/portal/governance/legal", { title: "Privacy notice v1", category: "policy", status: "active" }));
  assert.equal(create.status, 200);
  const created = await create.json() as { ok: boolean; documentId: string };
  assert.equal(created.ok, true);
  assert.ok(created.documentId, "a document id comes back");

  sessionCookie = world.ownerCookie;
  const overview = await overviewRoute.GET(get("http://localhost/api/portal/governance"));
  const snap = (await overview.json() as { snapshot: { legalDocuments: Array<{ id: string; title: string }> } }).snapshot;
  assert.ok(snap.legalDocuments.some(document => document.id === created.documentId && document.title === "Privacy notice v1"), "the new record shows in the register");
});
