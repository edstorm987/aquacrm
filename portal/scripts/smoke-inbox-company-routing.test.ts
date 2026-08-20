import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Company-routed enquiries, on the READ side.
//
// `routedCompanyId` has been written at submission by two public endpoints for
// a while (`brand-enquiry` and `form-capture`) and was read by nothing: an
// enquiry routed to one of Ed's own trading companies arrived in the inbox
// indistinguishable from an ordinary un-owned one, so the routing appeared to
// do nothing at all.
//
// Everything here drives the real functions. The row mapping is exercised with
// constructed `brand_enquiries` fixtures rather than the live table — Supabase
// is the only source of these rows and there is no local sandbox for it, so a
// test that queried would be asserting against Ed's real data. The attribution
// test drives `synchroniseWebsiteEnquiryIdentities` against the in-memory store
// with a client that genuinely matches the enquirer.
//
// Note the Supabase env vars are deliberately left unset: any accidental live
// call from this suite throws instead of touching production.

type Enquiries = typeof import("../src/lib/server/websiteEnquiries");
type Row = import("../src/lib/server/websiteEnquiries").BrandEnquiryRow;

let enquiries: Enquiries;
let storage: typeof import("../src/server/storage");
let tenants: typeof import("../src/server/tenants");
let companies: typeof import("../src/server/tradingCompanies");
let persons: typeof import("../src/server/persons");

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  enquiries = await import("../src/lib/server/websiteEnquiries");
  tenants = await import("../src/server/tenants");
  companies = await import("../src/server/tradingCompanies");
  persons = await import("../src/server/persons");
});

/** A row shaped like a live `brand_enquiries` record, Aqua Tag metadata and all. */
function row(overrides: Partial<Row> & { metadata?: Record<string, unknown> } = {}): Row {
  const { metadata, ...rest } = overrides;
  return {
    id: "enq_1",
    brand_slug: "zimante",
    name: "Priya Nayar",
    email: "priya@nayar-build.co.uk",
    phone: "07305 410203",
    contact_method: "email",
    consent: true,
    services: ["New website"],
    message: "Can you quote for a five page site?",
    source_url: "https://zimante.com/contact",
    campaign: null,
    created_at: new Date("2026-08-19T09:00:00.000Z").toISOString(),
    ...rest,
    metadata: {
      consentPurpose: "reply-to-enquiry",
      consentVersion: 1,
      consentCapturedAt: "2026-08-19T09:00:00.000Z",
      origin: "https://zimante.com",
      channel: "form",
      siteKey: null,
      propertyId: "zimante",
      siteName: "Zimante",
      pagePath: "/contact",
      inboxStatus: "open",
      enquiryClassification: "unclassified",
      notification: "pending",
      ...(metadata ?? {}),
    },
  };
}

describe("an enquiry routed to a company exposes routedCompanyId and the company name on the inbox row", () => {
  it("carries the routed company id straight off the stored metadata", () => {
    const mapped = enquiries.mapBrandEnquiryRow(row({ metadata: { routedCompanyId: "company_abc123" } }));
    assert.equal(mapped.routedCompanyId, "company_abc123");
    // Nothing else about the row changes shape.
    assert.equal(mapped.id, "enq_1");
    assert.equal(mapped.siteName, "Zimante");
    assert.equal(mapped.status, "open");
  });

  it("resolves the company's name from the agency's real trading companies", () => {
    const agencyId = tenants.createAgency({ name: "Routing Co", slug: `route-${Math.floor(performance.now())}-${Math.random().toString(36).slice(2, 7)}` }).id;
    const company = companies.createTradingCompany(agencyId, { name: "Zimante Digital" }, "ed");
    const mapped = enquiries.mapBrandEnquiryRow(row({ metadata: { routedCompanyId: company.id } }));

    const [named] = enquiries.attachRoutedCompanyNames([mapped], companies.listTradingCompanies(agencyId, true));
    assert.equal(named.routedCompanyId, company.id);
    assert.equal(named.routedCompanyName, "Zimante Digital");
  });

  it("still reads as routed when the company record has since been deleted", () => {
    // The badge is keyed off the id, so a stale id shows the fallback label
    // rather than an empty badge — and the enquiry is never silently un-routed.
    const mapped = enquiries.mapBrandEnquiryRow(row({ metadata: { routedCompanyId: "company_gone" } }));
    const [named] = enquiries.attachRoutedCompanyNames([mapped], []);
    assert.equal(named.routedCompanyId, "company_gone");
    assert.equal(named.routedCompanyName, undefined);
    assert.equal(
      enquiries.routedCompanyFilterOptions([named])[0]?.name,
      enquiries.ROUTED_COMPANY_FALLBACK_NAME,
      "a routed enquiry with no company record must still be selectable, under a labelled fallback",
    );
  });

  it("offers one filter option per company actually present, named and sorted", () => {
    const rows = [
      enquiries.mapBrandEnquiryRow(row({ id: "a", metadata: { routedCompanyId: "c_2" } })),
      enquiries.mapBrandEnquiryRow(row({ id: "b", metadata: { routedCompanyId: "c_1" } })),
      enquiries.mapBrandEnquiryRow(row({ id: "c", metadata: { routedCompanyId: "c_2" } })),
      enquiries.mapBrandEnquiryRow(row({ id: "d" })),
    ];
    const named = enquiries.attachRoutedCompanyNames(rows, [
      { id: "c_1", name: "Zimante Digital" },
      { id: "c_2", name: "Aqua Oasis" },
    ]);
    assert.deepEqual(enquiries.routedCompanyFilterOptions(named), [
      { id: "c_2", name: "Aqua Oasis" },
      { id: "c_1", name: "Zimante Digital" },
    ]);
  });
});

describe("the company filter returns only that company's enquiries", () => {
  const batch = () => enquiries.attachRoutedCompanyNames([
    enquiries.mapBrandEnquiryRow(row({ id: "zim_1", metadata: { routedCompanyId: "c_zim" } })),
    enquiries.mapBrandEnquiryRow(row({ id: "zim_2", metadata: { routedCompanyId: "c_zim" } })),
    enquiries.mapBrandEnquiryRow(row({ id: "aqua_1", metadata: { routedCompanyId: "c_aqua" } })),
    enquiries.mapBrandEnquiryRow(row({ id: "agency_1" })),
  ], [{ id: "c_zim", name: "Zimante Digital" }, { id: "c_aqua", name: "Aqua Oasis" }]);

  it("narrows to exactly the chosen company", () => {
    const filtered = enquiries.filterEnquiriesByRoutedCompany(batch(), "c_zim");
    assert.deepEqual(filtered.map(item => item.id), ["zim_1", "zim_2"]);
  });

  it("does not leak another company's enquiries, or the agency's", () => {
    const filtered = enquiries.filterEnquiriesByRoutedCompany(batch(), "c_aqua");
    assert.deepEqual(filtered.map(item => item.id), ["aqua_1"]);
    assert.equal(filtered.some(item => item.routedCompanyId === "c_zim"), false);
    assert.equal(filtered.some(item => !item.routedCompanyId), false);
  });

  it("can isolate what is still the agency's own demand", () => {
    const filtered = enquiries.filterEnquiriesByRoutedCompany(batch(), enquiries.ROUTED_COMPANY_FILTER_NONE);
    assert.deepEqual(filtered.map(item => item.id), ["agency_1"]);
  });

  it("shows everything under the default, and nothing under an id that no longer exists", () => {
    assert.equal(enquiries.filterEnquiriesByRoutedCompany(batch(), enquiries.ROUTED_COMPANY_FILTER_ALL).length, 4);
    // An unrecognised value narrows to nothing — it can never mis-attribute.
    assert.equal(enquiries.filterEnquiriesByRoutedCompany(batch(), "c_never").length, 0);
  });
});

describe("an enquiry with no routedCompanyId is unchanged and still appears unfiltered", () => {
  it("leaves an ordinary agency enquiry with no routing fields at all", () => {
    const mapped = enquiries.mapBrandEnquiryRow(row());
    assert.equal(mapped.routedCompanyId, undefined);
    assert.equal(mapped.routedCompanyName, undefined);
  });

  it("degrades on a pre-Aqua-Tag enquiry: no formCapture, no routing, no crash", () => {
    // Enquiries captured before the tag existed have a near-empty metadata blob.
    const legacy = enquiries.mapBrandEnquiryRow({
      id: "legacy_1",
      brand_slug: "milesymedia",
      name: "Old Enquiry",
      email: null,
      phone: null,
      contact_method: null,
      consent: null,
      services: null,
      message: null,
      source_url: null,
      campaign: null,
      created_at: new Date("2025-01-01T00:00:00.000Z").toISOString(),
      metadata: null,
    });
    assert.equal(legacy.formCapture, undefined);
    assert.equal(legacy.routedCompanyId, undefined);
    assert.equal(legacy.routedCompanyName, undefined);
    assert.equal(legacy.pagePath, "/");
  });

  it("ignores a blank or non-string routedCompanyId rather than routing to nothing", () => {
    assert.equal(enquiries.mapBrandEnquiryRow(row({ metadata: { routedCompanyId: "   " } })).routedCompanyId, undefined);
    assert.equal(enquiries.mapBrandEnquiryRow(row({ metadata: { routedCompanyId: 42 } })).routedCompanyId, undefined);
    assert.equal(enquiries.mapBrandEnquiryRow(row({ metadata: { routedCompanyId: null } })).routedCompanyId, undefined);
  });

  it("is returned untouched by the name resolution, and survives every filter that should keep it", () => {
    const plain = enquiries.mapBrandEnquiryRow(row({ id: "agency_only" }));
    const [after] = enquiries.attachRoutedCompanyNames([plain], [{ id: "c_zim", name: "Zimante Digital" }]);
    assert.deepEqual(after, plain, "an un-routed enquiry must come back byte-for-byte the same");

    assert.equal(enquiries.filterEnquiriesByRoutedCompany([plain], enquiries.ROUTED_COMPANY_FILTER_ALL).length, 1);
    assert.equal(enquiries.filterEnquiriesByRoutedCompany([plain], enquiries.ROUTED_COMPANY_FILTER_NONE).length, 1);
    assert.equal(enquiries.filterEnquiriesByRoutedCompany([plain], "c_zim").length, 0);
    assert.deepEqual(enquiries.routedCompanyFilterOptions([plain]), [], "no routed enquiries means no dead filter control");
  });
});

describe("an enquiry routed to a company has no owningClientId and is not attributed to a client", () => {
  let agencyId: string;
  let clientId: string;
  let companyId: string;

  beforeEach(() => {
    const agency = tenants.createAgency({
      name: "Attribution Co",
      slug: `attr-${Math.floor(performance.now())}-${Math.random().toString(36).slice(2, 7)}`,
    });
    agencyId = agency.id;
    // A client whose account email is the enquirer's — identity resolution will
    // match this with authoritative evidence and auto-link, unless something
    // stops it.
    clientId = tenants.createClient(agencyId, {
      name: "Nayar Build",
      ownerEmail: "priya@nayar-build.co.uk",
    }).id;
    companyId = companies.createTradingCompany(agencyId, { name: "Zimante Digital" }, "ed").id;
  });

  function ledgerEventsFor(client: string): string[] {
    return Object.values(storage.getState().clientRecordLedger ?? {})
      .filter(event => event.agencyId === agencyId && event.clientId === client)
      .map(event => event.sourceId);
  }

  it("refuses the auto-link even though the identity guess matched", async () => {
    const routed = enquiries.attachRoutedCompanyNames(
      [enquiries.mapBrandEnquiryRow(row({ id: `enq_company_${Date.now()}`, metadata: { routedCompanyId: companyId } }))],
      companies.listTradingCompanies(agencyId, true),
    );
    const [result] = await enquiries.synchroniseWebsiteEnquiryIdentities(agencyId, routed);

    // The guess DID find the client — this is what makes the refusal meaningful
    // rather than a test of an enquiry nothing matched.
    assert.equal(result.identityStatus, "resolved", "the identity guess must have matched, or this proves nothing");
    assert.equal(result.clientId, undefined, "a company-routed enquiry must not be attributed to a client");
    assert.equal(result.routedCompanyId, companyId);
    assert.equal(result.routedCompanyName, "Zimante Digital");
  });

  it("files nothing on the client's record for a company-routed enquiry", async () => {
    const id = `enq_company_ledger_${Date.now()}`;
    const routed = enquiries.attachRoutedCompanyNames(
      [enquiries.mapBrandEnquiryRow(row({ id, metadata: { routedCompanyId: companyId } }))],
      companies.listTradingCompanies(agencyId, true),
    );
    await enquiries.synchroniseWebsiteEnquiryIdentities(agencyId, routed);
    assert.deepEqual(
      ledgerEventsFor(clientId).filter(sourceId => sourceId.includes(id)),
      [],
      "the company's demand must not appear on a client's record",
    );
  });

  it("does not make the enquirer a client-facing person off the back of the guess", async () => {
    const routed = enquiries.attachRoutedCompanyNames(
      [enquiries.mapBrandEnquiryRow(row({ id: `enq_company_person_${Date.now()}`, metadata: { routedCompanyId: companyId } }))],
      companies.listTradingCompanies(agencyId, true),
    );
    const [result] = await enquiries.synchroniseWebsiteEnquiryIdentities(agencyId, routed);
    assert.ok(result.personId, "the enquirer is still a canonical person");
    const person = persons.listPersons(agencyId).find(item => item.id === result.personId);
    assert.equal(person?.facets.clientIds?.includes(clientId) ?? false, false);
  });

  it("still attributes the same enquirer when the site is NOT routed to a company", async () => {
    // The control. Same contact details, same client — only the routing differs.
    // `clientId`/`identityStatus` are pre-set so the resolution is unchanged and
    // the Supabase write-back (which has no credentials here, by design) is not
    // reached; the attribution being proven is the client ledger entry, which is
    // written from the same value the routed case suppresses.
    const id = `enq_agency_${Date.now()}`;
    const [result] = await enquiries.synchroniseWebsiteEnquiryIdentities(agencyId, [{
      ...enquiries.mapBrandEnquiryRow(row({ id })),
      clientId,
      identityStatus: "resolved",
    }]);
    assert.equal(result.routedCompanyId, undefined);
    assert.equal(result.clientId, clientId);
    assert.ok(
      ledgerEventsFor(clientId).some(sourceId => sourceId.includes(id)),
      "an un-routed enquiry must still land on the client's record",
    );
  });

  it("resolves the company name for a spam enquiry too", async () => {
    // Spam short-circuits identity resolution. It must not short-circuit the
    // routing surface, or a company's spam becomes invisible to its filter.
    const routed = enquiries.attachRoutedCompanyNames(
      [enquiries.mapBrandEnquiryRow(row({
        id: `enq_spam_${Date.now()}`,
        metadata: { routedCompanyId: companyId, enquiryClassification: "spam" },
      }))],
      companies.listTradingCompanies(agencyId, true),
    );
    const [result] = await enquiries.synchroniseWebsiteEnquiryIdentities(agencyId, routed);
    assert.equal(result.classification, "spam");
    assert.equal(result.routedCompanyId, companyId);
    assert.equal(result.routedCompanyName, "Zimante Digital");
    assert.equal(result.clientId, undefined);
  });
});

describe("the inbox surfaces the routing", () => {
  // SHAPE, not behaviour, and deliberately so: `_MasterInbox.tsx` is a client
  // component and cannot be imported here (`next/link` fails to load under the
  // react-server condition this suite runs with), while the canonical filter
  // helpers live in `websiteEnquiries.ts`, which is `server-only` and cannot be
  // imported by the client bundle. The component therefore mirrors the server
  // predicate; these assertions exist to catch the two drifting apart. The
  // behaviour itself is proven above, against the server-side definitions.
  const read = (relative: string) => readFileSync(join(__dirname, "..", relative), "utf-8");
  const inbox = read("src/app/portal/agency/inbox/_MasterInbox.tsx");
  const card = read("src/app/portal/agency/inbox/_EnquiryDetailCard.tsx");

  it("renders a company badge on the enquiry row, keyed off the id", () => {
    assert.match(inbox, /item\.routedCompanyId \? <Pill tone="brand">/);
    assert.match(inbox, /item\.routedCompanyName \|\| COMPANY_FALLBACK_NAME/);
  });

  it("offers a company entry on the enquiry filter control", () => {
    assert.match(inbox, /aria-label="Filter enquiries by company"/);
    assert.match(inbox, /companyOptions\.map\(option =>/);
    assert.match(inbox, /\.filter\(item => matchesCompanyFilter\(item, companyFilter\)\)/);
  });

  it("mirrors the server predicate exactly", () => {
    const server = read("src/lib/server/websiteEnquiries.ts");
    for (const clause of [
      /if \(filter === (?:ROUTED_)?COMPANY_FILTER_ALL\) return true;/,
      /if \(filter === (?:ROUTED_)?COMPANY_FILTER_NONE\) return !(?:enquiry|item)\.routedCompanyId;/,
    ]) {
      assert.match(server, clause);
      assert.match(inbox, clause);
    }
    assert.equal(enquiries.ROUTED_COMPANY_FALLBACK_NAME, "Your company");
    assert.match(inbox, /const COMPANY_FALLBACK_NAME = "Your company";/);
  });

  it("states the destination on the enquiry detail card", () => {
    assert.match(card, /label="Destination"/);
    assert.match(card, /item\.routedCompanyId/);
  });
});
