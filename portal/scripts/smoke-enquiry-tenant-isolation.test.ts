// Website-enquiry tenant isolation — the multi-tenant boundary on brand_enquiries.
//
// WHY THIS FILE EXISTS (HIGH severity, confirmed by security review):
// Every brand_enquiries row carries its tenant in `agency_id` (only after the
// hand-applied migration) and, always, in `metadata.agencyId`. The RLS policy is
// null-tolerant by design AND `profiles.agency_id` is not populated for anyone,
// so `current_profile_agency_id()` is null and the policy degrades to "any
// internal user manages EVERY agency's brand_enquiries". The website-enquiries
// routes addressed rows by id alone, trusting that inert RLS — so an owner of
// agency B could erase / reply to / read agency A's enquiries. Ids are not
// secret (any internal user can enumerate them).
//
// The fix is an app-level ownership guard (`src/lib/supabase/ownedEnquiry.ts`)
// that every route now loads through, plus tenant-scoped matching in
// form-capture. This file proves the guard, drives the REAL erase handler across
// a tenant boundary, and pins the form-capture matcher.
//
// Each test FAILS against the pre-fix code: the guard/matcher modules did not
// exist, and the erase route deleted any row by id regardless of tenant.

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_SESSION_SECRET ??= "enquiry-tenant-isolation-secret";

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// ─── Unit: the ownership guard + form-capture matcher ────────────────────────
//
// These need no request rigging — they take an injected client / plain rows.

describe("enquiryBelongsToAgency — the ownership predicate", () => {
  let guard: typeof import("../src/lib/supabase/ownedEnquiry");
  before(async () => { guard = await import("../src/lib/supabase/ownedEnquiry"); });

  it("owns a row whose agency_id column matches (post-migration)", () => {
    assert.equal(guard.enquiryBelongsToAgency({ agency_id: "agencyA", metadata: {} }, "agencyA"), true);
  });

  it("rejects a row whose agency_id column names a different agency", () => {
    assert.equal(guard.enquiryBelongsToAgency({ agency_id: "agencyB", metadata: { agencyId: "agencyA" } }, "agencyA"), false,
      "the column is authoritative once set — metadata must not override it");
  });

  it("falls back to metadata.agencyId when the column is null/absent (pre-migration)", () => {
    assert.equal(guard.enquiryBelongsToAgency({ agency_id: null, metadata: { agencyId: "agencyA" } }, "agencyA"), true);
    assert.equal(guard.enquiryBelongsToAgency({ metadata: { agencyId: "agencyA" } }, "agencyA"), true);
    assert.equal(guard.enquiryBelongsToAgency({ metadata: { agencyId: "agencyB" } }, "agencyA"), false);
  });

  it("rejects a row with no tenant anywhere", () => {
    assert.equal(guard.enquiryBelongsToAgency({ metadata: null }, "agencyA"), false);
    assert.equal(guard.enquiryBelongsToAgency(null, "agencyA"), false);
  });
});

describe("loadOwnedEnquiry — a foreign id looks exactly like a missing one", () => {
  let guard: typeof import("../src/lib/supabase/ownedEnquiry");
  before(async () => { guard = await import("../src/lib/supabase/ownedEnquiry"); });

  // A minimal scoped-client stand-in: select().eq().maybeSingle() over one seeded
  // table. `agencyColumnMissing` simulates the pre-migration schema, where
  // projecting agency_id errors with Postgres 42703 and the guard must retry.
  function fakeClient(rows: Record<string, unknown>[], opts: { agencyColumnMissing?: boolean } = {}) {
    return {
      from() {
        let cols = "";
        const filters: Array<(r: Record<string, unknown>) => boolean> = [];
        const b = {
          select(c: string) { cols = c; return b; },
          eq(col: string, val: unknown) { filters.push(r => r[col] === val); return b; },
          async maybeSingle() {
            if (opts.agencyColumnMissing && /\bagency_id\b/.test(cols)) {
              return { data: null, error: { code: "42703", message: "column brand_enquiries.agency_id does not exist" } };
            }
            const found = rows.filter(r => filters.every(f => f(r)))[0];
            if (!found) return { data: null, error: null };
            // Pre-migration rows carry no agency_id column; mirror that.
            const projected = opts.agencyColumnMissing ? { ...found } : found;
            if (opts.agencyColumnMissing) delete (projected as Record<string, unknown>).agency_id;
            return { data: projected, error: null };
          },
        };
        return b;
      },
    } as never;
  }

  it("returns the row for an owned id, and null for a foreign one — identically to a missing id", async () => {
    const rows = [{ id: "a1", agency_id: "agencyA", metadata: { agencyId: "agencyA" }, brand_slug: "brandA" }];
    const client = fakeClient(rows);
    const owned = await guard.loadOwnedEnquiry(client, { id: "a1", agencyId: "agencyA", columns: ["brand_slug"] });
    assert.equal(owned?.id, "a1");
    const foreign = await guard.loadOwnedEnquiry(client, { id: "a1", agencyId: "agencyB", columns: ["brand_slug"] });
    const missing = await guard.loadOwnedEnquiry(client, { id: "does-not-exist", agencyId: "agencyB", columns: ["brand_slug"] });
    assert.equal(foreign, null, "a foreign row must not be returned");
    assert.equal(missing, null, "a missing row must not be returned");
    assert.deepEqual(foreign, missing, "foreign and missing must be indistinguishable — no existence oracle");
  });

  it("enforces ownership pre-migration too, retrying the select without agency_id", async () => {
    const rows = [{ id: "a1", metadata: { agencyId: "agencyA" } }]; // no column yet
    const client = fakeClient(rows, { agencyColumnMissing: true });
    assert.equal((await guard.loadOwnedEnquiry(client, { id: "a1", agencyId: "agencyA" }))?.id, "a1");
    assert.equal(await guard.loadOwnedEnquiry(client, { id: "a1", agencyId: "agencyB" }), null,
      "a stranger must be refused even while the column does not exist");
  });
});

describe("pickTenantOwnedEnquiry — form-capture never attaches across tenants", () => {
  let guard: typeof import("../src/lib/supabase/ownedEnquiry");
  before(async () => { guard = await import("../src/lib/supabase/ownedEnquiry"); });

  it("takes only the candidate that belongs to the resolved agency, even if a newer stranger's row exists first", () => {
    // Newest-first, as form-capture fetches them: agency B's row is newer and
    // would win a bare limit(1) match. It must be skipped.
    const candidates = [
      { id: "newerB", agency_id: "agencyB", metadata: { agencyId: "agencyB" } },
      { id: "olderA", agency_id: "agencyA", metadata: { agencyId: "agencyA" } },
    ];
    assert.equal(guard.pickTenantOwnedEnquiry(candidates, "agencyA")?.id, "olderA");
  });

  it("returns null when no candidate belongs to the agency — the capture is held, not misfiled", () => {
    const candidates = [{ id: "strangerB", agency_id: "agencyB", metadata: { agencyId: "agencyB" } }];
    assert.equal(guard.pickTenantOwnedEnquiry(candidates, "agencyA"), null);
    assert.equal(guard.pickTenantOwnedEnquiry([], "agencyA"), null);
  });
});

// ─── The HIGH case: drive the REAL erase handler across a tenant boundary ─────
//
// Rigging follows the runtime-verify convention (see smoke-close-deal-route):
// stub next/headers so the minted session cookie is readable in-process, and
// stub the scoped Supabase client so the route runs against a controllable
// in-memory brand_enquiries table instead of the live project.

describe("website-enquiries/erase refuses a cross-tenant delete", () => {
  // A tiny fake of the scoped client covering exactly what the route uses: the
  // guard's select().eq().maybeSingle() read, and the delete().eq().select()
  // write. It mutates the shared `table` so the test can assert survival.
  let table: Record<string, unknown>[] = [];
  function makeScopedFake() {
    return {
      from() {
        let op: "select" | "delete" = "select";
        let cols = "";
        const filters: Array<(r: Record<string, unknown>) => boolean> = [];
        const b = {
          select(c: string) { cols = c; void cols; return b; },
          delete() { op = "delete"; return b; },
          eq(col: string, val: unknown) { filters.push(r => r[col] === val); return b; },
          async maybeSingle() {
            const found = table.filter(r => filters.every(f => f(r)))[0];
            return { data: found ?? null, error: null };
          },
          then(resolve: (x: { data: unknown[]; error: null }) => void) {
            const rows = table.filter(r => filters.every(f => f(r)));
            if (op === "delete") {
              const ids = new Set(rows.map(r => r.id));
              table = table.filter(r => !ids.has(r.id));
            }
            resolve({ data: rows.map(r => ({ id: r.id })), error: null });
          },
        };
        return b;
      },
    };
  }

  let POST: typeof import("../src/app/api/portal/website-enquiries/erase/route").POST;
  let issueSession: typeof import("../src/lib/server/auth/auth").issueSession;
  let NextRequest: typeof import("next/server").NextRequest;
  let sessionCookie = "";

  before(async () => {
    // 1) next/headers → a cookie jar this file controls.
    const headersId = require.resolve("next/headers");
    require.cache[headersId] = {
      id: headersId, filename: headersId, loaded: true, paths: [], children: [],
      exports: {
        cookies: async () => ({
          get: (name: string) => (sessionCookie && name === "lk_session_v1" ? { name, value: sessionCookie } : undefined),
          getAll: () => (sessionCookie ? [{ name: "lk_session_v1", value: sessionCookie }] : []),
          has: (name: string) => Boolean(sessionCookie) && name === "lk_session_v1",
        }),
        headers: async () => new Headers(),
        draftMode: async () => ({ isEnabled: false }),
      },
    } as never;

    // 2) The scoped Supabase client → the in-memory table.
    const scopedId = require.resolve("../src/lib/supabase/scoped");
    require.cache[scopedId] = {
      id: scopedId, filename: scopedId, loaded: true, paths: [], children: [],
      exports: { createScopedSupabaseClient: async () => makeScopedFake() },
    } as never;

    // Loaded AFTER the stubs (require, not import — this file transpiles to CJS
    // where import statements would hoist above the stubbing above).
    ({ NextRequest } = require("next/server"));
    ({ POST } = require("../src/app/api/portal/website-enquiries/erase/route"));
    ({ issueSession } = require("../src/lib/server/auth/auth"));
    const storage = require("../src/server/storage") as typeof import("../src/server/storage");
    await storage.ensureHydrated();
  });

  function eraseAs(role: string, agencyId: string, enquiryId: string) {
    sessionCookie = issueSession({ userId: `u_${agencyId}`, email: `owner@${agencyId}.test`, role: role as never, agencyId });
    return POST(new NextRequest("http://localhost/api/portal/website-enquiries/erase", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enquiryId }),
    }));
  }

  it("an agency-B owner CANNOT erase an agency-A enquiry, and the row survives", async () => {
    table = [{ id: "enqA", agency_id: "agencyA", metadata: { agencyId: "agencyA" }, brand_slug: "brandA" }];

    const res = await eraseAs("agency-owner", "agencyB", "enqA");
    const body = await res.json() as { ok?: boolean; error?: string };

    assert.equal(res.status, 404, "a cross-tenant erase must be refused as not-found");
    assert.equal(body.ok, false);
    assert.equal(table.length, 1, "the agency-A enquiry must still exist after the refused erase");
    assert.equal(table[0].id, "enqA");
  });

  it("the owning agency CAN still erase its own enquiry (the guard does not over-block)", async () => {
    table = [{ id: "enqA", agency_id: "agencyA", metadata: { agencyId: "agencyA" }, brand_slug: "brandA" }];

    const res = await eraseAs("agency-owner", "agencyA", "enqA");
    const body = await res.json() as { ok?: boolean; deletedId?: string };

    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.deletedId, "enqA");
    assert.equal(table.length, 0, "the owner's own enquiry is deleted");
  });

  it("enforces ownership by metadata.agencyId alone when the column is absent (pre-migration)", async () => {
    table = [{ id: "enqLegacy", metadata: { agencyId: "agencyA" }, brand_slug: "brandA" }];

    const foreign = await eraseAs("agency-owner", "agencyB", "enqLegacy");
    assert.equal(foreign.status, 404, "a stranger is refused even before the agency_id column exists");
    assert.equal(table.length, 1, "the pre-migration row survives the cross-tenant erase");

    const owner = await eraseAs("agency-owner", "agencyA", "enqLegacy");
    assert.equal(owner.status, 200, "the metadata owner can still erase it");
    assert.equal(table.length, 0);
  });
});
