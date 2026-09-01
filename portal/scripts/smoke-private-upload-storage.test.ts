import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { before, test } from "node:test";

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
    assert.match(source, /deletePrivateUpload/, `${route} must delete through the shared boundary`);
    // The swallowed-provider-error pattern that reported a phantom deletion.
    assert.doesNotMatch(source, /\.catch\(\(\) => (?:false|undefined)\)/, `${route} must not swallow a provider delete error`);
    assert.doesNotMatch(source, /from "@vercel\/blob"/, `${route} must not hold a second provider copy`);
    assert.match(source, /storage_delete_failed/, `${route} must report a refused deletion instead of ok`);
  }
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
