import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.PORTAL_BACKEND = "postgres";
process.env.PORTAL_SESSION_SECRET = "postgres-private-object-reentrancy-secret";

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

let blob: string | null = null;
let leaseHolder: string | null = null;
let leaseAttempts = 0;
let leaseClaims = 0;
let leaseConflicts = 0;
let leaseReleases = 0;
const leaseKeys: string[] = [];

const postgresPath = req.resolve("../src/server/storagePostgres");
req.cache[postgresPath] = {
  id: postgresPath,
  filename: postgresPath,
  loaded: true,
  paths: [],
  children: [],
  exports: {
    __esModule: true,
    loadBlob: async () => blob,
    saveBlob: async (content: string) => { blob = content; },
    applyDevTeamWorkspaceFiles: async () => { throw new Error("unexpected_dev_team_workspace_write"); },
    claimProductWorkspaceLease: async (key: string, holder: string, leaseMs: number) => {
      leaseAttempts += 1;
      leaseKeys.push(key);
      if (leaseHolder && leaseHolder !== holder) {
        leaseConflicts += 1;
        throw new Error("postgres_lock_reacquired_by_different_holder");
      }
      leaseHolder = holder;
      leaseClaims += 1;
      return { state: "claimed", leaseExpiresAt: Date.now() + leaseMs };
    },
    releaseProductWorkspaceLease: async (_key: string, holder: string) => {
      if (leaseHolder !== holder) throw new Error("postgres_lock_released_by_non_holder");
      leaseHolder = null;
      leaseReleases += 1;
    },
  },
} as never;

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Users = typeof import("../src/server/users");
type Auth = typeof import("../src/lib/server/auth/auth");
type Lifecycle = typeof import("../src/lib/server/privateObjectLifecycle");
type InboxMedia = typeof import("../src/lib/server/inbox/inboxMedia");
type ClientRequestsRoute = typeof import("../src/app/api/tenants/client-requests/route");
type Coordinator = typeof import("../src/server/productWorkspaceCoordinator");
type RequestScope = typeof import("./dev-console-request-scope");

let storage: Storage;
let tenants: Tenants;
let users: Users;
let auth: Auth;
let lifecycle: Lifecycle;
let inboxMedia: InboxMedia;
let clientRequestsRoute: ClientRequestsRoute;
let coordinator: Coordinator;
let requestScope: RequestScope;

before(async () => {
  requestScope = await import("./dev-console-request-scope");
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  users = await import("../src/server/users");
  auth = await import("../src/lib/server/auth/auth");
  lifecycle = await import("../src/lib/server/privateObjectLifecycle");
  inboxMedia = await import("../src/lib/server/inbox/inboxMedia");
  clientRequestsRoute = await import("../src/app/api/tenants/client-requests/route");
  coordinator = await import("../src/server/productWorkspaceCoordinator");
  await storage.ensureHydrated();
  assert.equal(storage.getBackendInfo().kind, "postgres");
});

function resetLeaseMetrics(): void {
  leaseAttempts = 0;
  leaseClaims = 0;
  leaseConflicts = 0;
  leaseReleases = 0;
  leaseKeys.length = 0;
}

test("Postgres client-request attachment commit reuses its active whole-state lease", async () => {
  const ownerEmail = "postgres-owner@example.test";
  const agency = tenants.createAgency({ name: "Postgres attachment agency", ownerEmail });
  const owner = users.createUser({
    email: ownerEmail,
    name: "Postgres owner",
    password: "Postgres-private-object-123!",
    role: "agency-owner",
    agencyId: agency.id,
  });
  const requestId = "req_postgres_attachment";
  const client = tenants.createClient(agency.id, {
    name: "Postgres attachment client",
    ownerEmail: "client@example.test",
    metadata: {
      clientRequests: [{
        id: requestId,
        type: "support-ticket",
        message: "Please review the attached proof.",
        status: "open",
        submittedBy: "client@example.test",
        submittedAt: Date.now(),
        replies: [],
      }],
    },
  });
  await storage.flushPendingWrites();

  const objectId = "ima_postgres_reentrant";
  const storageKey = `${agency.id}/${client.id}:${requestId}/${objectId}-proof.pdf`;
  const requestHash = lifecycle.privateObjectRequestHash([
    agency.id,
    "inbox-media",
    objectId,
    storageKey,
  ]);
  const stored = { storageProvider: "local" as const, storageKey };
  await lifecycle.beginStagedPrivateUpload({
    agencyId: agency.id,
    purpose: "inbox-media",
    objectId,
    requestHash,
    planned: stored,
    localDirectory: "inbox-media",
  });
  await lifecycle.confirmStagedPrivateUpload({
    agencyId: agency.id,
    purpose: "inbox-media",
    objectId,
    requestHash,
    stored,
  });

  const token = inboxMedia.signInboxMediaToken({
    agencyId: agency.id,
    targetKind: "client",
    targetId: `${client.id}:${requestId}`,
    id: objectId,
    name: "proof.pdf",
    size: 4,
    contentType: "application/pdf",
    kind: "file",
    ...stored,
  });
  const session = auth.issueSession({
    userId: owner.id,
    email: owner.email,
    role: owner.role,
    agencyId: agency.id,
    agencyIds: [agency.id],
    activeAgencyId: agency.id,
    sessionRev: owner.sessionRev ?? 0,
  });

  resetLeaseMetrics();
  const response = await requestScope.withSession(session, () => clientRequestsRoute.PATCH(new Request(
    "http://localhost/api/tenants/client-requests",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: client.id,
        requestId,
        reply: "Attached proof for review.",
        attachments: [{ token }],
      }),
    },
  )), { route: "/api/tenants/client-requests" });
  const payload = await response.json() as {
    ok?: boolean;
    error?: string;
    request?: { replies?: Array<{ id: string; attachments?: Array<{ id: string }> }> };
  };

  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.ok, true);
  assert.equal(leaseConflicts, 0, "the nested client ledger must not reacquire the active Postgres lease");
  assert.equal(leaseAttempts, 2, "claim and commit are separate transactions; the nested owner write must compose");
  assert.equal(leaseClaims, 2);
  assert.equal(leaseReleases, 2);
  assert.deepEqual(new Set(leaseKeys), new Set(["portal-state-coordinated-write"]));
  assert.equal(leaseHolder, null);

  const reply = payload.request?.replies?.at(-1);
  assert.ok(reply);
  assert.equal(reply.attachments?.[0]?.id, objectId);
  const savedClient = tenants.getClientForAgency(agency.id, client.id);
  const savedRequests = savedClient?.metadata.clientRequests as Array<{ id: string; replies?: Array<{ id: string; attachments?: Array<{ id: string }> }> }>;
  assert.equal(savedRequests.find(item => item.id === requestId)?.replies?.at(-1)?.attachments?.[0]?.id, objectId);
  const lifecycleRecord = Object.values(storage.getState().privateObjectLifecycles)
    .find(record => record.objectId === objectId);
  assert.equal(lifecycleRecord?.state, "ready");
  assert.equal(lifecycleRecord?.ownerId, reply.id);
});

test("independent Postgres transactions still contend for the whole-state lease", async () => {
  resetLeaseMetrics();
  let enterFirst!: () => void;
  let releaseFirst!: () => void;
  const firstEntered = new Promise<void>(resolve => { enterFirst = resolve; });
  const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
  const first = coordinator.withPortalStateTransaction("independent-one", async () => {
    enterFirst();
    await firstGate;
  });
  await firstEntered;

  try {
    await assert.rejects(
      coordinator.withPortalStateTransaction("independent-two", async () => undefined),
      /postgres_lock_reacquired_by_different_holder/,
    );
  } finally {
    releaseFirst();
    await first;
  }

  assert.equal(leaseAttempts, 2, "an independent caller must attempt its own durable acquisition");
  assert.equal(leaseClaims, 1);
  assert.equal(leaseConflicts, 1);
  assert.equal(leaseReleases, 1);
  assert.deepEqual(new Set(leaseKeys), new Set(["portal-state-coordinated-write"]));
  assert.equal(leaseHolder, null);
});

test("unawaited reentrant work cannot outlive the Postgres lease it inherited", async () => {
  resetLeaseMetrics();
  let enterNested!: () => void;
  let releaseNested!: () => void;
  const nestedEntered = new Promise<void>(resolve => { enterNested = resolve; });
  const nestedGate = new Promise<void>(resolve => { releaseNested = resolve; });
  let outerSettled = false;
  const outer = coordinator.withPortalStateTransaction("escaped-outer", async () => {
    void coordinator.withPortalStateTransaction("escaped-inner", async () => {
      enterNested();
      await nestedGate;
    });
    await nestedEntered;
  });
  void outer.then(() => { outerSettled = true; });
  await nestedEntered;
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(leaseAttempts, 1, "same-call-chain work must reuse the one whole-state lease");
  assert.equal(outerSettled, false, "the lease owner must wait for escaped reentrant work");
  assert.notEqual(leaseHolder, null);

  releaseNested();
  await outer;
  assert.equal(outerSettled, true);
  assert.equal(leaseClaims, 1);
  assert.equal(leaseConflicts, 0);
  assert.equal(leaseReleases, 1);
  assert.equal(leaseHolder, null);
});
