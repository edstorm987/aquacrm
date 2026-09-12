// BRAND-ERASURE-001 — race-safe brand-enquiry metadata operations.
//
// Proves the semantics the atomic SQL applies, without a database (local-only):
//   - a writer MERGE and an erasure of DISJOINT keys COMMUTE, so no ordering of a
//     concurrent write can restore removed client lineage / PII (the two-writer
//     race);
//   - erasure is idempotent (re-run = no-op);
//   - routing-vs-identity independence and unrelated-client survival hold;
//   - a writer patch may never carry lineage keys;
//   - the migration is a locked, service-role-only, fixed-search-path pair.
//
// Run: node --import tsx --test scripts/smoke-brand-enquiry-atomic.test.ts

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  mergeEnquiryMetadata,
  eraseEnquiryClientLineage,
  isWriterPatchSafe,
} from "../src/lib/server/enquiries/brandEnquiryMetadataOps";

const CLIENT = "cl_target";
const OTHER = "cl_other";

// A representative enquiry routed to CLIENT and identity-resolved to CLIENT, with
// captured PII in metadata — the strongest erasure case.
function seedResolved() {
  return {
    clientId: CLIENT,
    clientLinkedAt: 1_000,
    channel: "form",
    replies: [{ body: "hi" }],
    calls: [{ id: "c1" }],
    formCapture: { email: "a@b.co" },
    identityResolution: { status: "resolved", clientId: CLIENT, clientName: "Acme", confidence: 0.9 },
  } as Record<string, unknown>;
}

// A realistic concurrent writer patch (the response recorder) — disjoint keys.
const WRITER_PATCH = { firstRespondedAt: "2026-09-12T12:00:00Z", lastRespondedAt: "2026-09-12T12:05:00Z", lastRespondedBy: "u1" };

test("BRAND-ERASURE-001: a writer merge and an erase COMMUTE (two-writer race)", () => {
  // Order A: writer wins the race, then erasure runs.
  const a = eraseEnquiryClientLineage(mergeEnquiryMetadata(seedResolved(), WRITER_PATCH), CLIENT).metadata;
  // Order B: erasure runs, then the (stale-keyed) writer merges.
  const b = mergeEnquiryMetadata(eraseEnquiryClientLineage(seedResolved(), CLIENT).metadata, WRITER_PATCH);
  assert.deepEqual(a, b, "the two orders must converge — no lost update either way");
  for (const state of [a, b]) {
    assert.ok(!("clientId" in state), "client lineage stays removed regardless of order");
    assert.ok(!("replies" in state) && !("calls" in state) && !("formCapture" in state), "PII stays removed");
    assert.equal((state as { lastRespondedAt?: string }).lastRespondedAt, WRITER_PATCH.lastRespondedAt, "the writer's own keys survive");
    const ir = state.identityResolution as Record<string, unknown>;
    assert.ok(!("clientId" in ir) && !("clientName" in ir), "resolved lineage removed");
  }
});

test("BRAND-ERASURE-001: erasure is idempotent", () => {
  const once = eraseEnquiryClientLineage(seedResolved(), CLIENT);
  assert.equal(once.changed, true);
  const twice = eraseEnquiryClientLineage(once.metadata, CLIENT);
  assert.equal(twice.changed, false, "re-erasing already-clean metadata changes nothing");
  assert.deepEqual(twice.metadata, once.metadata);
});

test("BRAND-ERASURE-001: routing vs identity independence, and PII strip only when resolved-as-client", () => {
  // Routed to CLIENT, no identity resolution → unlink only, no PII strip.
  const routedOnly = eraseEnquiryClientLineage({ clientId: CLIENT, clientLinkedAt: 1, name: "keep-in-column", channel: "form" }, CLIENT);
  assert.equal(routedOnly.stripPii, false, "a bare route does not authorise stripping the enquirer's PII");
  assert.ok(!("clientId" in routedOnly.metadata));
  assert.equal(routedOnly.review, "legacyUnscoped");

  // Identity resolved to ANOTHER client → must survive CLIENT's erasure entirely.
  const otherSeed = { identityResolution: { status: "resolved", clientId: OTHER, clientName: "Other" }, channel: "form" };
  const untouched = eraseEnquiryClientLineage(otherSeed, CLIENT);
  assert.equal(untouched.changed, false, "another client's resolution must not be touched");
  assert.deepEqual(untouched.metadata, otherSeed);
});

test("BRAND-ERASURE-001: a writer patch may never carry lineage keys", () => {
  assert.equal(isWriterPatchSafe({ lastRespondedAt: "x" }), true);
  assert.equal(isWriterPatchSafe({ clientId: "sneaky" }), false);
  assert.equal(isWriterPatchSafe({ identityResolution: {} }), false);
  assert.equal(isWriterPatchSafe({ clientLinkedAt: 1 }), false);
});

test("BRAND-ERASURE-001: the migration is a locked, service-role-only, fixed-search-path pair", () => {
  const sql = readFileSync("../supabase/migrations/20260912150000_brand_enquiry_atomic_metadata.sql", "utf8");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.brand_enquiry_metadata_merge/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.brand_enquiry_erase_client_lineage/);
  assert.match(sql, /SELECT metadata INTO m FROM public\.brand_enquiries[\s\S]*?FOR UPDATE/, "erasure locks the row (atomic read+write)");
  assert.match(sql, /writer patch may not touch client lineage keys/, "the merge RPC refuses lineage keys");
  // Both functions are SECURITY DEFINER with a fixed search_path and service-role-only.
  assert.equal((sql.match(/SECURITY DEFINER SET search_path = public/g) ?? []).length, 2);
  assert.equal((sql.match(/GRANT EXECUTE ON FUNCTION[\s\S]*?TO service_role;/g) ?? []).length, 2);
  assert.equal((sql.match(/REVOKE ALL ON FUNCTION[\s\S]*?FROM public, anon, authenticated;/g) ?? []).length, 2);
});
