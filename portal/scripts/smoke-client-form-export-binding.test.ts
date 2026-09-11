// The export target is live ONLY for a tested, active connection that has been
// explicitly approved and bound to the EXACT agency + client + site — and it
// goes inert the moment approval is revoked.
//
// This is the behavioural proof behind two of the acceptance requirements the
// resolver's shape alone cannot demonstrate: cross-agency / cross-client /
// cross-site substitution must FAIL (produce no endpoint), and revocation must
// disable a previously-live binding. It drives the real vault + approval path
// rather than grepping the source.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, test } from "node:test";

// `clientSupabaseExport`/`clientFormIntakeApproval` are `server-only`; stub the
// marker so this Node test can import them, exactly as the integration-connections
// smoke does.
const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {}, paths: [], children: [],
} as never;

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Connections = typeof import("../src/lib/server/integrations/integrationConnections");
type ExportResolver = typeof import("../src/lib/server/clientForms/clientSupabaseExport");
type Approval = typeof import("../src/lib/server/clientForms/clientFormIntakeApproval");

let storage: Storage;
let tenants: Tenants;
let connections: Connections;
let exportResolver: ExportResolver;
let approval: Approval;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  process.env.PORTAL_VAULT_ENCRYPTION_KEY = "export-binding-smoke-vault-key-longer-than-thirty-two-characters";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  connections = await import("../src/lib/server/integrations/integrationConnections");
  exportResolver = await import("../src/lib/server/clientForms/clientSupabaseExport");
  approval = await import("../src/lib/server/clientForms/clientFormIntakeApproval");
  await storage.ensureHydrated();
  await storage.reset();
});

// A healthy connection test: the intake function answers a GET with 405 (deployed)
// and the read function refuses a forged read with 403 — which passes the test and
// activates the connection.
const healthyFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes("/functions/v1/aqua-form-read")) {
    return new Response(JSON.stringify({ ok: false, error: "unavailable" }), { status: 403, headers: { "content-type": "application/json" } });
  }
  return new Response(null, { status: 405, headers: { "content-type": "application/json" } });
}) as typeof fetch;

test("an export target is live only for the approved, exactly-bound site — and dies on revocation", async () => {
  const agency = tenants.createAgency({ name: "Binding Co", slug: `binding-${Math.floor(performance.now())}` });
  const client = tenants.createClient(agency.id, { name: "Boundful" });
  const SITE_A = "site-alpha";
  const SITE_B = "site-beta";

  const saved = connections.saveIntegrationConnection({
    agencyId: agency.id,
    provider: "client-supabase",
    clientId: client.id,
    values: {
      projectUrl: "https://boundful.supabase.co",
      formId: "contact",
      webhookSecret: "webhook-secret-value-1111111111",
      readSecret: "read-secret-value-2222222222",
    },
    actorUserId: "owner",
  });

  // Before a passing test the connection is not active → no target, ever.
  assert.equal(
    exportResolver.clientSupabaseExportTarget(agency.id, client.id, SITE_A), undefined,
    "an untested connection must yield no export target",
  );

  // Pass the test → tested + active. Still NOT approved, so still inert.
  const tested = await connections.testIntegrationConnection(agency.id, saved.id, { userId: "owner" }, healthyFetch);
  assert.equal(tested.lastTestStatus, "passed", "the healthy mock must pass the connection test");
  assert.equal(
    exportResolver.clientSupabaseExportTarget(agency.id, client.id, SITE_A), undefined,
    "a tested+active but UNAPPROVED connection must still yield no export target (fail-closed)",
  );

  // Approve + bind to SITE_A. Now — and only now — SITE_A is live.
  approval.approveClientFormIntake({ agencyId: agency.id, connectionId: saved.id, siteId: SITE_A, actorUserId: "owner" });
  const live = exportResolver.clientSupabaseExportTarget(agency.id, client.id, SITE_A);
  assert.ok(live, "an approved, bound, tested+active connection must yield a target for its site");
  assert.equal(live!.submitUrl, "https://boundful.supabase.co/functions/v1/aqua-form-submit", "the target is the Edge Function URL");
  assert.equal(live!.formId, "contact", "the public form id is carried");
  // The resolved target carries ONLY public values — no secret can reach an export.
  assert.deepEqual(
    Object.keys(live!).sort(), ["formId", "submitUrl", "turnstileSiteKey"],
    "the export target exposes only public fields — no webhook/read secret, table, or anon key",
  );

  // ── Substitution must FAIL in every dimension ──────────────────────────
  assert.equal(
    exportResolver.clientSupabaseExportTarget(agency.id, client.id, SITE_B), undefined,
    "a DIFFERENT site must not resolve — approval binds to exactly one site",
  );
  assert.equal(
    exportResolver.clientSupabaseExportTarget(agency.id, "cl_someone_else", SITE_A), undefined,
    "a DIFFERENT client must not resolve this connection",
  );
  assert.equal(
    exportResolver.clientSupabaseExportTarget("ag_someone_else", client.id, SITE_A), undefined,
    "a DIFFERENT agency must not resolve this connection, even with the right client id",
  );

  // ── Revocation disables the previously-live binding ────────────────────
  approval.revokeClientFormIntakeApproval({ agencyId: agency.id, connectionId: saved.id, actorUserId: "owner" });
  assert.equal(
    exportResolver.clientSupabaseExportTarget(agency.id, client.id, SITE_A), undefined,
    "once approval is revoked, the site that was live must go inert",
  );
});
