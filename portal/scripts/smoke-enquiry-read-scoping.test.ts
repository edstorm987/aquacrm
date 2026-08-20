// Website-enquiry READ scoping — the multi-tenant boundary on the LIST path.
//
// WHY THIS FILE EXISTS (HIGH severity, multi-tenant read):
// `listWebsiteEnquiries` reads `brand_enquiries` through the RLS-bypassing
// service-role admin client, so the raw query returns EVERY agency's enquiry
// rows (name/email/phone/message/metadata). RLS on the table is currently inert
// (`profiles.agency_id` unset) AND this path bypasses RLS anyway, so before the
// fix any internal user of any agency read all agencies' enquiry CONTENT through
// the ~12 surfaces that call this function. It was masked only because there is
// effectively one real tenant today.
//
// The fix makes `agencyId` a REQUIRED parameter and filters the fetched rows
// through `enquiryBelongsToAgency` before mapping — reusing the SAME ownership
// predicate the per-row guard (`ownedEnquiry.ts`) uses, so it holds both before
// and after Ed's hand-applied `agency_id` migration.
//
// These tests drive the raw function against an injected in-memory admin client
// carrying a MIXED-tenant `brand_enquiries` set. They FAIL against the pre-fix
// code, which returned all tenants' rows unfiltered.

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_SESSION_SECRET ??= "enquiry-read-scoping-secret";

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";

type Row = {
  id: string;
  agency_id?: string | null;
  brand_slug: string;
  name: string;
  email: string | null;
  phone: string | null;
  contact_method: string | null;
  services: string[] | null;
  message: string | null;
  source_url: string | null;
  campaign: string | null;
  consent: boolean | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

function row(id: string, opts: { agencyId?: string | null; metaAgencyId?: string | null }): Row {
  return {
    id,
    // `undefined` means the pre-migration schema (no column); `null`/string is
    // the post-migration column value.
    ...(opts.agencyId === undefined ? {} : { agency_id: opts.agencyId }),
    brand_slug: "aquaoasis",
    name: `Enquirer ${id}`,
    email: `${id}@example.com`,
    phone: null,
    contact_method: null,
    services: [],
    message: "Hello from a website form.",
    source_url: "https://example.com/contact",
    campaign: null,
    consent: true,
    created_at: new Date(1_700_000_000_000 + id.charCodeAt(id.length - 1) * 1000).toISOString(),
    metadata: opts.metaAgencyId === undefined ? {} : { agencyId: opts.metaAgencyId },
  };
}

// A minimal admin-client stand-in: from().select(cols).order().limit() resolving
// to { data, error }. When the projected columns name `agency_id` and this fixture
// is the PRE-migration schema, it answers Postgres' undefined_column (42703) so the
// reader must retry without the column — exactly like the live table during Ed's
// hand-applied migration window.
function fakeAdmin(rows: Row[], opts: { agencyColumnMissing?: boolean } = {}) {
  return {
    from() {
      let cols = "";
      return {
        select(c: string) { cols = c; return this; },
        order() { return this; },
        limit(count: number) {
          if (opts.agencyColumnMissing && /\bagency_id\b/.test(cols)) {
            return Promise.resolve({
              data: null,
              error: { code: "42703", message: "column brand_enquiries.agency_id does not exist" },
            });
          }
          // Post-migration rows keep their agency_id column; pre-migration rows
          // never carry one, mirroring what PostgREST would return.
          const projected = rows.slice(0, count).map(r => {
            if (opts.agencyColumnMissing) { const { agency_id, ...rest } = r; void agency_id; return rest; }
            return r;
          });
          return Promise.resolve({ data: projected, error: null });
        },
      };
    },
  };
}

describe("listWebsiteEnquiries — reads are scoped to the caller's agency", () => {
  let mod: typeof import("../src/lib/server/websiteEnquiries");
  before(async () => { mod = await import("../src/lib/server/websiteEnquiries"); });

  it("returns ONLY agencyA's rows from a mixed-tenant set (post-migration column)", async () => {
    const rows = [
      row("a1", { agencyId: "agencyA", metaAgencyId: "agencyA" }),
      row("b1", { agencyId: "agencyB", metaAgencyId: "agencyB" }),
      row("a2", { agencyId: "agencyA", metaAgencyId: null }), // column carries the tenant, metadata blank
      // The column is authoritative: this row is B's even though its metadata
      // names A. It must NOT leak to A.
      row("x1", { agencyId: "agencyB", metaAgencyId: "agencyA" }),
    ];
    const enquiries = await mod.listWebsiteEnquiries("agencyA", 500, {
      supabase: fakeAdmin(rows) as never,
    });
    const ids = enquiries.map(e => e.id).sort();
    assert.deepEqual(ids, ["a1", "a2"], "only agencyA's own rows come back; B's rows (incl. the metadata-spoofed one) are excluded");
  });

  it("falls back to metadata.agencyId when the column is absent (pre-migration schema)", async () => {
    const rows = [
      row("a1", { agencyId: undefined, metaAgencyId: "agencyA" }),
      row("b1", { agencyId: undefined, metaAgencyId: "agencyB" }),
      row("none", { agencyId: undefined, metaAgencyId: undefined }), // no tenant anywhere → nobody's
    ];
    const enquiries = await mod.listWebsiteEnquiries("agencyA", 500, {
      supabase: fakeAdmin(rows, { agencyColumnMissing: true }) as never,
    });
    assert.deepEqual(enquiries.map(e => e.id), ["a1"], "pre-migration ownership resolves via metadata.agencyId");
  });

  it("returns an empty list when no row belongs to the caller — no cross-tenant leak", async () => {
    const rows = [
      row("b1", { agencyId: "agencyB", metaAgencyId: "agencyB" }),
      row("b2", { agencyId: "agencyB", metaAgencyId: "agencyB" }),
    ];
    const enquiries = await mod.listWebsiteEnquiries("agencyA", 500, {
      supabase: fakeAdmin(rows) as never,
    });
    assert.equal(enquiries.length, 0, "an agency with no rows sees nobody else's");
  });

  it("preserves the existing mapping for owned rows", async () => {
    const rows = [row("a1", { agencyId: "agencyA", metaAgencyId: "agencyA" })];
    const [enquiry] = await mod.listWebsiteEnquiries("agencyA", 500, {
      supabase: fakeAdmin(rows) as never,
    });
    assert.equal(enquiry.id, "a1");
    assert.equal(enquiry.name, "Enquirer a1");
    assert.equal(enquiry.email, "a1@example.com");
    assert.equal(enquiry.consent, true);
  });
});
