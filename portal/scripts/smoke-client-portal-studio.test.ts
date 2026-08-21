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
type PortalBuilder = typeof import("../src/lib/portal/clientPortalBuilder");

let storage: Storage;
let tenants: Tenants;
let designs: Designs;
let agencyProducts: AgencyProducts;
let portalBuilderTools: PortalBuilder;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  designs = await import("../src/server/clientPortalDesigns");
  agencyProducts = await import("../src/server/agencyProducts");
  portalBuilderTools = await import("../src/lib/portal/clientPortalBuilder");
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

  it("versions custom portal code without exposing draft code to the live portal", async () => {
    const { agency, client, actorUserId } = await fresh();
    const instance = designs.ensureClientPortalInstance({ agencyId: agency.id, clientId: client.id, actorUserId });
    const draft = structuredClone(instance.draft);
    draft.customCode = {
      enabled: true,
      placement: "before-content",
      title: "Client launch console",
      scopedCss: ".mm-private-sidebar { width: 19rem; }",
      html: '<section id="launch-console">Launch console</section>',
      css: "#launch-console { padding: 24px; }",
      javascript: 'document.querySelector("#launch-console")?.setAttribute("data-ready", "true");',
      minHeight: 320,
    };

    const saved = designs.savePortalDesignDraft({ agencyId: agency.id, scope: "client", recordId: instance.id, document: draft, actorUserId });
    assert.equal(saved?.draft.customCode?.title, "Client launch console");
    assert.equal(saved?.published.customCode?.enabled, false);

    const published = designs.publishPortalDesign({ agencyId: agency.id, scope: "client", recordId: instance.id, actorUserId, label: "Custom launch experience" });
    assert.equal(published?.published.customCode?.placement, "before-content");
    assert.equal(published?.published.customCode?.minHeight, 320);
    assert.match(published?.published.customCode?.javascript ?? "", /data-ready/);
  });

  it("versions visual page composition, live data blocks, and custom pages without changing operational records", async () => {
    const { agency, client, actorUserId } = await fresh();
    const instance = designs.ensureClientPortalInstance({ agencyId: agency.id, clientId: client.id, actorUserId });
    const draft = structuredClone(instance.draft);
    assert.equal(draft.builder?.pages.home?.[0]?.type, "system-content");
    draft.builder!.pages.home = [
      {
        id: "hero-launch",
        type: "hero",
        visible: true,
        width: "full",
        tone: "dark",
        eyebrow: "Welcome {firstName}",
        title: "Your launch room",
        body: "Everything is connected here.",
        actionLabel: "Open files",
        actionHref: "/portal/customer/files",
        items: [],
      },
      draft.builder!.pages.home![0],
      {
        id: "metrics-live",
        type: "metrics",
        visible: true,
        visibilityRule: "always",
        width: "full",
        tone: "surface",
        eyebrow: "Live data",
        title: "Delivery pulse",
        body: "",
        actionLabel: "",
        actionHref: "",
        dataSource: "delivery",
        items: [],
      },
      {
        id: "product-hub-live",
        type: "product-hub",
        visible: true,
        visibilityRule: "with-products",
        width: "full",
        tone: "surface",
        eyebrow: "Your services",
        title: "Connected workspaces",
        body: "",
        actionLabel: "",
        actionHref: "",
        items: [],
      },
      {
        id: "custom-calculator",
        type: "custom-extension",
        visible: true,
        visibilityRule: "multiple-products",
        width: "half",
        tone: "surface",
        eyebrow: "",
        title: "Programme calculator",
        body: "",
        actionLabel: "",
        actionHref: "",
        items: [],
        extension: {
          enabled: true,
          placement: "after-content",
          title: "Programme calculator",
          scopedCss: "",
          html: '<output id="product-count"></output>',
          css: "output { display: block; padding: 24px; }",
          javascript: 'document.querySelector("#product-count").textContent = window.AQUA_PORTAL.productIds;',
          minHeight: 180,
        },
      },
    ];
    draft.builder!.customPages.push({
      id: "page-welcome-pack",
      slug: "welcome-pack",
      label: "Welcome pack",
      visible: true,
      blocks: [{
        id: "welcome-copy",
        type: "rich-text",
        visible: true,
        visibilityRule: "always",
        width: "full",
        tone: "surface",
        eyebrow: "Start here",
        title: "Welcome to your portal",
        body: "A bespoke introduction for {firstName}.",
        actionLabel: "",
        actionHref: "",
        items: [],
      }, {
        id: "welcome-image",
        type: "image",
        visible: true,
        visibilityRule: "always",
        responsive: { hideOnMobile: false, hideOnDesktop: false, spacing: "spacious", alignment: "center" },
        width: "half",
        tone: "surface",
        eyebrow: "",
        title: "Welcome image",
        body: "",
        actionLabel: "",
        actionHref: "",
        items: [],
        media: { url: "https://example.test/welcome.jpg", alt: "Welcome pack cover", caption: "Prepared for the client", aspect: "portrait", fit: "contain" },
      }, {
        id: "welcome-video",
        type: "video",
        visible: true,
        visibilityRule: "single-product",
        responsive: { hideOnMobile: true, hideOnDesktop: false, spacing: "comfortable", alignment: "left" },
        width: "half",
        tone: "dark",
        eyebrow: "",
        title: "Welcome film",
        body: "",
        actionLabel: "",
        actionHref: "",
        items: [],
        media: { url: "https://youtu.be/abc123", alt: "Welcome film", caption: "Watch before kickoff", aspect: "landscape", fit: "cover" },
      }, {
        id: "welcome-request",
        type: "request-form",
        visible: true,
        visibilityRule: "specific-products",
        productIds: ["product-photography", "product-website"],
        productMatch: "any",
        width: "full",
        tone: "surface",
        eyebrow: "Ask the team",
        title: "Send a launch request",
        body: "This joins the real client record.",
        actionLabel: "Send to launch team",
        actionHref: "",
        requestType: "design-feedback",
        items: [],
      }, {
        id: "welcome-approval",
        type: "approval-panel",
        visible: true,
        visibilityRule: "always",
        width: "half",
        tone: "dark",
        eyebrow: "Decision",
        title: "Approve the design",
        body: "Record an unambiguous answer.",
        actionLabel: "",
        actionHref: "",
        approvalType: "design",
        items: [],
      }, {
        id: "welcome-upload",
        type: "file-upload",
        visible: true,
        visibilityRule: "always",
        width: "half",
        tone: "surface",
        eyebrow: "Context",
        title: "Upload inspiration",
        body: "Keep source material with the project.",
        actionLabel: "Upload inspiration",
        actionHref: "",
        uploadCategory: "inspiration",
        items: [],
      }],
    });

    const saved = designs.savePortalDesignDraft({ agencyId: agency.id, scope: "client", recordId: instance.id, document: draft, actorUserId });
    assert.deepEqual(saved?.draft.builder?.pages.home?.map(block => block.type), ["hero", "system-content", "metrics", "product-hub", "custom-extension"]);
    assert.equal(saved?.draft.builder?.pages.home?.[2]?.dataSource, "delivery");
    assert.equal(saved?.draft.builder?.pages.home?.[3]?.visibilityRule, "with-products");
    assert.equal(saved?.draft.builder?.pages.home?.[4]?.extension?.minHeight, 180);
    assert.match(saved?.draft.builder?.pages.home?.[4]?.extension?.javascript ?? "", /productIds/);
    assert.equal(saved?.draft.builder?.customPages[0]?.slug, "welcome-pack");
    assert.equal(saved?.draft.builder?.customPages[0]?.blocks[0]?.responsive.spacing, "comfortable");
    assert.equal(saved?.draft.builder?.customPages[0]?.blocks[1]?.media?.aspect, "portrait");
    assert.equal(saved?.draft.builder?.customPages[0]?.blocks[1]?.responsive.alignment, "center");
    assert.equal(saved?.draft.builder?.customPages[0]?.blocks[2]?.responsive.hideOnMobile, true);
    assert.deepEqual(saved?.draft.builder?.customPages[0]?.blocks.slice(-3).map(block => block.type), ["request-form", "approval-panel", "file-upload"]);
    assert.equal(saved?.draft.builder?.customPages[0]?.blocks[3]?.requestType, "design-feedback");
    assert.deepEqual(saved?.draft.builder?.customPages[0]?.blocks[3]?.productIds, ["product-photography", "product-website"]);
    assert.equal(saved?.draft.builder?.customPages[0]?.blocks[3]?.productMatch, "any");
    assert.equal(saved?.draft.builder?.customPages[0]?.blocks[4]?.approvalType, "design");
    assert.equal(saved?.draft.builder?.customPages[0]?.blocks[5]?.uploadCategory, "inspiration");
    assert.equal(saved?.published.builder?.customPages.length, 0);
    assert.equal(tenants.getClientForAgency(agency.id, client.id)?.metadata?.files?.[0]?.name, "Brief.pdf");

    const published = designs.publishPortalDesign({ agencyId: agency.id, scope: "client", recordId: instance.id, actorUserId, label: "Portal builder launch" });
    assert.equal(published?.published.builder?.customPages[0]?.label, "Welcome pack");
    assert.equal(published?.published.builder?.customPages[0]?.blocks[3]?.actionLabel, "Send to launch team");
    assert.equal(published?.published.builder?.pages.home?.[0]?.title, "Your launch room");
    assert.equal(published?.published.builder?.pages.home?.[4]?.visibilityRule, "multiple-products");
  });

  it("targets composed blocks to any or every selected product without weakening empty targeting", () => {
    const block = portalBuilderTools.createPortalBlock("request-form", "targeted-request");
    block.visibilityRule = "specific-products";
    block.productIds = ["product-photography", "product-website"];
    block.productMatch = "any";

    assert.equal(portalBuilderTools.portalBlockMatchesProducts(block, ["product-photography"]), true);
    assert.equal(portalBuilderTools.portalBlockMatchesProducts(block, ["product-brand"]), false);
    block.productMatch = "all";
    assert.equal(portalBuilderTools.portalBlockMatchesProducts(block, ["product-photography"]), false);
    assert.equal(portalBuilderTools.portalBlockMatchesProducts(block, ["product-photography", "product-website"]), true);
    block.productIds = [];
    assert.equal(portalBuilderTools.portalBlockMatchesProducts(block, ["product-photography", "product-website"]), false);
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

  it("keeps published product freshness separate from a refreshed draft", async () => {
    const { agency, actorUserId } = await fresh();
    const product = agencyProducts.createAgencyProduct(agency.id, {
      name: "Website care",
      portalRequirement: "required",
      portalTemplateKey: "ongoing-care",
    }, actorUserId);
    const template = designs.ensureProductPortalTemplate(agency.id, product, actorUserId);
    const publishedSourceAtCreation = template.productSourceUpdatedAt;

    await new Promise(resolve => setTimeout(resolve, 2));
    const changedProduct = agencyProducts.updateAgencyProduct(agency.id, product.id, {
      portalHeadline: "Your current care and improvement programme.",
    }, actorUserId);
    assert.ok(changedProduct);
    assert.ok(changedProduct.updatedAt > (publishedSourceAtCreation ?? 0));

    const refreshed = designs.refreshProductPortalTemplateFromMaster({
      agencyId: agency.id,
      templateId: template.id,
      actorUserId,
    });
    assert.equal(refreshed?.draftProductSourceUpdatedAt, changedProduct.updatedAt);
    assert.equal(refreshed?.productSourceUpdatedAt, publishedSourceAtCreation);

    const published = designs.publishPortalDesign({
      agencyId: agency.id,
      scope: "template",
      recordId: template.id,
      actorUserId,
      label: "Publish current product copy",
    });
    assert.equal(published?.productSourceUpdatedAt, changedProduct.updatedAt);
  });
});

describe("client portal studio surface", () => {
  it("edits the real preview with lifecycle, page, device, brand, and version controls", async () => {
    const [studio, editorPage, preview, portalData, chrome, extension, composition, interactions, builder, views, customerRoute, workspace, route, setup] = await Promise.all([
      readFile(new URL("../src/app/portal/agency/portals/editor/_ClientPortalStudio.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/portals/editor/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/client-preview/[clientId]/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/customer/_portalData.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/customer/_CustomerPortalChrome.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/customer/_PortalCustomExtension.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/customer/_PortalPageComposition.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/customer/_PortalInteractionBlocks.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/lib/portal/clientPortalBuilder.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/customer/_CustomerPortalViews.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/customer/[...rest]/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/portals/_PortalsWorkspace.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/portal/client-portal-design/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/server/clientPortalSetup.ts", import.meta.url), "utf8"),
    ]);
    // The studio's data loader moved into the editor engine so the Dev Team
    // editor can mount the SAME studio. The contract is unchanged — it is just
    // no longer inline in the route — so assert it where it now lives.
    const studioLoader = await readFile(new URL("../src/engines/editor/server/portalStudio.ts", import.meta.url), "utf8");

    for (const label of ["Portal studio", "Template", "Client", "Lifecycle stage", "Portal page", "Builder", "Content", "Pages", "Brand", "Code", "Versions", "Visual composition", "Add a portal component", "Custom portal layer", "Portal CSS", "JavaScript", "Save draft", "Publish"]) {
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
    assert.match(studioLoader, /ensureProductPortalTemplates/);
    assert.match(studioLoader, /query\.productId/);
    // …and the route still mounts the studio through that loader.
    assert.match(editorPage, /loadPortalStudioProps/);
    assert.match(editorPage, /<ClientPortalStudio/);
    assert.match(preview, /portalScope/);
    assert.match(preview, /portalMode/);
    assert.match(portalData, /resolveClientPortalDesign/);
    assert.match(portalData, /productPresentations/);
    assert.match(chrome, /presentation\.pages/);
    assert.match(chrome, /PortalCustomExtension/);
    assert.match(extension, /sandbox="allow-downloads allow-forms allow-popups allow-scripts"/);
    assert.doesNotMatch(extension, /allow-same-origin/);
    assert.match(extension, /connect-src 'none'/);
    assert.match(extension, /window\.AQUA_PORTAL/);
    assert.match(composition, /data-portal-page-builder/);
    assert.match(composition, /data\.files/);
    assert.match(composition, /data\.invoices/);
    assert.match(composition, /data\.products/);
    assert.match(composition, /ProductHub/);
    assert.match(composition, /portalBlockMatchesProducts/);
    assert.match(composition, /productIds/);
    assert.match(composition, /MediaBlock/);
    assert.match(composition, /videoEmbedUrl/);
    assert.match(composition, /responsiveBlockClass/);
    assert.match(composition, /Boolean\(previewHrefPrefix\)/);
    assert.match(interactions, /\/api\/tenants\/client-requests/);
    assert.match(interactions, /\/api\/tenants\/client-approvals/);
    assert.match(interactions, /\/api\/tenants\/client-files\/upload/);
    assert.match(interactions, /Available in the live client portal/);
    assert.match(builder, /CLIENT_PORTAL_BLOCK_REGISTRY/);
    assert.match(builder, /multiple-products/);
    assert.match(builder, /specific-products/);
    assert.match(builder, /productMatch/);
    assert.match(builder, /landscape/);
    assert.match(builder, /hideOnMobile/);

    // The block TYPES used to be grepped for out of this file's source text.
    // Element-engine P3 moved the per-type vocabulary into
    // `src/engines/editor/elements/portalElements.ts` — the portal's 16 types now declare
    // which shared element each one is a name for, instead of being a second
    // registry — so a source grep here was asserting the location of a table
    // rather than the existence of a block type. These read the exported
    // vocabulary instead, which is what the studio palette actually renders and
    // what survives the table moving again.
    const paletteTypes = portalBuilderTools.CLIENT_PORTAL_BLOCK_REGISTRY.map(entry => entry.type);
    for (const type of ["product-hub", "custom-extension", "request-form", "approval-panel", "file-upload"]) {
      assert.ok(paletteTypes.includes(type as typeof paletteTypes[number]), `the portal palette lost "${type}"`);
    }
    // The system shim stays a known stored type without being in the palette.
    assert.ok(!paletteTypes.includes("system-content"));
    assert.equal(portalBuilderTools.createPortalBlock("system-content", "sys").type, "system-content");
    assert.match(studio, /For multi-product bundles/);
    assert.match(studio, /For selected products/);
    assert.match(studio, /Every selected product/);
    assert.match(studio, /PortalExtensionBlockEditor/);
    assert.match(studio, /PortalMediaBlockEditor/);
    assert.match(studio, /Hide on mobile/);
    assert.match(studio, /Request flow/);
    assert.match(studio, /Decisions shown/);
    assert.match(studio, /File category/);
    assert.match(customerRoute, /section === "page"/);
    assert.match(customerRoute, /customPageSlug/);
    assert.match(views, /data\.presentation\.stages/);
    assert.match(workspace, /Stunning Standard/);
    assert.match(workspace, /> View portal/);
    assert.match(workspace, /> Dev Editor Engine/);
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
