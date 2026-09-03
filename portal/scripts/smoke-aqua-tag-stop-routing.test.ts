import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, describe, it } from "node:test";

let storage: typeof import("../src/server/storage");
let tenants: typeof import("../src/server/tenants");
let companies: typeof import("../src/server/tradingCompanies");
let sources: typeof import("../src/server/websiteSources");
let injections: typeof import("../src/server/websiteInjections");
let formSchemas: typeof import("../src/server/websiteFormSchemas");
let agencyId: string;
let companyId: string;
let siteId: string;

const FORM_HTML = `<form id="contact"><input name="email" type="email"><button>Send</button></form>`;
const fakeFetch = (async (url: string) => ({
  html: FORM_HTML,
  finalUrl: url,
  statusCode: 200,
})) as unknown as typeof import("../src/lib/server/safeSiteFetch").fetchPublicSiteHtml;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  tenants = await import("../src/server/tenants");
  companies = await import("../src/server/tradingCompanies");
  sources = await import("../src/server/websiteSources");
  injections = await import("../src/server/websiteInjections");
  formSchemas = await import("../src/server/websiteFormSchemas");
});

beforeEach(async () => {
  storage.mutate(state => {
    state.websiteSources = {};
    state.websiteSiteConfigs = {};
  });
  agencyId = tenants.createAgency({
    name: "Stop routing test",
    slug: `stop-routing-${Math.random().toString(36).slice(2)}`,
  }).id;
  companyId = companies.createTradingCompany(agencyId, { name: "Preserved company" }, "user_owner").id;
  siteId = sources.addWebsiteSource({
    agencyId,
    host: "preserved.example.com",
    destinationCompanyId: companyId,
    createdBy: "user_owner",
  }).id;
  injections.addInjection({
    agencyId,
    websiteSourceId: siteId,
    kind: "ga4",
    value: "G-PRESERVE1",
  });
  const imported = await formSchemas.importFormSchemasForSite({ agencyId, websiteSourceId: siteId }, fakeFetch);
  assert.equal(imported.ok, true);
});

describe("Aqua Tag stop-routing semantics", () => {
  it("routes to the agency inbox without deleting the source, tools or forms", () => {
    const before = sources.getWebsiteSource(agencyId, siteId);
    assert.equal(before?.destinationCompanyId, companyId);

    const updated = sources.updateWebsiteSourceRouting({ agencyId, id: siteId });
    assert.equal(updated?.id, siteId);
    assert.equal(updated?.destinationCompanyId, undefined);
    assert.equal(updated?.destinationClientId, undefined);
    assert.deepEqual(sources.resolveWebsiteSourceRouting(agencyId, "preserved.example.com"), { kind: "inbox" });
    assert.equal(sources.getWebsiteSource(agencyId, siteId)?.host, "preserved.example.com");
    assert.deepEqual(injections.listInjections(agencyId, siteId).map(item => item.value), ["G-PRESERVE1"]);
    assert.equal(formSchemas.listSiteFormSchemas(agencyId, siteId).length, 1);
  });

  it("keeps permanent deletion separate and cascading", () => {
    assert.equal(sources.removeWebsiteSource(agencyId, siteId), true);
    assert.equal(sources.getWebsiteSource(agencyId, siteId), null);
    assert.equal(injections.getSiteConfig(agencyId, siteId), null);
    assert.deepEqual(formSchemas.listSiteFormSchemas(agencyId, siteId), []);
  });

  it("mounts a non-destructive route action on both Stop controls", () => {
    const agencyUi = readFileSync(new URL(
      "../src/app/portal/agency/fulfilment/_AquaTagsWorkspace.tsx",
      import.meta.url,
    ), "utf8");
    const clientUi = readFileSync(new URL(
      "../src/app/portal/clients/[clientId]/_ClientTagWorkspace.tsx",
      import.meta.url,
    ), "utf8");
    const route = readFileSync(new URL(
      "../src/app/api/portal/website-sources/route.ts",
      import.meta.url,
    ), "utf8");
    const registry = readFileSync(new URL(
      "../src/lib/client/websiteSourceRegistryRead.ts",
      import.meta.url,
    ), "utf8");

    // Both mounted controls send the dedicated non-destructive action through
    // ONE checked helper, so neither can drift onto `remove` or onto a bare
    // fetch that mistakes a 200 for a receipt. → issues #85
    for (const ui of [agencyUi, clientUi]) {
      assert.match(ui, /routeWebsiteSourceToInbox\(/);
      // (ToolInjections removes a TOOL with `action: "remove", siteId, injectionId`;
      // a SOURCE removal is `action: "remove", id` and must never be sent here.)
      assert.doesNotMatch(ui, /action: "remove", id/, "a routing control must never send the destructive source action");
      assert.match(ui, /back to the agency inbox/);
      assert.match(ui, /Keep the registered site and its tools/);
    }
    assert.match(registry, /action: "route-to-inbox"/);
    assert.match(registry, /checkedJsonMutation</, "the helper must use the existing checked mutation contract");
    assert.match(registry, /isWebsiteSourceRouteReceipt\(payload, \{ sourceId, routing: \{\} \}\)/,
      "a route receipt must name the same source with no destination");
    assert.match(route, /action === "route-to-inbox"/);
    // The agency comes from the SERVER, not the body — but it is no longer
    // spelled `session.agencyId` inline. The route resolves an access-kernel
    // actor and hoists `const agencyId = actor.resourceAgencyId`, which is the
    // same guarantee through the newer vocabulary. Assert the guarantee: the
    // agency is actor-derived, and the call is handed that local rather than
    // anything off the request.
    assert.match(route, /const agencyId = actor\.resourceAgencyId;/,
      "the route stopped deriving its agency from the resolved actor");
    assert.match(route, /updateWebsiteSourceRouting\(\{\s*\n\s*agencyId,\s*\n\s*id:/,
      "route-to-inbox stopped passing the server-derived agency");
    assert.doesNotMatch(route, /agencyId: (?:str\()?body/,
      "an agency id is being taken from the request body");
    assert.match(route, /website_source\.routed_to_inbox/);
  });

  it("warns about every cascading dependency and supports cancel before deletion", () => {
    const configUi = readFileSync(new URL(
      "../src/app/portal/agency/inbox/_WebsiteSourcesConfig.tsx",
      import.meta.url,
    ), "utf8");
    const registry = readFileSync(new URL(
      "../src/lib/client/websiteSourceRegistryRead.ts",
      import.meta.url,
    ), "utf8");
    assert.match(configUi, /window\.confirm/);
    assert.match(configUi, /registration, tool injections and imported form schemas/);
    assert.match(configUi, /if \(!confirmed\) return/);
    assert.match(configUi, /aria-label={`Permanently remove/);
    assert.match(configUi, /removeWebsiteSourceRegistration\(/);
    assert.match(registry, /action: "remove"/);
    assert.match(registry, /isWebsiteSourceRemoveReceipt\(payload, \{ sourceId \}\)/,
      "a removal receipt must name the exact source that was removed");
    // Nothing optimistic: the row leaves the list only after the receipt.
    const removeBody = configUi.slice(configUi.indexOf("async function remove("), configUi.indexOf("async function importForms("));
    assert.ok(removeBody.indexOf("await removeWebsiteSourceRegistration(") < removeBody.indexOf("setSources(current => current.filter"),
      "the row must not be dropped before the server confirms the removal");
  });
});
