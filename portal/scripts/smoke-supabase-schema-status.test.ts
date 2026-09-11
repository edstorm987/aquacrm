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
    "aqua_tag_submissions", "aqua_write_controls", "aqua_write_control_events",
    "aqua_write_quarantines",
  ]) assert.ok(tables.has(name), `expected table ${name}`);
  assert.equal(tables.size, 25);
  // 20260731133000 drops the first app_datastores; 20260807010000 restores it.
  assert.equal(tables.get("app_datastores"), "20260807010000_restore_aquacrm_datastore.sql");
});

test("every callable function is expected with its migration; trigger functions are not RPCs", () => {
  const { rpcs } = expectedObjects();
  assert.ok(rpcs.size >= 26, `expected at least 26 callable functions, saw ${rpcs.size}`);
  // 20260911120000 lease-fences the write in-transaction, adding p_lease_fences.
  assert.deepEqual(rpcs.get("apply_app_datastore_patch")?.params, ["p_app_key", "p_operation_id", "p_operations", "p_lease_fences"]);
  assert.equal(rpcs.get("apply_app_datastore_patch")?.file, "20260911120000_lease_fenced_datastore_patch.sql");
  for (const name of ["apply_app_datastore_patch_with_sidecars", "load_app_datastore_with_sidecars", "renew_product_workspace_lease", "ingest_aqua_tag_submission", "claim_aqua_tag_submission_work", "settle_aqua_tag_submission_work", "current_profile_agency_id", "claim_inbox_webhook_events", "claim_lead_conversion", "claim_product_workspace_lease", "claim_editor_ai_reply", "read_aqua_write_admission", "set_aqua_write_control", "aqua_assert_write_admitted", "record_aqua_write_quarantine", "list_aqua_write_quarantines", "resolve_aqua_write_quarantine"]) {
    assert.ok(rpcs.has(name), `expected rpc ${name}`);
  }
  for (const trigger of ["touch_updated_at", "handle_new_auth_user", "archive_app_datastore_version", "brand_enquiries_default_agency"]) {
    assert.ok(!rpcs.has(trigger), `${trigger} returns trigger and must not be listed as an RPC`);
  }
});

test("the added columns and the eight buckets are expected", () => {
  const { columns, buckets } = expectedObjects();
  assert.deepEqual([...columns.keys()].sort(), ["brand_enquiries.agency_id", "inbox_webhook_events.lease_owner", "profiles.agency_id", "website_consent_events.agency_id"]);
  assert.equal(buckets.size, 8);
  assert.equal(buckets.get("aquacrm-uploads")?.isPublic, false);
  assert.equal(
    buckets.get("aquacrm-uploads")?.file,
    "20260910010000_harden_aquacrm_public_media_bucket.sql",
  );
  assert.equal(buckets.get("aquacrm-public")?.isPublic, true);
  assert.equal(buckets.get("aquacrm-public")?.limit, 8 * 1024 * 1024);
  assert.equal(
    buckets.get("aquacrm-public")?.file,
    "20260910010000_harden_aquacrm_public_media_bucket.sql",
  );
  assert.deepEqual(
    [...(buckets.get("aquacrm-public")?.mimes ?? [])].sort(),
    ["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"],
  );
});

test("the forward hardening and live SQL verifier both fail closed on bucket exposure drift", () => {
  const migration = readFileSync(new URL(
    "../../supabase/migrations/20260910010000_harden_aquacrm_public_media_bucket.sql",
    import.meta.url,
  ), "utf8");
  const verifier = readFileSync(new URL("../../supabase/rls-verify.sql", import.meta.url), "utf8");
  assert.match(migration, /update storage\.buckets\s+set public = false\s+where id = 'aquacrm-uploads'/);
  assert.match(migration, /aquacrm-uploads must remain private/);
  assert.match(verifier, /containment-private-storage-public/);
  assert.match(verifier, /id = 'aquacrm-uploads' and public is false/);
  assert.match(verifier, /containment-public-storage-private/);
  assert.match(migration, /from pg_policies pol\s+where pol\.schemaname = 'storage'\s+and pol\.tablename = 'objects'\s+and pol\.cmd in \('INSERT', 'UPDATE', 'DELETE', 'ALL'\)/);
  assert.match(migration, /from unnest\(pol\.roles\) as policy_role\(role_name\)\s+left join pg_roles target_role on target_role\.rolname = policy_role\.role_name[\s\S]*?when policy_role\.role_name = 'public'::name then true[\s\S]*?pg_has_role\('anon', target_role\.oid, 'member'\)[\s\S]*?pg_has_role\('authenticated', target_role\.oid, 'member'\)/,
    "the migration must reject custom policy roles inherited by either browser principal");
  assert.match(migration, /raise exception 'storage hardening failed: browser-role storage\.objects write policy exists:/);
  assert.match(
    verifier,
    /select 'FAIL', 'containment-storage-browser-write-policy',[\s\S]*?from pg_policies pol\s+where pol\.schemaname = 'storage'\s+and pol\.tablename = 'objects'\s+and pol\.cmd in \('INSERT', 'UPDATE', 'DELETE', 'ALL'\)[\s\S]*?from unnest\(pol\.roles\) as policy_role\(role_name\)[\s\S]*?pg_has_role\('anon', target_role\.oid, 'member'\)[\s\S]*?pg_has_role\('authenticated', target_role\.oid, 'member'\)/,
    "the live verifier must detect effective storage writes by command and role rather than policy name",
  );
  assert.match(
    migration,
    /select c\.relrowsecurity, c\.relforcerowsecurity, c\.relowner\s+into storage_objects_rls, storage_objects_force_rls, storage_objects_owner\s+from pg_class c\s+join pg_namespace n on n\.oid = c\.relnamespace\s+where n\.nspname = 'storage'\s+and c\.relname = 'objects'\s+and c\.relkind in \('r', 'p'\)/,
    "the forward migration must inspect the real storage.objects relation",
  );
  assert.match(migration, /raise exception 'storage hardening failed: storage\.objects table is missing'/);
  assert.match(migration, /storage_objects_rls is distinct from true[\s\S]*?raise exception 'storage hardening failed: RLS is disabled on storage\.objects'/);
  assert.match(
    migration,
    /from \(values \('anon'::name\), \('authenticated'::name\)\) as browser\(role_name\)[\s\S]*?role_row\.oid is null[\s\S]*?role_row\.rolsuper[\s\S]*?role_row\.rolbypassrls[\s\S]*?storage_objects_force_rls is distinct from true[\s\S]*?pg_has_role\(role_row\.oid, storage_objects_owner, 'member'\)/,
    "the migration must reject missing, privileged or effective-owner browser roles",
  );
  assert.match(migration, /browser role can bypass storage\.objects RLS/);
  assert.match(
    verifier,
    /select 'FAIL', 'containment-storage-objects-missing',[\s\S]*?where not exists \([\s\S]*?n\.nspname = 'storage'[\s\S]*?c\.relname = 'objects'[\s\S]*?c\.relkind in \('r', 'p'\)\s*\)/,
    "the live verifier must fail when storage.objects is absent",
  );
  assert.match(
    verifier,
    /select 'FAIL', 'containment-storage-objects-rls-disabled',[\s\S]*?where exists \([\s\S]*?n\.nspname = 'storage'[\s\S]*?c\.relname = 'objects'[\s\S]*?c\.relrowsecurity is false\s*\)/,
    "the live verifier must fail when storage.objects RLS is disabled",
  );
  assert.match(
    migration,
    /drop policy if exists "Public can read public ecosystem assets" on storage\.objects;\s*create policy "Public can read public ecosystem assets"\s*on storage\.objects for select\s*to anon, authenticated\s*using \(\s*bucket_id in \('aquacrm-public', 'aquaoasis-web-public', 'milesymedia-public', 'zimante-group-public'\)\s*\)/,
    "the forward migration must reassert only the canonical four-public-bucket direct-read policy",
  );
  assert.match(migration, /expected_public_read_qual constant text[\s\S]*?regexp_replace\(lower\(coalesce\(pol\.qual, ''\)\), '\[\[:space:\]\(\)\]', '', 'g'\) = expected_public_read_qual/,
    "the migration must compare a normalized canonical policy qualification");
  assert.match(migration, /pol\.cmd in \('SELECT', 'ALL'\)[\s\S]*?from unnest\(pol\.roles\) as policy_role\(role_name\)[\s\S]*?pg_has_role\('anon', target_role\.oid, 'member'\)[\s\S]*?pg_has_role\('authenticated', target_role\.oid, 'member'\)[\s\S]*?unexpected browser-readable storage\.objects policy exists/,
    "other direct, PUBLIC or inherited-role browser read policies must abort the migration");
  assert.match(verifier, /browser_storage_read_policies as \([\s\S]*?pol\.cmd in \('SELECT', 'ALL'\)[\s\S]*?from unnest\(pol\.roles\) as policy_role\(role_name\)[\s\S]*?pg_has_role\('authenticated', target_role\.oid, 'member'\)/);
  assert.match(verifier, /canonical_storage_read_policies as \([\s\S]*?Public can read public ecosystem assets[\s\S]*?cardinality\(pol\.roles\) = 2[\s\S]*?regexp_replace\(lower\(coalesce\(pol\.qual, ''\)\)[\s\S]*?'bucket_id=anyarray\[''aquacrm-public''::text,''aquaoasis-web-public''::text,''milesymedia-public''::text,''zimante-group-public''::text\]'/,
    "the verifier's canonical qualification must contain only the four intentionally public buckets");
  assert.match(verifier, /containment-storage-public-read-contract-missing-or-altered/);
  assert.match(verifier, /containment-storage-unexpected-browser-read-policy/);
  assert.match(
    verifier,
    /browser_storage_rls_bypasses as \([\s\S]*?role_row\.oid is null[\s\S]*?role_row\.rolsuper[\s\S]*?role_row\.rolbypassrls[\s\S]*?storage_relation\.relforcerowsecurity is false[\s\S]*?pg_has_role\(role_row\.oid, storage_relation\.relowner, 'member'\)/,
    "the verifier must classify every browser path that makes RLS ineffective",
  );
  assert.match(verifier, /containment-storage-browser-role-bypasses-rls/);
});

test("the containment success row excludes read-only writes, sealed sequences and storage write policies", () => {
  const verifier = readFileSync(new URL("../../supabase/rls-verify.sql", import.meta.url), "utf8");
  const infoStart = verifier.indexOf("select 'INFO', 'containment-verified'");
  assert.notEqual(infoStart, -1, "the verifier must retain its final containment success row");
  const successPredicate = verifier.slice(infoStart);

  assert.match(
    successPredicate,
    /not exists \(\s*select 1 from read_only_tables t\s*cross join \(values \('anon'\), \('authenticated'\)\) r\(role\)\s*cross join \(values \('INSERT'\), \('UPDATE'\), \('DELETE'\), \('TRUNCATE'\), \('REFERENCES'\), \('TRIGGER'\)\) p\(priv\)\s*where has_table_privilege\(r\.role, t\.table_name, p\.priv\)\s*\)/,
    "containment-verified must stay absent when a browser role can write a read-only table",
  );
  assert.match(
    successPredicate,
    /not exists \(\s*select 1 from pg_class s\s*join pg_depend d on d\.objid = s\.oid and d\.deptype = 'a'\s*join pg_class t on t\.oid = d\.refobjid\s*join pg_namespace n on n\.oid = t\.relnamespace\s*join sealed_tables st on st\.table_name = 'public\.' \|\| t\.relname\s*cross join \(values \('anon'\), \('authenticated'\)\) r\(role\)\s*where s\.relkind = 'S' and n\.nspname = 'public'\s*and \(has_sequence_privilege\(r\.role, s\.oid, 'USAGE'\)\s*or has_sequence_privilege\(r\.role, s\.oid, 'SELECT'\)\s*or has_sequence_privilege\(r\.role, s\.oid, 'UPDATE'\)\)\s*\)/,
    "containment-verified must stay absent when a browser role can use a sealed-table sequence",
  );
  assert.match(
    successPredicate,
    /not exists \(\s*select 1 from pg_policies pol\s*where pol\.schemaname = 'storage'\s+and pol\.tablename = 'objects'\s+and pol\.cmd in \('INSERT', 'UPDATE', 'DELETE', 'ALL'\)[\s\S]*?from unnest\(pol\.roles\) as policy_role\(role_name\)[\s\S]*?when policy_role\.role_name = 'public'::name then true[\s\S]*?pg_has_role\('anon', target_role\.oid, 'member'\)[\s\S]*?pg_has_role\('authenticated', target_role\.oid, 'member'\)[\s\S]*?end\s*\)\s*\)/,
    "containment-verified must stay absent for renamed, PUBLIC-role or ALL-command storage write policies",
  );
  assert.match(
    successPredicate,
    /exists \(\s*select 1\s+from pg_class c\s+join pg_namespace n on n\.oid = c\.relnamespace\s+where n\.nspname = 'storage'\s+and c\.relname = 'objects'\s+and c\.relkind in \('r', 'p'\)\s+and c\.relrowsecurity is true\s*\)/,
    "containment-verified must require storage.objects to exist with RLS enabled",
  );
  assert.match(successPredicate, /exists \(\s*select 1 from canonical_storage_read_policies\s*\)/,
    "containment-verified must require the exact canonical public-read policy");
  assert.match(successPredicate, /not exists \(\s*select 1 from unexpected_browser_storage_read_policies\s*\)/,
    "containment-verified must reject every other browser-effective storage read policy");
  assert.match(successPredicate, /not exists \(\s*select 1 from browser_storage_rls_bypasses\s*\)/,
    "containment-verified must reject missing, BYPASSRLS, superuser or effective-owner browser roles");
});

test("the tool is read-only and prints no secret", () => {
  assert.doesNotMatch(SOURCE, /method:\s*"(POST|PUT|PATCH|DELETE)"/i, "the status tool must only GET/HEAD");
  assert.doesNotMatch(SOURCE, /\/rest\/v1\/rpc\//, "the status tool must never invoke an RPC");
  assert.match(SOURCE, /createHash\("sha256"\)\.update\(key\)\.digest\("hex"\)\.slice\(0, 12\)/, "keys appear only as 12-char fingerprints");
  assert.match(SOURCE, /method: "HEAD"/, "row counts are HEAD-only");
  assert.match(
    SOURCE,
    /SUPABASE_SECRET_KEY\?\.trim\(\)[\s\S]*?SUPABASE_SERVICE_ROLE_KEY\?\.trim\(\)/,
    "the live drift tool must accept current and legacy server-key aliases",
  );
  assert.match(
    SOURCE,
    /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\?\.trim\(\)[\s\S]*?NEXT_PUBLIC_PUBLISHABLE_KEY\?\.trim\(\)[\s\S]*?NEXT_PUBLIC_SUPABASE_ANON_KEY\?\.trim\(\)/,
    "the live drift tool must accept every public-key alias used by runtime Auth",
  );
});
