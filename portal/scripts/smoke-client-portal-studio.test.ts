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

let storage: Storage;
let tenants: Tenants;
let designs: Designs;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  designs = await import("../src/server/clientPortalDesigns");
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
});

describe("client portal studio surface", () => {
  it("edits the real preview with lifecycle, page, device, brand, and version controls", async () => {
    const [studio, preview, portalData, chrome, views, workspace, route] = await Promise.all([
      readFile(new URL("../src/app/portal/agency/portals/editor/_ClientPortalStudio.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/client-preview/[clientId]/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/customer/_portalData.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/customer/_CustomerPortalChrome.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/customer/_CustomerPortalViews.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/portals/_PortalsWorkspace.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/portal/client-portal-design/route.ts", import.meta.url), "utf8"),
    ]);

    for (const label of ["Portal studio", "Template", "Client", "Lifecycle stage", "Portal page", "Content", "Pages", "Brand", "Versions", "Save draft", "Publish"]) {
      assert.match(studio, new RegExp(label));
    }
    assert.match(studio, /\/client-preview\/\$\{clientId\}/);
    assert.match(studio, /portalDraft: "1"/);
    assert.match(studio, /target="_blank"/);
    assert.match(studio, /confirmDraftDiscard/);
    assert.match(studio, /saveOnShortcut/);
    assert.match(studio, /row-start-2/);
    assert.match(studio, /aria-live="polite"/);
    assert.match(preview, /portalScope/);
    assert.match(preview, /portalMode/);
    assert.match(portalData, /resolveClientPortalDesign/);
    assert.match(chrome, /presentation\.pages/);
    assert.match(views, /data\.presentation\.stages/);
    assert.match(workspace, /Stunning Standard/);
    assert.match(workspace, /> View portal/);
    assert.match(workspace, /> Portal editor/);
    assert.match(route, /save-draft/);
    assert.match(route, /reset-client/);
  });
});
