// Write-side-effect surface inventory (Item 4).
//
// The global/tenant write-freeze binds mutate() (all PortalState) plus every
// surface that calls assertWritesAllowed. This inventory FAILS when:
//   (a) a *UploadStorage module gains a write/delete primitive without the
//       assertWritesAllowed guard (a new unclassified storage mutator), or
//   (b) an assertWritesAllowed surface string is used that is not in the
//       declared registry (an unclassified surface), or
//   (c) a registered surface is declared but no longer used anywhere (stale).
//
// It is deliberately behavioural about the STORAGE class (the object stores are
// the write paths mutate() cannot see) and enumerated about the surface strings,
// so the freeze coverage cannot silently regress.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_LIB = join(ROOT, "src", "lib", "server");
const read = (p: string) => readFileSync(p, "utf8");

// Every write-side-effect surface class that is guarded by the freeze, with a
// one-line classification. A NEW guarded surface must be added here; a removed
// one must be deleted here. (mutate() covers all PortalState writes separately
// and carries its own SecurityLockdownError guard — it is not a string surface.)
const WRITE_SURFACE_REGISTRY: Record<string, string> = {
  "storage.private-upload": "private object-store ingestion (storePrivateUpload)",
  "storage.private-delete": "private object-store deletion (deletePrivateUpload)",
  "storage.public-upload": "public media ingestion (storePublicUpload)",
  "storage.public-delete": "public media deletion (deleteSupabasePublicUpload)",
};

/** Recursively collect .ts files under a dir. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

test("every assertWritesAllowed surface string is classified in the registry", () => {
  const used = new Set<string>();
  for (const file of walk(join(ROOT, "src"))) {
    const src = read(file);
    for (const m of src.matchAll(/assertWritesAllowed\("([a-z0-9.-]+)"/g)) used.add(m[1]!);
  }
  const unclassified = [...used].filter(s => !(s in WRITE_SURFACE_REGISTRY));
  assert.deepEqual(unclassified, [], `these write surfaces are used but not classified: ${unclassified.join(", ")}`);
  // And no registry entry is stale.
  const stale = Object.keys(WRITE_SURFACE_REGISTRY).filter(s => !used.has(s));
  assert.deepEqual(stale, [], `these registered surfaces are no longer used — remove them: ${stale.join(", ")}`);
});

test("every object-store module that writes or deletes calls the write boundary", () => {
  // The object stores are the write paths mutate() never sees. Any module here
  // that performs a provider write/delete MUST gate it — this fails loudly if a
  // new storage mutator is added without the guard.
  const WRITE_PRIMITIVES = /\.upload\(|\bput\(|\.remove\(|\bdel\(|writeFile\(/;
  const storageModules = walk(SERVER_LIB).filter(f => /UploadStorage\.ts$/.test(f));
  assert.ok(storageModules.length >= 2, `expected the upload-storage modules, found ${storageModules.length}`);
  for (const file of storageModules) {
    const src = read(file);
    if (WRITE_PRIMITIVES.test(src)) {
      assert.match(
        src,
        /assertWritesAllowed\(/,
        `${file.replace(ROOT + "/", "")} performs a storage write/delete but never calls assertWritesAllowed — classify and guard it`,
      );
    }
  }
});

test("the registry documents at least the four storage surfaces", () => {
  for (const surface of ["storage.private-upload", "storage.private-delete", "storage.public-upload", "storage.public-delete"]) {
    assert.ok(surface in WRITE_SURFACE_REGISTRY, `${surface} must be registered`);
  }
});
