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

import { GET as designGet, POST as designPost } from "../src/app/api/portal/client-portal-design/route";
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
import { flushPendingWrites, getState, mutate, reset } from "../src/server/storage";
import type { WorkspaceElementLevel } from "../src/lib/server/access/workspaceElementAccess";
import { sampleClientId } from "../src/lib/server/clients/samplePreviewClient";

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
  const manager = createUser({
    email: `manager-${agency.id}@template.test`,
    name: "Manager",
    role: "agency-manager",
    agencyId: agency.id,
    password: "manager-test-password",
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
    manager,
    staff,
    client,
    template,
    instance,
    ownerToken: tokenFor(owner),
    managerToken: tokenFor(manager),
    staffToken: tokenFor(staff),
  };
}

async function setStaffPortalLevel(home: Fixture, level: WorkspaceElementLevel) {
  mutate(state => {
    state.accessGrants.staffPortal = {
      id: "staffPortal",
      agencyId: home.agency.id,
      userId: home.staff.id,
      scope: { kind: "workspace", id: "fulfilment" },
      environment: "live",
      capabilities: level === "hidden"
        ? ["workspace.view"]
        : [`element.fulfilment.portals.${level}`],
      createdBy: home.owner.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  });
  await flushPendingWrites();
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

function get(token: string, query: { scope: "client" | "template"; clientId?: string; templateId?: string }) {
  const url = new URL("http://localhost/api/portal/client-portal-design");
  url.searchParams.set("scope", query.scope);
  if (query.clientId) url.searchParams.set("clientId", query.clientId);
  if (query.templateId) url.searchParams.set("templateId", query.templateId);
  return withSession(token, () => designGet(new NextRequest(url, {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
  })));
}

async function saveAndPublish(token: string, label: string) {
  const document = {
    ...home.instance.draft,
    chrome: { ...home.instance.draft.chrome, serviceLabel: label },
  };
  const saved = await post(token, {
    action: "save-draft",
    scope: "client",
    clientId: home.client.id,
    recordId: home.instance.id,
    document,
  });
  assert.equal(saved.status, 200, `save-draft was refused for ${label}`);
  const published = await post(token, {
    action: "publish",
    scope: "client",
    clientId: home.client.id,
    recordId: home.instance.id,
  });
  assert.equal(published.status, 200, `publish was refused for ${label}`);
  assert.equal(getClientPortalInstance(home.agency.id, home.client.id)?.published.chrome.serviceLabel, label);
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
  it("lets staff with Portals View load and inspect, but refuses every write", async () => {
    await setStaffPortalLevel(home, "view");
    advanceTemplate(home, "Your website");

    const loaded = await get(home.staffToken, { scope: "client", clientId: home.client.id });
    assert.equal(loaded.status, 200, "the read API drifted from the visible Portals surface");

    const planned = await post(home.staffToken, {
      action: "update-plan", scope: "client", clientId: home.client.id,
    });
    assert.equal(planned.status, 200, "the Portals read-only control must reach its read-only API");
    assert.equal((await planned.json() as { ok?: boolean }).ok, true);

    const applied = await post(home.staffToken, {
      action: "update-apply", scope: "client", clientId: home.client.id, accept: ["chrome.serviceLabel"],
    });
    assert.equal(applied.status, 403, "View must not grant a portal mutation");

    const saved = await post(home.staffToken, {
      action: "save-draft",
      scope: "client",
      clientId: home.client.id,
      recordId: home.instance.id,
      document: home.instance.draft,
    });
    assert.equal(saved.status, 403, "View must not grant an editor save");
  });

  it("lets staff with current Portals Manage save and publish", async () => {
    await setStaffPortalLevel(home, "manage");
    await saveAndPublish(home.staffToken, "Staff-managed portal");
  });

  it("re-resolves a staff grant on every write instead of trusting an open editor", async () => {
    await setStaffPortalLevel(home, "manage");
    assert.equal((await get(home.staffToken, { scope: "client", clientId: home.client.id })).status, 200);

    await setStaffPortalLevel(home, "view");
    const response = await post(home.staffToken, {
      action: "save-draft",
      scope: "client",
      clientId: home.client.id,
      recordId: home.instance.id,
      document: home.instance.draft,
    });
    assert.equal(response.status, 403, "a downgraded grant kept mutation authority from an earlier load");
  });

  it("refuses staff whose canonical Portals element is Hidden", async () => {
    await setStaffPortalLevel(home, "hidden");
    advanceTemplate(home, "Your website");

    const loaded = await get(home.staffToken, { scope: "client", clientId: home.client.id });
    assert.equal(loaded.status, 403, "Hidden staff read a portal design");

    const planned = await post(home.staffToken, {
      action: "update-plan", scope: "client", clientId: home.client.id,
    });
    assert.equal(planned.status, 403, "Hidden staff inspected a portal update");

    const applied = await post(home.staffToken, {
      action: "update-apply", scope: "client", clientId: home.client.id, accept: ["chrome.serviceLabel"],
    });
    assert.equal(applied.status, 403, "Hidden staff changed a portal draft");
    assert.notEqual(
      getClientPortalInstance(home.agency.id, home.client.id)?.draft.chrome.serviceLabel,
      "Your website",
      "and nothing was written",
    );
  });

  it("keeps owner and manager save/publish behavior unchanged", async () => {
    await saveAndPublish(home.ownerToken, "Owner portal");
    await saveAndPublish(home.managerToken, "Manager portal");
  });

  it("keeps a staff manager inside the exact tenant/client boundary", async () => {
    await setStaffPortalLevel(home, "manage");
    const foreignAgency = createAgency({ name: "Foreign portal agency" });
    const foreignClient = createClient(foreignAgency.id, { name: "Foreign client", stage: "live" });
    const response = await post(home.staffToken, {
      action: "save-draft",
      scope: "client",
      clientId: foreignClient.id,
      recordId: home.instance.id,
      document: home.instance.draft,
    });
    assert.equal(response.status, 403, "Portals Manage crossed the signed tenant boundary");
  });

  it("requires a client — a template alone has nothing to update", async () => {
    const response = await post(home.ownerToken, { action: "update-plan", scope: "template" });
    assert.equal(response.status, 400);
  });

  it("loads the sample through template scope, then refuses every client write", async () => {
    const sampleId = sampleClientId(home.agency.id);
    const clientsBefore = Object.keys(getState().clients).length;
    const instancesBefore = Object.keys(getState().clientPortalInstances).length;

    // This is the exact request shape the corrected DevEditor produces: the
    // sample still supplies preview data, while the design record is the real
    // agency template. It must be a clean 200 rather than the old client 404.
    const loaded = await get(home.ownerToken, {
      scope: "template",
      clientId: sampleId,
      templateId: home.template.id,
    });
    assert.equal(loaded.status, 200);
    assert.equal((await loaded.json() as { record?: { id: string } }).record?.id, home.template.id);
    assert.equal(Object.keys(getState().clients).length, clientsBefore);
    assert.equal(Object.keys(getState().clientPortalInstances).length, instancesBefore);

    const response = await post(home.ownerToken, {
      action: "save-draft",
      scope: "client",
      clientId: sampleId,
      recordId: `${home.agency.id}:${sampleId}`,
      document: home.instance.draft,
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { ok: false, error: "sample preview is read-only" });
    assert.equal(Object.keys(getState().clients).length, clientsBefore,
      "the route turned the preview fixture into a business client");
    assert.equal(Object.keys(getState().clientPortalInstances).length, instancesBefore,
      "the route persisted a portal instance for the preview fixture");
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
