import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

let storage: typeof import("../src/server/storage");
let tenants: typeof import("../src/server/tenants");
let sources: typeof import("../src/server/websiteSources");
let injections: typeof import("../src/server/websiteInjections");

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  tenants = await import("../src/server/tenants");
  sources = await import("../src/server/websiteSources");
  injections = await import("../src/server/websiteInjections");
});

describe("the Aqua Tag injection config (consent-aware tag manager)", () => {
  let agencyId: string;
  let siteId: string;

  beforeEach(() => {
    storage.mutate(state => { state.websiteSources = {}; state.websiteSiteConfigs = {}; });
    agencyId = tenants.createAgency({ name: "Inject Co", slug: `inj-${Math.floor(performance.now())}` }).id;
    siteId = sources.addWebsiteSource({ agencyId, host: "zimante.com", createdBy: "ed" }).id;
  });

  it("adds an allow-listed tool by id, defaulting its consent category", () => {
    const injection = injections.addInjection({ agencyId, websiteSourceId: siteId, kind: "ga4", value: "G-ABC12345" });
    assert.equal(injection.kind, "ga4");
    assert.equal(injection.value, "G-ABC12345");
    assert.equal(injection.consentCategory, "analytics", "GA4 defaults to analytics consent");
    assert.equal(injection.enabled, true);
    assert.deepEqual(injections.listInjections(agencyId, siteId).map(i => i.id), [injection.id]);
  });

  it("verification tags default to necessary (they don't track)", () => {
    const injection = injections.addInjection({ agencyId, websiteSourceId: siteId, kind: "gsc-verification", value: "google-site-verification-token-abc" });
    assert.equal(injection.consentCategory, "necessary");
  });

  it("refuses a tool that isn't on the allow-list", () => {
    assert.throws(() => injections.addInjection({ agencyId, websiteSourceId: siteId, kind: "hotjar", value: "12345" }), /supported list/);
  });

  it("refuses a raw snippet or any value that isn't a clean provider id — the security guard", () => {
    // The whole v1 model is id/key only; anything with markup or the wrong shape is rejected.
    assert.throws(() => injections.addInjection({ agencyId, websiteSourceId: siteId, kind: "ga4", value: "G-1\"><script>alert(1)</script>" }));
    assert.throws(() => injections.addInjection({ agencyId, websiteSourceId: siteId, kind: "ga4", value: "not-a-ga4-id" }));
    assert.throws(() => injections.addInjection({ agencyId, websiteSourceId: siteId, kind: "meta-pixel", value: "abc" }), /Pixel/);
  });

  it("lets the operator override the consent category", () => {
    const injection = injections.addInjection({ agencyId, websiteSourceId: siteId, kind: "ga4", value: "G-OVERRIDE1", consentCategory: "marketing" });
    assert.equal(injection.consentCategory, "marketing");
  });

  it("refuses an unknown consent category", () => {
    assert.throws(() => injections.addInjection({ agencyId, websiteSourceId: siteId, kind: "ga4", value: "G-BADCAT12", consentCategory: "tracking" }));
  });

  it("won't add the same tool+id twice, or add to another agency's site", () => {
    injections.addInjection({ agencyId, websiteSourceId: siteId, kind: "gtm", value: "GTM-ABC12" });
    assert.throws(() => injections.addInjection({ agencyId, websiteSourceId: siteId, kind: "gtm", value: "gtm-abc12" }), /already on this site/);
    const other = tenants.createAgency({ name: "Other", slug: `o-${Math.floor(performance.now())}` }).id;
    assert.throws(() => injections.addInjection({ agencyId: other, websiteSourceId: siteId, kind: "ga4", value: "G-FOREIGN1" }), /not found/);
  });

  it("toggles, re-points and removes an injection", () => {
    const injection = injections.addInjection({ agencyId, websiteSourceId: siteId, kind: "posthog", value: "phc_abcdefghijklmnop" });
    injections.updateInjection({ agencyId, websiteSourceId: siteId, injectionId: injection.id, enabled: false });
    assert.equal(injections.listInjections(agencyId, siteId)[0].enabled, false);
    injections.updateInjection({ agencyId, websiteSourceId: siteId, injectionId: injection.id, consentCategory: "preferences" });
    assert.equal(injections.listInjections(agencyId, siteId)[0].consentCategory, "preferences");
    assert.throws(() => injections.updateInjection({ agencyId, websiteSourceId: siteId, injectionId: injection.id, value: "not-a-key" }));
    assert.equal(injections.removeInjection(agencyId, siteId, injection.id), true);
    assert.equal(injections.listInjections(agencyId, siteId).length, 0);
  });

  it("serves only enabled injections, resolved by host (what the endpoint will use)", () => {
    const on = injections.addInjection({ agencyId, websiteSourceId: siteId, kind: "ga4", value: "G-ENABLED1" });
    const off = injections.addInjection({ agencyId, websiteSourceId: siteId, kind: "gtm", value: "GTM-OFF12" });
    injections.updateInjection({ agencyId, websiteSourceId: siteId, injectionId: off.id, enabled: false });
    const served = injections.listEnabledInjectionsForHost(agencyId, "https://www.Zimante.com/pricing");
    assert.deepEqual(served.map(i => i.id), [on.id], "only the enabled one, matched however the URL is written");
    assert.deepEqual(injections.listEnabledInjectionsForHost(agencyId, "unregistered.com"), []);
  });

  it("takes a site's config with it when the site is removed — never orphaned", () => {
    injections.addInjection({ agencyId, websiteSourceId: siteId, kind: "ga4", value: "G-ORPHAN12" });
    assert.equal(sources.removeWebsiteSource(agencyId, siteId), true);
    assert.equal(injections.getSiteConfig(agencyId, siteId), null, "the site (and its config) is gone");
  });
});

describe("the public config endpoint serves the tag (real route handler)", () => {
  let route: typeof import("../src/app/api/public/aqua-tag-config/route");
  let NextRequest: typeof import("next/server").NextRequest;
  let agencyId: string;
  let masterKey: string;

  before(async () => {
    route = await import("../src/app/api/public/aqua-tag-config/route");
    ({ NextRequest } = await import("next/server"));
  });

  beforeEach(() => {
    storage.mutate(state => { state.websiteSources = {}; state.websiteSiteConfigs = {}; state.agencyMasterTagKeys = {}; });
    agencyId = tenants.createAgency({ name: "Serve Co", slug: `srv-${Math.floor(performance.now())}` }).id;
    masterKey = sources.ensureAgencyMasterSiteKey(agencyId);
    const siteId = sources.addWebsiteSource({ agencyId, host: "zimante.com", createdBy: "ed" }).id;
    injections.addInjection({ agencyId, websiteSourceId: siteId, kind: "ga4", value: "G-SERVED11" });
    const off = injections.addInjection({ agencyId, websiteSourceId: siteId, kind: "gtm", value: "GTM-HIDDEN1" });
    injections.updateInjection({ agencyId, websiteSourceId: siteId, injectionId: off.id, enabled: false });
  });

  const call = async (query: string) => {
    const response = await route.GET(new NextRequest(`http://localhost/api/public/aqua-tag-config${query}`));
    return {
      status: response.status,
      body: await response.json() as { injections: unknown[] },
      cache: response.headers.get("cache-control"),
      cors: response.headers.get("access-control-allow-origin"),
    };
  };

  it("returns a site's enabled injections for the right key+host, cached and CORS-open", async () => {
    const { status, body, cache, cors } = await call(`?key=${masterKey}&host=https://www.Zimante.com/pricing`);
    assert.equal(status, 200);
    assert.deepEqual(body.injections, [{ kind: "ga4", value: "G-SERVED11", consentCategory: "analytics" }], "enabled only; only kind/value/category, no internal ids");
    assert.match(cache ?? "", /max-age=300/);
    assert.equal(cors, "*");
  });

  it("serves nothing for an unknown key or an unconfigured host — the safe default", async () => {
    assert.deepEqual((await call(`?key=aqua_notreal&host=zimante.com`)).body.injections, []);
    assert.deepEqual((await call(`?key=${masterKey}&host=unregistered.com`)).body.injections, []);
  });
});

describe("the tag script injects configured tools (source contract)", () => {
  let source: string;
  before(async () => { source = (await import("../src/lib/integrations/aquaTagSource")).AQUA_TAG_SOURCE; });

  it("stays syntactically valid JavaScript after the injection edit", () => {
    // The tag is a String.raw template served byte-identical to every visitor; a
    // syntax slip (or a stray `${` / backtick) would break form-capture on every
    // tagged site at once. Parsing it here is the headless guard for that.
    assert.doesNotThrow(() => new Function(source));
    assert.ok(!source.includes("${"), "no template interpolation may leak into the served tag");
  });

  it("fetches the config endpoint and injects each tool gated by consent", () => {
    assert.match(source, /aqua-tag-config\?key=/);
    assert.match(source, /loadInjections\(\)/);
    assert.match(source, /if \(!permitted\(item\.consentCategory/, "each tool is held until its consent category is granted");
    // Retroactive: runInjections also runs from applyPreferences on a consent change.
    assert.match(source, /preferences = next;\s*\n\s*\/\/[^\n]*\n\s*runInjections\(\);/);
    // The allow-listed recipes are present.
    assert.match(source, /google-site-verification/);
    assert.match(source, /googletagmanager\.com\/gtag/);
    assert.match(source, /connect\.facebook\.net/);
  });

  it("never lets a failing tool break the page", () => {
    assert.match(source, /try \{ injectTool\(item\); \} catch/);
  });
});

describe("the injection management route + workspace UI are wired", () => {
  const read = (relative: string) => require("node:fs").readFileSync(require("node:path").join(__dirname, "..", relative), "utf-8") as string;
  const route = read("src/app/api/portal/website-injections/route.ts");
  const ui = read("src/app/portal/agency/fulfilment/_AquaTagsWorkspace.tsx");

  it("the route is agency-scoped and drives the store CRUD + catalogue", () => {
    assert.match(route, /requireRole\(\[\.\.\.AGENCY_ROLES\]\)/);
    assert.match(route, /addInjection/);
    assert.match(route, /updateInjection/);
    assert.match(route, /removeInjection/);
    assert.match(route, /INJECTION_PROVIDERS/);
    // The value RegExp is a server-only guard — it must never be shipped to the client.
    assert.ok(!route.includes("valuePattern"), "valuePattern must not leave the server");
  });

  it("the workspace has a Tools & injections surface that calls the route", () => {
    assert.match(ui, /Tools &amp; injections/);
    assert.match(ui, /\/api\/portal\/website-injections/);
    assert.match(ui, /function ToolInjections/);
    assert.match(ui, /<ToolInjections \/>/);
  });
});

describe("injections feed Radar — coverage (Phase 5)", () => {
  const read = (relative: string) => require("node:fs").readFileSync(require("node:path").join(__dirname, "..", relative), "utf-8") as string;
  const catalogue = read("src/lib/radar/radarRuleCatalog.ts");
  const observations = read("src/lib/server/radar/radarObservations.ts");

  it("registers a development:injection-coverage family fed by websiteSiteConfigs", () => {
    assert.match(catalogue, /"injection-coverage", "Tag injection coverage"/);
    assert.match(observations, /add\("development", "injection-coverage"/);
    assert.match(observations, /state\.websiteSiteConfigs/);
    assert.match(observations, /injections\.some\(injection => injection\.enabled\)/);
  });
});

// ─── The Dev Team "API & MCP" page's master-tag block ───────────────────────
//
// The page presents the master tag as a machine surface: its permanent key, the
// snippet, the endpoints the tag actually calls, and the injectable allow-list.
// Every one of those is derived from the same source the tag itself uses, so
// what's asserted here is that the derivation stays complete — a new endpoint
// or provider must not be able to appear in the tag while the page still shows
// the old set.

describe("the master tag as surfaced on the Dev Team API page", () => {
  const readPage = () => require("node:fs").readFileSync("src/app/portal/dev-team/api/_Section.tsx", "utf8");
  const readPanel = () => require("node:fs").readFileSync("src/app/portal/dev-team/api/_MasterTagPanel.tsx", "utf8");

  it("surfaces every endpoint the tag script actually calls — no more, no less", async () => {
    const { AQUA_TAG_SOURCE } = await import("../src/lib/integrations/aquaTagSource");

    // What the deployed tag really talks to, read out of the tag's own source.
    const called = [...new Set([...AQUA_TAG_SOURCE.matchAll(/\/api\/[a-zA-Z0-9/_-]+/g)].map(m => m[0]))].sort();
    assert.deepEqual(called, [
      "/api/public/aqua-tag-config",
      "/api/public/form-capture",
      "/api/telemetry/collect",
    ], "the tag's endpoint set changed — the API page must be updated to match");

    // And each one is built into the view the page hands its panel.
    const page = readPage();
    for (const endpoint of called) {
      assert.ok(
        page.includes(endpoint),
        `the API page does not surface "${endpoint}", which the tag calls`,
      );
    }
  });

  it("passes every allow-listed provider through, with its pattern made serialisable", () => {
    const page = readPage();
    // RegExp cannot cross the server/client boundary — the page must send
    // `.source`, or the panel silently renders empty patterns.
    assert.match(page, /valuePattern: provider\.valuePattern\.source/);
    // Mapped from the catalogue, not retyped — so adding a provider needs no edit here.
    assert.match(page, /INJECTION_PROVIDERS\.map\(/);
    assert.ok(injections.injectionProvider("ga4"), "the catalogue is reachable as the page expects");

    const panel = readPanel();
    assert.match(panel, /view\.providers\.map\(/, "the panel renders the passed list rather than its own");
    assert.doesNotMatch(panel, /\bga4\b|\bGTM-\b|\bphc_\b/, "the panel hardcodes no provider — all of it is derived");
  });

  it("keeps the master site key stable — the tag is already deployed, it can never rotate", () => {
    const agency = tenants.createAgency({ name: "Tag Stability Co", slug: `tag-stable-${Math.floor(performance.now())}` }).id;
    const first = sources.ensureAgencyMasterSiteKey(agency);
    const second = sources.ensureAgencyMasterSiteKey(agency);
    assert.equal(second, first, "ensureAgencyMasterSiteKey must be idempotent");
    assert.equal(sources.resolveAgencyByMasterSiteKey(first), agency, "the ingestion path resolves it back");

    // The snippet the page shows is the real builder's output, pointed at the
    // resolved origin — script path and key attribute both present.
    const snippet = sources.masterTagSnippet("https://crm.example.com/", first);
    assert.equal(snippet, `<script src="https://crm.example.com/aqua-tag.js" data-site-key="${first}" defer></script>`);
    assert.match(readPage(), /masterTagSnippet\(tagOrigin, tagKey\)/);
  });

  it("warns when the snippet would be built from an origin no visitor can reach", async () => {
    // Found in browser verification, not by reading the code: the first version
    // asked "is NEXT_PUBLIC_PORTAL_BASE_URL set?" — and locally it IS set, to
    // http://localhost:3032, so the warning stayed silent on a snippet that
    // pointed at a dev server. The question that actually matters is whether a
    // stranger's browser could reach the origin at all.
    const { isPubliclyReachableOrigin } = await import("../src/lib/public/publicOrigin");

    for (const unreachable of [
      "http://localhost:3032",          // the exact value that slipped through
      "http://localhost:3046",
      "http://127.0.0.1:3000",
      "http://[::1]:3000",
      "http://10.0.0.4:3000",
      "http://192.168.68.58:3046",      // the LAN address Next prints on boot
      "http://172.20.1.5:3000",
      "http://169.254.10.2",
      "https://ed-mac.local:3000",
      "not a url",
      "",
    ]) {
      assert.equal(isPubliclyReachableOrigin(unreachable), false, `${unreachable} is not publicly reachable`);
    }

    for (const reachable of [
      "https://crm.aquaoasis-web.com",
      "https://aquacrm.vercel.app",
      "http://172.15.0.1",              // just outside the private 172.16–31 block
      "https://example.co.uk:8443",
    ]) {
      assert.equal(isPubliclyReachableOrigin(reachable), true, `${reachable} is publicly reachable`);
    }

    assert.match(readPage(), /originIsFallback: !isPubliclyReachableOrigin\(tagOrigin\)/);
    assert.match(readPanel(), /view\.originIsFallback \?/);
  });

});
