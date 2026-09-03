import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { before, test } from "node:test";
import { withSession } from "./dev-console-request-scope";

const read = (path: string) => readFileSync(path, "utf8");

// `privateUploadStorage` is a server module; the tests below drive its real
// deletion boundary with injected providers, so `server-only` is neutralised
// exactly as the other server-module smokes do.
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

type Storage = typeof import("../src/lib/server/privateUploadStorage");
let storage: Storage;
type Lifecycle = typeof import("../src/lib/server/privateObjectLifecycle");
let lifecycle: Lifecycle;
type PortalStorage = typeof import("../src/server/storage");
type LegalDocuments = typeof import("../src/server/legalDocuments");
let portalStorage: PortalStorage;
let legalDocuments: LegalDocuments;
type ClientFileDeletion = typeof import("../src/lib/clients/clientFileDeletion");
let clientFileDeletion: ClientFileDeletion;
type ClientFileUploadTransaction = typeof import("../src/lib/clients/clientFileUploadTransaction");
let clientFileUploadTransaction: ClientFileUploadTransaction;
type CareerApplicationFailure = typeof import("../src/lib/public/careerApplicationFailure");
let careerApplicationFailure: CareerApplicationFailure;

const LOCAL_DIR = "private-upload-storage-smoke";
const localRoot = join(process.cwd(), ".data", LOCAL_DIR);

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/lib/server/privateUploadStorage");
  lifecycle = await import("../src/lib/server/privateObjectLifecycle");
  portalStorage = await import("../src/server/storage");
  legalDocuments = await import("../src/server/legalDocuments");
  clientFileDeletion = await import("../src/lib/clients/clientFileDeletion");
  clientFileUploadTransaction = await import("../src/lib/clients/clientFileUploadTransaction");
  careerApplicationFailure = await import("../src/lib/public/careerApplicationFailure");
  await portalStorage.ensureHydrated();
});

test("private uploads use one durable storage boundary", () => {
  const source = read("src/lib/server/privateUploadStorage.ts");
  assert.match(source, /access: "private"/);
  assert.match(source, /durablePrivateUploadsRequired/);
  assert.match(source, /NODE_ENV === "production"/);
  assert.match(source, /PrivateUploadStorageError/);
  assert.match(source, /\.data/);
});

test("every business upload route fails closed through the shared boundary", () => {
  for (const route of [
    "src/app/api/tenants/client-files/upload/route.ts",
    "src/app/api/portal/finance/expense-attachments/upload/route.ts",
    "src/app/api/portal/company/legal/upload/route.ts",
    "src/app/api/portal/sops/upload/route.ts",
    "src/app/api/portal/development/upload/route.ts",
    "src/app/api/portal/freelancer/work/route.ts",
    "src/app/api/public/careers/route.ts",
    "src/app/api/portal/website-enquiries/calls/recording/route.ts",
    "src/app/api/portal/inbox/media/route.ts",
    "src/app/api/portal/finance/expense-attachments/upload/route.ts",
    "src/app/api/portal/marketing/campaign-assets/upload/route.ts",
  ]) {
    const source = read(route);
    assert.match(source, /storePrivateUpload/);
    assert.match(source, /PrivateUploadStorageError/);
    assert.match(source, /503/);
    assert.doesNotMatch(source, /from "@vercel\/blob"/);
  }
});

test("browser-staged uploads checkpoint before storage, confirm the returned key, and have a scheduled sweeper", () => {
  for (const route of [
    "src/app/api/portal/inbox/media/route.ts",
    "src/app/api/portal/finance/expense-attachments/upload/route.ts",
    "src/app/api/portal/marketing/campaign-assets/upload/route.ts",
  ]) {
    const source = read(route);
    const begin = source.indexOf("await beginStagedPrivateUpload");
    const store = source.indexOf("await storePrivateUpload", begin);
    const confirm = source.indexOf("await confirmStagedPrivateUpload", store);
    assert.ok(begin >= 0 && store > begin && confirm > store, `${route} must persist intent before provider I/O and the exact key afterwards`);
    assert.match(source, /privateObjectRequestHash/);
  }
  const cron = read("src/app/api/cron/inbox/route.ts");
  assert.match(cron, /processPrivateObjectLifecycleSweep/);
  assert.ok(cron.indexOf("await flushPendingWrites();") < cron.indexOf("await processPrivateObjectLifecycleSweep()"),
    "the cron must flush its earlier work before the lifecycle coordinator rehydrates");
});

test("every staged owner claims before its durable write and commits ownership in the lifecycle lane", () => {
  const paths = [
    "src/app/api/portal/inbox/messages/route.ts",
    "src/app/api/portal/website-enquiries/communications/route.ts",
    "src/app/api/tenants/client-requests/route.ts",
  ];
  for (const path of paths) {
    const source = read(path);
    const claim = source.indexOf("await claimStagedPrivateUploadsForOwnership");
    const commit = source.indexOf("await commitStagedPrivateUploadOwnership", claim);
    assert.ok(claim >= 0 && commit > claim, `${path} must claim before entering the owner/finalisation lane`);
  }

  const finance = read("src/built-ins/modules/agency-finance/src/api/handlers.ts");
  for (const [startMarker, ownerMarker] of [
    ["export async function createExpenseHandler", "const value = await create()"],
    ["export async function updateExpenseHandler", "const value = await update()"],
  ]) {
    const start = finance.indexOf(startMarker);
    const end = finance.indexOf("\nexport async function ", start + startMarker.length);
    const source = finance.slice(start, end < 0 ? undefined : end);
    const claim = source.indexOf("await claimStagedPrivateUploadsForOwnership");
    const commit = source.indexOf("await commitStagedPrivateUploadOwnership", claim);
    const owner = source.indexOf(ownerMarker, commit);
    assert.ok(claim >= 0 && commit > claim && owner > commit, `${startMarker} must claim before the combined owner/finalisation transaction`);
  }

  const campaigns = read("src/built-ins/modules/leads-pipeline/src/api/handlers.ts");
  for (const [startMarker, ownerMarker] of [
    ["export async function createCampaignHandler", "const value = await create()"],
    ["export async function updateCampaignHandler", "const value = await update()"],
  ]) {
    const start = campaigns.indexOf(startMarker);
    const end = campaigns.indexOf("\nexport async function ", start + startMarker.length);
    const source = campaigns.slice(start, end < 0 ? undefined : end);
    const claim = source.indexOf("await claimStagedPrivateUploadsForOwnership");
    const commit = source.indexOf("await commitStagedPrivateUploadOwnership", claim);
    const owner = source.indexOf(ownerMarker, commit);
    assert.ok(claim >= 0 && commit > claim && owner > commit, `${startMarker} must claim before the combined owner/finalisation transaction`);
  }
  assert.match(read("src/app/api/portal/marketing/campaign-assets/upload/route.ts"), /asset:\s*{\s*id,/,
    "campaign upload responses must carry the lifecycle object id to their owner");
});

test("every upload that is final in one request compensates a failed owner write", () => {
  for (const route of [
    "src/app/api/tenants/client-files/upload/route.ts",
    "src/app/api/portal/company/legal/upload/route.ts",
    "src/app/api/portal/sops/upload/route.ts",
    "src/app/api/portal/development/upload/route.ts",
    "src/app/api/portal/freelancer/work/route.ts",
    "src/app/api/portal/website-enquiries/calls/recording/route.ts",
  ]) {
    const source = read(route);
    assert.match(source, /attachStoredPrivateUpload/, `${route} must compensate a binary when its final record cannot be attached`);
    assert.match(source, /upload_record_failed/);
    assert.match(source, /upload_orphaned/);
  }
});

test("state-backed final uploads flush and roll back inside the shared attach boundary", () => {
  for (const route of [
    "src/app/api/portal/company/legal/upload/route.ts",
    "src/app/api/portal/sops/upload/route.ts",
    "src/app/api/portal/development/upload/route.ts",
    "src/app/api/portal/freelancer/work/route.ts",
    "src/app/api/public/careers/route.ts",
  ]) {
    const source = read(route);
    assert.match(source, /persist: flushPendingWrites/, `${route} must flush before acknowledging the binary`);
    assert.match(source, /rollbackOwner:/, `${route} must remove the owner row before compensating a refused flush`);
  }
});

test("client upload correctness is rechecked after storage inside a fresh per-client transaction", () => {
  const route = read("src/app/api/tenants/client-files/upload/route.ts");
  const stored = route.indexOf("await storePrivateUpload");
  const transaction = route.indexOf("withClientMetadataLedgerTransaction", stored);
  const reread = route.indexOf("getClientForAgency(session.agencyId, clientId)", transaction);
  const recheck = route.indexOf("reconcileClientFileUpload(latestFiles, ref, replayInput)", reread);
  const merge = route.indexOf("metadata: { files: decision.files }", recheck);
  assert.ok(stored >= 0 && transaction > stored && reread > transaction && recheck > reread && merge > recheck,
    "binary storage must be followed by a locked fresh read, replay/conflict recheck, and latest-state merge");
  assert.match(route, /ledger: "files"/);
  assert.match(route, /losingDecision\.current = decision[\s\S]*throw new Error\(`workspace_upload_\$\{decision\.status\}`\)/);
  assert.match(route, /if \(losingDecision\.current\) return/);
  assert.match(route, /rollbackClientFileUpload\(latestFiles, ref\.id\)/);
  assert.doesNotMatch(route, /previousFiles|files: previousFiles/, "rollback must never restore a request-start array");
});

test("every delete path removes the binary through the shared boundary, not its own copy", () => {
  for (const route of [
    "src/app/api/tenants/client-files/route.ts",
    "src/app/api/portal/sops/route.ts",
    "src/app/api/portal/company/legal/route.ts",
    "src/app/api/portal/development/route.ts",
  ]) {
    const source = read(route);
    assert.match(source, /deletePrivate(?:Upload|ObjectWithRecovery)/, `${route} must delete through the shared boundary`);
    // The swallowed-provider-error pattern that reported a phantom deletion.
    assert.doesNotMatch(source, /\.catch\(\(\) => (?:false|undefined)\)/, `${route} must not swallow a provider delete error`);
    assert.doesNotMatch(source, /from "@vercel\/blob"/, `${route} must not hold a second provider copy`);
    assert.match(source, /storage_delete_failed/, `${route} must report a refused deletion instead of ok`);
  }
});

test("legal, SOP and Development deletion use durable recovery checkpoints", () => {
  for (const route of [
    "src/app/api/portal/sops/route.ts",
    "src/app/api/portal/company/legal/route.ts",
    "src/app/api/portal/development/route.ts",
  ]) {
    const source = read(route);
    assert.match(source, /deletePrivateObjectWithRecovery/, `${route} bypasses the durable deletion coordinator`);
    assert.match(source, /privateObjectRequestHash/, `${route} has no immutable retry intent`);
    assert.match(source, /storage_delete_failed/, `${route} does not expose a retryable provider refusal`);
  }
});

test("expired staged uploads are deleted from their durable predicted key", async () => {
  const agencyId = `agency_stage_${Date.now()}`;
  const objectId = "stage_one";
  const storageKey = `${agencyId}/stage-one.pdf`;
  const requestHash = lifecycle.privateObjectRequestHash([agencyId, objectId, storageKey]);
  await lifecycle.beginStagedPrivateUpload({
    agencyId,
    purpose: "expense-attachment",
    objectId,
    requestHash,
    planned: { storageProvider: "local", storageKey },
    localDirectory: LOCAL_DIR,
    now: 100,
    leaseMs: 10,
  });
  await lifecycle.confirmStagedPrivateUpload({
    agencyId,
    purpose: "expense-attachment",
    objectId,
    requestHash,
    stored: { storageProvider: "local", storageKey },
    now: 101,
  });
  let removed = "";
  const swept = await lifecycle.processPrivateObjectLifecycleSweep({
    now: 111,
    providers: { local: async path => { removed = path; } },
  });
  assert.equal(swept.cleaned, 1);
  assert.match(removed, /stage-one\.pdf$/);
  assert.equal(Object.values(portalStorage.getState().privateObjectLifecycles).some(record => record.objectId === objectId), false);
});

test("the scheduled sweep retries an expired failed owner deletion", async () => {
  const agencyId = `agency_delete_retry_${Date.now()}`;
  const objectId = "delete_retry_one";
  const storageKey = `${agencyId}/old-icon.png`;
  const requestHash = lifecycle.privateObjectRequestHash([agencyId, objectId, storageKey]);
  const failed = await lifecycle.deletePrivateObjectWithRecovery({
    agencyId,
    purpose: "saved-tool-icon-delete",
    objectId,
    requestHash,
    localDirectory: LOCAL_DIR,
    retryAfterMs: 10,
    now: () => 500,
    prepare: () => ({
      snapshot: { storageKey },
      storageProvider: "local",
      storageKey,
      metadata: { userId: "user_delete_retry", toolId: "tool_delete_retry" },
    }),
    providers: { local: async () => { throw new Error("temporary provider refusal"); } },
  });
  assert.equal(failed.ok, false);

  let removed = "";
  const swept = await lifecycle.processPrivateObjectLifecycleSweep({
    now: 511,
    providers: { local: async path => { removed = path; } },
  });
  assert.equal(swept.cleaned, 1);
  assert.match(removed, /old-icon\.png$/);
  const checkpoint = lifecycle.privateObjectDeletionCheckpoint<{ storageKey: string }>(
    agencyId,
    "saved-tool-icon-delete",
    objectId,
  );
  assert.equal(checkpoint?.record.state, "ready",
    "a swept owner deletion should retain a short idempotent completion checkpoint");
});

test("an incidental equal-string reference cannot forge completion of a failed deletion", async () => {
  const agencyId = `agency_delete_reference_${Date.now()}`;
  const objectId = "delete_reference_one";
  const storageKey = `${agencyId}/private-icon.png`;
  const requestHash = lifecycle.privateObjectRequestHash([agencyId, objectId, storageKey]);
  const failed = await lifecycle.deletePrivateObjectWithRecovery({
    agencyId,
    purpose: "saved-tool-icon-delete",
    objectId,
    requestHash,
    localDirectory: LOCAL_DIR,
    retryAfterMs: 10,
    now: () => 700,
    prepare: () => ({
      snapshot: { storageKey },
      storageProvider: "local",
      storageKey,
      metadata: { userId: "user_delete_reference", toolId: "tool_delete_reference" },
    }),
    providers: { local: async () => { throw new Error("temporary provider refusal"); } },
  });
  assert.equal(failed.ok, false);

  portalStorage.mutate(state => {
    state.pluginData.delete_reference_decoy = { note: storageKey };
  });
  let providerCalls = 0;
  try {
    const swept = await lifecycle.processPrivateObjectLifecycleSweep({
      now: 711,
      providers: { local: async () => { providerCalls += 1; } },
    });
    assert.equal(swept.recoveredReady, 0,
      "a string match cannot prove provider deletion completed");
    assert.equal(swept.failed, 1);
    assert.equal(providerCalls, 0,
      "a still-referenced key must be retained instead of sent to the provider");
    const checkpoint = lifecycle.privateObjectDeletionCheckpoint<{ storageKey: string }>(
      agencyId,
      "saved-tool-icon-delete",
      objectId,
    );
    assert.equal(checkpoint?.record.state, "delete-failed");
    assert.match(checkpoint?.record.error ?? "", /still referenced/);
  } finally {
    portalStorage.mutate(state => {
      delete state.pluginData.delete_reference_decoy;
      for (const [id, record] of Object.entries(state.privateObjectLifecycles)) {
        if (record.agencyId === agencyId) delete state.privateObjectLifecycles[id];
      }
    });
  }
});

test("an expired empty-key delete checkpoint converges through the provider's skipped path", async () => {
  const agencyId = `agency_empty_delete_${Date.now()}`;
  const objectId = "empty_delete_one";
  const requestHash = lifecycle.privateObjectRequestHash([agencyId, objectId, ""]);
  await assert.rejects(lifecycle.deletePrivateObjectWithRecovery({
    agencyId,
    purpose: "development-resource",
    objectId,
    requestHash,
    localDirectory: LOCAL_DIR,
    retryAfterMs: 10,
    now: () => 800,
    prepare: () => ({ snapshot: { id: objectId }, storageKey: "" }),
    afterCheckpoint: () => { throw new Error("simulated crash after checkpoint"); },
  }), /simulated crash/);

  try {
    const swept = await lifecycle.processPrivateObjectLifecycleSweep({ now: 811 });
    assert.equal(swept.cleaned, 1,
      "an empty storage key should converge as a skipped provider deletion");
    const checkpoint = lifecycle.privateObjectDeletionCheckpoint<{ id: string }>(
      agencyId,
      "development-resource",
      objectId,
    );
    assert.equal(checkpoint?.record.state, "ready");
  } finally {
    portalStorage.mutate(state => {
      for (const [id, record] of Object.entries(state.privateObjectLifecycles)) {
        if (record.agencyId === agencyId) delete state.privateObjectLifecycles[id];
      }
    });
  }
});

test("the abandonment sweep adopts an owner that committed before readiness acknowledgement", async () => {
  const agencyId = `agency_adopt_${Date.now()}`;
  const objectId = "creative_one";
  const storageKey = `campaigns/${agencyId}/creative-one.png`;
  const requestHash = lifecycle.privateObjectRequestHash([agencyId, objectId, storageKey]);
  await lifecycle.beginStagedPrivateUpload({
    agencyId,
    purpose: "campaign-asset",
    objectId,
    requestHash,
    planned: { storageProvider: "supabase", storageKey },
    localDirectory: "campaign-assets",
    now: 200,
    leaseMs: 10,
  });
  portalStorage.mutate(state => {
    state.pluginData.lifecycle_owner = { "campaign:one": { agencyId, creative: { asset: { storageKey } } } };
  });
  let providerTouched = false;
  const swept = await lifecycle.processPrivateObjectLifecycleSweep({
    now: 211,
    providers: { supabase: async () => { providerTouched = true; } },
  });
  assert.equal(swept.recoveredReady, 1);
  assert.equal(providerTouched, false, "a durable owner must win over abandonment cleanup");
  const record = Object.values(portalStorage.getState().privateObjectLifecycles).find(item => item.objectId === objectId);
  assert.equal(record?.state, "ready");
  portalStorage.mutate(state => {
    delete state.pluginData.lifecycle_owner;
    if (record) delete state.privateObjectLifecycles[record.id];
  });
});

test("an expired ownership claim is retained and never sent to the provider", async () => {
  const agencyId = `agency_claim_${Date.now()}`;
  const objectId = "claimed_message_attachment";
  const storageKey = `${agencyId}/claimed-message.pdf`;
  const requestHash = lifecycle.privateObjectRequestHash([agencyId, objectId, storageKey]);
  await lifecycle.beginStagedPrivateUpload({
    agencyId,
    purpose: "inbox-media",
    objectId,
    requestHash,
    planned: { storageProvider: "local", storageKey },
    localDirectory: LOCAL_DIR,
    now: 300,
    leaseMs: 1,
  });
  await lifecycle.claimStagedPrivateUploadsForOwnership({
    agencyId,
    purpose: "inbox-media",
    objectIds: [objectId],
    now: 301,
    leaseMs: 1,
  });
  let providerTouched = false;
  const swept = await lifecycle.processPrivateObjectLifecycleSweep({
    now: 303,
    providers: { local: async () => { providerTouched = true; } },
  });
  assert.equal(providerTouched, false, "a cross-store owner checkpoint must fail safe by retaining bytes");
  assert.equal(swept.retainedClaims, 1);
  const record = Object.values(portalStorage.getState().privateObjectLifecycles).find(item => item.objectId === objectId);
  assert.equal(record?.state, "claiming");
  assert.match(record?.error ?? "", /recovery/);
});

test("a refused owner write releases only its exact claim for later abandonment cleanup", async () => {
  const agencyId = `agency_claim_release_${Date.now()}`;
  const objectId = "refused_owner_attachment";
  const storageKey = `${agencyId}/refused-owner.pdf`;
  const requestHash = lifecycle.privateObjectRequestHash([agencyId, objectId, storageKey]);
  const expectedBindings = [{ objectId, storageProvider: "local" as const, storageKey }];
  await lifecycle.beginStagedPrivateUpload({
    agencyId,
    purpose: "inbox-media",
    objectId,
    requestHash,
    planned: { storageProvider: "local", storageKey },
    localDirectory: LOCAL_DIR,
    now: 1_000,
  });
  await lifecycle.claimStagedPrivateUploadsForOwnership({
    agencyId,
    purpose: "inbox-media",
    objectIds: [objectId],
    expectedBindings,
    claimId: "owner-operation-refused",
    now: 1_001,
  });
  await assert.rejects(
    lifecycle.commitStagedPrivateUploadOwnership({
      agencyId,
      purpose: "inbox-media",
      objectIds: [objectId],
      expectedBindings,
      claimId: "owner-operation-refused",
      commit: async () => { throw new Error("owner_refused_before_commit"); },
    }),
    /owner_refused_before_commit/,
  );
  assert.equal(Object.values(portalStorage.getState().privateObjectLifecycles).find(item => item.objectId === objectId)?.state, "claiming");
  await assert.rejects(
    lifecycle.releaseStagedPrivateUploadOwnershipClaim({
      agencyId,
      purpose: "inbox-media",
      objectIds: [objectId],
      expectedBindings,
      claimId: "different-owner-operation",
      now: 1_002,
    }),
    /another owner operation/,
  );
  const released = await lifecycle.releaseStagedPrivateUploadOwnershipClaim({
    agencyId,
    purpose: "inbox-media",
    objectIds: [objectId],
    expectedBindings,
    claimId: "owner-operation-refused",
    now: 1_003,
  });
  assert.equal(released, 1);
  const record = Object.values(portalStorage.getState().privateObjectLifecycles).find(item => item.objectId === objectId);
  assert.equal(record?.state, "uploading");
  assert.equal(record?.claimId, undefined);

  let removed = false;
  const swept = await lifecycle.processPrivateObjectLifecycleSweep({
    now: 1_003 + 24 * 60 * 60_000 + 1,
    providers: { local: async () => { removed = true; } },
  });
  assert.equal(swept.cleaned, 1);
  assert.equal(removed, true, "released bytes should return to ordinary staged cleanup");
});

test("an ambiguous owner outcome is retained once and only its exact claim can recover", async () => {
  const agencyId = `agency_claim_ambiguous_${Date.now()}`;
  const objectId = "ambiguous_owner_attachment";
  const storageKey = `${agencyId}/ambiguous-owner.pdf`;
  const requestHash = lifecycle.privateObjectRequestHash([agencyId, objectId, storageKey]);
  const expectedBindings = [{ objectId, storageProvider: "local" as const, storageKey }];
  await lifecycle.beginStagedPrivateUpload({
    agencyId,
    purpose: "inbox-media",
    objectId,
    requestHash,
    planned: { storageProvider: "local", storageKey },
    localDirectory: LOCAL_DIR,
    now: 2_000,
    leaseMs: 1,
  });
  await lifecycle.claimStagedPrivateUploadsForOwnership({
    agencyId,
    purpose: "inbox-media",
    objectIds: [objectId],
    expectedBindings,
    claimId: "owner-operation-ambiguous",
    now: 2_001,
    leaseMs: 1,
  });
  await assert.rejects(
    lifecycle.commitStagedPrivateUploadOwnership({
      agencyId,
      purpose: "inbox-media",
      objectIds: [objectId],
      expectedBindings,
      claimId: "owner-operation-ambiguous",
      commit: async () => { throw new Error("owner_result_unknown"); },
    }),
    /owner_result_unknown/,
  );

  let providerTouches = 0;
  const firstSweep = await lifecycle.processPrivateObjectLifecycleSweep({
    now: 2_003,
    providers: { local: async () => { providerTouches += 1; } },
  });
  assert.equal(firstSweep.retainedClaims, 1);
  const retained = Object.values(portalStorage.getState().privateObjectLifecycles).find(item => item.objectId === objectId);
  assert.equal(retained?.state, "claiming");
  assert.equal(retained?.claimId, "owner-operation-ambiguous");
  assert.equal(retained?.claimRecoveryRequiredAt, 2_003);
  assert.equal(retained?.expiresAt, 2_002, "the sweep must not renew an ambiguous claim forever");

  const secondSweep = await lifecycle.processPrivateObjectLifecycleSweep({
    now: 9_000,
    providers: { local: async () => { providerTouches += 1; } },
  });
  assert.equal(secondSweep.retainedClaims, 0, "an already-marked claim must not manufacture repeated recovery work");
  assert.equal(providerTouches, 0, "ambiguous ownership must never trigger binary deletion");
  const stillRetained = Object.values(portalStorage.getState().privateObjectLifecycles).find(item => item.objectId === objectId);
  assert.equal(stillRetained?.updatedAt, 2_003);
  assert.equal(stillRetained?.expiresAt, 2_002);

  await assert.rejects(
    lifecycle.recoverStagedPrivateUploadOwnershipClaim({
      agencyId,
      purpose: "inbox-media",
      objectIds: [objectId],
      expectedBindings,
      claimId: "different-owner-operation",
      ownerId: "message_wrong",
      now: 9_001,
    }),
    /another owner operation/,
  );
  const recovered = await lifecycle.recoverStagedPrivateUploadOwnershipClaim({
    agencyId,
    purpose: "inbox-media",
    objectIds: [objectId],
    expectedBindings,
    claimId: "owner-operation-ambiguous",
    ownerId: "message_committed",
    now: 9_002,
  });
  assert.equal(recovered, 1);
  const ready = Object.values(portalStorage.getState().privateObjectLifecycles).find(item => item.objectId === objectId);
  assert.equal(ready?.state, "ready");
  assert.equal(ready?.ownerId, "message_committed");
});

test("PortalState owner persistence and readiness commit without a rehydrate gap", async () => {
  const agencyId = `agency_owner_commit_${Date.now()}`;
  const objectId = "expense_commit";
  const storageKey = `${agencyId}/expense.pdf`;
  const requestHash = lifecycle.privateObjectRequestHash([agencyId, objectId, storageKey]);
  await lifecycle.beginStagedPrivateUpload({
    agencyId,
    purpose: "expense-attachment",
    objectId,
    requestHash,
    planned: { storageProvider: "local", storageKey },
    localDirectory: LOCAL_DIR,
  });
  await lifecycle.claimStagedPrivateUploadsForOwnership({
    agencyId,
    purpose: "expense-attachment",
    objectIds: [objectId],
  });
  const value = await lifecycle.commitStagedPrivateUploadOwnership({
    agencyId,
    purpose: "expense-attachment",
    objectIds: [objectId],
    commit: async () => {
      portalStorage.mutate(state => {
        state.pluginData.lifecycle_commit_owner = { expense: { id: "expense_one", agencyId, attachments: [{ id: objectId, storageKey }] } };
      });
      return { ownerId: "expense_one", value: "committed" };
    },
  });
  assert.equal(value, "committed");
  assert.deepEqual(portalStorage.getState().pluginData.lifecycle_commit_owner, {
    expense: { id: "expense_one", agencyId, attachments: [{ id: objectId, storageKey }] },
  }, "finalisation must not fresh-reload away the just-written plugin owner");
  const record = Object.values(portalStorage.getState().privateObjectLifecycles).find(item => item.objectId === objectId);
  assert.equal(record?.state, "ready");
  assert.equal(record?.ownerId, "expense_one");
});

test("sweep and owner adoption serialize on one lock, so a deleted object cannot gain an owner", async () => {
  const agencyId = `agency_sweep_race_${Date.now()}`;
  const objectId = "racing_attachment";
  const storageKey = `${agencyId}/racing.pdf`;
  const requestHash = lifecycle.privateObjectRequestHash([agencyId, objectId, storageKey]);
  await lifecycle.beginStagedPrivateUpload({
    agencyId,
    purpose: "expense-attachment",
    objectId,
    requestHash,
    planned: { storageProvider: "local", storageKey },
    localDirectory: LOCAL_DIR,
    now: 400,
    leaseMs: 1,
  });
  let releaseProvider!: () => void;
  let providerStarted!: () => void;
  const providerGate = new Promise<void>(resolve => { releaseProvider = resolve; });
  const providerEntered = new Promise<void>(resolve => { providerStarted = resolve; });
  const sweep = lifecycle.processPrivateObjectLifecycleSweep({
    now: 402,
    providers: { local: async () => { providerStarted(); await providerGate; } },
  });
  await providerEntered;
  let claimSettled = false;
  const claim = lifecycle.claimStagedPrivateUploadsForOwnership({
    agencyId,
    purpose: "expense-attachment",
    objectIds: [objectId],
  }).then(
    value => ({ ok: true as const, value }),
    error => ({ ok: false as const, error }),
  ).finally(() => { claimSettled = true; });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(claimSettled, false, "owner adoption must wait while destructive provider I/O owns the lifecycle lock");
  releaseProvider();
  const swept = await sweep;
  const claimed = await claim;
  assert.equal(swept.cleaned, 1);
  assert.equal(claimed.ok, false);
  if (!claimed.ok) assert.ok(claimed.error instanceof lifecycle.PrivateObjectLifecycleClaimError);
  assert.equal(Object.values(portalStorage.getState().privateObjectLifecycles).some(item => item.objectId === objectId), false);
});

test("pending deletion checkpoints strip content and credentials before recovery persistence", () => {
  for (const route of [
    "src/app/api/portal/company/legal/route.ts",
    "src/app/api/portal/sops/route.ts",
    "src/app/api/portal/development/route.ts",
  ]) {
    assert.match(read(route), /checkpointSnapshot:/, `${route} must sanitise the durable retry snapshot`);
  }
  assert.match(read("src/app/api/portal/company/legal/route.ts"), /notes: undefined[\s\S]*storageKey: ""/);
  assert.match(read("src/app/api/portal/sops/route.ts"), /content: undefined[\s\S]*blocks: undefined[\s\S]*storageKey: undefined/);
  assert.match(read("src/app/api/portal/development/route.ts"), /codeSnippet: undefined[\s\S]*file: undefined[\s\S]*credential: undefined/);
  assert.doesNotMatch(read("src/server/legalDocuments.ts"), /getLegalDocument[\s\S]{0,500}pendingPrivateObjectDeletion</);
  assert.doesNotMatch(read("src/engines/sop/server/sops.ts"), /getSop[\s\S]{0,300}pendingPrivateObjectDeletion/);
  assert.doesNotMatch(read("src/server/developmentToolkit.ts"), /getDevelopmentResource[\s\S]{0,300}pendingPrivateObjectDeletion/);
});

test("a retry surface reads only the sanitised checkpoint while ordinary readers see no deleted owner", async () => {
  const agencyId = `agency_sanitised_delete_${Date.now()}`;
  const objectId = "legal_sensitive";
  const secret = "private legal advice that must not survive in a recovery row";
  portalStorage.mutate(state => {
    state.legalDocuments[objectId] = {
      id: objectId,
      agencyId,
      title: "Sensitive agreement",
      category: "contract",
      status: "active",
      notes: secret,
      counterparty: "Confidential counterparty",
      fileName: "secret.pdf",
      contentType: "application/pdf",
      size: 42,
      storageProvider: "local",
      storageKey: `${agencyId}/secret.pdf`,
      createdBy: "owner",
      createdAt: 1,
      updatedAt: 1,
    };
  });
  const result = await lifecycle.deletePrivateObjectWithRecovery({
    agencyId,
    purpose: "legal-document",
    objectId,
    requestHash: lifecycle.privateObjectRequestHash([agencyId, objectId, false]),
    localDirectory: "legal-uploads",
    prepare(state) {
      const snapshot = state.legalDocuments[objectId];
      if (!snapshot) throw new Error("owner missing");
      delete state.legalDocuments[objectId];
      return { snapshot, storageProvider: snapshot.storageProvider, storageKey: snapshot.storageKey };
    },
    checkpointSnapshot: snapshot => ({
      ...snapshot,
      notes: undefined,
      counterparty: undefined,
      fileName: "",
      storageKey: "",
    }),
    providers: { local: async () => { throw new Error("provider unavailable"); } },
  });
  assert.equal(result.ok, false);
  assert.equal(legalDocuments.getLegalDocument(agencyId, objectId), null, "ordinary content/update readers must not receive recovery snapshots");
  assert.equal(legalDocuments.listLegalDocuments(agencyId).some(item => item.id === objectId), false);
  const retryRow = legalDocuments.listLegalDocumentsWithPendingDeletion(agencyId).find(item => item.id === objectId);
  assert.equal(retryRow?.deleteState, "delete-failed");
  assert.equal(retryRow?.notes, undefined);
  assert.equal(retryRow?.counterparty, undefined);
  assert.equal(JSON.stringify(portalStorage.getState().privateObjectLifecycles).includes(secret), false,
    "the durable checkpoint itself must not retain sensitive content");
});

test("owner deletion survives a crash after its checkpoint and replays without rerunning prepare", async () => {
  const agencyId = `agency_delete_crash_${Date.now()}`;
  const objectId = "resource_crash";
  const requestHash = lifecycle.privateObjectRequestHash([agencyId, objectId, "delete"]);
  portalStorage.mutate(state => {
    state.developmentResources[objectId] = {
      id: objectId,
      agencyId,
      kind: "knowledge",
      title: "Crash recovery",
      tags: [],
      workflowStageIds: [],
      sopIds: [],
      visibility: "team",
      file: { fileName: "proof.pdf", contentType: "application/pdf", size: 2, storageProvider: "local", storageKey: `${agencyId}/proof.pdf` },
      createdBy: "owner",
      updatedBy: "owner",
      createdAt: 1,
      updatedAt: 1,
    };
  });
  let prepares = 0;
  const prepare = (state: Parameters<Parameters<typeof lifecycle.deletePrivateObjectWithRecovery>[0]["prepare"]>[0]) => {
    prepares += 1;
    const snapshot = state.developmentResources[objectId];
    if (!snapshot) throw new Error("owner missing");
    delete state.developmentResources[objectId];
    return { snapshot, storageProvider: snapshot.file?.storageProvider, storageKey: snapshot.file?.storageKey };
  };
  await assert.rejects(() => lifecycle.deletePrivateObjectWithRecovery({
    agencyId,
    purpose: "development-resource",
    objectId,
    requestHash,
    localDirectory: "development-uploads",
    prepare,
    afterCheckpoint: () => { throw new Error("simulated process death"); },
  }), /simulated process death/);
  assert.equal(portalStorage.getState().developmentResources[objectId], undefined);
  assert.equal(Object.values(portalStorage.getState().privateObjectLifecycles).find(item => item.objectId === objectId)?.state, "deleting");

  let providerCalls = 0;
  const retried = await lifecycle.deletePrivateObjectWithRecovery({
    agencyId,
    purpose: "development-resource",
    objectId,
    requestHash,
    localDirectory: "development-uploads",
    prepare,
    providers: { local: async () => { providerCalls += 1; } },
  });
  assert.equal(retried.ok, true);
  assert.equal(prepares, 1, "retry must use the checkpoint snapshot, not rerun owner deletion");
  assert.equal(providerCalls, 1);
  assert.equal(Object.values(portalStorage.getState().privateObjectLifecycles).find(item => item.objectId === objectId)?.state, "ready");

  await assert.rejects(() => lifecycle.deletePrivateObjectWithRecovery({
    agencyId,
    purpose: "development-resource",
    objectId,
    requestHash: lifecycle.privateObjectRequestHash([agencyId, objectId, "changed-delete"]),
    localDirectory: "development-uploads",
    prepare,
  }), lifecycle.PrivateObjectLifecycleConflictError);
});

test("development-resource updates cannot resurrect an owner after provider deletion", async () => {
  const { createAgency } = await import("../src/server/tenants");
  const { createUser } = await import("../src/server/users");
  const { issueSession } = await import("../src/lib/server/auth/auth");
  const { POST } = await import("../src/app/api/portal/development/route");
  const agency = createAgency({ name: "Development lifecycle", slug: `development-lifecycle-${Date.now()}` });
  const owner = createUser({
    agencyId: agency.id,
    email: `development-lifecycle-${Date.now()}@example.test`,
    name: "Lifecycle owner",
    role: "agency-owner",
    password: "correct horse battery staple",
  });
  const token = issueSession({
    userId: owner.id,
    email: owner.email,
    role: owner.role,
    agencyId: agency.id,
  });
  const objectId = `resource_update_race_${Date.now()}`;
  const workflowId = `workflow_update_race_${Date.now()}`;
  const storageKey = `${agency.id}/${objectId}.pdf`;
  portalStorage.mutate(state => {
    state.developmentWorkflows[workflowId] = {
      id: workflowId,
      agencyId: agency.id,
      name: "Lifecycle workflow",
      stages: [{ id: "build", name: "Build", order: 0 }],
      active: true,
      createdBy: owner.id,
      createdAt: 1,
      updatedAt: 1,
    };
    state.developmentResources[objectId] = {
      id: objectId,
      agencyId: agency.id,
      kind: "knowledge",
      title: "Lifecycle source",
      tags: [],
      workflowStageIds: [`${workflowId}:build`],
      sopIds: [],
      visibility: "team",
      file: { fileName: "source.pdf", contentType: "application/pdf", size: 2, storageProvider: "local", storageKey },
      createdBy: owner.id,
      updatedBy: owner.id,
      createdAt: 1,
      updatedAt: 1,
    };
  });

  let enteredCheckpoint!: () => void;
  const checkpointEntered = new Promise<void>(resolve => { enteredCheckpoint = resolve; });
  let releaseDeletion!: () => void;
  const deletionReleased = new Promise<void>(resolve => { releaseDeletion = resolve; });
  let providerCalls = 0;
  const deletion = lifecycle.deletePrivateObjectWithRecovery({
    agencyId: agency.id,
    purpose: "development-resource",
    objectId,
    requestHash: lifecycle.privateObjectRequestHash([agency.id, objectId, "permanent-delete"]),
    localDirectory: "development-uploads",
    prepare(state) {
      const snapshot = state.developmentResources[objectId];
      if (!snapshot) throw new Error("owner missing");
      delete state.developmentResources[objectId];
      return { snapshot, storageProvider: snapshot.file?.storageProvider, storageKey: snapshot.file?.storageKey };
    },
    afterCheckpoint: async () => {
      enteredCheckpoint();
      await deletionReleased;
    },
    providers: { local: async () => { providerCalls += 1; } },
  });
  await checkpointEntered;

  let updateSettled = false;
  const update = withSession(token, () => POST(new Request("http://localhost/api/portal/development", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "resource:update",
      resourceId: objectId,
      input: { title: "Must not be resurrected" },
    }),
  })));
  let workflowSettled = false;
  const workflowUpdate = withSession(token, () => POST(new Request("http://localhost/api/portal/development", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "workflow:update",
      workflowId,
      input: { stages: [{ id: "build", name: "Build revised", order: 0 }] },
    }),
  })));
  void update.then(() => { updateSettled = true; }, () => { updateSettled = true; });
  void workflowUpdate.then(() => { workflowSettled = true; }, () => { workflowSettled = true; });
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(updateSettled, false,
    "the update crossed the deletion checkpoint instead of waiting for the shared lifecycle lane");
  assert.equal(workflowSettled, false,
    "the workflow rewrite crossed the deletion checkpoint instead of waiting for the shared lifecycle lane");

  releaseDeletion();
  const [deleted, response, workflowResponse] = await Promise.all([deletion, update, workflowUpdate]);
  assert.equal(deleted.ok, true);
  assert.equal(providerCalls, 1, "the private binary was not deleted exactly once");
  assert.equal(response.status, 404, "the queued update did not re-read and refuse the deleted owner");
  assert.equal(workflowResponse.status, 200, "the queued workflow update did not finish on its fresh snapshot");
  assert.equal(portalStorage.getState().developmentResources[objectId], undefined,
    "the queued update resurrected an owner whose binary was permanently deleted");
});

test("provider refusal remains delete-failed and concurrent identical retries converge once", async () => {
  const agencyId = `agency_delete_retry_${Date.now()}`;
  const objectId = "resource_retry";
  const requestHash = lifecycle.privateObjectRequestHash([agencyId, objectId, "delete"]);
  portalStorage.mutate(state => {
    state.developmentResources[objectId] = {
      id: objectId, agencyId, kind: "knowledge", title: "Retry recovery", tags: [], workflowStageIds: [], sopIds: [], visibility: "team",
      file: { fileName: "retry.pdf", contentType: "application/pdf", size: 2, storageProvider: "local", storageKey: `${agencyId}/retry.pdf` },
      createdBy: "owner", updatedBy: "owner", createdAt: 1, updatedAt: 1,
    };
  });
  let prepares = 0;
  const prepare = (state: Parameters<Parameters<typeof lifecycle.deletePrivateObjectWithRecovery>[0]["prepare"]>[0]) => {
    prepares += 1;
    const snapshot = state.developmentResources[objectId];
    if (!snapshot) throw new Error("owner missing");
    delete state.developmentResources[objectId];
    return { snapshot, storageProvider: snapshot.file?.storageProvider, storageKey: snapshot.file?.storageKey };
  };
  const refused = await lifecycle.deletePrivateObjectWithRecovery({
    agencyId, purpose: "development-resource", objectId, requestHash, localDirectory: "development-uploads", prepare,
    providers: { local: async () => { throw new Error("provider unavailable"); } },
  });
  assert.equal(refused.ok, false);
  assert.equal(Object.values(portalStorage.getState().privateObjectLifecycles).find(item => item.objectId === objectId)?.state, "delete-failed");

  let providerCalls = 0;
  const retry = () => lifecycle.deletePrivateObjectWithRecovery({
    agencyId, purpose: "development-resource", objectId, requestHash, localDirectory: "development-uploads", prepare,
    providers: { local: async () => { providerCalls += 1; } },
  });
  const [first, second] = await Promise.all([retry(), retry()]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(prepares, 1, "the owner mutation must run once across refusal and concurrent retries");
  assert.equal(providerCalls, 1, "the completed checkpoint must replay without a second provider delete");
});

test("client-file deletion persists intent before touching the provider and renders retry truth", () => {
  const route = read("src/app/api/tenants/client-files/route.ts");
  const surface = read("src/app/portal/clients/[clientId]/_FilesTabClient.tsx");
  const intent = route.indexOf("beginClientFileDeletion(currentFiles");
  const persist = route.indexOf("await flushPendingWrites();", intent);
  const provider = route.indexOf("await deletePrivateUpload", intent);
  assert.ok(intent >= 0 && persist > intent && provider > persist, "deleting state must be durable before provider deletion starts");
  assert.match(route, /failClientFileDeletion\(latestFiles/);
  assert.match(surface, /Delete failed — retry available/);
  assert.match(surface, /if \(data\.files\) setFiles\(data\.files\)/);
  assert.match(surface, /Retry delete/);
});

test("client-file delete completion and refusal merge into the latest collection", () => {
  const deleting = {
    id: "delete-me",
    name: "old-name.pdf",
    deleteState: "deleting" as const,
    deleteStartedAt: 10,
  };
  const concurrentUpload = { id: "new-upload", name: "new.pdf" };
  const concurrentTargetUpdate = { ...deleting, name: "renamed-while-provider-waited.pdf" };
  const latest = [concurrentUpload, concurrentTargetUpdate];

  const failed = clientFileDeletion.failClientFileDeletion(latest, deleting.id, "provider unavailable", 20);
  assert.deepEqual(failed.map(file => file.id), ["new-upload", "delete-me"], "a provider refusal must retain a concurrent upload");
  assert.equal(failed[1]?.name, "renamed-while-provider-waited.pdf", "only lifecycle fields may change on the target");
  assert.equal(failed[1]?.deleteState, "delete-failed");
  assert.equal(failed[1]?.deleteError, "provider unavailable");

  const completed = clientFileDeletion.finishClientFileDeletion(latest, deleting.id);
  assert.deepEqual(completed, [concurrentUpload], "successful cleanup removes only the target from the latest state");

  const route = read("src/app/api/tenants/client-files/route.ts");
  const provider = route.indexOf("await deletePrivateUpload");
  const reread = route.indexOf("getClientForAgency(session.agencyId, body.clientId)", provider);
  const merge = route.indexOf("finishClientFileDeletion(latestFiles", provider);
  assert.ok(provider >= 0 && reread > provider && merge > reread, "the route must re-read and merge after provider I/O");
});

test("post-storage upload reconciliation preserves concurrent rows, detects replay/conflict, and rolls back only its id", () => {
  const replayInput = {
    name: "brief.pdf",
    size: 123,
    contentType: "application/pdf",
    contentSha256: "a".repeat(64),
    productId: "product-one",
    workspacePageId: "page-one",
    collectionId: "collection-one",
    uploadKey: "retry-one",
  };
  const winner = {
    id: "winner",
    ...replayInput,
  };
  const concurrent = { id: "concurrent", name: "notes.txt", size: 5, contentType: "text/plain" };
  const losingCandidate = { id: "loser-binary", ...replayInput };

  const replay = clientFileUploadTransaction.reconcileClientFileUpload(
    [concurrent, winner],
    losingCandidate,
    replayInput,
  );
  assert.equal(replay.status, "replay");
  if (replay.status !== "replay") throw new Error("unreachable");
  assert.equal(replay.file.id, "winner", "replay must return the durable winner, never the losing stored binary");
  assert.deepEqual(replay.files.map(file => file.id), ["concurrent", "winner"]);

  const conflict = clientFileUploadTransaction.reconcileClientFileUpload(
    [concurrent, winner],
    { ...losingCandidate, id: "different-bytes", contentSha256: "b".repeat(64) },
    { ...replayInput, contentSha256: "b".repeat(64) },
  );
  assert.equal(conflict.status, "conflict", "same retry identity with different bytes must not replay");

  const freshCandidate = { ...losingCandidate, id: "fresh", uploadKey: "retry-two" };
  const attach = clientFileUploadTransaction.reconcileClientFileUpload(
    [concurrent, winner],
    freshCandidate,
    { ...replayInput, uploadKey: "retry-two" },
  );
  assert.equal(attach.status, "attach");
  if (attach.status !== "attach") throw new Error("unreachable");
  assert.deepEqual(attach.files.map(file => file.id), ["fresh", "concurrent", "winner"], "fresh merge must retain rows that landed during provider I/O");

  const latestAfterFailedFlush = [
    { ...concurrent, name: "renamed concurrently" },
    freshCandidate,
    winner,
    { id: "even-later", name: "later.txt" },
  ];
  const rolledBack = clientFileUploadTransaction.rollbackClientFileUpload(latestAfterFailedFlush, "fresh");
  assert.deepEqual(rolledBack.map(file => file.id), ["concurrent", "winner", "even-later"]);
  assert.equal(rolledBack[0]?.name, "renamed concurrently", "rollback may not restore stale fields on surviving rows");
});

test("a post-storage replay compensates only the losing binary and keeps the durable winner", async () => {
  const winnerKey = "upload-race/winner.pdf";
  const loserKey = "upload-race/loser.pdf";
  mkdirSync(join(localRoot, "upload-race"), { recursive: true });
  writeFileSync(join(localRoot, winnerKey), "same durable bytes");
  writeFileSync(join(localRoot, loserKey), "same durable bytes");
  const replayInput = {
    name: "brief.pdf",
    size: 18,
    contentType: "application/pdf",
    contentSha256: "a".repeat(64),
    productId: "product-one",
    workspacePageId: "page-one",
    collectionId: "collection-one",
    uploadKey: "same-operation",
  };
  const winner = { id: "winner", ...replayInput, storageKey: winnerKey };
  const loser = { id: "loser", ...replayInput, storageKey: loserKey };
  let durableFiles = [winner];

  try {
    const attached = await storage.attachStoredPrivateUpload(
      { storageProvider: "local", storageKey: loserKey },
      LOCAL_DIR,
      () => {
        const decision = clientFileUploadTransaction.reconcileClientFileUpload(durableFiles, loser, replayInput);
        assert.equal(decision.status, "replay");
        if (decision.status !== "replay") throw new Error("unreachable");
        assert.equal(decision.file.id, winner.id);
        // The route deliberately throws here so the shared boundary removes
        // this request's unique stored object, never the durable winner.
        throw new Error("workspace_upload_replay");
      },
      { rollbackOwner: () => { durableFiles = durableFiles.filter(file => file.id !== loser.id); } },
    );
    assert.equal(attached.ok, false);
    if (attached.ok) throw new Error("unreachable");
    assert.equal(attached.compensated, true);
    assert.deepEqual(durableFiles.map(file => file.id), [winner.id]);
    assert.equal(existsSync(join(localRoot, loserKey)), false, "only the redundant stored object is compensated");
    assert.equal(existsSync(join(localRoot, winnerKey)), true, "the durable winner's object must remain untouched");
  } finally {
    rmSync(join(localRoot, "upload-race"), { recursive: true, force: true });
  }
});

test("anonymous careers failures expose only a stable generic DTO and opaque incident id", () => {
  const incidentId = "career_0123456789abcdef01234567";
  const payload = careerApplicationFailure.careerApplicationFailurePayload(incidentId);
  assert.deepEqual(payload, {
    ok: false,
    code: "career_application_unavailable",
    error: "Applications are temporarily unavailable. Please try again later.",
    incidentId,
  });
  const publicJson = JSON.stringify(payload);
  for (const secret of ["storageKey", "detail", "bucket is read-only", "database timeout", "stack"]) {
    assert.doesNotMatch(publicJson, new RegExp(secret, "i"));
  }

  const route = read("src/app/api/public/careers/route.ts");
  assert.match(route, /career_\$\{crypto\.randomBytes\(12\)\.toString\("hex"\)\}/);
  assert.match(route, /console\.error\("\[careers\] application failure"/);
  assert.match(route, /NextResponse\.json\(careerApplicationFailurePayload\(incidentId\)/);
  assert.match(route, /return privateFailure\("attach_owner"/);
  assert.match(route, /cause instanceof PrivateUploadStorageError \? "storage_unavailable" : "application_write"/);
  assert.doesNotMatch(route, /return responseError\(cause\.message|error: attached\.message|detail: attached\.detail|storageKey: attached\.compensated/);
});

test("a stored upload whose record cannot be written is nothing to delete", async () => {
  const skipped = await storage.deletePrivateUpload({ storageProvider: "local", storageKey: "", localDirectory: LOCAL_DIR });
  assert.deepEqual(skipped, { ok: true, outcome: "skipped" });
  const noProvider = await storage.deletePrivateUpload({ storageKey: "a/b.pdf", localDirectory: LOCAL_DIR });
  assert.deepEqual(noProvider, { ok: true, outcome: "skipped" });
});

test("a refusing provider is reported as a failure, never as a deletion", async () => {
  const supabase = await storage.deletePrivateUpload(
    { storageProvider: "supabase", storageKey: "clients/a/b.pdf", localDirectory: LOCAL_DIR },
    { supabase: async () => { throw new Error("bucket is read-only"); } },
  );
  assert.equal(supabase.ok, false);
  assert.equal(supabase.outcome, "failed");
  assert.equal(supabase.error, "bucket is read-only");

  const blob = await storage.deletePrivateUpload(
    { storageProvider: "vercel-blob", storageKey: "https://blob.example/a.pdf", localDirectory: LOCAL_DIR },
    { vercelBlob: async () => { throw new Error("blob store unreachable"); } },
  );
  assert.equal(blob.ok, false);
  assert.equal(blob.error, "blob store unreachable");

  const unknown = await storage.deletePrivateUpload({ storageProvider: "dropbox", storageKey: "x", localDirectory: LOCAL_DIR });
  assert.equal(unknown.ok, false);
  assert.match(unknown.error ?? "", /Unknown storage provider/);
});

test("a delete retry after the provider already converged is idempotent", async () => {
  let present = true;
  const provider = async () => {
    if (present) {
      present = false;
      return;
    }
    const missing = new Error("Object not found") as Error & { code: string };
    missing.code = "ObjectNotFound";
    throw missing;
  };
  const input = { storageProvider: "vercel-blob", storageKey: "https://blob.example/retry.pdf", localDirectory: LOCAL_DIR };
  const first = await storage.deletePrivateUpload(input, { vercelBlob: provider });
  const afterCrashRetry = await storage.deletePrivateUpload(input, { vercelBlob: provider });
  assert.deepEqual(first, { ok: true, outcome: "deleted" });
  assert.deepEqual(afterCrashRetry, { ok: true, outcome: "deleted" }, "already-absent provider state must let the durable deleting row converge");
});

test("a local delete really removes the file, is idempotent and refuses to escape its directory", async () => {
  mkdirSync(join(localRoot, "agency"), { recursive: true });
  const key = join("agency", "brief.txt");
  writeFileSync(join(localRoot, key), "brief");
  try {
    const removed = await storage.deletePrivateUpload({ storageProvider: "local", storageKey: key, localDirectory: LOCAL_DIR });
    assert.deepEqual(removed, { ok: true, outcome: "deleted" });
    assert.equal(existsSync(join(localRoot, key)), false);

    const again = await storage.deletePrivateUpload({ storageProvider: "local", storageKey: key, localDirectory: LOCAL_DIR });
    assert.equal(again.ok, true, "removing an already-removed file is convergent, not an error");

    const escape = await storage.deletePrivateUpload({ storageProvider: "local", storageKey: "../../package.json", localDirectory: LOCAL_DIR });
    assert.equal(escape.ok, false, "a traversal key must be refused, not silently reported as deleted");
    assert.equal(escape.outcome, "failed");
    assert.equal(existsSync(join(process.cwd(), "package.json")), true);
  } finally {
    rmSync(localRoot, { recursive: true, force: true });
  }
});

test("an upload whose owning record fails is compensated away, and says so when it cannot be", async () => {
  mkdirSync(localRoot, { recursive: true });
  const key = "orphan.txt";
  writeFileSync(join(localRoot, key), "orphan");
  try {
    const compensated = await storage.attachStoredPrivateUpload<string>(
      { storageProvider: "local", storageKey: key },
      LOCAL_DIR,
      () => { throw new Error("client record could not be saved"); },
    );
    assert.equal(compensated.ok, false);
    if (compensated.ok) throw new Error("unreachable");
    assert.equal(compensated.compensated, true);
    assert.equal(compensated.detail, "client record could not be saved");
    assert.match(compensated.message, /removed/);
    assert.equal(existsSync(join(localRoot, key)), false, "the orphaned binary must not survive a failed record write");

    // Storage that also refuses the compensating delete must NOT be described
    // as cleaned up — the object is still stored and attached to nothing.
    const stranded = await storage.attachStoredPrivateUpload<string>(
      { storageProvider: "supabase", storageKey: "clients/a/stranded.pdf" },
      LOCAL_DIR,
      () => { throw new Error("record write failed"); },
    );
    assert.equal(stranded.ok, false);
    if (stranded.ok) throw new Error("unreachable");
    assert.equal(stranded.compensated, false);
    assert.match(stranded.message, /still stored|attached to nothing/);
    assert.equal(stranded.storageKey, "clients/a/stranded.pdf");

    const kept = await storage.attachStoredPrivateUpload(
      { storageProvider: "local", storageKey: key },
      LOCAL_DIR,
      () => "record",
    );
    assert.deepEqual(kept, { ok: true, value: "record" });
  } finally {
    rmSync(localRoot, { recursive: true, force: true });
  }
});

test("a durable-flush failure removes the real owner row before compensating its binary", async () => {
  const agencyId = "agency_upload_tx";
  const documentId = "legal_upload_tx";
  const key = "transaction/document.pdf";
  mkdirSync(join(localRoot, "transaction"), { recursive: true });
  writeFileSync(join(localRoot, key), "evidence");
  let persistCalls = 0;
  try {
    const result = await storage.attachStoredPrivateUpload(
      { storageProvider: "local", storageKey: key },
      LOCAL_DIR,
      () => legalDocuments.createLegalDocument({
        id: documentId,
        agencyId,
        title: "Transactional evidence",
        category: "other",
        status: "active",
        fileName: "document.pdf",
        contentType: "application/pdf",
        size: 8,
        storageProvider: "local",
        storageKey: key,
        createdBy: "owner",
      }),
      {
        persist: async () => {
          persistCalls += 1;
          if (persistCalls === 1) throw new Error("database flush refused");
        },
        rollbackOwner: () => { legalDocuments.rollbackLegalDocumentUpload(agencyId, documentId); },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.compensated, true);
    assert.equal(persistCalls, 2, "the rollback must itself be durably confirmed before compensation");
    assert.equal(legalDocuments.getLegalDocument(agencyId, documentId), null, "the owner row must not point at the compensated binary");
    assert.equal(existsSync(join(localRoot, key)), false, "the now-unowned binary must be removed");
    assert.equal(portalStorage.getState().activity.some(entry => entry.metadata?.documentId === documentId), false, "the rolled-back upload audit must not claim a document exists");
  } finally {
    legalDocuments.rollbackLegalDocumentUpload(agencyId, documentId);
    rmSync(localRoot, { recursive: true, force: true });
  }
});

test("a rollback that cannot be durably confirmed keeps the binary", async () => {
  const key = "rollback-refused.txt";
  mkdirSync(localRoot, { recursive: true });
  writeFileSync(join(localRoot, key), "keep me");
  let ownerExists = false;
  try {
    const result = await storage.attachStoredPrivateUpload(
      { storageProvider: "local", storageKey: key },
      LOCAL_DIR,
      () => { ownerExists = true; return "owner"; },
      {
        persist: async () => { throw new Error("database remains unavailable"); },
        rollbackOwner: () => { ownerExists = false; },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.compensated, false);
    assert.equal(ownerExists, false, "the in-process owner rollback still runs");
    assert.equal(existsSync(join(localRoot, key)), true, "without durable rollback proof the object must not be deleted");
    assert.match(result.message, /kept to avoid leaving a saved record that points to a missing file/);
  } finally {
    rmSync(localRoot, { recursive: true, force: true });
  }
});
