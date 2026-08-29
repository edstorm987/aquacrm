// Issue #22 P0 — central session revocation.
//
// A signed cookie proves what was true at mint time, nothing more. The live
// exploit: downgrade an owner to staff, replay the OLD owner cookie against
// POST /api/portal/settings/external-ai → 201 + a working token, because
// `getSessionFromRequest()` only verified the HMAC and `requireRole()` trusted
// the role embedded in the cookie.
//
// The fix is one central boundary in `auth.ts`: `resolveFreshSessionUser()`
// re-validates existence, `sessionRev`, current role and live membership on
// EVERY authenticated read of the cookie — both `getSession()` (and therefore
// `requireSession`/`requireRole`/`requireRoleForClient`) and
// `getSessionFromRequest()`. These tests replay real old cookies against the
// real route handlers after downgrade, password rotation, explicit session
// rotation and account deletion, and pin the sandbox/demo anchoring semantics.

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

// Load-bearing import order: this helper installs the AsyncLocalStorage
// global BEFORE anything from `next/` is evaluated (see its own header).
import { withSession } from "./dev-console-request-scope";

import { NextRequest } from "next/server";

import { GET as externalAiGet, POST as externalAiPost } from "../src/app/api/portal/settings/external-ai/route";
import { GET as agencyUsersGet } from "../src/app/api/portal/agency/users/route";
import { POST as notepadPost } from "../src/app/api/portal/notepad/route";
import {
  issueSession,
  resolveFreshSessionUser,
  SESSION_COOKIE_NAME,
  verifyToken,
} from "../src/lib/server/auth/auth";
import {
  LIVE_DATA_REALM_ID,
  createEmptyPortalState,
  mutate,
  replaceDataRealmState,
} from "../src/server/storage";
import { rotateUserSession, setUserPassword, updateUser } from "../src/server/users";
import type { PortalState, ServerUser, SessionPayload } from "../src/server/types";

const AGENCY_ID = "revocation-co";
const OWNER_ID = "revocation-owner";
const OWNER_EMAIL = "owner@revocation-co.test";
const SHOWCASE_REALM_ID = "sandbox-public-showcase-revocation";

function owner(overrides: Partial<ServerUser> = {}): ServerUser {
  return {
    id: OWNER_ID,
    email: OWNER_EMAIL,
    name: "Revocation Owner",
    passwordHash: "test-only",
    role: "agency-owner",
    agencyId: AGENCY_ID,
    agencyIds: [AGENCY_ID],
    sessionRev: 0,
    accessRev: 0,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function stateFor(subject: ServerUser): PortalState {
  const state = createEmptyPortalState();
  state.agencies[AGENCY_ID] = {
    id: AGENCY_ID,
    name: "Revocation Co",
    slug: AGENCY_ID,
    brand: { primaryColor: "#000000" },
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  };
  state.users[subject.email] = subject;
  return state;
}

function ownerToken(sessionRev = 0): string {
  return issueSession({
    userId: OWNER_ID,
    email: OWNER_EMAIL,
    role: "agency-owner",
    agencyId: AGENCY_ID,
    agencyIds: [AGENCY_ID],
    activeAgencyId: AGENCY_ID,
    sessionRev,
  });
}

/** The exact exploit request: create an external-AI API key with a cookie. */
function externalAiCreateRequest(token: string): NextRequest {
  return new NextRequest("http://localhost/api/portal/settings/external-ai", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
    },
    body: JSON.stringify({
      action: "create",
      name: "Replay key",
      modules: ["clients"],
      permissions: ["records:read"],
    }),
  });
}

function externalAiStatusRequest(token: string): NextRequest {
  return new NextRequest("http://localhost/api/portal/settings/external-ai", {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });
}

function notepadCreateRequest(): Request {
  return new Request("http://localhost/api/portal/notepad", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "create-note" }),
  });
}

beforeEach(async () => {
  await replaceDataRealmState(LIVE_DATA_REALM_ID, stateFor(owner()));
});

describe("central session revocation — the exploit route (getSessionFromRequest path)", () => {
  it("a live owner cookie still creates a key (the boundary refuses stale, not valid, sessions)", async () => {
    const response = await externalAiPost(externalAiCreateRequest(ownerToken()));
    assert.equal(response.status, 201);
    const body = await response.json() as { ok: boolean; token?: string };
    assert.equal(body.ok, true);
    assert.ok(body.token, "a fresh owner still gets a working token");
  });

  it("after owner→staff downgrade the OLD owner cookie cannot create an external-AI key", async () => {
    const staleOwnerCookie = ownerToken();
    updateUser(OWNER_EMAIL, { role: "agency-staff" });

    const response = await externalAiPost(externalAiCreateRequest(staleOwnerCookie));
    assert.equal(response.status, 403, "the 201-with-working-token exploit must be dead");
    const body = await response.json() as { ok: boolean; token?: string };
    assert.equal(body.ok, false);
    assert.equal(body.token, undefined);

    const read = await externalAiGet(externalAiStatusRequest(staleOwnerCookie));
    assert.equal(read.status, 403, "the stale cookie cannot even read key status");
  });

  it("after password rotation the OLD cookie is refused", async () => {
    const staleCookie = ownerToken();
    assert.equal(setUserPassword(OWNER_EMAIL, "An3wSecure!Password"), true);
    const response = await externalAiPost(externalAiCreateRequest(staleCookie));
    assert.equal(response.status, 403);
  });

  it("after explicit session rotation the OLD cookie is refused", async () => {
    const staleCookie = ownerToken();
    assert.ok(rotateUserSession(OWNER_ID));
    const response = await externalAiPost(externalAiCreateRequest(staleCookie));
    assert.equal(response.status, 403);
  });

  it("after account deletion the OLD cookie is refused", async () => {
    const staleCookie = ownerToken();
    mutate(state => { delete state.users[OWNER_EMAIL]; });
    const response = await externalAiPost(externalAiCreateRequest(staleCookie));
    assert.equal(response.status, 403);
  });

  it("a role edited in place WITHOUT a rev bump is still refused (belt-and-braces)", async () => {
    const staleCookie = ownerToken();
    mutate(state => {
      const stored = state.users[OWNER_EMAIL];
      if (stored) state.users[OWNER_EMAIL] = { ...stored, role: "agency-staff" };
    });
    const response = await externalAiPost(externalAiCreateRequest(staleCookie));
    assert.equal(response.status, 403);
  });
});

describe("central session revocation — requireRole() paths inherit the boundary", () => {
  it("a fresh owner cookie passes requireRole (control)", async () => {
    const response = await withSession(ownerToken(), () => notepadPost(notepadCreateRequest()));
    assert.equal(response.status, 201);
  });

  it("downgrade revokes the old cookie at a requireRole mutation", async () => {
    const staleCookie = ownerToken();
    updateUser(OWNER_EMAIL, { role: "agency-staff" });
    const response = await withSession(staleCookie, () => notepadPost(notepadCreateRequest()));
    assert.equal(response.status, 401, "requireSession sees no session at all");
  });

  it("password rotation revokes the old cookie at the team-management surface", async () => {
    const staleCookie = ownerToken();
    assert.equal(setUserPassword(OWNER_EMAIL, "An3wSecure!Password"), true);
    const response = await withSession(staleCookie, () => agencyUsersGet());
    assert.equal(response.status, 401);
  });

  it("account deletion revokes the old cookie at the team-management surface", async () => {
    const staleCookie = ownerToken();
    mutate(state => { delete state.users[OWNER_EMAIL]; });
    const response = await withSession(staleCookie, () => agencyUsersGet());
    assert.equal(response.status, 401);
  });

  it("a cookie whose active agency left the user's live membership is refused", async () => {
    const foreign = issueSession({
      userId: OWNER_ID,
      email: OWNER_EMAIL,
      role: "agency-owner",
      agencyId: "some-other-agency",
      agencyIds: [AGENCY_ID, "some-other-agency"],
      activeAgencyId: "some-other-agency",
      sessionRev: 0,
    });
    const response = await withSession(foreign, () => agencyUsersGet());
    assert.equal(response.status, 401);
  });
});

describe("resolveFreshSessionUser — anchoring semantics", () => {
  function sandboxSession(sessionRev: number, returnAgencyId = AGENCY_ID): SessionPayload {
    const token = issueSession({
      userId: "sandbox-persona-user",
      email: "persona@revocation-co.test",
      role: "agency-staff",
      agencyId: AGENCY_ID,
      agencyIds: [AGENCY_ID],
      activeAgencyId: AGENCY_ID,
      isDemo: true,
      sandbox: {
        realmId: "sandbox-demo-revocation",
        dataset: "demo",
        access: "read-only",
        persona: "staff",
        returnUserId: OWNER_ID,
        returnAgencyId,
        enteredAt: 1,
      },
      sessionRev,
    });
    const session = verifyToken(token);
    assert.ok(session);
    return session;
  }

  it("a sandbox session anchors freshness to the LIVE account, not the persona", async () => {
    assert.ok(await resolveFreshSessionUser(sandboxSession(0)), "fresh anchor passes");
    assert.ok(rotateUserSession(OWNER_ID));
    assert.equal(await resolveFreshSessionUser(sandboxSession(0)), null,
      "rotating the live anchor kills the old sandbox cookie");
  });

  it("a sandbox session dies when its live anchor loses workspace membership", async () => {
    assert.equal(
      await resolveFreshSessionUser(sandboxSession(0, "an-agency-the-owner-left")),
      null,
    );
  });

  it("a sandbox session dies when its live anchor is deleted", async () => {
    mutate(state => { delete state.users[OWNER_EMAIL]; });
    assert.equal(await resolveFreshSessionUser(sandboxSession(0)), null);
  });

  it("a fenced demo/dev session skips the live-membership check but not existence or rotation", async () => {
    const devModeStyle = verifyToken(issueSession({
      userId: OWNER_ID,
      email: OWNER_EMAIL,
      role: "agency-owner",
      agencyId: "demo-agency",
      agencyIds: ["demo-agency"],
      activeAgencyId: "demo-agency",
      isDemo: true,
      devReturnAgencyId: AGENCY_ID,
      sessionRev: 0,
    }));
    assert.ok(devModeStyle);
    assert.ok(await resolveFreshSessionUser(devModeStyle),
      "the fenced demo tenant is deliberately outside live membership");
    assert.ok(rotateUserSession(OWNER_ID));
    assert.equal(await resolveFreshSessionUser(devModeStyle), null,
      "rotation still revokes a demo-tenant session");
  });

  it("a public showcase visitor is validated inside its fixture realm — deletion revokes", async () => {
    const visitor = owner({
      id: "showcase-visitor-id",
      email: "visitor@showcase.test",
      role: "agency-owner",
    });
    await replaceDataRealmState(SHOWCASE_REALM_ID, stateFor(visitor));
    const showcaseSession = verifyToken(issueSession({
      userId: visitor.id,
      email: visitor.email,
      role: "agency-owner",
      agencyId: AGENCY_ID,
      agencyIds: [AGENCY_ID],
      activeAgencyId: AGENCY_ID,
      isDemo: true,
      publicShowcase: true,
      sandbox: {
        realmId: SHOWCASE_REALM_ID,
        dataset: "demo",
        access: "read-only",
        persona: "owner",
        returnUserId: visitor.id,
        returnAgencyId: AGENCY_ID,
        enteredAt: 1,
      },
      sessionRev: 0,
    }));
    assert.ok(showcaseSession);
    assert.ok(await resolveFreshSessionUser(showcaseSession), "an existing visitor passes");
    await replaceDataRealmState(SHOWCASE_REALM_ID, stateFor(owner({
      id: "a-different-visitor",
      email: "other@showcase.test",
    })));
    assert.equal(await resolveFreshSessionUser(showcaseSession), null,
      "a reset fixture realm revokes the old visitor cookie");
  });
});
