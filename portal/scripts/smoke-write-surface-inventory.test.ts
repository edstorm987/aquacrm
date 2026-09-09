// Write-side-effect surface inventory (Item 4).
//
// The global/tenant write-freeze binds mutate() (all PortalState) plus every
// surface that calls assertWritesAllowed. This inventory FAILS when:
//   (a) ANY server module (not just *UploadStorage.ts) performs an object-store
//       write/delete primitive (Supabase Storage upload/remove, or Vercel Blob
//       put/del) without calling assertWritesAllowed and without an explicit
//       allowlist entry — a new unguarded object-store mutator anywhere, or
//   (b) an assertWritesAllowed surface string is used that is not in the
//       declared registry (an unclassified surface), or
//   (c) a registered surface is declared but no longer used anywhere (stale).
//
// This is the STATIC net. The BEHAVIOURAL proof that each of the four storage
// surfaces actually refuses under a freeze lives in smoke-write-boundary.test.ts
// (all four surfaces are exercised there against a real freeze). Together they
// keep the freeze coverage from silently regressing.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
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

// Files that legitimately contain an object-store write primitive WITHOUT an
// adjacent assertWritesAllowed, each with the reason it is bound elsewhere.
// Adding a file here is a deliberate, reviewed decision — the point of the net
// below is that a NEW unguarded object-store write path cannot appear silently.
const OBJECT_STORE_WRITE_ALLOWLIST: Record<string, string> = {
  // (currently empty — both storage modules guard their own primitives)
};

// Object-store WRITE primitives, matched narrowly so generic look-alikes do not
// false-positive:
//   · Supabase Storage:  `.storage.from(<bucket>).upload(` / `.remove(`
//     (excludes DOM `classList.remove(` and any non-storage `.upload(` such as
//      an injected `transport.upload(` batch abstraction).
//   · Vercel Blob:       `put(` / `del(` — ONLY counted in a file that imports
//     `@vercel/blob` (excludes unrelated `del(`/`put(` identifiers).
const SUPABASE_STORAGE_WRITE = /\.storage\s*\.from\([^)]*\)\s*\.(?:upload|remove)\(/;
const IMPORTS_VERCEL_BLOB = /from\s+["']@vercel\/blob["']/;
const VERCEL_BLOB_WRITE = /\b(?:put|del)\(/;

function performsObjectStoreWrite(src: string): boolean {
  if (SUPABASE_STORAGE_WRITE.test(src)) return true;
  if (IMPORTS_VERCEL_BLOB.test(src) && VERCEL_BLOB_WRITE.test(src)) return true;
  return false;
}

test("every server module that performs an object-store write/delete calls the write boundary", () => {
  // The object stores are the write paths mutate() never sees. This scans the
  // WHOLE server tree (not just *UploadStorage.ts) so a new object-store write
  // path added anywhere fails the build unless it either calls the boundary or
  // is explicitly allowlisted above. Closes the "a mutator in a differently
  // named module escapes the net" gap the earlier filename-scoped check had.
  const offenders: string[] = [];
  let matched = 0;
  for (const file of walk(join(ROOT, "src"))) {
    const rel = file.replace(ROOT + "/", "");
    const src = read(file);
    if (!performsObjectStoreWrite(src)) continue;
    matched += 1;
    if (rel in OBJECT_STORE_WRITE_ALLOWLIST) continue;
    if (!/assertWritesAllowed\(/.test(src)) offenders.push(rel);
  }
  // Sanity: the net must actually be finding the known object-store modules, so
  // a future refactor that hides the primitives can't turn this test into a
  // silent no-op that passes because it matched nothing.
  assert.ok(matched >= 2, `expected to match at least the two upload-storage modules, matched ${matched}`);
  assert.deepEqual(
    offenders,
    [],
    `these server modules perform an object-store write/delete but never call assertWritesAllowed — guard them (or allowlist with a reason): ${offenders.join(", ")}`,
  );
});

test("the registry documents at least the four storage surfaces", () => {
  for (const surface of ["storage.private-upload", "storage.private-delete", "storage.public-upload", "storage.public-delete"]) {
    assert.ok(surface in WRITE_SURFACE_REGISTRY, `${surface} must be registered`);
  }
});
