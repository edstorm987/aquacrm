// Giving a trading company a portal of its own — phases 1-3.
//
//   Phase 1  the disposition map, with a COMPILE-TIME exhaustiveness guard
//   Phase 2  a read-only preview of what would populate the portal
//   Phase 3  the endpoint's security shell, moving NOTHING
//
// ⚠ THE MODEL, settled by the founder 2026-08-20: AGENCY is a HOLDING GROUP,
// TRADING COMPANIES are the businesses under it, each with its own CLIENTS.
// Three permanent tiers. A company never becomes an agency — it stays a
// company under its group and gains a workspace. The "third tier" section at
// the bottom is what pins that, because a portal tenant with no link back to
// its holding group is indistinguishable from a wholly separate business, and
// the top tier silently disappears.
//
// The thing actually being defended here is small and specific. `PortalState`
// has many collections. The only existing "everything belonging to a tenant"
// code hand-lists 25 of them (`showcaseMode.ts:477-519`) and the demo teardown
// lists 7 (`demoSeed.ts:430-463`). Both silently miss the rest — a live bug.
// So the first section below does not test that the map is *correct*; it tests
// that the map cannot go STALE without something failing loudly.
//
// The endpoint section drives the real route handler in-process (issueSession
// + NextRequest), so it fails against behaviour rather than against source
// text — the same shape as `smoke-company-switcher.test.ts`.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";

import {
  PROMOTION_COLLECTION_COUNT,
  PROMOTION_COLLECTIONS,
  collectionsNeedingConfirmation,
  collectionsWithDisposition,
  dispositionFor,
} from "../src/server/companyPortal/disposition";
import {
  previewCompanyPortal,
  previewCoversEveryCollection,
} from "../src/server/companyPortal/companyPortal";
import {
  GET as PROMOTE_GET,
  POST as PROMOTE_POST,
} from "../src/app/api/portal/agency/companies/[companyId]/portal/route";
import { POST as SWITCH_POST } from "../src/app/api/auth/switch-agency/route";
import { SESSION_COOKIE_NAME, issueSession, verifyToken } from "../src/lib/server/auth/auth";
import { ensureHydrated, getState, mutate } from "../src/server/storage";
import { createAgency, createClient, getAgency } from "../src/server/tenants";
import { createUser, getUserById, updateUser } from "../src/server/users";
import { addUserAgencyMembership } from "../src/lib/server/seeds/aquaOasisSeed";
import {
  createTradingCompany,
  getTradingCompany,
  markTradingCompanyPortalCreated,
  tradingCompanyHasOwnPortal,
} from "../src/server/tradingCompanies";
import {
  getCompanyPortalAgency,
  listHeldCompanyPortals,
} from "../src/server/agencyBootstrap";
import type { SessionPayload } from "../src/server/types";

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_SESSION_SECRET ??= "company-promotion-smoke-secret";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

/** Comments stripped first — an explanatory comment must not satisfy an assertion. */
function sourceWithoutComments(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

/**
 * Every collection declared on `PortalState`, read out of the type itself.
 *
 * This is the runtime half of the exhaustiveness guard. The compile-time half
 * lives in `disposition.ts` and fails `tsc`; this one fails a TEST, so a 79th
 * collection announces itself in both places. Parsing the interface is
 * deliberate: reading `Object.keys(getState())` would only see the collections
 * that happen to be populated, which is exactly the blindness being fixed.
 */
function portalStateCollections(): string[] {
  const source = readFileSync(join(ROOT, "src/server/types.ts"), "utf8");
  const start = source.indexOf("export interface PortalState {");
  assert.ok(start >= 0, "PortalState must still be declared in src/server/types.ts");
  const open = source.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  const body = source
    .slice(open + 1, end)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
  return [...body.matchAll(/^\s{2}(\w+)\??\s*:/gm)].map(match => match[1]!);
}

// ───────────────────────────────────────────────────────────────────────────
// PHASE 1 — the disposition map cannot go stale
// ───────────────────────────────────────────────────────────────────────────

describe("Promotion disposition map — exhaustiveness", () => {
  it("classifies exactly as many collections as PortalState declares", () => {
    const declared = portalStateCollections();
    assert.equal(
      declared.length,
      PROMOTION_COLLECTION_COUNT,
      `PortalState now declares ${declared.length} collections, not ${PROMOTION_COLLECTION_COUNT}. ` +
        "Classify the new one in src/server/companyPortal/disposition.ts and update the count.",
    );
    assert.equal(PROMOTION_COLLECTIONS.length, declared.length);
  });

  it("has an entry for EVERY collection — no 25-of-78 hand-list", () => {
    const declared = portalStateCollections();
    const mapped = new Set(PROMOTION_COLLECTIONS as string[]);
    const missing = declared.filter(name => !mapped.has(name));
    assert.deepEqual(
      missing,
      [],
      `unclassified collections: ${missing.join(", ")} — a promotion would silently leave these behind`,
    );
  });

  it("has no entry for a collection that no longer exists", () => {
    const declared = new Set(portalStateCollections());
    const stale = (PROMOTION_COLLECTIONS as string[]).filter(name => !declared.has(name));
    assert.deepEqual(stale, [], `stale entries: ${stale.join(", ")}`);
  });

  it("keeps the map in PortalState's own order, so the two can be read side by side", () => {
    assert.deepEqual(PROMOTION_COLLECTIONS as string[], portalStateCollections());
  });

  it("gives every entry a real reason — a disposition with no argument is a guess", () => {
    for (const name of PROMOTION_COLLECTIONS) {
      const plan = dispositionFor(name);
      assert.ok(plan.reason.length > 40, `${name}: reason is too thin to be checkable`);
    }
  });

  it("derives the guard from the TYPE, not from a written-down list", () => {
    const source = sourceWithoutComments("src/server/companyPortal/disposition.ts");
    assert.match(
      source,
      /keyof Required<PortalState>/,
      "the map must be a mapped type over Required<PortalState> so a new collection fails tsc",
    );
    assert.match(source, /satisfies PromotionDispositionMap/);
    assert.match(source, /AssertNever<UnclassifiedCollections>/);
    assert.match(source, /AssertNever<StaleCollections>/);
  });

  it("does not copy showcaseMode's hand-list — the wrong precedent", () => {
    const source = sourceWithoutComments("src/server/companyPortal/disposition.ts");
    assert.doesNotMatch(source, /from "@\/lib\/server\/auth\/showcaseMode"/);
    assert.doesNotMatch(source, /from "\.\.\/\.\.\/lib\/server\/showcaseMode"/);
  });

  it("classifies the collections the plan names, exactly as the plan names them", () => {
    // Spot-checks with consequences, not a re-statement of the whole map.
    assert.equal(dispositionFor("clients").disposition, "move");
    assert.equal(dispositionFor("activity").disposition, "leave");
    assert.equal(dispositionFor("clientRecordLedger").disposition, "rekey");
    assert.equal(dispositionFor("companyProfiles").disposition, "rekey");
    assert.equal(dispositionFor("clientPortalInstances").disposition, "rekey");
    assert.equal(dispositionFor("pluginInstalls").disposition, "rekey");
    assert.equal(dispositionFor("pluginData").disposition, "rekey");
    assert.equal(dispositionFor("radarInfraHealth").disposition, "na");
    for (const radar of ["radarMemory", "radarSyntheticProbes", "radarEvidence"] as const) {
      assert.equal(dispositionFor(radar).disposition, "leave", `${radar} must not carry a baseline across`);
    }
    for (const credential of [
      "externalAssistantApiKeys",
      "commandCalendarConnections",
      "integrationConnections",
    ] as const) {
      assert.equal(dispositionFor(credential).disposition, "leave", `${credential} is a credential — never copied`);
    }
  });

  it("proposes, never guesses: every unconfirmable class defaults to LEAVE", () => {
    for (const name of collectionsNeedingConfirmation()) {
      if (name === "users") {
        // The one mixed case, and mixed for a reason: a client-tier user is not
        // ambiguous at all — they follow their client, because a client and its
        // portal users cannot live in two tenants. What needs confirming is
        // agency-tier STAFF tagged with `companyIds`, and that is raised as a
        // `staff-tag` ambiguity suggesting LEAVE — never a membership grant.
        assert.equal(dispositionFor(name).disposition, "move");
        continue;
      }
      assert.equal(
        dispositionFor(name).disposition,
        "leave",
        `${name} needs confirmation, so its default must be the reversible direction`,
      );
    }
  });

  it("holds the sixteen people* collections as proposals with no company dimension", () => {
    const people = PROMOTION_COLLECTIONS.filter(
      name => dispositionFor(name).ownership === "none",
    );
    assert.ok(people.length >= 16, `expected at least the sixteen people collections, got ${people.length}`);
    for (const name of people) {
      assert.equal(dispositionFor(name).needsConfirmation, true, `${name} must stop for a human`);
    }
  });

  it("never proposes DELETE — a promotion is a move, never a destruction", () => {
    const dispositions = new Set(PROMOTION_COLLECTIONS.map(name => dispositionFor(name).disposition));
    for (const value of dispositions) {
      assert.ok(
        ["move", "rekey", "seed", "closure", "leave", "na"].includes(value),
        `unexpected disposition ${value}`,
      );
    }
  });

  it("every collection lands in exactly one disposition bucket", () => {
    const buckets = (["move", "rekey", "seed", "closure", "leave", "na"] as const)
      .flatMap(value => collectionsWithDisposition(value));
    assert.equal(buckets.length, PROMOTION_COLLECTION_COUNT);
    assert.equal(new Set(buckets).size, PROMOTION_COLLECTION_COUNT);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Fixtures
// ───────────────────────────────────────────────────────────────────────────

let seq = 0;

interface Fixture {
  agencyId: string;
  otherAgencyId: string;
  companyId: string;
  otherCompanyId: string;
  companyClientId: string;
  otherClientId: string;
  ownCompanyProductId: string;
  sharedProductId: string;
  unscopedProductId: string;
  installId: string;
  userId: string;
  email: string;
  token: string;
}

async function seedPromotableCompany(): Promise<Fixture> {
  await ensureHydrated();
  seq += 1;
  const agency = createAgency({ name: `Promote Origin ${seq}`, slug: `promote-origin-${seq}` });
  const other = createAgency({ name: `Promote Other ${seq}`, slug: `promote-other-${seq}` });
  const email = `promoter${seq}@example.com`;
  const user = createUser({
    email,
    password: "Pr0mote-Test-Passw0rd!",
    role: "agency-owner",
    agencyId: agency.id,
    name: "Promoter",
  });
  addUserAgencyMembership(user.id, other.id);

  const company = createTradingCompany(agency.id, { name: `Zimante ${seq}` }, user.id);
  const otherCompany = createTradingCompany(agency.id, { name: `Sibling ${seq}` }, user.id);

  const companyClient = createClient(agency.id, { name: `Company Client ${seq}` });
  const otherClient = createClient(agency.id, { name: `Sibling Client ${seq}` });

  const ownProductId = `prod_own_${seq}`;
  const sharedProductId = `prod_shared_${seq}`;
  const unscopedProductId = `prod_unscoped_${seq}`;
  const installId = `${agency.id}|_agency|agency-finance`;

  mutate(state => {
    // The client that belongs to the brand.
    state.clients[companyClient.id]!.companyId = company.id;
    state.clients[otherClient.id]!.companyId = otherCompany.id;

    // A product owned only by this brand, one shared with a sibling, and one
    // with no companyIds at all (which means "every brand").
    const now = Date.now();
    const product = (id: string, companyIds: string[]) => ({
      id,
      agencyId: agency.id,
      name: id,
      companyIds,
      createdAt: now,
      updatedAt: now,
    });
    const products = state.agencyProducts as unknown as Record<string, unknown>;
    products[ownProductId] = product(ownProductId, [company.id]);
    products[sharedProductId] = product(sharedProductId, [company.id, otherCompany.id]);
    products[unscopedProductId] = product(unscopedProductId, []);

    // An agency-scoped plugin install holding one invoice for this brand and
    // one for the sibling — the ninth ownership surface, opaque to the core.
    state.pluginInstalls[installId] = {
      id: installId,
      pluginId: "agency-finance",
      agencyId: agency.id,
      enabled: true,
      config: {},
      features: {},
      installedAt: now,
    };
    state.pluginData[installId] = {
      invoices: [
        { id: `inv_mine_${seq}`, companyId: company.id, total: 100 },
        { id: `inv_theirs_${seq}`, companyId: otherCompany.id, total: 200 },
      ],
      budgetPots: [{ id: `pot_${seq}`, companyIds: [company.id, otherCompany.id] }],
    };
  });

  const fresh = getUserById(user.id)!;
  return {
    agencyId: agency.id,
    otherAgencyId: other.id,
    companyId: company.id,
    otherCompanyId: otherCompany.id,
    companyClientId: companyClient.id,
    otherClientId: otherClient.id,
    ownCompanyProductId: ownProductId,
    sharedProductId,
    unscopedProductId,
    installId,
    userId: fresh.id,
    email: fresh.email,
    token: issueSession({
      userId: fresh.id,
      email: fresh.email,
      role: fresh.role,
      agencyId: agency.id,
      agencyIds: fresh.agencyIds,
      activeAgencyId: agency.id,
      sessionRev: fresh.sessionRev ?? 0,
    }),
  };
}

function promoteRequest(
  token: string | undefined,
  companyId: string,
  opts: { origin?: string | null; method?: "GET" | "POST" } = {},
): [NextRequest, { params: Promise<{ companyId: string }> }] {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.origin !== null) headers.origin = opts.origin ?? "http://localhost";
  if (token) headers.cookie = `${SESSION_COOKIE_NAME}=${token}`;
  const method = opts.method ?? "POST";
  const request = new NextRequest(
    `http://localhost/api/portal/agency/companies/${companyId}/portal`,
    method === "POST" ? { method, headers, body: "{}" } : { method, headers },
  );
  return [request, { params: Promise.resolve({ companyId }) }];
}

function mintedSession(response: Response): SessionPayload | null {
  const value = (response as unknown as {
    cookies: { get(name: string): { value: string } | undefined };
  }).cookies.get(SESSION_COOKIE_NAME)?.value;
  return value ? verifyToken(value) : null;
}

function mintedToken(response: Response): string {
  return (response as unknown as {
    cookies: { get(name: string): { value: string } | undefined };
  }).cookies.get(SESSION_COOKIE_NAME)!.value;
}

// ───────────────────────────────────────────────────────────────────────────
// PHASE 2 — the preview reads, and only reads
// ───────────────────────────────────────────────────────────────────────────

describe("Promotion preview — what would move", () => {
  it("writes NOTHING — the state is byte-identical before and after", async () => {
    const f = await seedPromotableCompany();
    const before = JSON.stringify(getState());
    previewCompanyPortal(f.agencyId, f.companyId);
    assert.equal(JSON.stringify(getState()), before, "a preview that writes is not a preview");
  });

  it("reports every PortalState collection, including the empty ones", async () => {
    const f = await seedPromotableCompany();
    const preview = previewCompanyPortal(f.agencyId, f.companyId)!;
    assert.ok(previewCoversEveryCollection(preview));
    assert.equal(preview.lines.length, PROMOTION_COLLECTION_COUNT);
    assert.deepEqual(
      preview.lines.map(line => line.collection as string),
      PROMOTION_COLLECTIONS as string[],
    );
  });

  it("moves the brand's client, and only the brand's client", async () => {
    const f = await seedPromotableCompany();
    const preview = previewCompanyPortal(f.agencyId, f.companyId)!;
    assert.deepEqual(preview.movingClientIds, [f.companyClientId]);
    const clients = preview.lines.find(line => line.collection === "clients")!;
    assert.equal(clients.moving, 1);
    assert.ok(clients.sample.includes(f.companyClientId));
    assert.ok(!clients.sample.includes(f.otherClientId), "a sibling brand's client must not move");
  });

  it("moves a product owned only by this brand", async () => {
    const f = await seedPromotableCompany();
    const preview = previewCompanyPortal(f.agencyId, f.companyId)!;
    const products = preview.lines.find(line => line.collection === "agencyProducts")!;
    assert.equal(products.disposition, "move");
    assert.ok(products.sample.includes(f.ownCompanyProductId));
  });

  it("calls a SHARED product ambiguous, and defaults it to LEAVE", async () => {
    const f = await seedPromotableCompany();
    const preview = previewCompanyPortal(f.agencyId, f.companyId)!;
    const products = preview.lines.find(line => line.collection === "agencyProducts")!;
    assert.ok(!products.sample.includes(f.sharedProductId), "a shared product must not be in the move list");

    const ambiguity = preview.ambiguities.find(
      entry => entry.collection === "agencyProducts" && entry.kind === "shared-record",
    );
    assert.ok(ambiguity, "a product shared with another brand must be raised as ambiguous");
    assert.equal(ambiguity!.suggested, "leave", "every ambiguous default must be the reversible direction");
    assert.ok(ambiguity!.recordIds.includes(f.sharedProductId));
  });

  it("calls a product with EMPTY companyIds ambiguous too — unset means every brand", async () => {
    const f = await seedPromotableCompany();
    const preview = previewCompanyPortal(f.agencyId, f.companyId)!;
    const ambiguity = preview.ambiguities.find(
      entry => entry.collection === "agencyProducts" && entry.kind === "shared-record",
    )!;
    assert.ok(
      ambiguity.recordIds.includes(f.unscopedProductId),
      "a product with no companyIds belongs to every brand — moving it would take it from the others",
    );
  });

  it("SEES THE NINTH OWNERSHIP SURFACE — company ids buried inside plugin data", async () => {
    const f = await seedPromotableCompany();
    const preview = previewCompanyPortal(f.agencyId, f.companyId)!;
    const rows = preview.pluginData.filter(row => row.installId === f.installId);
    assert.ok(rows.length > 0, "a preview blind to pluginData under-reports what a promotion touches");

    const invoices = rows.find(row => row.key === "invoices")!;
    assert.equal(invoices.exclusive, 1, "one invoice names this company and no other");
    assert.equal(invoices.scope, "agency");

    const pots = rows.find(row => row.key === "budgetPots")!;
    assert.equal(pots.shared, 1, "a pot naming two brands is a split, not a move");

    assert.ok(preview.totals.pluginInstallsNeedingHook >= 1);
    assert.ok(
      preview.warnings.some(warning => warning.includes("onPromoteCompany")),
      "the preview must say the core cannot split opaque plugin values itself",
    );
  });

  it("says out loud that it cannot see live enquiries", async () => {
    const f = await seedPromotableCompany();
    const preview = previewCompanyPortal(f.agencyId, f.companyId)!;
    assert.ok(
      preview.warnings.some(w => w.includes("brand_enquiries") && w.includes("consent")),
      "consent given to one legal entity does not travel to a new one — the preview must not stay quiet about it",
    );
  });

  it("refuses to preview another agency's company, with the same answer as a fake id", async () => {
    const f = await seedPromotableCompany();
    assert.equal(previewCompanyPortal(f.otherAgencyId, f.companyId), null);
    assert.equal(previewCompanyPortal(f.agencyId, "company_does_not_exist"), null);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// PHASE 3 — the security shell, promoting nothing
// ───────────────────────────────────────────────────────────────────────────

describe("Promote endpoint — the boundary", () => {
  it("creates the tenant, grants membership, and moves NOTHING", async () => {
    const f = await seedPromotableCompany();
    const clientsBefore = Object.keys(getState().clients).length;
    const productsBefore = JSON.stringify(getState().agencyProducts);

    const res = await PROMOTE_POST(...promoteRequest(f.token, f.companyId));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.created, true);
    assert.equal(body.movedRecords, 0, "phase 3 promotes nothing");

    const agency = getAgency(body.agencyId);
    assert.ok(agency, "the new tenant must exist");
    assert.equal(agency!.status, "active");

    // Nothing moved.
    assert.equal(Object.keys(getState().clients).length, clientsBefore);
    assert.equal(getState().clients[f.companyClientId]!.agencyId, f.agencyId, "the client must not have moved");
    // The ORIGIN's products are untouched — that is what "moves nothing" means.
    //
    // Comparing the whole map used to work and stopped meaning anything on
    // 2026-08-27, when `bootstrapAgency` began seeding a new tenant's one
    // default product (issue #21 — it used to be seeded by the first page view,
    // which was a write on eight rendered surfaces). A promoted company is a new
    // tenant like any other and gets its own Website; what it must never get is
    // a single record belonging to the agency it came from.
    const before = JSON.parse(productsBefore) as Record<string, { agencyId: string }>;
    const after = getState().agencyProducts;
    for (const [id, product] of Object.entries(before)) {
      assert.deepEqual(after[id], product, `the origin's product ${id} was altered by a promotion`);
    }
    const newTenantProducts = Object.values(after).filter(product => product.agencyId === body.agencyId);
    assert.equal(newTenantProducts.length, 1, "the new tenant got more than its own default product");
    assert.equal(newTenantProducts[0]!.name, "Website");
    assert.equal(
      Object.keys(after).length, Object.keys(before).length + 1,
      "a promotion created or moved a product it should not have",
    );

    // Tombstoned, so later phases know which agency to move records into.
    const company = getTradingCompany(f.agencyId, f.companyId)!;
    assert.equal(company.portalAgencyId, body.agencyId);
    assert.ok(typeof company.portalCreatedAt === "number" && company.portalCreatedAt > 0);
  });

  it("re-mints the promoter's cookie as old ∪ {new}, and NOTHING more", async () => {
    const f = await seedPromotableCompany();
    const before = verifyToken(f.token)!;
    const res = await PROMOTE_POST(...promoteRequest(f.token, f.companyId));
    const body = await res.json();
    const session = mintedSession(res)!;

    assert.equal(session.activeAgencyId, body.agencyId);
    assert.equal(session.userId, f.userId, "promoting must not change who you are");
    assert.equal(session.role, "agency-owner");
    assert.equal(session.isDemo, undefined, "no borrowed-identity marker may be forwarded");
    assert.equal(session.devReturnAgencyId, undefined);
    assert.equal(session.previewReturnAgencyId, undefined);

    const expected = new Set([...(before.agencyIds ?? []), body.agencyId]);
    assert.deepEqual(
      [...session.agencyIds!].sort(),
      [...expected].sort(),
      "the re-mint may add exactly the one id it just granted",
    );
  });

  it("THE CARVE-OUT DID NOT LEAK: the new cookie still cannot switch to a third agency", async () => {
    const f = await seedPromotableCompany();
    const stranger = createAgency({ name: `Stranger ${seq}`, slug: `stranger-${seq}` });
    const res = await PROMOTE_POST(...promoteRequest(f.token, f.companyId));
    const token = mintedToken(res);

    const switchRes = await SWITCH_POST(
      new NextRequest("http://localhost/api/auth/switch-agency", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost", cookie: `${SESSION_COOKIE_NAME}=${token}` },
        body: JSON.stringify({ agencyId: stranger.id }),
      }),
    );
    assert.equal(switchRes.status, 403, "a promotion must never become a way to widen a session");
  });

  it("a second POST creates nothing, grants nothing and mints nothing", async () => {
    const f = await seedPromotableCompany();
    const first = await PROMOTE_POST(...promoteRequest(f.token, f.companyId));
    const firstBody = await first.json();
    const agenciesAfterFirst = Object.keys(getState().agencies).length;
    const promotedAt = getTradingCompany(f.agencyId, f.companyId)!.portalCreatedAt;

    // The cookie from before the promotion is now STALE by design — granting
    // the membership bumped `sessionRev`. So the second attempt arrives the
    // way a real one would: the promoter switches back to the origin agency
    // (exactly what `/api/auth/switch-agency` mints) and posts again.
    const fresh = getUserById(f.userId)!;
    const backAtOrigin = issueSession({
      userId: fresh.id,
      email: fresh.email,
      role: fresh.role,
      agencyId: f.agencyId,
      agencyIds: fresh.agencyIds,
      activeAgencyId: f.agencyId,
      sessionRev: fresh.sessionRev ?? 0,
    });
    const second = await PROMOTE_POST(...promoteRequest(backAtOrigin, f.companyId));
    assert.equal(second.status, 200);
    const secondBody = await second.json();
    assert.equal(secondBody.agencyId, firstBody.agencyId, "a second POST returns the agency that already exists");
    assert.equal(secondBody.created, false);
    assert.equal(secondBody.alreadyHasPortal, true);
    assert.equal(Object.keys(getState().agencies).length, agenciesAfterFirst, "no second agency");
    assert.equal(getTradingCompany(f.agencyId, f.companyId)!.portalCreatedAt, promotedAt, "the first promotion's stamp stands");
    assert.equal(
      mintedSession(second),
      null,
      "a repeat POST grants nothing in the same request, so it may not mint a cookie either",
    );

    // Exactly one membership grant, not two.
    const memberships = (getUserById(f.userId)!.agencyIds ?? []).filter(id => id === firstBody.agencyId);
    assert.equal(memberships.length, 1);
  });

  it("REFUSES a manager — a manager may run the agency, not spin a business out of it", async () => {
    const f = await seedPromotableCompany();
    updateUser(f.email, { role: "agency-manager" });
    const fresh = getUserById(f.userId)!;
    const token = issueSession({
      userId: fresh.id,
      email: fresh.email,
      role: "agency-manager",
      agencyId: f.agencyId,
      agencyIds: fresh.agencyIds,
      activeAgencyId: f.agencyId,
      sessionRev: fresh.sessionRev ?? 0,
    });
    const res = await PROMOTE_POST(...promoteRequest(token, f.companyId));
    assert.equal(res.status, 403);
    assert.equal(mintedSession(res), null);
    assert.equal(getTradingCompany(f.agencyId, f.companyId)!.portalAgencyId, undefined);
  });

  it("REFUSES a cookie that claims owner while the live record says manager", async () => {
    const f = await seedPromotableCompany();
    updateUser(f.email, { role: "agency-manager" });
    const fresh = getUserById(f.userId)!;
    // Cookie minted with the escalated role AND the current rev, so only the
    // live-record role check can catch it.
    const token = issueSession({
      userId: fresh.id,
      email: fresh.email,
      role: "agency-owner",
      agencyId: f.agencyId,
      agencyIds: fresh.agencyIds,
      activeAgencyId: f.agencyId,
      sessionRev: fresh.sessionRev ?? 0,
    });
    const res = await PROMOTE_POST(...promoteRequest(token, f.companyId));
    // The central fresh-session boundary (issue #22) now refuses the forged
    // cookie before the route runs: an unrecognised session is a 401, and the
    // live record stays authoritative for role.
    assert.equal(res.status, 401, "the live record is authoritative for role");
    assert.equal(mintedSession(res), null);
  });

  it("does not leak whether a company exists", async () => {
    const f = await seedPromotableCompany();
    const foreign = await PROMOTE_POST(...promoteRequest(f.token, f.companyId + "_nope"));
    const imaginary = await PROMOTE_POST(...promoteRequest(f.token, "company_totally_made_up"));
    assert.equal(foreign.status, imaginary.status);
    assert.deepEqual(await foreign.json(), await imaginary.json());
  });

  it("refuses a company belonging to another agency, with that same answer", async () => {
    const f = await seedPromotableCompany();
    const other = await seedPromotableCompany();
    const res = await PROMOTE_POST(...promoteRequest(f.token, other.companyId));
    assert.equal(res.status, 403);
    assert.equal(getTradingCompany(other.agencyId, other.companyId)!.portalAgencyId, undefined);
  });

  it("refuses without a session", async () => {
    const f = await seedPromotableCompany();
    const res = await PROMOTE_POST(...promoteRequest(undefined, f.companyId));
    assert.equal(res.status, 401);
  });

  it("refuses a cross-origin post", async () => {
    const f = await seedPromotableCompany();
    const res = await PROMOTE_POST(...promoteRequest(f.token, f.companyId, { origin: "https://evil.example" }));
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, "invalid_origin");
    assert.equal(getTradingCompany(f.agencyId, f.companyId)!.portalAgencyId, undefined);
  });

  it("refuses a stale session whose rev the user record has moved past", async () => {
    const f = await seedPromotableCompany();
    updateUser(f.email, { name: "Renamed" });
    addUserAgencyMembership(f.userId, f.otherAgencyId); // bumps sessionRev
    const res = await PROMOTE_POST(...promoteRequest(f.token, f.companyId));
    assert.equal(res.status, 401);
  });

  it("never caches an answer", async () => {
    const f = await seedPromotableCompany();
    const res = await PROMOTE_POST(...promoteRequest(f.token, f.companyId));
    assert.equal(res.headers.get("cache-control"), "no-store");
  });
});

describe("Promote endpoint — a borrowed identity cannot promote", () => {
  const borrowed: [string, Partial<Parameters<typeof issueSession>[0]>][] = [
    ["demo", { isDemo: true }],
    ["Dev Mode", { devReturnAgencyId: "ag_home" }],
    ["freelancer preview", { previewReturnAgencyId: "ag_home" }],
    ["public showcase", { publicShowcase: true }],
    ["showcase", { showcaseReturnAgencyId: "ag_home" }],
  ];

  for (const [label, extra] of borrowed) {
    it(`refuses a ${label} session, and promotes nothing`, async () => {
      const f = await seedPromotableCompany();
      const fresh = getUserById(f.userId)!;
      const token = issueSession({
        userId: fresh.id,
        email: fresh.email,
        role: fresh.role,
        agencyId: f.agencyId,
        agencyIds: fresh.agencyIds,
        activeAgencyId: f.agencyId,
        sessionRev: fresh.sessionRev ?? 0,
        ...extra,
      });
      const res = await PROMOTE_POST(...promoteRequest(token, f.companyId));
      assert.equal(res.status, 409, `${label} must be told to leave the preview first`);
      assert.equal(mintedSession(res), null, `${label} must not be re-minted`);
      assert.equal(getTradingCompany(f.agencyId, f.companyId)!.portalAgencyId, undefined);
    });
  }
});

describe("Promote endpoint — the preview is served under the same guards", () => {
  it("an owner gets the full preview", async () => {
    const f = await seedPromotableCompany();
    const res = await PROMOTE_GET(...promoteRequest(f.token, f.companyId, { method: "GET" }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.preview.collectionsClassified, PROMOTION_COLLECTION_COUNT);
    assert.equal(body.preview.totals.movedRecords, undefined);
  });

  it("a demo session cannot read it either", async () => {
    const f = await seedPromotableCompany();
    const fresh = getUserById(f.userId)!;
    const token = issueSession({
      userId: fresh.id,
      email: fresh.email,
      role: fresh.role,
      agencyId: f.agencyId,
      agencyIds: fresh.agencyIds,
      activeAgencyId: f.agencyId,
      sessionRev: fresh.sessionRev ?? 0,
      isDemo: true,
    });
    const res = await PROMOTE_GET(...promoteRequest(token, f.companyId, { method: "GET" }));
    assert.equal(res.status, 409);
  });

  it("a GET does not write either", async () => {
    const f = await seedPromotableCompany();
    const before = JSON.stringify(getState());
    await PROMOTE_GET(...promoteRequest(f.token, f.companyId, { method: "GET" }));
    assert.equal(JSON.stringify(getState()), before);
  });
});

describe("Promote endpoint — the archived skeleton's guards were NOT copied", () => {
  it("imports the switcher's guard shape rather than agency-add's", () => {
    const source = sourceWithoutComments(
      "src/app/api/portal/agency/companies/[companyId]/portal/route.ts",
    );
    assert.match(source, /hasValidOrigin/);
    assert.match(source, /isBorrowedIdentity/);
    assert.match(source, /isSessionFresh/);
    assert.match(source, /function refuse\(\)/);
    assert.doesNotMatch(source, /founder_only/, "the label that sat over an owner-OR-manager gate");
    assert.doesNotMatch(source, /isDemo: session\.isDemo/, "agency-add forwarded isDemo and dropped the return markers");
  });

  it("the archived agency-add endpoint stays archived", () => {
    // Take the mechanism, leave the guards — and leave the archive alone.
    const archived = sourceWithoutComments("src/archive/multi-agency/api/agency-add.ts");
    assert.match(archived, /founder_only/, "unchanged in the archive");
    assert.doesNotMatch(archived, /hasValidOrigin/, "if this now has guards, the archive was edited");
  });
});


// ─── THE THIRD TIER ───────────────────────────────────────────────────────
//
// Settled by the founder 2026-08-20: "it's both — agency as a holding group,
// trading companies as companies, and then each company has clients."
//
// The failure this section exists to catch is quiet. If the portal tenant is
// created WITHOUT a link back to its holding group, everything still works:
// the tenant boots, the owner can switch into it, every test above still
// passes. What is lost is the top tier — the group can no longer tell which
// agencies are its own companies' portals and which are unrelated businesses.
// Nothing fails; the model just silently collapses from three tiers to two.

describe("Company portal — the holding-group link (the third tier)", () => {
  it("stamps the portal tenant with its holding group AND its company", async () => {
    const f = await seedPromotableCompany();
    const res = await PROMOTE_POST(...promoteRequest(f.token, f.companyId));
    assert.equal(res.status, 200);
    const body = await res.json();

    const portal = getAgency(body.agencyId)!;
    assert.equal(
      portal.holdingAgencyId,
      f.agencyId,
      "a portal tenant with no holding group is indistinguishable from an unrelated business",
    );
    assert.equal(portal.companyId, f.companyId, "the portal must name the company it is for");

    // And the link is TWO-WAY — neither tier reachable without the other.
    const company = getTradingCompany(f.agencyId, f.companyId)!;
    assert.equal(company.portalAgencyId, body.agencyId);
    assert.equal(company.agencyId, f.agencyId, "the company STAYS in its holding group");
  });

  it("the company does not leave, change tier, or lose its clients", async () => {
    const f = await seedPromotableCompany();
    const clientsBefore = Object.values(getState().clients)
      .filter(c => c.companyId === f.companyId)
      .map(c => c.id)
      .sort();
    assert.ok(clientsBefore.length > 0, "fixture must give the company a client to keep");

    await PROMOTE_POST(...promoteRequest(f.token, f.companyId));

    // Still a company, still in the portfolio, still owning its clients.
    const listed = getTradingCompany(f.agencyId, f.companyId);
    assert.ok(listed, "the company must still belong to its holding group — it was never promoted OUT");
    const clientsAfter = Object.values(getState().clients)
      .filter(c => c.companyId === f.companyId)
      .map(c => c.id)
      .sort();
    assert.deepEqual(clientsAfter, clientsBefore, "clients stay with the company; nothing moved");
    assert.equal(tradingCompanyHasOwnPortal(f.agencyId, f.companyId), true);
  });

  it("the holding group can list the portals it holds, and only those", async () => {
    const f = await seedPromotableCompany();
    assert.deepEqual(listHeldCompanyPortals(f.agencyId), [], "no portals before one is created");

    const res = await PROMOTE_POST(...promoteRequest(f.token, f.companyId));
    const body = await res.json();

    const held = listHeldCompanyPortals(f.agencyId);
    assert.deepEqual(held.map(a => a.id), [body.agencyId], "the group must see exactly its own portal");
    assert.equal(getCompanyPortalAgency(f.agencyId, f.companyId)!.id, body.agencyId);

    // An unrelated agency holds nothing, and the portal itself is not a group.
    assert.deepEqual(listHeldCompanyPortals(f.otherAgencyId), []);
    assert.deepEqual(listHeldCompanyPortals(body.agencyId), []);
    assert.equal(getCompanyPortalAgency(f.agencyId, "company_not_real"), null);
  });

  it("an ordinary agency carries NO holding link — the stamp is opt-in", async () => {
    await ensureHydrated();
    const plain = createAgency({ name: `Plain ${Date.now()}`, slug: `plain-${Date.now()}` });
    assert.equal(plain.holdingAgencyId, undefined, "a top-level agency is nobody's company portal");
    assert.equal(plain.companyId, undefined);
  });

  it("the stamp is written once — a repeat POST never re-points an existing portal", async () => {
    const f = await seedPromotableCompany();
    const first = await PROMOTE_POST(...promoteRequest(f.token, f.companyId));
    const firstBody = await first.json();
    const firstStamp = getTradingCompany(f.agencyId, f.companyId)!.portalCreatedAt;

    // Directly re-marking with a DIFFERENT tenant must not overwrite.
    markTradingCompanyPortalCreated(f.agencyId, f.companyId, "some-other-agency", f.userId);
    const company = getTradingCompany(f.agencyId, f.companyId)!;
    assert.equal(company.portalAgencyId, firstBody.agencyId, "the first portal stands");
    assert.equal(company.portalCreatedAt, firstStamp, "the first timestamp is never overwritten");
    assert.equal(getCompanyPortalAgency(f.agencyId, f.companyId)!.id, firstBody.agencyId);
  });
});
