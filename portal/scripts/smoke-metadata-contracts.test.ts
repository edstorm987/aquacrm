// Metadata contracts — closing the `Record<string, unknown>` escape hatch.
//
// `lib/data/metadataContracts.ts` catalogues every metadata key the source
// tree touches, with namespace, owner, type and sensitivity. This test scans
// `src/` for `metadata.<key>` / `metadata["<key>"]` accesses and fails when a
// key is used that the catalogue does not know — so from this commit on, a
// new metadata key cannot ship without an owner, a type and a sensitivity
// class. It also fails when the catalogue carries keys nothing touches any
// more (minus the explicit stored-data allowlist), so entries retire with
// the code instead of rotting.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  METADATA_KEY_CONTRACTS,
  isCataloguedMetadataKey,
  metadataKeysByNamespace,
  personalMetadataKeys,
} from "../src/lib/data/metadataContracts";

const SRC_ROOT = join(__dirname, "..", "src");

/**
 * Keys catalogued for STORED data although no source path reads them today
 * (named in server/types.ts comments or seen in live documents). Anything
 * else catalogued-but-unused must be retired with the code that stopped
 * using it.
 */
const STORED_DATA_ONLY_KEYS = new Set(["practiceName"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

function scanMetadataKeys(): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  // First char excludes `$` so a template interpolation in prose —
  // `` `metadata.${key} is required` `` — is not mistaken for a key access.
  const dot = /\bmetadata\??\.([A-Za-z_][A-Za-z0-9_$]*)/g;
  const bracket = /\bmetadata(?:\?\.)?\[\s*"([^"]+)"\s*\]/g;
  for (const file of walk(SRC_ROOT)) {
    const source = readFileSync(file, "utf-8");
    for (const pattern of [dot, bracket]) {
      for (const match of source.matchAll(pattern)) {
        const key = match[1]!;
        const bucket = found.get(key) ?? new Set<string>();
        bucket.add(file.slice(SRC_ROOT.length + 1));
        found.set(key, bucket);
      }
    }
  }
  return found;
}

test("every metadata key the source touches is catalogued", () => {
  const found = scanMetadataKeys();
  const uncatalogued = [...found.entries()]
    .filter(([key]) => !isCataloguedMetadataKey(key))
    .map(([key, files]) => `${key} (${[...files].slice(0, 3).join(", ")})`)
    .sort();
  assert.deepEqual(
    uncatalogued,
    [],
    "Uncatalogued metadata keys in source. Add each to METADATA_KEY_CONTRACTS " +
      "with its carrier, namespace, owner, type and sensitivity — that is the " +
      "whole cost of keeping the escape hatch governed:\n" + uncatalogued.join("\n"),
  );
});

test("the catalogue carries no dead entries beyond the stored-data allowlist", () => {
  const found = scanMetadataKeys();
  const dead = METADATA_KEY_CONTRACTS
    .map(contract => contract.key)
    .filter(key => !found.has(key) && !STORED_DATA_ONLY_KEYS.has(key))
    .sort();
  assert.deepEqual(dead, [], `catalogued metadata keys nothing in src touches any more: ${dead.join(", ")}`);
});

test("catalogue integrity: unique keys, namespaced, owners stated", () => {
  const keys = METADATA_KEY_CONTRACTS.map(contract => contract.key);
  assert.equal(new Set(keys).size, keys.length, "duplicate metadata key contract");
  for (const contract of METADATA_KEY_CONTRACTS) {
    assert.ok(contract.owner.trim().length > 0, `${contract.key}: owner required`);
    assert.ok(contract.type.trim().length > 0, `${contract.key}: type description required`);
  }
  // Namespaces exist and group sensibly — the migration plan moves one at a time.
  const grouped = metadataKeysByNamespace();
  assert.ok(grouped.size >= 10, "expected the catalogue to span its declared namespaces");
});

test("PII keys are classified so the erasure sweep has a checklist", () => {
  const personal = new Set(personalMetadataKeys());
  // Contact-and-identity keys that erasure MUST cover — pinned so a
  // reclassification to 'none' cannot silently drop them from the sweep.
  for (const key of ["clientEmail", "portalLoginEmail", "contactPhone", "linkedContacts", "clientRequests", "files", "inboxCalls", "whatsappLink"]) {
    assert.ok(personal.has(key), `${key} must stay classified as personal data`);
  }
});
