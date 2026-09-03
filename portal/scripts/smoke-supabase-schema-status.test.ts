// Pins the migration parser behind `scripts/supabase-schema-status.mjs`, the
// read-only live-drift tool. The tool needs a network and a service key; this
// smoke needs neither. It fails if the parser stops seeing an object the
// migrations define, so the drift table cannot go quietly narrow.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { expectedObjects } from "./supabase-schema-status.mjs";

const SOURCE = readFileSync(new URL("./supabase-schema-status.mjs", import.meta.url), "utf8");

test("every table the migrations create is expected, and the one they drop is not", () => {
  const { tables } = expectedObjects();
  for (const name of [
    "profiles", "brands", "clients", "client_portals", "client_portal_members", "audit_events",
    "shoots", "shoot_photos", "brand_enquiries", "app_datastores", "website_consent_events",
    "app_datastore_history", "inbox_channel_connections", "inbox_contact_identities",
    "inbox_conversations", "inbox_messages", "inbox_webhook_events", "editor_ai_reply_claims",
    "lead_conversion_operations", "product_workspace_leases", "app_datastore_patch_receipts",
    "aqua_tag_submissions",
  ]) assert.ok(tables.has(name), `expected table ${name}`);
  assert.equal(tables.size, 22);
  // 20260731133000 drops the first app_datastores; 20260807010000 restores it.
  assert.equal(tables.get("app_datastores"), "20260807010000_restore_aquacrm_datastore.sql");
});

test("every callable function is expected with its migration; trigger functions are not RPCs", () => {
  const { rpcs } = expectedObjects();
  assert.ok(rpcs.size >= 26, `expected at least 26 callable functions, saw ${rpcs.size}`);
  assert.deepEqual(rpcs.get("apply_app_datastore_patch")?.params, ["p_app_key", "p_operation_id", "p_operations"]);
  assert.equal(rpcs.get("apply_app_datastore_patch")?.file, "20260902090000_merge_app_datastore_patch_objects.sql");
  for (const name of ["apply_app_datastore_patch_with_sidecars", "load_app_datastore_with_sidecars", "renew_product_workspace_lease", "ingest_aqua_tag_submission", "claim_aqua_tag_submission_work", "settle_aqua_tag_submission_work", "current_profile_agency_id", "claim_inbox_webhook_events", "claim_lead_conversion", "claim_product_workspace_lease", "claim_editor_ai_reply"]) {
    assert.ok(rpcs.has(name), `expected rpc ${name}`);
  }
  for (const trigger of ["touch_updated_at", "handle_new_auth_user", "archive_app_datastore_version", "brand_enquiries_default_agency"]) {
    assert.ok(!rpcs.has(trigger), `${trigger} returns trigger and must not be listed as an RPC`);
  }
});

test("the added columns and the eight buckets are expected", () => {
  const { columns, buckets } = expectedObjects();
  assert.deepEqual([...columns.keys()].sort(), ["brand_enquiries.agency_id", "inbox_webhook_events.lease_owner", "profiles.agency_id"]);
  assert.equal(buckets.size, 8);
  assert.equal(buckets.get("aquacrm-uploads")?.isPublic, false);
  assert.equal(buckets.get("aquacrm-public")?.isPublic, true);
});

test("the tool is read-only and prints no secret", () => {
  assert.doesNotMatch(SOURCE, /method:\s*"(POST|PUT|PATCH|DELETE)"/i, "the status tool must only GET/HEAD");
  assert.doesNotMatch(SOURCE, /\/rest\/v1\/rpc\//, "the status tool must never invoke an RPC");
  assert.match(SOURCE, /createHash\("sha256"\)\.update\(key\)\.digest\("hex"\)\.slice\(0, 12\)/, "keys appear only as 12-char fingerprints");
  assert.match(SOURCE, /method: "HEAD"/, "row counts are HEAD-only");
});
