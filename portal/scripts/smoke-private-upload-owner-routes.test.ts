import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { before, describe, it } from "node:test";

process.env.PORTAL_BACKEND = "memory";
process.env.PORTAL_SESSION_SECRET = "private-upload-owner-routes-secret";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

type Auth = typeof import("../src/lib/server/auth/auth");
type ClientRequestsRoute = typeof import("../src/app/api/tenants/client-requests/route");
type InboxMedia = typeof import("../src/lib/server/inbox/inboxMedia");
type Lifecycle = typeof import("../src/lib/server/privateObjectLifecycle");
type PortalStorage = typeof import("../src/server/storage");
type RequestScope = typeof import("./dev-console-request-scope");
type Tenants = typeof import("../src/server/tenants");
type Users = typeof import("../src/server/users");

let auth: Auth;
let clientRequestsRoute: ClientRequestsRoute;
let inboxMedia: InboxMedia;
let lifecycle: Lifecycle;
let portalStorage: PortalStorage;
let requestScope: RequestScope;
let tenants: Tenants;
let users: Users;

before(async () => {
  // Load this first: it installs Node's AsyncLocalStorage global before any
  // `next/headers` import evaluates (the ordering is intentionally pinned).
  requestScope = await import("./dev-console-request-scope");
  [auth, clientRequestsRoute, inboxMedia, lifecycle, portalStorage, tenants, users] = await Promise.all([
    import("../src/lib/server/auth/auth"),
    import("../src/app/api/tenants/client-requests/route"),
    import("../src/lib/server/inbox/inboxMedia"),
    import("../src/lib/server/privateObjectLifecycle"),
    import("../src/server/storage"),
    import("../src/server/tenants"),
    import("../src/server/users"),
  ]);
  await portalStorage.ensureHydrated();
});

async function stage(input: { agencyId: string; objectId: string; storageKey: string }) {
  const requestHash = lifecycle.privateObjectRequestHash([
    input.agencyId,
    "inbox-media",
    input.objectId,
    input.storageKey,
  ]);
  const stored = { storageProvider: "local" as const, storageKey: input.storageKey };
  await lifecycle.beginStagedPrivateUpload({
    agencyId: input.agencyId,
    purpose: "inbox-media",
    objectId: input.objectId,
    requestHash,
    planned: stored,
    localDirectory: "inbox-media",
  });
  await lifecycle.confirmStagedPrivateUpload({
    agencyId: input.agencyId,
    purpose: "inbox-media",
    objectId: input.objectId,
    requestHash,
    stored,
  });
  return stored;
}

function clientPatch(input: {
  clientId: string;
  requestId: string;
  reply?: string;
  attachments?: unknown;
}): Request {
  return new Request("http://localhost/api/tenants/client-requests", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

describe("private upload owner routes", () => {
  it("pins malformed, duplicate, exact-binding and definite-release guards in both routes", () => {
    for (const path of [
      "src/app/api/portal/website-enquiries/communications/route.ts",
      "src/app/api/tenants/client-requests/route.ts",
    ]) {
      const source = readFileSync(path, "utf8");
      assert.match(source, /body\?\.attachments !== undefined && !Array\.isArray\(body\.attachments\)/,
        `${path} must refuse a present non-array attachments payload`);
      const duplicateCheck = source.indexOf("new Set(storageIdentities).size !== storageIdentities.length");
      const claim = source.indexOf("await claimStagedPrivateUploadsForOwnership", duplicateCheck);
      assert.ok(duplicateCheck >= 0 && claim > duplicateCheck, `${path} must reject duplicate ids/provider keys before claiming`);
      assert.match(source, /storageProvider: payload\.storageProvider,[\s\S]*storageKey: payload\.storageKey/);
      assert.match(source, /expectedBindings: stagedBindings/);
      assert.match(source, /claimId: stagedClaimId/);
      assert.match(source, /releaseStagedPrivateUploadOwnershipClaim/);
    }

    const website = readFileSync("src/app/api/portal/website-enquiries/communications/route.ts", "utf8");
    assert.match(website, /privateObjectRequestHash\(\["website-enquiry-reply-owner", agencyId, deliveryEnquiry\.id, replyId\]\)/);
    assert.match(website, /if \(error instanceof WebsiteEnquiryOwnerRefusedError\) \{[\s\S]*releaseStagedPrivateUploadOwnershipClaim/);

    const client = readFileSync("src/app/api/tenants/client-requests/route.ts", "utf8");
    assert.match(client, /privateObjectRequestHash\(\["client-request-reply-owner", session\.agencyId, clientId, body\.requestId, attachmentOwnerId\]\)/);
    assert.match(client, /if \(ownerRefusal\) \{[\s\S]*releaseClientRequestStagedClaim\(stagedClaim!\)/);
    assert.match(client, /if \(error instanceof ProductWorkspaceBusyError\) \{[\s\S]*await releaseClientRequestStagedClaim\(stagedClaim\)[\s\S]*status: 409/,
      "a production ledger-lease refusal happens before the owner callback and must release the exact staged claim");
  });

  it("client replies refuse malformed, duplicate and forged tokens, then bind an exact upload to its reply", async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ownerEmail = `owner-${suffix}@example.test`;
    const agency = tenants.createAgency({ name: `Owner routes ${suffix}`, ownerEmail });
    const owner = users.createUser({
      email: ownerEmail,
      name: "Owner routes tester",
      password: "Private-upload-owner-routes-123!",
      role: "agency-owner",
      agencyId: agency.id,
    });
    const requestId = `req_owner_routes_${suffix}`;
    const client = tenants.createClient(agency.id, {
      name: `Owner route client ${suffix}`,
      ownerEmail: `client-${suffix}@example.test`,
      metadata: {
        clientRequests: [{
          id: requestId,
          type: "support-ticket",
          message: "Please inspect the attachment.",
          status: "open",
          submittedBy: `client-${suffix}@example.test`,
          submittedAt: Date.now(),
          replies: [],
        }],
      },
    });
    await portalStorage.flushPendingWrites();
    const session = auth.issueSession({
      userId: owner.id,
      email: owner.email,
      role: owner.role,
      agencyId: agency.id,
      agencyIds: [agency.id],
      activeAgencyId: agency.id,
      sessionRev: owner.sessionRev ?? 0,
    });
    const call = (attachments: unknown, reply: string) => requestScope.withSession(session, () =>
      clientRequestsRoute.PATCH(clientPatch({ clientId: client.id, requestId, reply, attachments })),
    { route: "/api/tenants/client-requests" });

    const malformed = await call({ token: "not-a-list" }, "Malformed attachment payload");
    assert.equal(malformed.status, 400);

    const duplicateObjectId = `ima_duplicate_${suffix}`;
    const duplicateStored = await stage({
      agencyId: agency.id,
      objectId: duplicateObjectId,
      storageKey: `${agency.id}/${client.id}:${requestId}/${duplicateObjectId}.pdf`,
    });
    const duplicateToken = inboxMedia.signInboxMediaToken({
      agencyId: agency.id,
      targetKind: "client",
      targetId: `${client.id}:${requestId}`,
      id: duplicateObjectId,
      name: "duplicate.pdf",
      size: 10,
      contentType: "application/pdf",
      kind: "file",
      ...duplicateStored,
    });
    const duplicate = await call([{ token: duplicateToken }, { token: duplicateToken }], "Duplicate attachment payload");
    assert.equal(duplicate.status, 400);
    assert.equal(Object.values(portalStorage.getState().privateObjectLifecycles)
      .find(record => record.agencyId === agency.id && record.objectId === duplicateObjectId)?.state, "uploading");

    const forgedObjectId = `ima_forged_${suffix}`;
    const forgedStored = await stage({
      agencyId: agency.id,
      objectId: forgedObjectId,
      storageKey: `${agency.id}/${client.id}:${requestId}/${forgedObjectId}.pdf`,
    });
    const forgedToken = inboxMedia.signInboxMediaToken({
      agencyId: agency.id,
      targetKind: "client",
      targetId: `${client.id}:${requestId}`,
      id: forgedObjectId,
      name: "forged.pdf",
      size: 11,
      contentType: "application/pdf",
      kind: "file",
      storageProvider: "supabase",
      storageKey: forgedStored.storageKey,
    });
    const forged = await call([{ token: forgedToken }], "Forged provider payload");
    assert.equal(forged.status, 409);
    assert.equal(Object.values(portalStorage.getState().privateObjectLifecycles)
      .find(record => record.agencyId === agency.id && record.objectId === forgedObjectId)?.state, "uploading");

    const exactObjectId = `ima_exact_${suffix}`;
    const exactStored = await stage({
      agencyId: agency.id,
      objectId: exactObjectId,
      storageKey: `${agency.id}/${client.id}:${requestId}/${exactObjectId}.pdf`,
    });
    const exactToken = inboxMedia.signInboxMediaToken({
      agencyId: agency.id,
      targetKind: "client",
      targetId: `${client.id}:${requestId}`,
      id: exactObjectId,
      name: "exact.pdf",
      size: 12,
      contentType: "application/pdf",
      kind: "file",
      ...exactStored,
    });
    const accepted = await call([{ token: exactToken }], "Exact provider payload");
    const acceptedBody = await accepted.json() as {
      ok?: boolean;
      request?: { replies?: Array<{ id: string; attachments?: Array<{ id: string }> }> };
    };
    assert.equal(accepted.status, 200, JSON.stringify(acceptedBody));
    assert.equal(acceptedBody.ok, true);
    const reply = acceptedBody.request?.replies?.at(-1);
    assert.ok(reply);
    assert.equal(reply.attachments?.[0]?.id, exactObjectId);
    const lifecycleRecord = Object.values(portalStorage.getState().privateObjectLifecycles)
      .find(record => record.agencyId === agency.id && record.objectId === exactObjectId);
    assert.equal(lifecycleRecord?.state, "ready");
    assert.equal(lifecycleRecord?.ownerId, reply.id);
    assert.equal(lifecycleRecord?.claimId, lifecycle.privateObjectRequestHash([
      "client-request-reply-owner",
      agency.id,
      client.id,
      requestId,
      reply.id,
    ]));
  });
});
