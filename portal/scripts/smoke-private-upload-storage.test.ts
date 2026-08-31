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

const LOCAL_DIR = "private-upload-storage-smoke";
const localRoot = join(process.cwd(), ".data", LOCAL_DIR);

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/lib/server/privateUploadStorage");
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
  ]) {
    const source = read(route);
    assert.match(source, /storePrivateUpload/);
    assert.match(source, /PrivateUploadStorageError/);
    assert.match(source, /status: 503/);
    assert.doesNotMatch(source, /from "@vercel\/blob"/);
  }
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
