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
const { createTradingCompany } = require("../src/server/tradingCompanies") as typeof import("../src/server/tradingCompanies");
const { createUser } = require("../src/server/users") as typeof import("../src/server/users");
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
  // The central fresh-session boundary (issue #22) refuses a cookie whose
  // subject does not exist, so every minted session needs a REAL user record.
  const cookieFor = (role: string, suffix: string) => {
    const user = createUser({
      email: `${suffix}${seq}@example.com`,
      password: "Governance-smoke-1!",
      role: role as never,
      agencyId: agency.id,
    });
    return issueSession({
      userId: user.id,
      email: user.email,
      role: user.role,
      agencyId: agency.id,
    });
  };
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

// ─── The scope selector must actually scope ──────────────────────────────────
//
// The bug this pins (issues #68): only the posture and the HIPAA flag narrowed
// to the selected company. The legal register, the framework declarations, the
// sub-processor "Record on file" evidence and — worst of all — the list of
// clients offered for an IRREVERSIBLE erasure stayed agency-wide while the page
// carried the company's name. One brand's DPA therefore read as covering
// another's, and another brand's client sat in the erase dropdown.
//
// Every positive here is paired with the negative a merely-permissive filter
// would pass: Alpha sees Alpha's and the shared record, and NOT Beta's.

interface ScopedWorld extends World {
  alphaId: string;
  betaId: string;
  alphaClientId: string;
  betaClientId: string;
  alphaDocId: string;
  betaDocId: string;
  sharedDocId: string;
}

interface Snapshot {
  companyId: string | null;
  companyName: string;
  hipaaEnabled: boolean;
  legalDocuments: Array<{ id: string; title: string }>;
  declarations: Array<{ id: string; reference?: string }>;
  subprocessors: Array<{ id: string; hasAgreementRecord: boolean }>;
  erasureClients: Array<{ id: string; name: string }>;
  agencyWideSections: Array<{ id: string; label: string; reason: string }>;
}

async function readSnapshot(scope: string | null): Promise<Snapshot> {
  const query = scope ? `?companyId=${encodeURIComponent(scope)}` : "";
  const response = await overviewRoute.GET(get(`http://localhost/api/portal/governance${query}`));
  assert.equal(response.status, 200);
  const body = await response.json() as { ok: boolean; snapshot: Snapshot };
  assert.equal(body.ok, true);
  return body.snapshot;
}

async function seedTwoBrands(): Promise<ScopedWorld> {
  const world = await seedWorld();
  const alpha = createTradingCompany(world.agencyId, { name: `Alpha ${seq}` }, "seed");
  const beta = createTradingCompany(world.agencyId, { name: `Beta ${seq}` }, "seed");

  sessionCookie = world.ownerCookie;
  const addLegal = async (payload: Record<string, unknown>) => {
    const response = await legalRoute.POST(post("http://localhost/api/portal/governance/legal", payload));
    assert.equal(response.status, 200);
    return (await response.json() as { documentId: string }).documentId;
  };
  // Stripe is documented ONLY under Alpha, Vercel ONLY under Beta. The
  // sub-processor register must never answer one out of the other's paperwork.
  const alphaDocId = await addLegal({ title: "Alpha DPA", category: "contract", status: "active", counterparty: "Stripe", companyId: alpha.id });
  const betaDocId = await addLegal({ title: "Beta DPA", category: "contract", status: "active", counterparty: "Vercel", companyId: beta.id });
  const sharedDocId = await addLegal({ title: "Group privacy notice", category: "policy", status: "active", companyId: null });

  const alphaClient = createClient(world.agencyId, { name: `Alpha Client ${seq}`, stage: "live", companyId: alpha.id });
  const betaClient = createClient(world.agencyId, { name: `Beta Client ${seq}`, stage: "live", companyId: beta.id });

  return {
    ...world,
    alphaId: alpha.id,
    betaId: beta.id,
    alphaClientId: alphaClient.id,
    betaClientId: betaClient.id,
    alphaDocId,
    betaDocId,
    sharedDocId,
  };
}

test("the selected company scopes the register, the declarations, the sub-processor evidence and the erasure targets", async () => {
  const world = await seedTwoBrands();
  sessionCookie = world.ownerCookie;

  // A declaration recorded for Beta only.
  const flip = await hipaaRoute.POST(post("http://localhost/api/portal/governance/hipaa", { companyId: world.betaId, enabled: true }));
  assert.equal(flip.status, 200);

  const alpha = await readSnapshot(world.alphaId);
  const alphaTitles = alpha.legalDocuments.map(document => document.id);
  assert.ok(alphaTitles.includes(world.alphaDocId), "Alpha sees its own record");
  assert.ok(alphaTitles.includes(world.sharedDocId), "a record with no company is shared and stays visible");
  assert.ok(!alphaTitles.includes(world.betaDocId), "Alpha must NOT see Beta's DPA");

  const alphaStripe = alpha.subprocessors.find(row => row.id === "stripe");
  const alphaVercel = alpha.subprocessors.find(row => row.id === "vercel");
  assert.equal(alphaStripe?.hasAgreementRecord, true, "Stripe is documented under Alpha");
  assert.equal(alphaVercel?.hasAgreementRecord, false, "Vercel is documented only under Beta — Alpha must not report a record on file");

  const alphaClientIds = alpha.erasureClients.map(client => client.id);
  assert.ok(alphaClientIds.includes(world.alphaClientId), "Alpha's client is an erasure target under Alpha");
  assert.ok(alphaClientIds.includes(world.clientId), "a client attached to no company stays offered under every scope");
  assert.ok(!alphaClientIds.includes(world.betaClientId), "Beta's client must NOT be erasable from Alpha's scope");

  assert.equal(alpha.hipaaEnabled, false, "Beta's HIPAA declaration does not switch Alpha's track on");
  assert.deepEqual(alpha.declarations, [], "Beta's declaration is not listed under Alpha");

  // The mirror image, so the filter cannot be passing by accident.
  const beta = await readSnapshot(world.betaId);
  const betaIds = beta.legalDocuments.map(document => document.id);
  assert.ok(betaIds.includes(world.betaDocId) && betaIds.includes(world.sharedDocId), "Beta sees its own record and the shared one");
  assert.ok(!betaIds.includes(world.alphaDocId), "Beta must NOT see Alpha's DPA");
  assert.equal(beta.subprocessors.find(row => row.id === "vercel")?.hasAgreementRecord, true, "Vercel is documented under Beta");
  assert.equal(beta.subprocessors.find(row => row.id === "stripe")?.hasAgreementRecord, false, "Stripe is documented only under Alpha");
  const betaClientIds = beta.erasureClients.map(client => client.id);
  assert.ok(betaClientIds.includes(world.betaClientId) && !betaClientIds.includes(world.alphaClientId), "erasure targets follow the scope both ways");
  assert.equal(beta.hipaaEnabled, true, "Beta's own declaration is read under Beta");
  assert.ok(beta.declarations.length > 0, "and the dated declaration behind it is listed");

  // Agency-wide still sees everything — scoping narrows, it never hides a
  // record from the group view.
  const group = await readSnapshot(null);
  const groupIds = group.legalDocuments.map(document => document.id);
  assert.ok([world.alphaDocId, world.betaDocId, world.sharedDocId].every(id => groupIds.includes(id)), "agency-wide shows every record");
  const groupClientIds = group.erasureClients.map(client => client.id);
  assert.ok([world.alphaClientId, world.betaClientId, world.clientId].every(id => groupClientIds.includes(id)), "agency-wide offers every client");
});

test("the sections a company scope cannot narrow say so instead of pretending", async () => {
  // Issue #68's other half: security controls are facts about the shipped code,
  // and the subject-request and retention registers are keyed to the agency.
  // Rendering them silently under a company's name would claim a narrowing that
  // never happened, so the snapshot must name them and say why.
  const world = await seedTwoBrands();
  sessionCookie = world.ownerCookie;

  const alpha = await readSnapshot(world.alphaId);
  assert.equal(alpha.companyName.startsWith("Alpha"), true, "the snapshot names the scope it was built for");
  const ids = alpha.agencyWideSections.map(section => section.id).sort();
  assert.deepEqual(ids, ["requests", "retention", "security"], "every genuinely group-wide section is declared");
  for (const section of alpha.agencyWideSections) {
    assert.ok(section.label.length > 0, `${section.id} carries a label`);
    assert.ok(section.reason.length > 20, `${section.id} says WHY it cannot narrow, not just that it does not`);
  }

  // And the page has to render that reason — a flag nothing shows is no label
  // at all. The CALL SITES are what this asserts: the two strings below live
  // inside the note component itself, so matching only those would stay green
  // with every `<AgencyWideNote>` deleted from the page.
  const { readFileSync } = await import("node:fs");
  const workspace = readFileSync("src/app/portal/agency/governance/_GovernanceWorkspace.tsx", "utf8");
  assert.match(workspace, /snapshot\.agencyWideSections\.find/, "the note reads the declared section from the snapshot, never a reason of its own");
  assert.match(workspace, /not narrowed to/, "and labels them against the selected company by name");
  for (const section of alpha.agencyWideSections) {
    assert.match(
      workspace,
      new RegExp(`<AgencyWideNote[^>]*id="${section.id}"`),
      `the ${section.id} section must actually render the agency-wide label`,
    );
  }
});
