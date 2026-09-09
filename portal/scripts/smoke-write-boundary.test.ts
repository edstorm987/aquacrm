// The write boundary (assume-breach containment, Phase 2).
//
// The global read-only kill switch binds mutate() (all PortalState). Object
// storage and public-media ingestion are SEPARATE write paths mutate() never
// sees, so the freeze must also bind them via assertWritesAllowed. These tests
// prove (behaviourally) that a frozen upload is refused and leaves nothing
// behind, and (statically) that the storage write choke points call the guard.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test, { beforeEach } from "node:test";

import { storePrivateUpload, deletePrivateUpload, deleteSupabasePrivateUpload } from "../src/lib/server/privateUploadStorage";
import { storePublicUpload, deleteSupabasePublicUpload } from "../src/lib/server/publicUploadStorage";
import {
  assertWritesAllowed,
  WritesFrozenError,
  setGlobalReadOnly,
  clearGlobalReadOnly,
  isGlobalReadOnly,
  lockdownTenant,
  liftTenantLockdown,
} from "../src/lib/server/auth/securityControl";
import { getState, mutate } from "../src/server/storage";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
const blob = (b: Uint8Array) => new Blob([Uint8Array.from(b).buffer]);

beforeEach(() => {
  if (isGlobalReadOnly()) clearGlobalReadOnly("test-reset");
  for (const a of Object.keys(getState().securityControl?.tenantLockdowns ?? {})) liftTenantLockdown(a, "test-reset");
});

test("assertWritesAllowed refuses under a global freeze and a tenant lockdown", () => {
  assert.doesNotThrow(() => assertWritesAllowed("test.surface", { tenantId: "agency-x" }));
  setGlobalReadOnly("ic", "incident");
  assert.throws(() => assertWritesAllowed("test.surface", { tenantId: "agency-x" }), WritesFrozenError);
  clearGlobalReadOnly("ic");
  lockdownTenant("agency-x", "ic", "tenant incident");
  assert.throws(() => assertWritesAllowed("test.surface", { tenantId: "agency-x" }), WritesFrozenError);
  // A different tenant is unaffected.
  assert.doesNotThrow(() => assertWritesAllowed("test.surface", { tenantId: "agency-y" }));
  liftTenantLockdown("agency-x", "ic");
});

test("a frozen private upload is refused BEFORE any bytes touch disk", async () => {
  const localKey = `write-boundary-test/frozen-${Date.now()}.png`;
  setGlobalReadOnly("ic", "freeze");
  await assert.rejects(
    storePrivateUpload({ pathname: localKey, file: blob(PNG), contentType: "image/png", localDirectory: "write-boundary-test", localKey }),
    WritesFrozenError,
  );
  assert.ok(!existsSync(join(process.cwd(), ".data", "write-boundary-test", localKey)), "a frozen upload must never touch disk");
  clearGlobalReadOnly("ic");
  // After thaw the same upload succeeds (the guard is reversible).
  const stored = await storePrivateUpload({ pathname: localKey, file: blob(PNG), contentType: "image/png", localDirectory: "write-boundary-test", localKey });
  assert.equal(stored.storageProvider, "local");
});

test("a frozen private DELETE is refused before the provider is touched (both delete paths)", async () => {
  setGlobalReadOnly("ic", "freeze");
  // deletePrivateUpload(): a refusing provider seam would run if the guard were
  // skipped — assert it never gets there under a freeze.
  let providerTouched = false;
  await assert.rejects(
    deletePrivateUpload(
      { storageProvider: "local", storageKey: "held.png", localDirectory: "write-boundary-test" },
      { local: async () => { providerTouched = true; } },
    ),
    WritesFrozenError,
  );
  assert.equal(providerTouched, false, "a frozen delete must not reach the provider");
  // deleteSupabasePrivateUpload(): the exported mirror must also refuse (and must
  // NOT swallow the freeze into a silent `false`).
  await assert.rejects(deleteSupabasePrivateUpload("held.png"), WritesFrozenError);
  clearGlobalReadOnly("ic");
  // After thaw the same delete proceeds (local, force:true on a missing file is an
  // idempotent success) — proving the guard is reversible, not a hard disable.
  const after = await deletePrivateUpload({ storageProvider: "local", storageKey: "missing.png", localDirectory: "write-boundary-test" });
  assert.equal(after.ok, true);
});

test("a frozen public upload and public delete are refused by the boundary", async () => {
  const input = { pathname: "wb/x.png", file: blob(PNG), contentType: "image/png", localDirectory: "wb", localKey: "x.png" };
  setGlobalReadOnly("ic", "freeze");
  // public-upload: refused before content-type/provider branching or any I/O.
  await assert.rejects(storePublicUpload(input, {}), WritesFrozenError);
  // public-delete: refused before the configured/empty-key checks.
  await assert.rejects(deleteSupabasePublicUpload("wb/x.png"), WritesFrozenError);
  clearGlobalReadOnly("ic");
  // After thaw the guard no longer blocks: with a production-shaped env and no
  // Supabase configured, storePublicUpload reaches the provider layer and throws
  // the durable-storage error (NOT a freeze error) — proving we got past the
  // boundary — and nothing is written to disk.
  await assert.rejects(
    storePublicUpload(input, { NODE_ENV: "production" } as NodeJS.ProcessEnv),
    (err: unknown) => err instanceof Error && !(err instanceof WritesFrozenError) && (err as { code?: string }).code === "durable_public_uploads_required",
  );
  // public-delete after thaw: Supabase unconfigured in test → returns false
  // (reached the provider check, not blocked by the freeze).
  assert.equal(await deleteSupabasePublicUpload("wb/x.png"), false);
});

test("PORTAL_WRITES_FROZEN blocks writes even with NO in-state freeze (survives a restore)", () => {
  // Simulate a restored older snapshot: securityControl has NO globalReadOnly,
  // yet the out-of-band env freeze must still refuse writes during cutover.
  assert.equal(isGlobalReadOnly(), false);
  const prior = process.env.PORTAL_WRITES_FROZEN;
  process.env.PORTAL_WRITES_FROZEN = "1";
  try {
    assert.throws(() => assertWritesAllowed("test.surface"), WritesFrozenError);
    assert.throws(() => { mutate(state => { state.agencies["x"] = { id: "x" } as never; }); }, /write refused|read-only|frozen/i);
  } finally {
    if (prior === undefined) delete process.env.PORTAL_WRITES_FROZEN;
    else process.env.PORTAL_WRITES_FROZEN = prior;
  }
  // Cleared: writes resume.
  assert.doesNotThrow(() => assertWritesAllowed("test.surface"));
});

test("the storage write choke points call the boundary (static inventory)", () => {
  const privateSrc = readFileSync(join(ROOT, "src/lib/server/privateUploadStorage.ts"), "utf8");
  assert.match(privateSrc, /assertWritesAllowed\("storage\.private-upload"/, "storePrivateUpload must call the write boundary");
  const publicSrc = readFileSync(join(ROOT, "src/lib/server/publicUploadStorage.ts"), "utf8");
  assert.match(publicSrc, /assertWritesAllowed\("storage\.public-upload"/, "storePublicUpload must call the write boundary");
});
