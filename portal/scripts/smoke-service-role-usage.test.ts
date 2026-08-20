/**
 * Service-role usage — measured, pinned, and only allowed to go DOWN knowingly.
 *
 * WHY THIS EXISTS
 * RLS only gates requests made with the anon key; every
 * `createSupabaseAdminClient()` call site bypasses it entirely. The RLS plan
 * (docs/development/plans/rls-enable.md, phase 4) reduces that surface: on
 * 2026-08-20 the portal had 23 call sites across 18 files; the website-inbox
 * routes were then moved onto the signed-in user's scoped client
 * (`createScopedSupabaseClient`), leaving the sites pinned below — each of
 * which has a documented reason it must keep the service role.
 *
 * MEASUREMENT METHOD (keep it identical or the history is meaningless):
 * count occurrences of the literal `createSupabaseAdminClient(` in `src/`,
 * excluding only `src/lib/supabase/admin.ts` — the file that defines it.
 * That is the same thing as: grep -rn 'createSupabaseAdminClient(' src/
 * minus the definition file.
 *
 * IF THIS TEST FAILS:
 * - You REMOVED a site (good): update EXPECTED_SITES, and record the new
 *   count in the plan's phase-4 table so the reduction is on the record.
 * - You ADDED a site: stop. Decide whether the new code can run under the
 *   user's session (`createScopedSupabaseClient`) instead. If it genuinely
 *   needs the service role (storage ACLs, auth.admin, public endpoints with
 *   no session, cross-tenant erasure), add it BOTH here and to the plan's
 *   phase-4 table with its reason. An undocumented service-role site is how
 *   "RLS is on" quietly stops meaning anything.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORTAL_ROOT = path.resolve(HERE, "..");
const SRC_ROOT = path.join(PORTAL_ROOT, "src");
const DEFINITION_FILE = path.join("src", "lib", "supabase", "admin.ts");
const PLAN_FILE = path.join(PORTAL_ROOT, "docs", "development", "plans", "rls-enable.md");

const MARKER = "createSupabaseAdminClient(";

/**
 * The pinned posture. 23 sites / 18 files before the 2026-08-20 reduction;
 * 13 sites / 8 files after it. Every entry here must also appear, with its
 * reason, in the plan's phase-4 "what stays and why" table.
 */
const EXPECTED_SITES: Record<string, number> = {
  // GDPR erasure must scrub every row and storage object regardless of what
  // RLS would show the caller; smoke-client-erasure.test.ts pins this wiring.
  "src/app/api/portal/clients/[clientId]/erase/route.ts": 1,
  // Public endpoint, no user session. Anon may only INSERT consented rows by
  // policy; this route also SELECTs for dedupe and UPDATEs metadata — powers
  // the anon key must never have (an email-probe would leak enquiries).
  "src/app/api/public/brand-enquiry/route.ts": 1,
  // Public endpoint, no user session; inserts consent:false hold rows the
  // anon insert policy correctly refuses, and attaches to existing rows.
  "src/app/api/public/form-capture/route.ts": 1,
  // Public endpoint, no user session; website_consent_events deliberately has
  // no anon policy — consent records are written server-side after validation.
  "src/app/api/telemetry/collect/route.ts": 1,
  // Admin diagnostics: must count ALL rows to report truthfully, and runs in
  // contexts (dev console, health sweeps) with no user session to scope by.
  "src/lib/server/databaseStorageHealth.ts": 1,
  // Private storage buckets deny anon/authenticated by design; app-mediated
  // signed access is the model, so storage ops need the service role.
  "src/lib/server/privateUploadStorage.ts": 3,
  // Writes to the public-assets bucket; only the service role may write it.
  "src/lib/server/publicUploadStorage.ts": 2,
  // Shared read/annotate layer used by radar, operational alerts, marketing
  // intelligence and server components — paths that run without a request or
  // user session. Moving it under a user session would make radar evidence
  // depend on cookie liveness. The remaining phase-4 candidate, not a chore.
  "src/lib/server/websiteEnquiries.ts": 3,
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function measure(): Record<string, number> {
  const found: Record<string, number> = {};
  for (const file of walk(SRC_ROOT)) {
    const relative = path.relative(PORTAL_ROOT, file);
    if (relative === DEFINITION_FILE) continue;
    const source = readFileSync(file, "utf8");
    let count = 0;
    for (let i = source.indexOf(MARKER); i >= 0; i = source.indexOf(MARKER, i + 1)) count += 1;
    if (count > 0) found[relative.split(path.sep).join("/")] = count;
  }
  return found;
}

describe("service-role usage stays measured and documented", () => {
  const found = measure();
  const foundTotal = Object.values(found).reduce((sum, n) => sum + n, 0);
  const expectedTotal = Object.values(EXPECTED_SITES).reduce((sum, n) => sum + n, 0);

  it("matches the pinned call-site count (13 sites in 8 files as of 2026-08-20)", () => {
    assert.deepEqual(
      found,
      EXPECTED_SITES,
      `Service-role call sites drifted from the pinned set (found ${foundTotal} sites in ` +
        `${Object.keys(found).length} files; pinned ${expectedTotal} in ${Object.keys(EXPECTED_SITES).length}). ` +
        `Removed one? Update EXPECTED_SITES and the phase-4 table in docs/development/plans/rls-enable.md. ` +
        `Added one? First try createScopedSupabaseClient (runs under the user's RLS); if the service role is ` +
        `genuinely required, document the reason in the plan AND here. Never let this drift silently.`,
    );
  });

  it("documents every remaining service-role file in the RLS plan", () => {
    const plan = readFileSync(PLAN_FILE, "utf8");
    // Full paths, not basenames — every route file is called route.ts.
    const undocumented = Object.keys(EXPECTED_SITES).filter(file => !plan.includes(file));
    assert.deepEqual(
      undocumented,
      [],
      `These service-role files are not mentioned in docs/development/plans/rls-enable.md: ` +
        `${undocumented.join(", ")}. The phase-4 table must say why each remaining site keeps the ` +
        `service role, or the "reduction" claim cannot be audited.`,
    );
  });

  it("keeps the scoped client as the marked alternative", () => {
    // The conversion target must exist and stay loud about session absence —
    // silent RLS-empty reads masquerading as 404s are the failure mode that
    // makes people reach straight back for the admin client.
    const scoped = readFileSync(path.join(SRC_ROOT, "lib", "supabase", "scoped.ts"), "utf8");
    assert.match(scoped, /createScopedSupabaseClient/);
    assert.match(scoped, /AuthError\(401/, "a missing Supabase session must 401, not return empty rows");
  });
});
