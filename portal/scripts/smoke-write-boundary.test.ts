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

import { storePrivateUpload } from "../src/lib/server/privateUploadStorage";
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
