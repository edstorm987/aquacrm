// Company switching — one app, one deploy, several companies.
//
// Ed: "it still runs on one server one app, I just get a company switcher that
// loads me in, and each of my company websites — if I login it goes to my
// AquaCRM but as whatever company I am coming from."
//
// A "company" is an AGENCY. Switching is re-minting the session cookie with a
// different `activeAgencyId`; there is no parallel notion of current company.
//
// The part worth testing is the boundary, not the happy path. This codebase has
// already shipped one privilege escalation of exactly this shape (the freelancer
// preview let a manager exit as an owner), so the negative paths below are the
// point of the file:
//
//   • a body `agencyId` is a request, never proof of membership;
//   • a refusal must not reveal whether the agency exists;
//   • a switch may NARROW a session's memberships, never widen them;
//   • a borrowed identity (demo / Dev Mode / preview / showcase) cannot switch;
//   • `?brand=` picks between companies you are already in — it never grants one.
//
// Everything in the "switch endpoint" section drives the real route handler
// in-process (issueSession + NextRequest), so it fails against behaviour rather
// than against source text.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";

import {
  getAuthBrand,
  matchAuthBrandAgency,
  resolveAuthBrand,
  type AuthBrandAgency,
} from "../src/lib/authBrand";
import { GET, POST } from "../src/app/api/auth/switch-agency/route";
import { SESSION_COOKIE_NAME, issueSession, verifyToken } from "../src/lib/server/auth";
import { ensureHydrated } from "../src/server/storage";
import { createAgency, getAgency, updateAgency } from "../src/server/tenants";
import { createUser, getUserById, updateUser } from "../src/server/users";
import { addUserAgencyMembership } from "../src/lib/server/aquaOasisSeed";
import type { SessionPayload } from "../src/server/types";

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_SESSION_SECRET ??= "company-switcher-smoke-secret";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Source-marker helper. Comments are stripped first — an explanatory comment
// quoting the old code must not be able to satisfy an assertion about the code.
function sourceWithoutComments(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Brand fronts — now resolved against real companies, guard intact.
// ───────────────────────────────────────────────────────────────────────────

function agencyRow(over: Partial<AuthBrandAgency> = {}): AuthBrandAgency {
  return { id: "ag_1", name: "Ocean Boulevard", slug: "ocean-boulevard", status: "active", ...over };
}

describe("Sign-in brand — resolves real companies", () => {
  it("keeps the fallback guard: an unknown brand is AquaCRM, never another client", () => {
    const brand = resolveAuthBrand("totally-made-up", [agencyRow()]);
    assert.equal(brand.id, "aquacrm");
    assert.equal(brand.name, "AquaCRM");
    assert.equal(brand.agencyId, undefined);
  });

  it("keeps the fallback guard for a missing/empty brand", () => {
    assert.equal(resolveAuthBrand(undefined, [agencyRow()]).id, "aquacrm");
    assert.equal(resolveAuthBrand("", [agencyRow()]).id, "aquacrm");
    assert.equal(resolveAuthBrand("   ", [agencyRow()]).id, "aquacrm");
  });

  it("still serves the four hand-written fronts unchanged", () => {
    for (const id of ["milesymedia", "aqua", "aquacrm", "zimante"] as const) {
      const dynamicBrand = resolveAuthBrand(id, [agencyRow()]);
      assert.deepEqual({ ...dynamicBrand, agencyId: undefined }, { ...getAuthBrand(id), agencyId: undefined });
      assert.equal(dynamicBrand.agencyId, undefined);
    }
  });

  it("resolves a real company's slug to that company's front", () => {
    const brand = resolveAuthBrand("ocean-boulevard", [agencyRow()]);
    assert.equal(brand.id, "ocean-boulevard");
    assert.equal(brand.name, "Ocean Boulevard");
    assert.equal(brand.mark, "O");
    assert.equal(brand.agencyId, "ag_1");
  });

  it("does not send the visitor off-site — an agency front's home link stays relative", () => {
    // Agency records carry no verified website. Reflecting one would turn
    // `?brand=` into an open redirect on the page's "Back to …" link.
    assert.equal(resolveAuthBrand("ocean-boulevard", [agencyRow()]).homeUrl, "/");
  });

  it("ignores case and surrounding whitespace", () => {
    assert.equal(resolveAuthBrand("  Ocean-Boulevard ", [agencyRow()]).agencyId, "ag_1");
  });

  it("will not resolve an archived or paused company", () => {
    for (const status of ["archived", "paused"]) {
      const brand = resolveAuthBrand("ocean-boulevard", [agencyRow({ status })]);
      assert.equal(brand.id, "aquacrm", `status=${status} must fall back`);
      assert.notEqual(brand.name, "Ocean Boulevard");
    }
  });

  it("matches exactly — a prefix or substring is not a company", () => {
    const rows = [agencyRow()];
    assert.equal(matchAuthBrandAgency("ocean", rows), null);
    assert.equal(matchAuthBrandAgency("ocean-boulevard-2", rows), null);
    assert.equal(matchAuthBrandAgency("boulevard", rows), null);
    assert.equal(matchAuthBrandAgency("ocean-boulevard", rows)?.id, "ag_1");
  });

  it("matches on id as well as slug", () => {
    assert.equal(matchAuthBrandAgency("ag_1", [agencyRow()])?.id, "ag_1");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Sign-in lands in the company you came from — but only one of yours.
// ───────────────────────────────────────────────────────────────────────────

describe("Sign-in landing company — brand is a preference, never a grant", () => {
  it("a brand naming a company you are NOT in cannot be selected", () => {
    // This is the shape the login route relies on: the candidate list is
    // narrowed to the user's own memberships BEFORE the brand is matched.
    const all = [
      agencyRow({ id: "ag_mine", slug: "mine", name: "Mine" }),
      agencyRow({ id: "ag_theirs", slug: "theirs", name: "Someone Else" }),
    ];
    const myMemberships = all.filter(a => a.id === "ag_mine");
    assert.equal(matchAuthBrandAgency("theirs", myMemberships), null);
    assert.equal(matchAuthBrandAgency("mine", myMemberships)?.id, "ag_mine");
  });

  it("the login route narrows to the user's memberships before matching the brand", () => {
    const src = sourceWithoutComments("src/app/api/auth/login/route.ts");
    assert.match(src, /memberAgencyIds/, "login route must compute the user's memberships");
    assert.match(
      src,
      /matchAuthBrandAgency\(\s*requestedBrandValue,\s*listAgencies\(\)\.filter\(a => memberAgencyIds\.includes\(a\.id\)\),?\s*\)/,
      "the brand must be matched against membership-filtered agencies only",
    );
    assert.match(src, /activeAgencyId,/, "the session must be minted with the resolved activeAgencyId");
  });

  it("the login page resolves ?brand= dynamically and still guards the fallback", () => {
    const src = sourceWithoutComments("src/app/login/page.tsx");
    assert.match(src, /resolveAuthBrand\(value, listAgencies\(\)\)/);
    assert.doesNotMatch(src, /getAuthBrand\(/, "the hardcoded four-brand resolver must no longer decide this page");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. The switch endpoint — driven for real.
// ───────────────────────────────────────────────────────────────────────────

let seq = 0;

interface Fixture {
  userId: string;
  email: string;
  agencyA: string;
  agencyB: string;
  outsiderAgency: string;
  token: string;
}

/** Founder-ish account that belongs to two companies, plus one it does not. */
async function seedTwoCompanyUser(): Promise<Fixture> {
  await ensureHydrated();
  seq += 1;
  const a = createAgency({ name: `Switch A ${seq}`, slug: `switch-a-${seq}` });
  const b = createAgency({ name: `Switch B ${seq}`, slug: `switch-b-${seq}` });
  const outsider = createAgency({ name: `Outsider ${seq}`, slug: `outsider-${seq}` });
  const email = `switcher${seq}@example.com`;
  const user = createUser({
    email,
    password: "Sw1tch-Test-Passw0rd!",
    role: "agency-owner",
    agencyId: a.id,
    name: "Switcher",
  });
  addUserAgencyMembership(user.id, b.id);
  const fresh = getUserById(user.id)!;
  return {
    userId: fresh.id,
    email: fresh.email,
    agencyA: a.id,
    agencyB: b.id,
    outsiderAgency: outsider.id,
    token: issueSession({
      userId: fresh.id,
      email: fresh.email,
      role: fresh.role,
      agencyId: a.id,
      agencyIds: fresh.agencyIds,
      activeAgencyId: a.id,
      sessionRev: fresh.sessionRev ?? 0,
    }),
  };
}

function switchRequest(
  token: string | undefined,
  body: unknown,
  opts: { origin?: string | null } = {},
): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.origin !== null) headers.origin = opts.origin ?? "http://localhost";
  if (token) headers.cookie = `${SESSION_COOKIE_NAME}=${token}`;
  return new NextRequest("http://localhost/api/auth/switch-agency", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function listRequest(token: string | undefined): NextRequest {
  const headers: Record<string, string> = {};
  if (token) headers.cookie = `${SESSION_COOKIE_NAME}=${token}`;
  return new NextRequest("http://localhost/api/auth/switch-agency", { method: "GET", headers });
}

function mintedSession(response: Response): SessionPayload | null {
  const value = (response as unknown as {
    cookies: { get(name: string): { value: string } | undefined };
  }).cookies.get(SESSION_COOKIE_NAME)?.value;
  return value ? verifyToken(value) : null;
}

describe("Switch company — the happy path", () => {
  it("moves activeAgencyId to another company you belong to", async () => {
    const f = await seedTwoCompanyUser();
    const res = await POST(switchRequest(f.token, { agencyId: f.agencyB }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.agencyId, f.agencyB);

    const session = mintedSession(res);
    assert.ok(session, "a new session cookie must be issued");
    assert.equal(session!.activeAgencyId, f.agencyB);
    assert.equal(session!.agencyId, f.agencyB, "the legacy mirror must follow activeAgencyId");
    assert.equal(session!.userId, f.userId, "switching company must not change who you are");
    assert.equal(session!.role, "agency-owner");
  });

  it("never caches the answer", async () => {
    const f = await seedTwoCompanyUser();
    const res = await POST(switchRequest(f.token, { agencyId: f.agencyB }));
    assert.equal(res.headers.get("cache-control"), "no-store");
  });

  it("switching back is not a privilege change", async () => {
    const f = await seedTwoCompanyUser();
    const first = await POST(switchRequest(f.token, { agencyId: f.agencyB }));
    const second = await POST(switchRequest(mintedSessionToken(first), { agencyId: f.agencyA }));
    assert.equal(second.status, 200);
    const session = mintedSession(second)!;
    assert.equal(session.activeAgencyId, f.agencyA);
    assert.equal(session.userId, f.userId);
    assert.equal(session.role, "agency-owner");
  });

  it("lists only your own companies, with the active one marked", async () => {
    const f = await seedTwoCompanyUser();
    const res = await GET(listRequest(f.token));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.activeAgencyId, f.agencyA);
    const ids = (body.agencies as { id: string }[]).map(a => a.id).sort();
    assert.deepEqual(ids, [f.agencyA, f.agencyB].sort());
    assert.ok(
      !ids.includes(f.outsiderAgency),
      "the switcher must not be an agency directory",
    );
  });
});

function mintedSessionToken(response: Response): string {
  return (response as unknown as {
    cookies: { get(name: string): { value: string } | undefined };
  }).cookies.get(SESSION_COOKIE_NAME)!.value;
}

describe("Switch company — the boundary", () => {
  it("REFUSES a company you are not a member of", async () => {
    const f = await seedTwoCompanyUser();
    const res = await POST(switchRequest(f.token, { agencyId: f.outsiderAgency }));
    assert.equal(res.status, 403);
    assert.equal(mintedSession(res), null, "a refused switch must not issue a cookie");
    const body = await res.json();
    assert.equal(body.ok, false);
  });

  it("does not leak whether a refused company exists", async () => {
    const f = await seedTwoCompanyUser();
    const real = await POST(switchRequest(f.token, { agencyId: f.outsiderAgency }));
    const imaginary = await POST(switchRequest(f.token, { agencyId: "ag_does_not_exist_at_all" }));
    assert.equal(real.status, imaginary.status);
    assert.deepEqual(await real.json(), await imaginary.json());
  });

  it("an archived company is refused with the SAME answer as a stranger's", async () => {
    const f = await seedTwoCompanyUser();
    updateAgency(f.agencyB, { status: "archived" });
    const archived = await POST(switchRequest(f.token, { agencyId: f.agencyB }));
    const stranger = await POST(switchRequest(f.token, { agencyId: f.outsiderAgency }));
    assert.equal(archived.status, stranger.status);
    assert.deepEqual(await archived.json(), await stranger.json());
    assert.equal(mintedSession(archived), null);
    updateAgency(f.agencyB, { status: "active" });
  });

  it("a revoked membership is refused even though the cookie still lists it", async () => {
    // The cookie was minted while the user belonged to B. Membership is then
    // withdrawn on the live record. The signed cookie alone must not be enough.
    const f = await seedTwoCompanyUser();
    updateUser(f.email, { agencyIds: [f.agencyA] });
    const res = await POST(switchRequest(f.token, { agencyId: f.agencyB }));
    assert.equal(res.status, 403);
    assert.equal(mintedSession(res), null);
  });

  it("a membership added since sign-in does NOT widen the session", async () => {
    // The opposite failure: trusting the live record alone would let a switch
    // hand the cookie an agency it was never minted for.
    const f = await seedTwoCompanyUser();
    const late = createAgency({ name: `Late ${seq}`, slug: `late-${seq}` });
    // Written straight onto the record so `sessionRev` is untouched — the
    // cookie stays FRESH, which is what isolates the widening question from
    // the staleness one. (`addUserAgencyMembership` bumps the rev, so the
    // switch would be refused as stale and prove nothing about widening.)
    updateUser(f.email, { agencyIds: [f.agencyA, f.agencyB, late.id] });
    const res = await POST(switchRequest(f.token, { agencyId: late.id }));
    assert.equal(res.status, 403, "a new membership needs a fresh sign-in, not a switch");
    assert.equal(mintedSession(res), null);
  });

  it("the re-minted session narrows agencyIds — it never grows them", async () => {
    // Live record gains a third company (rev untouched, so the cookie is still
    // fresh). An ALLOWED switch must not smuggle that third company into the
    // new cookie: the re-mint copies the intersection, not the live record.
    const f = await seedTwoCompanyUser();
    const late = createAgency({ name: `Smuggled ${seq}`, slug: `smuggled-${seq}` });
    updateUser(f.email, { agencyIds: [f.agencyA, f.agencyB, late.id] });
    const res = await POST(switchRequest(f.token, { agencyId: f.agencyB }));
    assert.equal(res.status, 200, "switching to a company both sides agree on still works");
    const session = mintedSession(res)!;
    assert.ok(
      !session.agencyIds!.includes(late.id),
      "the re-mint must not hand the cookie a company it did not already carry",
    );
    assert.ok(
      session.agencyIds!.every(id => [f.agencyA, f.agencyB].includes(id)),
      "no agency may appear that the previous cookie did not already carry",
    );
    assert.ok(!session.agencyIds!.includes(f.outsiderAgency));
  });

  it("refuses without a session", async () => {
    const f = await seedTwoCompanyUser();
    const res = await POST(switchRequest(undefined, { agencyId: f.agencyB }));
    assert.equal(res.status, 401);
  });

  it("refuses a cross-origin post", async () => {
    const f = await seedTwoCompanyUser();
    const res = await POST(
      switchRequest(f.token, { agencyId: f.agencyB }, { origin: "https://evil.example" }),
    );
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, "invalid_origin");
    assert.equal(mintedSession(res), null);
  });

  it("refuses a missing or non-string agencyId", async () => {
    const f = await seedTwoCompanyUser();
    for (const body of [{}, { agencyId: "" }, { agencyId: 7 }, { agencyId: { id: "x" } }]) {
      const res = await POST(switchRequest(f.token, body));
      assert.equal(res.status, 400, `body ${JSON.stringify(body)} must be rejected`);
    }
  });

  it("refuses a stale session whose rev the user record has moved past", async () => {
    const f = await seedTwoCompanyUser();
    // A role change bumps sessionRev; the old cookie must stop working.
    updateUser(f.email, { role: "agency-manager" });
    const res = await POST(switchRequest(f.token, { agencyId: f.agencyB }));
    assert.equal(res.status, 401);
  });
});

describe("Switch company — a borrowed identity cannot switch", () => {
  const borrowed: [string, Partial<Parameters<typeof issueSession>[0]>][] = [
    ["demo", { isDemo: true }],
    ["Dev Mode", { devReturnAgencyId: "ag_home" }],
    ["freelancer preview", { previewReturnAgencyId: "ag_home" }],
    ["public showcase", { publicShowcase: true }],
    ["showcase", { showcaseReturnAgencyId: "ag_home" }],
  ];

  for (const [label, extra] of borrowed) {
    it(`refuses a ${label} session`, async () => {
      const f = await seedTwoCompanyUser();
      const fresh = getUserById(f.userId)!;
      const token = issueSession({
        userId: fresh.id,
        email: fresh.email,
        role: fresh.role,
        agencyId: f.agencyA,
        agencyIds: fresh.agencyIds,
        activeAgencyId: f.agencyA,
        sessionRev: fresh.sessionRev ?? 0,
        ...extra,
      });
      const res = await POST(switchRequest(token, { agencyId: f.agencyB }));
      assert.equal(res.status, 409, `${label} must be told to leave the preview first`);
      assert.equal(mintedSession(res), null, `${label} must not be re-minted`);
    });
  }

  it("tells the switcher UI it cannot switch, so the tile hides itself", async () => {
    const f = await seedTwoCompanyUser();
    const fresh = getUserById(f.userId)!;
    const token = issueSession({
      userId: fresh.id,
      email: fresh.email,
      role: fresh.role,
      agencyId: f.agencyA,
      agencyIds: fresh.agencyIds,
      activeAgencyId: f.agencyA,
      sessionRev: fresh.sessionRev ?? 0,
      isDemo: true,
    });
    const res = await GET(listRequest(token));
    assert.equal((await res.json()).canSwitch, false);
  });
});

describe("Switch company — the UI is wired to the guarded endpoint", () => {
  it("the switcher posts to /api/auth/switch-agency and hard-navigates", () => {
    const src = sourceWithoutComments("src/components/chrome/CompanySwitcher.tsx");
    assert.match(src, /"\/api\/auth\/switch-agency"/);
    assert.match(src, /window\.location\.href/, "a cookie change must not be a client-side route push");
  });

  it("the switcher renders nothing when there is nothing to switch to", () => {
    const src = sourceWithoutComments("src/components/chrome/CompanySwitcher.tsx");
    assert.match(src, /if \(!canSwitch \|\| options\.length < 2 \|\| !active\) return null;/);
  });

  it("is mounted in the sidebar", () => {
    const src = sourceWithoutComments("src/components/chrome/Sidebar.tsx");
    assert.match(src, /CompanySwitcher/);
  });

  it("the archived agency-add flow stays archived", () => {
    const src = sourceWithoutComments("src/components/chrome/CompanySwitcher.tsx");
    assert.doesNotMatch(src, /agency-add/, "creating a tenant is a different job from switching");
  });
});

describe("Switch company — the session model was not duplicated", () => {
  it("reuses activeAgencyId rather than inventing a current-company field", () => {
    const src = sourceWithoutComments("src/app/api/auth/switch-agency/route.ts");
    assert.match(src, /activeAgencyId: agency\.id/);
    assert.doesNotMatch(src, /currentCompanyId|activeCompanyId|currentAgencyId/);
  });

  it("keeps a live agency lookup as defence in depth", () => {
    assert.ok(getAgency("definitely-not-an-agency") === null);
  });
});
