import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Designs = typeof import("../src/server/clientPortalDesigns");
type AgencyProducts = typeof import("../src/server/agencyProducts");

let storage: Storage;
let tenants: Tenants;
let designs: Designs;
let agencyProducts: AgencyProducts;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  designs = await import("../src/server/clientPortalDesigns");
  agencyProducts = await import("../src/server/agencyProducts");
});

async function fresh() {
  await storage.ensureHydrated();
  await storage.reset();
  const agency = tenants.createAgency({ name: "Portal Studio Test", slug: "portal-studio-test" });
  const client = tenants.createClient(agency.id, {
    name: "Stunning Client",
    metadata: {
      files: [{ id: "file_1", name: "Brief.pdf", url: "https://example.test/brief", category: "brief" }],
      clientRequests: [{ id: "request_1", type: "support-ticket", message: "Keep this live", status: "open", submittedAt: 1, replies: [] }],
    },
  });
  return { agency, client, actorUserId: "portal_editor_test" };
}

describe("client portal design versions", () => {
  it("keeps drafts separate from published portals and from operational client data", async () => {
    const { agency, client, actorUserId } = await fresh();
    const instance = designs.ensureClientPortalInstance({ agencyId: agency.id, clientId: client.id, actorUserId });
    const originalHeading = instance.published.stages.onboarding.heading;
    const originalVersionId = instance.publishedVersionId;
    const draft = structuredClone(instance.draft);
    draft.stages.onboarding.heading = "A carefully edited beginning.";

    const saved = designs.savePortalDesignDraft({
      agencyId: agency.id,
      scope: "client",
      recordId: instance.id,
      document: draft,
      actorUserId,
    });
    assert.equal(saved?.draft.stages.onboarding.heading, "A carefully edited beginning.");
    assert.equal(saved?.published.stages.onboarding.heading, originalHeading);
    assert.equal(tenants.getClientForAgency(agency.id, client.id)?.metadata?.files?.[0]?.name, "Brief.pdf");
    assert.equal(tenants.getClientForAgency(agency.id, client.id)?.metadata?.clientRequests?.[0]?.message, "Keep this live");

    const published = designs.publishPortalDesign({ agencyId: agency.id, scope: "client", recordId: instance.id, actorUserId, label: "Client launch" });
    assert.equal(published?.published.stages.onboarding.heading, "A carefully edited beginning.");
    assert.notEqual(published?.publishedVersionId, originalVersionId);

    const restored = designs.restorePortalDesignVersion({ agencyId: agency.id, scope: "client", recordId: instance.id, versionId: originalVersionId, actorUserId });
    assert.equal(restored?.draft.stages.onboarding.heading, originalHeading);
    assert.equal(restored?.published.stages.onboarding.heading, "A carefully edited beginning.");
  });

  it("keeps client overrides independent from the master template and other clients", async () => {
    const { agency, client, actorUserId } = await fresh();
    const second = tenants.createClient(agency.id, { name: "Second Client" });
    const firstInstance = designs.ensureClientPortalInstance({ agencyId: agency.id, clientId: client.id, actorUserId });
    const secondInstance = designs.ensureClientPortalInstance({ agencyId: agency.id, clientId: second.id, actorUserId });
    const firstDraft = structuredClone(firstInstance.draft);
    firstDraft.theme.accentColor = "#005f73";
    designs.savePortalDesignDraft({ agencyId: agency.id, scope: "client", recordId: firstInstance.id, document: firstDraft, actorUserId });

    assert.equal(designs.getClientPortalInstance(agency.id, client.id)?.draft.theme.accentColor, "#005f73");
    assert.equal(designs.getClientPortalInstance(agency.id, second.id)?.draft.theme.accentColor, secondInstance.draft.theme.accentColor);
    assert.equal(designs.getClientPortalTemplate(agency.id)?.draft.theme.accentColor, "#8b6c33");
  });

  it("gives each portal-enabled product an independent Stunning Standard template", async () => {
    const { agency, client, actorUserId } = await fresh();
    const product = agencyProducts.createAgencyProduct(agency.id, {
      name: "Website launch",
      category: "Digital",
      portalRequirement: "required",
      portalTemplateKey: "website",
      portalHeadline: "Your launch, clearly managed.",
      portalWelcomeNote: "Everything for your website launch lives here.",
      portalSupportCta: "Request a change",
      portalStageFocus: { onboarding: "Share the brief and final access details." },
      accentColor: "#123456",
    }, actorUserId);
    const master = designs.ensureStunningPortalTemplate(agency.id, actorUserId);
    const productTemplate = designs.ensureProductPortalTemplate(agency.id, product, actorUserId);

    assert.notEqual(productTemplate.id, master.id);
    assert.equal(productTemplate.productId, product.id);
    assert.equal(productTemplate.productLifecycleSeedVersion, 3);
    assert.equal(productTemplate.baseTemplateId, master.id);
    assert.equal(productTemplate.baseTemplateVersionId, master.publishedVersionId);
    assert.equal(productTemplate.published.pages.home.title, "Your launch, clearly managed.");
    assert.equal(productTemplate.published.pages.home.body, "Everything for your website launch lives here.");
    assert.equal(productTemplate.published.home.careButtonLabel, "Request a change");
    assert.equal(productTemplate.published.stages.onboarding.focus, "Share the brief and final access details.");
    assert.equal(productTemplate.published.stages.onboarding.label, "Website roadmap");
    assert.equal(productTemplate.published.stages.designing.label, "Content & design");
    assert.equal(productTemplate.published.stages["developed-launch"].label, "Launch centre");
    assert.equal(productTemplate.published.stages.maintenance.label, "Website care");
    assert.match(productTemplate.published.stages.designing.heading, /Words and design/i);
    assert.equal(productTemplate.published.theme.accentColor, "#123456");

    const productDraft = structuredClone(productTemplate.draft);
    productDraft.pages.home.title = "A product-only portal heading.";
    productDraft.stages.designing.heading = "A carefully tailored website review.";
    designs.savePortalDesignDraft({
      agencyId: agency.id,
      scope: "template",
      recordId: productTemplate.id,
      document: productDraft,
      actorUserId,
    });
    designs.publishPortalDesign({ agencyId: agency.id, scope: "template", recordId: productTemplate.id, actorUserId });

    assert.equal(designs.getClientPortalTemplate(agency.id, master.id)?.published.pages.home.title, master.published.pages.home.title);
    const instance = designs.ensureClientPortalInstance({ agencyId: agency.id, clientId: client.id, actorUserId, templateId: productTemplate.id });
    assert.equal(instance.templateId, productTemplate.id);
    assert.equal(instance.templateVersionId, designs.getClientPortalTemplate(agency.id, productTemplate.id)?.publishedVersionId);
    assert.equal(instance.published.pages.home.title, "A product-only portal heading.");
    assert.equal(instance.published.stages.designing.heading, "A carefully tailored website review.");

    const existingClient = tenants.createClient(agency.id, { name: "Existing client" });
    const existingInstance = designs.ensureClientPortalInstance({ agencyId: agency.id, clientId: existingClient.id, actorUserId });
    const unchangedInstance = designs.ensureClientPortalInstance({ agencyId: agency.id, clientId: existingClient.id, actorUserId, templateId: productTemplate.id });
    assert.equal(unchangedInstance.templateId, existingInstance.templateId);
  });

  it("refreshes a product draft from the latest master without changing its live portal", async () => {
    const { agency, actorUserId } = await fresh();
    const product = agencyProducts.createAgencyProduct(agency.id, {
      name: "Brand launch",
      portalRequirement: "required",
      portalTemplateKey: "brand-identity",
      portalHeadline: "Your brand launch workspace.",
    }, actorUserId);
    const master = designs.ensureStunningPortalTemplate(agency.id, actorUserId);
    const productTemplate = designs.ensureProductPortalTemplate(agency.id, product, actorUserId);
    const originalPublishedResultsTitle = productTemplate.published.pages.results.title;

    const productDraft = structuredClone(productTemplate.draft);
    productDraft.pages.results.title = "Product-only results draft";
    designs.savePortalDesignDraft({ agencyId: agency.id, scope: "template", recordId: productTemplate.id, document: productDraft, actorUserId });

    const masterDraft = structuredClone(master.draft);
    masterDraft.pages.results.title = "Latest shared results experience";
    designs.savePortalDesignDraft({ agencyId: agency.id, scope: "template", recordId: master.id, document: masterDraft, actorUserId });
    const latestMaster = designs.publishPortalDesign({ agencyId: agency.id, scope: "template", recordId: master.id, actorUserId, label: "Master refresh" });
    assert.ok(latestMaster);

    const refreshed = designs.refreshProductPortalTemplateFromMaster({ agencyId: agency.id, templateId: productTemplate.id, actorUserId });
    assert.ok(refreshed);
    assert.equal(refreshed.baseTemplateVersionId, latestMaster.publishedVersionId);
    assert.equal(refreshed.draft.pages.results.title, "Latest shared results experience");
    assert.equal(refreshed.draft.pages.home.title, "Your brand launch workspace.");
    assert.equal(refreshed.draft.stages.onboarding.label, "Brand direction");
    assert.equal(refreshed.draft.stages.designing.label, "Identity review");
    assert.equal(refreshed.draft.stages["developed-launch"].label, "Brand kit");
    assert.equal(refreshed.published.pages.results.title, originalPublishedResultsTitle);
    const backup = refreshed.versions.find(version => version.label === "Before master refresh");
    assert.ok(backup);
    assert.equal(backup.document.pages.results.title, "Product-only results draft");

    const restored = designs.restorePortalDesignVersion({ agencyId: agency.id, scope: "template", recordId: productTemplate.id, versionId: backup.id, actorUserId });
    assert.equal(restored?.draft.pages.results.title, "Product-only results draft");
    assert.equal(restored?.published.pages.results.title, originalPublishedResultsTitle);
  });
});

describe("client portal studio surface", () => {
  it("edits the real preview with lifecycle, page, device, brand, and version controls", async () => {
    const [studio, editorPage, preview, portalData, chrome, views, workspace, route, setup] = await Promise.all([
      readFile(new URL("../src/app/portal/agency/portals/editor/_ClientPortalStudio.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/portals/editor/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/client-preview/[clientId]/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/customer/_portalData.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/customer/_CustomerPortalChrome.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/customer/_CustomerPortalViews.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/portals/_PortalsWorkspace.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/portal/client-portal-design/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/server/clientPortalSetup.ts", import.meta.url), "utf8"),
    ]);

    for (const label of ["Portal studio", "Template", "Client", "Lifecycle stage", "Portal page", "Content", "Pages", "Brand", "Versions", "Save draft", "Publish"]) {
      assert.match(studio, new RegExp(label));
    }
    assert.match(studio, /\/client-preview\/\$\{clientId\}/);
    assert.match(studio, /portalDraft: "1"/);
    assert.match(studio, /target="_blank"/);
    assert.match(studio, /confirmDraftDiscard/);
    assert.match(studio, /saveOnShortcut/);
    assert.match(studio, /aria-label="Portal template"/);
    assert.match(studio, /templateId/);
    assert.match(studio, /Master update available/);
    assert.match(studio, /Refresh draft from master/);
    assert.match(studio, /row-start-2/);
    assert.match(studio, /aria-live="polite"/);
    assert.match(editorPage, /ensureProductPortalTemplates/);
    assert.match(editorPage, /query\.productId/);
    assert.match(preview, /portalScope/);
    assert.match(preview, /portalMode/);
    assert.match(portalData, /resolveClientPortalDesign/);
    assert.match(chrome, /presentation\.pages/);
    assert.match(views, /data\.presentation\.stages/);
    assert.match(workspace, /Stunning Standard/);
    assert.match(workspace, /> View portal/);
    assert.match(workspace, /> Portal editor/);
    assert.match(workspace, /> View template/);
    assert.match(workspace, /> Edit template/);
    assert.match(workspace, /productId=/);
    assert.match(route, /save-draft/);
    assert.match(route, /reset-client/);
    assert.match(route, /refresh-product/);
    assert.match(route, /templateId/);
    assert.match(setup, /ensureProductPortalTemplate/);
  });
});
