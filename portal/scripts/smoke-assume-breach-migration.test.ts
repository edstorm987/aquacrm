import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
  path.resolve(here, "../../supabase/migrations/20260912160000_browser_privilege_closure.sql"),
  "utf8",
).replace(/\s+/g, " ").toLowerCase();
const verifier = readFileSync(
  path.resolve(here, "../../supabase/rls-verify.sql"),
  "utf8",
).replace(/\s+/g, " ").toLowerCase();
const rlsTriggerMigration = readFileSync(
  path.resolve(here, "../../supabase/migrations/20260903130000_ensure_rls_event_trigger.sql"),
  "utf8",
).replace(/\s+/g, " ").toLowerCase();

describe("assume-breach migration revokes every inherited browser capability", () => {
  it("preserves the managed RLS trigger and fails closed on an unprivileged fresh rebuild", () => {
    assert.doesNotMatch(rlsTriggerMigration, /drop event trigger if exists ensure_rls;/);
    assert.match(rlsTriggerMigration, /from pg_event_trigger where evtname = 'ensure_rls'/);
    assert.match(rlsTriggerMigration, /if not coalesce\(current_role_is_superuser, false\)/);
    assert.match(rlsTriggerMigration, /must be provisioned by a supabase superuser/);
    assert.match(rlsTriggerMigration, /e\.evtevent = 'ddl_command_end'/);
    assert.match(rlsTriggerMigration, /e\.evtenabled = 'o'/);
    assert.match(rlsTriggerMigration, /e\.evtfoid = 'public\.rls_auto_enable\(\)'::regprocedure/);
    assert.match(rlsTriggerMigration, /p\.prosecdef/);
    assert.match(rlsTriggerMigration, /search_path=pg_catalog/);
    assert.match(rlsTriggerMigration, /raise log 'rls_auto_enable: failed to enable rls on %'.* raise;/);
  });

  it("uses REVOKE ALL before granting the exact table capabilities back", () => {
    assert.match(migration, /revoke all privileges on all tables in schema public from public, anon, authenticated/);
    assert.match(migration, /grant select on table public\.profiles to authenticated/);
    assert.match(migration, /grant insert on table public\.brand_enquiries to anon, authenticated/);
  });

  it("checks non-DML table privileges that bypass or weaken RLS", () => {
    assert.match(migration, /cross join lateral aclexplode\(coalesce\(c\.relacl, '\{\}'::aclitem\[\]\)\)/);
    assert.match(migration, /public table acl mismatch/);
  });

  it("revokes and verifies the inherited private-sequence privileges", () => {
    assert.match(
      migration,
      /revoke all privileges on all sequences in schema public from public, anon, authenticated/,
    );
    assert.match(migration, /public sequence acl survived/);
  });

  it("removes direct browser EXECUTE from trigger and security helpers and verifies the result", () => {
    assert.match(migration, /revoke execute on all functions in schema public from public, anon, authenticated/);
    assert.match(migration, /public function execute survived/);
  });

  it("narrows storage.objects to public reads and audits direct column grants", () => {
    assert.match(migration, /revoke all privileges on table storage\.objects from public, anon, authenticated/);
    assert.match(migration, /grant select on table storage\.objects to anon, authenticated/);
    assert.match(migration, /direct column acl survived/);
    assert.match(migration, /storage\.objects privilege beyond select survived/);
  });

  it("uses exact policy and default-ACL allowlists instead of a name-only denylist", () => {
    assert.match(migration, /policy semantic mismatch/);
    assert.match(migration, /permissive, roles, cmd, qual, with_check/);
    assert.match(migration, /regexp_replace\(coalesce\(with_check, ''\)/);
    assert.match(migration, /is_grantable/);
    assert.match(migration, /cross join lateral aclexplode\(d\.defaclacl\)/);
    assert.match(migration, /unsafe public default acl survived/);
    assert.match(migration, /alter default privileges for role %i revoke all privileges on tables/);
    assert.match(migration, /d\.defaclnamespace = 0 or n\.nspname = 'public'/);
  });

  it("keeps the live verifier aligned with the closure and new private tables", () => {
    assert.match(verifier, /inbox_client_erasure_tombstones/);
    assert.match(verifier, /aqua_auth_nonces/);
    assert.match(verifier, /unexpected-browser-table-acl/);
    assert.match(verifier, /browser-sequence-acl/);
    assert.match(verifier, /browser-column-acl/);
    assert.match(verifier, /browser-function-execute/);
    assert.match(verifier, /browser-role-membership/);
    assert.match(verifier, /unsafe-public-default-acl/);
    assert.match(verifier, /unexpected-browser-policy/);
    assert.match(verifier, /rls-event-trigger-mismatch/);
  });
});
