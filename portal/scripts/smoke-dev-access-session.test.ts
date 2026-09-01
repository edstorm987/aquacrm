import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { withSession } from "./dev-console-request-scope";

import { GET as enterDev } from "../src/app/dev/route";
import { localDevDestination } from "../src/lib/server/dev/localDevDestination";
import { GET as getAccessGrants } from "../src/app/api/portal/access/grants/route";
import { GET as getAccessRequests } from "../src/app/api/portal/access/requests/route";
import { GET as getAccessTemplates } from "../src/app/api/portal/access/templates/route";
import { issueSession, SESSION_COOKIE_NAME, verifyToken } from "../src/lib/server/auth/auth";
import {
  LIVE_DATA_REALM_ID,
  createEmptyPortalState,
  mutate,
  replaceDataRealmState,
  runInDataRealm,
} from "../src/server/storage";
import type { PortalState, ServerUser } from "../src/server/types";

const AGENCY_ID = "bare-co";
const OWNER_ID = "dev-access-owner";
const OWNER_EMAIL = "dev-owner@bare-co.test";
const SANDBOX_REALM_ID = "sandbox-dev-access-regression";

function owner(sessionRev: number, accessRev: number): ServerUser {
  return {
    id: OWNER_ID,
    email: OWNER_EMAIL,
    name: "Dev Owner",
    passwordHash: "test-only",
    role: "agency-owner",
    agencyId: AGENCY_ID,
    agencyIds: [AGENCY_ID],
    sessionRev,
    accessRev,
    createdAt: 1,
    updatedAt: 1,
  };
}

function stateFor(subject: ServerUser): PortalState {
  const state = createEmptyPortalState();
  state.agencies[AGENCY_ID] = {
    id: AGENCY_ID,
    name: "Bare Co",
    slug: AGENCY_ID,
    brand: { primaryColor: "#000000" },
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  };
  state.users[subject.email] = subject;
  return state;
}

function responseCookie(response: Response): string | undefined {
  return (response as unknown as {
    cookies: { get(name: string): { value: string } | undefined };
  }).cookies.get(SESSION_COOKIE_NAME)?.value;
}

async function withBareDevMode<T>(operation: () => Promise<T>): Promise<T> {
  const saved = {
    dev: process.env.PORTAL_DEV_MODE,
    agency: process.env.PORTAL_DEV_AGENCY,
    node: process.env.NODE_ENV,
    vercel: process.env.VERCEL_ENV,
  };
  process.env.PORTAL_DEV_MODE = "true";
  delete process.env.PORTAL_DEV_AGENCY;
  if (process.env.NODE_ENV === "production") process.env.NODE_ENV = "test";
  delete process.env.VERCEL_ENV;
  try {
    return await operation();
  } finally {
    restore("PORTAL_DEV_MODE", saved.dev);
    restore("PORTAL_DEV_AGENCY", saved.agency);
    restore("NODE_ENV", saved.node);
    restore("VERCEL_ENV", saved.vercel);
  }
}

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(async () => {
  await replaceDataRealmState(LIVE_DATA_REALM_ID, stateFor(owner(5, 7)));
  await replaceDataRealmState(SANDBOX_REALM_ID, stateFor(owner(1, 2)));
});

describe("local /dev access-control session", () => {
  it("allows one-leading-slash local paths and rejects cross-origin redirect forms", () => {
    const requestUrl = "http://localhost/dev";
    const fallback = "/portal/agency/contacts";

    assert.equal(
      localDevDestination("/portal/team?view=active#today", fallback, requestUrl),
      "/portal/team?view=active#today",
    );
    assert.equal(localDevDestination("/", fallback, requestUrl), "/");

    for (const target of [
      "//evil.example/steal",
      "///evil.example/steal",
      "/\\evil.example/steal",
      "/folder\\evil.example/steal",
      "https://evil.example/steal",
      "portal/team",
      " /portal/team",
    ]) {
      assert.equal(
        localDevDestination(target, fallback, requestUrl),
        fallback,
        `${target} must not become a dev-mode redirect`,
      );
    }
  });

  it("mints from live authority even when the incoming browser cookie selects a sandbox realm", async () => {
    const incomingSandboxToken = issueSession({
      userId: OWNER_ID,
      email: OWNER_EMAIL,
      role: "agency-owner",
      agencyId: AGENCY_ID,
      agencyIds: [AGENCY_ID],
      activeAgencyId: AGENCY_ID,
      isDemo: true,
      sandbox: {
        realmId: SANDBOX_REALM_ID,
        dataset: "demo",
        access: "writable",
        persona: "owner",
        governor: true,
        returnUserId: OWNER_ID,
        returnAgencyId: AGENCY_ID,
        enteredAt: 1,
      },
      sessionRev: 1,
      accessRev: 2,
    });

    const entered = await withBareDevMode(() => withSession(
      incomingSandboxToken,
      () => enterDev(new Request("http://localhost/dev?to=/portal/agency/settings%23access")),
      { route: "/dev", host: "localhost" },
    ));
    assert.equal(entered.status, 303);
    const mintedToken = responseCookie(entered);
    assert.ok(mintedToken);
    const minted = verifyToken(mintedToken);
    assert.ok(minted);
    assert.equal(minted.sandbox, undefined, "the local entry cookie returns to the normal live realm");
    assert.equal(minted.sessionRev, 5, "session rotation is stamped from the live owner");
    assert.equal(minted.accessRev, 7, "the access-policy epoch is stamped from the live owner");

    const [templates, grants, requests] = await withSession(mintedToken, () => Promise.all([
      getAccessTemplates(),
      getAccessGrants(new Request("http://localhost/api/portal/access/grants")),
      getAccessRequests(new Request("http://localhost/api/portal/access/requests")),
    ]));
    assert.deepEqual(
      [templates.status, grants.status, requests.status],
      [200, 200, 200],
      "a freshly minted /dev owner can read every access-control collection",
    );

    await runInDataRealm(LIVE_DATA_REALM_ID, async () => {
      mutate(state => {
        const current = state.users[OWNER_EMAIL];
        assert.ok(current);
        current.accessRev = 8;
      });
    });
    const afterAccessRevision = await withSession(mintedToken, () => getAccessTemplates());
    assert.equal(
      afterAccessRevision.status,
      200,
      "accessRev invalidates policy caches but does not log out an otherwise current session",
    );

    await runInDataRealm(LIVE_DATA_REALM_ID, async () => {
      mutate(state => {
        const current = state.users[OWNER_EMAIL];
        assert.ok(current);
        current.sessionRev = 6;
      });
    });
    const afterSessionRotation = await withSession(mintedToken, () => getAccessTemplates());
    assert.equal(afterSessionRotation.status, 401, "a rotated session is still rejected");
    assert.equal(
      (await afterSessionRotation.json() as { error?: string }).error,
      "stale_session",
    );
  });
});
