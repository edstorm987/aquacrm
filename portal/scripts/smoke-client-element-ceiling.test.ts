// Client workspace elements — a ceiling refusal must not become legacy `manage`.
//
// Found while triaging the Finance cluster, 2026-08-27. `clientCommercialGate`
// in agency-finance asks the kernel whether this caller may touch a client's
// `client.commercial` element. Probing it with three client ids showed:
//
//   own client        ceilingFailure=none                 -> manage   (right)
//   nonexistent id    ceilingFailure=resource_ownership   -> manage   (wrong)
//   OTHER agency's    ceilingFailure=resource_ownership   -> manage   (wrong)
//
// `resolveActorClientWorkspaceElementAccess` read only "no capabilities and no
// grants" and concluded "this identity has not been migrated to canonical
// governance yet", falling back to `legacyLevels` — which answers `manage` for
// every agency role. So the element layer was overruling the very refusal the
// kernel had just handed it.
//
// The two cases ARE distinguishable, and that is what makes the fix safe:
//   • un-migrated identity  → the actor CAN reach the client, ceilingFailure is
//                             unset, and the legacy fallback is correct;
//   • ceiling refusal       → ceilingFailure is set, and nothing may be granted.
//
// This is a FLOOR beneath route-level tenancy, not a replacement for it — the
// direct tenant routes and the plugin catch-all still resolve the tenant first.
// But a floor that answers `manage` for another agency's client is not a floor,
// and anywhere it is the only client check it was load-bearing.

// First, and statically — see the note in dev-console-request-scope.ts.
import { withSession } from "./dev-console-request-scope";

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

process.env.PORTAL_BACKEND ??= "memory";

import { AuthError, issueSession } from "../src/lib/server/auth/auth";
import { ensureHydrated } from "../src/server/storage";
import { createAgency, createClient } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import type { Role } from "../src/server/types";

let mine: { id: string };
let theirs: { id: string };
let ownerSession: string;
let staffSession: string;

async function sessionAs(agencyId: string, role: Role, tag: string): Promise<string> {
  const user = createUser({
    email: `${tag}-${Date.now()}-${Math.round(performance.now() * 1000)}@ceiling.test`,
    name: tag,
    role,
    agencyId,
    password: "ceiling-smoke-pass-phrase",
  });
  return issueSession({
    userId: user.id, email: user.email, role,
    agencyId, agencyIds: [agencyId], activeAgencyId: agencyId,
    sessionRev: user.sessionRev ?? 0,
  });
}

before(async () => {
  await ensureHydrated();
  const ours = createAgency({ name: "Ours", slug: `ceiling-ours-${Date.now()}` });
  const other = createAgency({ name: "Theirs", slug: `ceiling-theirs-${Date.now()}` });
  mine = createClient(ours.id, { name: "Our Client", slug: "our-client" });
  theirs = createClient(other.id, { name: "Their Client", slug: "their-client" });
  ownerSession = await sessionAs(ours.id, "agency-owner", "owner");
  // Same agency, no governance grants written: the un-migrated identity whose
  // legacy behaviour the fix must NOT disturb.
  staffSession = await sessionAs(ours.id, "agency-staff", "staff");
});

async function accessAs(session: string, clientId: string) {
  const mod = await import("../src/lib/server/access/clientWorkspaceElementAccess");
  return withSession(session, async () => {
    const { access } = await mod.currentClientWorkspaceElementAccess(clientId);
    return access;
  });
}

async function requireAs(session: string, clientId: string, level: "view" | "use" | "manage") {
  const mod = await import("../src/lib/server/access/clientWorkspaceElementAccess");
  return withSession(session, async () => {
    try {
      await mod.requireCurrentClientWorkspaceElementAccess(clientId, "client.commercial", level);
      return null;
    } catch (error) {
      return error;
    }
  });
}

describe("a ceiling refusal denies rather than falling back to legacy", () => {
  it("still gives the owner manage over their OWN client", async () => {
    const access = await accessAs(ownerSession, mine.id);
    assert.equal(access.source, "owner-baseline");
    assert.equal(access.levels["client.commercial"], "manage");
    assert.equal(await requireAs(ownerSession, mine.id, "manage"), null, "the fix must not lock the owner out");
  });

  it("refuses an owner on ANOTHER agency's client — the case that answered manage", async () => {
    const access = await accessAs(ownerSession, theirs.id);
    assert.equal(access.source, "ceiling-denied", "a refusal must be reported as a refusal, not as `legacy`");
    assert.equal(access.levels["client.commercial"], "hidden");

    const error = await requireAs(ownerSession, theirs.id, "view");
    assert.ok(error instanceof AuthError, `expected an AuthError, got ${String(error)}`);
    assert.equal((error as AuthError).status, 403);
  });

  it("refuses a client id that does not exist at all", async () => {
    const access = await accessAs(ownerSession, "cli_does_not_exist");
    assert.equal(access.source, "ceiling-denied");
    assert.equal(access.levels["client.commercial"], "hidden");
    assert.ok(await requireAs(ownerSession, "cli_does_not_exist", "view"), "an unknown id must not read as manage");
  });

  it("hides EVERY element on a refusal, not just the one asked about", async () => {
    const access = await accessAs(ownerSession, theirs.id);
    const granted = Object.entries(access.levels).filter(([, level]) => level !== "hidden");
    assert.deepEqual(granted, [], `a refused client leaked: ${JSON.stringify(granted)}`);
    assert.deepEqual(access.capabilities, []);
    assert.deepEqual(access.grantIds, []);
    assert.equal(access.agencyWidePolicy, false);
  });

  it("leaves the un-migrated legacy identity untouched — the property that makes this safe", async () => {
    // Same agency, no grants: the kernel raises no ceiling failure, so this
    // identity keeps exactly the behaviour it had before governance existed.
    // If this ever flips to `ceiling-denied`, the fix has over-reached and every
    // un-migrated agency user has silently lost their client workspace.
    const access = await accessAs(staffSession, mine.id);
    assert.equal(access.source, "legacy", "the migration fallback is still reached for its own case");
    assert.equal(access.canonical, false);
    assert.equal(access.levels["client.commercial"], "manage");
    assert.equal(await requireAs(staffSession, mine.id, "manage"), null);
  });

  it("and refuses that same un-migrated identity on another agency's client", async () => {
    // The legacy fallback was the widest surface: staff got `manage` on every
    // client id in existence, including ones the kernel had refused.
    const access = await accessAs(staffSession, theirs.id);
    assert.equal(access.source, "ceiling-denied");
    assert.equal(access.levels["client.commercial"], "hidden");
    assert.ok(await requireAs(staffSession, theirs.id, "view"));
  });
});

// ─── The sequel: a refusal must not become 403 where the house answers 404 ───
//
// Issue #168. The fix above is right, and it had a consequence. `requireCurrent
// ClientWorkspaceElementAccess` now refuses a ceiling-denied client outright —
// and a ceiling refusal is exactly "another agency's client, or none at all".
// Roughly thirty routes ran that gate BEFORE their own `getClientForAgency`
// lookup, so they answered 403 for an id whose documented answer is 404 "client
// not found", the same answer an id that never existed gets. (Nothing leaked —
// 403 came back for both — but the convention at src/server/phaseApplier.ts:51
// is that a client outside my agency is INDISTINGUISHABLE from one that does not
// exist, and the UIs are written against that 404.)
//
// So: tenancy first, permission second — the order commented in full at
// api/tenants/close-deal/route.ts. These drive the real handlers.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const UNKNOWN_CLIENT_ID = "cli_no_such_client_at_all";

interface RouteCase {
  label: string;
  call: (clientId: string) => Promise<Response>;
}

function jsonRequest(path: string, method: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest(path: string, clientId: string): Request {
  return new Request(`http://localhost${path}?clientId=${encodeURIComponent(clientId)}`);
}

async function nextGetRequest(path: string, clientId: string) {
  const { NextRequest } = await import("next/server");
  return new NextRequest(`http://localhost${path}?clientId=${encodeURIComponent(clientId)}`);
}

// A spread across the sweep: the two try/catch shapes, a handler whose tenancy
// read sits inside a ledger transaction, a GET, and the two routes that had no
// agency-scoped lookup at all before this change.
const ROUTE_CASES: RouteCase[] = [
  {
    label: "POST /api/tenants/client-notes",
    call: async clientId => (await import("../src/app/api/tenants/client-notes/route"))
      .POST(jsonRequest("/api/tenants/client-notes", "POST", { clientId, notes: { notes: "hello" } })),
  },
  {
    label: "POST /api/tenants/client-contacts",
    call: async clientId => (await import("../src/app/api/tenants/client-contacts/route"))
      .POST(jsonRequest("/api/tenants/client-contacts", "POST", { clientId, action: "save" })),
  },
  {
    label: "POST /api/tenants/client-status",
    call: async clientId => (await import("../src/app/api/tenants/client-status/route"))
      .POST(jsonRequest("/api/tenants/client-status", "POST", { clientId, status: "active" })),
  },
  {
    label: "PATCH /api/tenants/client-custom-fields",
    call: async clientId => (await import("../src/app/api/tenants/client-custom-fields/route"))
      .PATCH(jsonRequest("/api/tenants/client-custom-fields", "PATCH", { clientId, customFields: {} })),
  },
  {
    label: "POST /api/tenants/client-approvals",
    call: async clientId => (await import("../src/app/api/tenants/client-approvals/route"))
      .POST(jsonRequest("/api/tenants/client-approvals", "POST", { clientId, action: "request", type: "design" })),
  },
  {
    label: "POST /api/tenants/client-payment-plans",
    call: async clientId => (await import("../src/app/api/tenants/client-payment-plans/route"))
      .POST(jsonRequest("/api/tenants/client-payment-plans", "POST", { clientId, action: "create" })),
  },
  {
    label: "GET /api/tenants/product-workspaces",
    call: async clientId => (await import("../src/app/api/tenants/product-workspaces/route"))
      .GET(getRequest("/api/tenants/product-workspaces", clientId)),
  },
  {
    label: "GET /api/tenants/client-record-ledger",
    call: async clientId => (await import("../src/app/api/tenants/client-record-ledger/route"))
      .GET(getRequest("/api/tenants/client-record-ledger", clientId)),
  },
  {
    label: "GET /api/tenants/client-milestones",
    call: async clientId => (await import("../src/app/api/tenants/client-milestones/route"))
      .GET(getRequest("/api/tenants/client-milestones", clientId)),
  },
  {
    label: "GET /api/tenants/client-telemetry",
    call: async clientId => (await import("../src/app/api/tenants/client-telemetry/route"))
      .GET(await nextGetRequest("/api/tenants/client-telemetry", clientId)),
  },
];

async function answerFor(session: string, routeCase: RouteCase, clientId: string) {
  const response = await withSession(session, () => routeCase.call(clientId));
  const body = await response.json().catch(() => ({})) as { error?: string };
  return { status: response.status, error: body.error ?? "" };
}

describe("tenancy answers before the element gate (issues #168)", () => {
  for (const routeCase of ROUTE_CASES) {
    it(`${routeCase.label} answers 404 for another agency's client, not 403`, async () => {
      const answer = await answerFor(ownerSession, routeCase, theirs.id);
      assert.equal(
        answer.status,
        404,
        `${routeCase.label} answered ${answer.status} (${answer.error}) — the element gate ran before the tenancy lookup`,
      );
      assert.match(answer.error, /client not found/i);
    });

    it(`${routeCase.label} answers a client id that does not exist identically`, async () => {
      // The whole point of the convention: the two answers must be the same, so
      // "not yours" is not distinguishable from "not there".
      const outsider = await answerFor(ownerSession, routeCase, theirs.id);
      const unknown = await answerFor(ownerSession, routeCase, UNKNOWN_CLIENT_ID);
      assert.equal(unknown.status, 404);
      assert.deepEqual(unknown, outsider, `${routeCase.label} distinguishes a stranger's client from a missing one`);
    });
  }

  it("holds for an un-migrated legacy identity too, not just the owner", async () => {
    // The staff identity above still gets `legacy` levels on its OWN client, so
    // its 404 here cannot be the gate refusing — it is the tenancy lookup.
    const answer = await answerFor(staffSession, ROUTE_CASES[0], theirs.id);
    assert.equal(answer.status, 404, `staff got ${answer.status} (${answer.error})`);
  });

  it("still lets the owner through to their OWN client", async () => {
    // The guard against "fixed it by 404ing everybody".
    const answer = await answerFor(ownerSession, ROUTE_CASES[0], mine.id);
    assert.notEqual(answer.status, 404, "the owner's own client must not read as missing");
    assert.notEqual(answer.status, 403);
  });
});

describe("no client route may put the element gate before its tenancy check", () => {
  function routeFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...routeFiles(full));
      else if (entry.name === "route.ts") out.push(full);
    }
    return out;
  }

  it("sweeps src/app/api/tenants so a NEW route cannot reintroduce the 403", () => {
    // A line-order scan. It used to look a fixed FOURTEEN LINES back, which was
    // a proximity heuristic rather than the contract: `client-delight` resolves
    // every target id in a loop and 404s, then gates twice — and when a comment
    // and a spend calculation were added between the two, the correct route
    // fell out of the window and was reported as an offender.
    //
    // The window is now the enclosing handler. A `getClientForAgency(` ANYWHERE
    // earlier in the same exported handler genuinely precedes the gate, which is
    // what the contract says; and a handler with no tenancy resolution at all is
    // still caught, so this is stricter than the line count, not laxer.
    const offenders: string[] = [];
    for (const file of routeFiles(join(process.cwd(), "src/app/api/tenants"))) {
      const lines = readFileSync(file, "utf8").split("\n");
      let handlerStart = 0;
      lines.forEach((line, index) => {
        if (/^export async function (GET|POST|PATCH|PUT|DELETE)\b/.test(line)) handlerStart = index;
        if (!line.includes("requireCurrentClientWorkspaceElementAccess(")) return;
        if (line.trimStart().startsWith("import") || line.includes("} from")) return;
        const before = lines.slice(handlerStart, index).join("\n");
        // The CALL, with its paren — not the import, which names it without one
        // and sits within a few lines of the gate in several of these files.
        const tenancyFirst = before.includes("getClientForAgency(")
          || (before.includes("scope.client") && before.includes("404"));
        if (!tenancyFirst) offenders.push(`${file.slice(process.cwd().length + 1)}:${index + 1}`);
      });
    }
    assert.deepEqual(offenders, [], `these gate before resolving the client in the caller's agency:\n${offenders.join("\n")}`);
  });
});
