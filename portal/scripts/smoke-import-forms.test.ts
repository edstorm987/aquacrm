import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { scanFormSchemasInHtml } from "../src/lib/server/integrations/aquaTagDetection";
import { mergeFormLayout } from "../src/lib/enquiries/enquiryFormLayout";

// Import forms (enquiry-detail-card plan, Phase 2) — read a tagged site's real
// forms so the enquiry card can mirror them. These prove the extraction logic
// and the store path; the extractor is pure, the store uses an injected fetch.

const CONTACT_FORM = `
  <form id="contact" action="/submit">
    <label for="nm">Your name</label>
    <input id="nm" name="full_name" type="text" required>
    <input name="email" type="email" placeholder="you@example.com">
    <label for="ph">Phone</label>
    <input id="ph" name="phone" type="tel">
    <select name="budget"><option>Low</option><option>High</option></select>
    <textarea name="message" aria-label="Your message"></textarea>
    <input type="hidden" name="csrf" value="x">
    <input type="checkbox" name="consent">
    <input type="checkbox" name="consent">
    <button type="submit">Send enquiry</button>
  </form>`;

describe("scanFormSchemasInHtml — mirrors each form's real fields", () => {
  it("reads fields in order with resolved labels, types and required flags", () => {
    const [form] = scanFormSchemasInHtml(CONTACT_FORM);
    assert.equal(form.formId, "contact");
    assert.equal(form.label, "contact");
    assert.equal(form.action, "/submit");
    assert.equal(form.capturable, true, "an email/tel field makes it capturable");

    // In document order; hidden + submit dropped; the two same-named checkboxes collapse to one.
    assert.deepEqual(form.fields.map(f => f.name), ["full_name", "email", "phone", "budget", "message", "consent"]);
    assert.deepEqual(form.fields.map(f => f.type), ["text", "email", "tel", "select", "textarea", "checkbox"]);

    const byName = Object.fromEntries(form.fields.map(f => [f.name, f]));
    assert.equal(byName.full_name.label, "Your name", "label via for=");
    assert.equal(byName.full_name.required, true);
    assert.equal(byName.email.label, "you@example.com", "falls back to placeholder");
    assert.equal(byName.email.required, false);
    assert.equal(byName.phone.label, "Phone", "label via for=");
    assert.equal(byName.budget.label, "Budget", "humanised from the name when nothing else");
    assert.equal(byName.message.label, "Your message", "falls back to aria-label");
  });

  it("labels a form by its submit text when it has no id/name", () => {
    const [form] = scanFormSchemasInHtml(`<form><input name="email" type="email"><button>Get a quote</button></form>`);
    assert.equal(form.formId, undefined);
    assert.equal(form.label, "Get a quote");
  });

  it("applies the tag's capturable heuristic per form", () => {
    const [login] = scanFormSchemasInHtml(`<form id="login"><input name="user" type="text"><input name="password" type="password"></form>`);
    assert.equal(login.capturable, false, "a password form is a login, never captured");

    const [ignored] = scanFormSchemasInHtml(`<form data-aqua-ignore><input name="email" type="email"></form>`);
    assert.equal(ignored.capturable, false, "data-aqua-ignore opts out");

    const [marked] = scanFormSchemasInHtml(`<form data-aqua-form><input name="ref" type="text"></form>`);
    assert.equal(marked.capturable, true, "an explicitly marked form is captured even without an email field");

    const [search] = scanFormSchemasInHtml(`<form><input name="q" type="search"></form>`);
    assert.equal(search.capturable, false, "a plain search box is not enquiry-shaped");
  });

  it("returns one entry per form, and nothing for form-less HTML", () => {
    assert.equal(scanFormSchemasInHtml(`${CONTACT_FORM}${CONTACT_FORM}`).length, 2);
    assert.deepEqual(scanFormSchemasInHtml("<p>no forms here</p>"), []);
    assert.deepEqual(scanFormSchemasInHtml(""), []);
  });
});

describe("importFormSchemasForSite — stores the schema on the site's config", () => {
  let storage: typeof import("../src/server/storage");
  let tenants: typeof import("../src/server/tenants");
  let sources: typeof import("../src/server/websiteSources");
  let injections: typeof import("../src/server/websiteInjections");
  let formSchemas: typeof import("../src/server/websiteFormSchemas");
  let agencyId: string;
  let siteId: string;

  // A fetch stand-in with the same shape as fetchPublicSiteHtml — no network.
  const fakeFetch = (html: string, statusCode = 200) =>
    (async (url: string) => ({ html, finalUrl: url, statusCode })) as unknown as typeof import("../src/lib/server/safeSiteFetch").fetchPublicSiteHtml;

  before(async () => {
    process.env.PORTAL_BACKEND = "memory";
    storage = await import("../src/server/storage");
    await storage.ensureHydrated();
    tenants = await import("../src/server/tenants");
    sources = await import("../src/server/websiteSources");
    injections = await import("../src/server/websiteInjections");
    formSchemas = await import("../src/server/websiteFormSchemas");
  });

  beforeEach(() => {
    storage.mutate(state => { state.websiteSources = {}; state.websiteSiteConfigs = {}; });
    agencyId = tenants.createAgency({ name: "Forms Co", slug: `frm-${Math.floor(performance.now())}` }).id;
    siteId = sources.addWebsiteSource({ agencyId, host: "cedar-dental.com", createdBy: "ed" }).id;
  });

  it("imports, stores, and reads the schemas back", async () => {
    const result = await formSchemas.importFormSchemasForSite({ agencyId, websiteSourceId: siteId }, fakeFetch(CONTACT_FORM));
    assert.equal(result.ok, true);
    assert.equal(result.schemas.length, 1);
    assert.equal(result.schemas[0].fields.length, 6);

    const stored = formSchemas.listSiteFormSchemas(agencyId, siteId);
    assert.deepEqual(stored.map(f => f.label), ["contact"]);
    assert.equal(storage.getState().websiteSiteConfigs?.[siteId]?.formSchemasImportedAt !== undefined, true);
  });

  it("leaves a site's injections untouched when importing forms", async () => {
    injections.addInjection({ agencyId, websiteSourceId: siteId, kind: "ga4", value: "G-KEEPME12" });
    await formSchemas.importFormSchemasForSite({ agencyId, websiteSourceId: siteId }, fakeFetch(CONTACT_FORM));
    assert.deepEqual(injections.listInjections(agencyId, siteId).map(i => i.value), ["G-KEEPME12"], "injections survive a form import");
    assert.equal(formSchemas.listSiteFormSchemas(agencyId, siteId).length, 1);
  });

  it("reports an unreachable or error page rather than throwing", async () => {
    const bad = await formSchemas.importFormSchemasForSite({ agencyId, websiteSourceId: siteId }, fakeFetch("", 503));
    assert.equal(bad.ok, false);
    assert.match(bad.error ?? "", /503/);
    assert.equal(formSchemas.listSiteFormSchemas(agencyId, siteId).length, 0, "a failed import stores nothing");
  });

  it("refuses a site that isn't this agency's", async () => {
    const other = tenants.createAgency({ name: "Other", slug: `oth-${Math.floor(performance.now())}` }).id;
    const result = await formSchemas.importFormSchemasForSite({ agencyId: other, websiteSourceId: siteId }, fakeFetch(CONTACT_FORM));
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /not found/);
  });

  it("takes the schemas with the site when it's removed — no orphan config", async () => {
    await formSchemas.importFormSchemasForSite({ agencyId, websiteSourceId: siteId }, fakeFetch(CONTACT_FORM));
    assert.equal(sources.removeWebsiteSource(agencyId, siteId), true);
    assert.deepEqual(formSchemas.listSiteFormSchemas(agencyId, siteId), []);
  });

  it("matches an imported form by id/label, or the sole capturable form (Phase 3)", () => {
    const contact = { formId: "contact", label: "Contact", capturable: true, fields: [] };
    const news = { formId: "newsletter", label: "Newsletter", capturable: false, fields: [] };
    assert.equal(formSchemas.matchFormSchema([contact, news] as never, "contact"), contact, "exact id");
    assert.equal(formSchemas.matchFormSchema([contact, news] as never, "Newsletter"), news, "exact label, case-insensitive");
    assert.equal(formSchemas.matchFormSchema([contact, news] as never, "unknown"), contact, "no hint match → the one capturable form");
    assert.equal(formSchemas.matchFormSchema([contact, { ...contact, formId: "x" }] as never, "none"), null, "two capturable + no hint → no confident match");
  });

  it("resolves the template for an enquiry by host + form (Phase 3)", async () => {
    await formSchemas.importFormSchemasForSite({ agencyId, websiteSourceId: siteId }, fakeFetch(CONTACT_FORM));
    const resolved = formSchemas.resolveFormSchemaForEnquiry(agencyId, "https://www.Cedar-Dental.com/contact", "contact");
    assert.equal(resolved?.formId, "contact", "host normalised, form matched");
    assert.equal(formSchemas.resolveFormSchemaForEnquiry(agencyId, "unregistered.com", undefined), null, "unregistered host → no template");
  });
});

describe("the import-forms route + module are wired", () => {
  const read = (relative: string) => readFileSync(join(__dirname, "..", relative), "utf-8");
  const route = read("src/app/api/portal/website-sources/route.ts");
  const module = read("src/server/websiteFormSchemas.ts");

  it("adds an agency-scoped import-forms action and returns imported schemas on GET", () => {
    assert.match(route, /requireRole\(\[\.\.\.AGENCY_ROLES\]\)/);
    assert.match(route, /action === "import-forms"/);
    assert.match(route, /importFormSchemasForSite/);
    assert.match(route, /formSchemasBySource/);
  });

  it("the module reuses the SSRF-safe fetch and stores on the site config", () => {
    assert.match(module, /fetchPublicSiteHtml/);
    assert.match(module, /scanFormSchemasInHtml/);
    assert.match(module, /websiteSiteConfigs/);
    assert.match(module, /config\.formSchemas = schemas/);
  });

  it("the website-sources panel offers Import forms and shows what was found", () => {
    const ui = read("src/app/portal/agency/inbox/_WebsiteSourcesConfig.tsx");
    assert.match(ui, /action: "import-forms"/);
    assert.match(ui, />.*Import forms|Import forms/);
    assert.match(ui, /formSchemasBySource/);
  });

  it("the form-template endpoint + card lay Layer A out from the schema (Phase 3)", () => {
    const route = read("src/app/api/portal/website-enquiries/form-template/route.ts");
    assert.match(route, /requireRole\(\[\.\.\.AGENCY_ROLES\]\)/);
    assert.match(route, /resolveFormSchemaForEnquiry/);
    const card = read("src/app/portal/agency/inbox/_EnquiryDetailCard.tsx");
    assert.match(card, /website-enquiries\/form-template/);
    assert.match(card, /mergeFormLayout/);
    assert.match(card, /template=\{template\}/);
  });
});

describe("mergeFormLayout — the submission in the real form's shape (Phase 3)", () => {
  const schema = {
    formId: "contact", label: "contact", capturable: true,
    fields: [
      { name: "full_name", label: "Your name", type: "text", required: true },
      { name: "email", label: "Work email", type: "email", required: false },
      { name: "budget", label: "Budget", type: "select", required: false },
      { name: "message", label: "Message", type: "textarea", required: false },
    ],
  };
  const capture = {
    formLabel: "Pricing enquiry",
    fields: [
      { key: "full_name", label: "Your name", value: "Tom", type: "text" },
      { key: "email", label: "Work email", value: "tom@innesco.co.uk", type: "email" },
    ],
    additional: [{ key: "referrer", label: "How did you hear?", value: "Google", type: "text" }],
  };

  it("shows every template field in the form's order, submitted or blank", () => {
    const layout = mergeFormLayout(capture as never, schema as never);
    assert.deepEqual(layout.rows.map(r => r.key), ["full_name", "email", "budget", "message"]);
    assert.deepEqual(layout.rows.map(r => r.submitted), [true, true, false, false]);
    assert.equal(layout.rows.find(r => r.key === "email")?.value, "tom@innesco.co.uk");
    assert.equal(layout.rows.find(r => r.key === "budget")?.value, "", "a skipped field stays blank, in the form's shape");
  });

  it("keeps submitted answers the template doesn't contain as extras", () => {
    const layout = mergeFormLayout(capture as never, schema as never);
    assert.deepEqual(layout.extras.map(r => r.key), ["referrer"]);
  });
});
