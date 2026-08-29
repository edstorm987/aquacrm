// The Update button, end to end through the real route.
//
// The engine is pinned in `smoke-client-portal-template-update`. This drives the
// actual handler a browser would call, because the parts that go wrong at a
// boundary are the ones a pure function cannot show: who is allowed to press
// it, what gets written, and what stays untouched.
//
// The rule being enforced, from Ed: an update is an OFFER with its changes and
// conflicts visible; a client left on an older version is a supported state.
//
// Deliberately checked here:
//   • `update-plan` writes NOTHING — it is a question, not an action.
//   • `update-apply` writes the DRAFT only. A client's LIVE portal never changes
//     until somebody publishes, exactly like every other edit in this codebase.
//   • a declined conflict keeps the client's own value.
//   • declining everything does not quietly mark them caught up.

import { withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_STORAGE_BACKEND ??= "memory";
process.env.PORTAL_SESSION_SECRET ??= "portal-update-route-secret";

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";

import { POST as designPost } from "../src/app/api/portal/client-portal-design/route";
import {
  ensureClientPortalInstance,
  ensureStunningPortalTemplate,
  getClientPortalInstance,
  publishPortalDesign,
  savePortalDesignDraft,
} from "../src/server/clientPortalDesigns";
import { issueSession, SESSION_COOKIE_NAME } from "../src/lib/server/auth/auth";
import { createAgency, createClient } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import { flushPendingWrites, reset } from "../src/server/storage";

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function fixture() {
  await reset();
  const agency = createAgency({ name: "Template agency", slug: `template-agency-${Date.now()}` });
  const owner = createUser({
    email: `owner-${agency.id}@template.test`,
    name: "Ed",
    role: "agency-owner",
    agencyId: agency.id,
    password: "owner-test-password",
  });
  const staff = createUser({
    email: `staff-${agency.id}@template.test`,
    name: "Staff",
    role: "agency-staff",
    agencyId: agency.id,
    password: "staff-test-password",
  });
  const client = createClient(agency.id, { name: "Bright Coffee", stage: "live" });

  const template = ensureStunningPortalTemplate(agency.id, owner.id);
  const instance = ensureClientPortalInstance({
    agencyId: agency.id,
    clientId: client.id,
    actorUserId: owner.id,
  });
  await flushPendingWrites();

  const tokenFor = (user: { id: string; email: string; role: string; sessionRev?: number }) => issueSession({
    userId: user.id,
    email: user.email,
    role: user.role as never,
    agencyId: agency.id,
    agencyIds: [agency.id],
    activeAgencyId: agency.id,
    sessionRev: user.sessionRev ?? 0,
  });

  return {
    agency,
    owner,
    staff,
    client,
    template,
    instance,
    ownerToken: tokenFor(owner),
    staffToken: tokenFor(staff),
  };
}

/** Move the template on, so there is genuinely something to offer. */
function advanceTemplate(home: Fixture, serviceLabel: string) {
  const current = home.template;
  savePortalDesignDraft({
    agencyId: home.agency.id,
    scope: "template",
    recordId: current.id,
    document: { ...current.published, chrome: { ...current.published.chrome, serviceLabel } },
    actorUserId: home.owner.id,
  });
  return publishPortalDesign({
    agencyId: home.agency.id,
    scope: "template",
    recordId: current.id,
    actorUserId: home.owner.id,
    label: serviceLabel,
  });
}

/**
 * Both halves of this handler's authentication have to be satisfied, and they
 * read from different places: `agencySession` takes the cookie off the
 * NextRequest, while the element check goes through `getSession()` → `cookies()`
 * and needs a real request scope. So: cookie header AND `withSession`.
 */
function post(token: string, body: unknown) {
  return withSession(token, () => designPost(new NextRequest("http://localhost/api/portal/client-portal-design", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
    },
    body: JSON.stringify(body),
  })));
}

let home: Fixture;
beforeEach(async () => { home = await fixture(); });

describe("update-plan — a question, not an action", () => {
  it("offers the template's change and writes nothing", async () => {
    advanceTemplate(home, "Your website");
    const before = JSON.stringify(getClientPortalInstance(home.agency.id, home.client.id));

    const response = await post(home.ownerToken, {
      action: "update-plan",
      scope: "client",
      clientId: home.client.id,
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { ok: boolean; plan?: { changes: { path: string }[] }; summary?: string };

    assert.equal(body.ok, true);
    // The real template normalises its builder pages when it publishes, so the
    // label is one change among several rather than the only one. What matters
    // is that the edit made above is genuinely offered.
    const paths = body.plan?.changes.map(change => change.path) ?? [];
    assert.ok(paths.includes("chrome.serviceLabel"), `expected the label change, got ${paths.join(", ")}`);
    assert.match(String(body.summary), /changes? available/);
    assert.equal(
      JSON.stringify(getClientPortalInstance(home.agency.id, home.client.id)),
      before,
      "asking what would happen must change nothing",
    );
  });

  it("says the client is current when the template has not moved", async () => {
    const response = await post(home.ownerToken, {
      action: "update-plan",
      scope: "client",
      clientId: home.client.id,
    });
    const body = await response.json() as { plan?: { upToDate: boolean }; summary?: string };
    assert.equal(body.plan?.upToDate, true);
    assert.equal(body.summary, "On the current version.");
  });
});

describe("update-apply — only what was accepted, and only to the draft", () => {
  it("applies the accepted change to the DRAFT and leaves the live portal alone", async () => {
    advanceTemplate(home, "Your website");
    const livePortalBefore = getClientPortalInstance(home.agency.id, home.client.id)?.published;

    const response = await post(home.ownerToken, {
      action: "update-apply",
      scope: "client",
      clientId: home.client.id,
      accept: ["chrome.serviceLabel"],
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { accepted: string[]; versionPinAdvanced: boolean };
    assert.deepEqual(body.accepted, ["chrome.serviceLabel"]);
    assert.equal(body.versionPinAdvanced, true);

    const after = getClientPortalInstance(home.agency.id, home.client.id);
    assert.equal(after?.draft.chrome.serviceLabel, "Your website", "the draft carries the update");
    assert.deepEqual(
      after?.published,
      livePortalBefore,
      "the client's LIVE portal is untouched until somebody publishes",
    );
  });

  it("keeps the client's own value when the conflicting change is declined", async () => {
    // The client picked their own wording first.
    savePortalDesignDraft({
      agencyId: home.agency.id,
      scope: "client",
      recordId: home.instance.id,
      document: { ...home.instance.published, chrome: { ...home.instance.published.chrome, serviceLabel: "Our build" } },
      actorUserId: home.owner.id,
    });
    publishPortalDesign({
      agencyId: home.agency.id,
      scope: "client",
      recordId: home.instance.id,
      actorUserId: home.owner.id,
    });
    advanceTemplate(home, "Your website");

    const planned = await post(home.ownerToken, {
      action: "update-plan", scope: "client", clientId: home.client.id,
    });
    const planBody = await planned.json() as { plan: { conflicts: { path: string }[] } };
    assert.ok(
      planBody.plan.conflicts.some(conflict => conflict.path === "chrome.serviceLabel"),
      "both sides moved that label, so it must be reported as a conflict",
    );

    // Decline it.
    const response = await post(home.ownerToken, {
      action: "update-apply", scope: "client", clientId: home.client.id, accept: [],
    });
    const body = await response.json() as { accepted: string[]; declined: string[]; versionPinAdvanced: boolean };

    assert.deepEqual(body.accepted, []);
    assert.ok(body.declined.includes("chrome.serviceLabel"), "the conflict was declined");
    assert.equal(body.versionPinAdvanced, false, "declining everything leaves them legacy on purpose");

    const after = getClientPortalInstance(home.agency.id, home.client.id);
    assert.equal(after?.draft.chrome.serviceLabel, "Our build", "their wording survived");
    assert.equal(after?.templateVersionId, home.instance.templateVersionId, "and the pin did not move");
  });

  it("advances the pin so the same change is not offered forever", async () => {
    advanceTemplate(home, "Your website");
    await post(home.ownerToken, {
      action: "update-apply", scope: "client", clientId: home.client.id, accept: ["chrome.serviceLabel"],
    });

    const planned = await post(home.ownerToken, {
      action: "update-plan", scope: "client", clientId: home.client.id,
    });
    const body = await planned.json() as { plan: { upToDate: boolean } };
    assert.equal(body.plan.upToDate, true, "once resolved, the offer is gone");
  });
});

describe("who may press it", () => {
  it("refuses a non-manager identity outright", async () => {
    advanceTemplate(home, "Your website");
    const response = await post(home.staffToken, {
      action: "update-apply", scope: "client", clientId: home.client.id, accept: ["chrome.serviceLabel"],
    });
    assert.equal(response.status, 403, "changing a live client's portal is manager work");
    assert.notEqual(
      getClientPortalInstance(home.agency.id, home.client.id)?.draft.chrome.serviceLabel,
      "Your website",
      "and nothing was written",
    );
  });

  it("requires a client — a template alone has nothing to update", async () => {
    const response = await post(home.ownerToken, { action: "update-plan", scope: "template" });
    assert.equal(response.status, 400);
  });
});

describe("the Fulfilment list of who is on which version", () => {
  it("reports every client's offer without changing anything", async () => {
    const { listClientPortalUpdateOffers } = await import("../src/server/clientPortalDesigns");

    const before = JSON.stringify(getClientPortalInstance(home.agency.id, home.client.id));
    const current = listClientPortalUpdateOffers(home.agency.id);
    assert.equal(current.length, 1);
    assert.equal(current[0]?.clientId, home.client.id);
    assert.equal(current[0]?.onCurrentVersion, true);
    assert.equal(current[0]?.summary, "On the current version.");

    advanceTemplate(home, "Your website");
    const behind = listClientPortalUpdateOffers(home.agency.id);
    assert.equal(behind[0]?.onCurrentVersion, false);
    assert.ok(behind[0]!.changeCount > 0, "there is something to offer");
    assert.match(behind[0]!.summary, /changes? available/);
    assert.equal(behind[0]?.baseKnown, true);

    assert.equal(
      JSON.stringify(getClientPortalInstance(home.agency.id, home.client.id)),
      before,
      "listing offers must never write",
    );
  });

  it("says nothing pejorative about a client left behind on purpose", async () => {
    const { listClientPortalUpdateOffers } = await import("../src/server/clientPortalDesigns");
    advanceTemplate(home, "Your website");
    const [offer] = listClientPortalUpdateOffers(home.agency.id);

    // Ed's rule: legacy is a supported state. The summary describes what is on
    // offer; it must not scold.
    for (const word of ["outdated", "out of date", "stale", "behind", "must", "should"]) {
      assert.ok(
        !offer!.summary.toLowerCase().includes(word),
        `the summary should not say "${word}": ${offer!.summary}`,
      );
    }
  });
});
