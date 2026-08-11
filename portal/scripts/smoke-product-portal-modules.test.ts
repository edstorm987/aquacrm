import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { PORTAL_PRODUCT_CATALOG, type PortalProductSelection } from "../src/lib/portalProducts";
import { PORTAL_PROGRAMME_LIFECYCLE, portalProductLifecycle, portalProductModule } from "../src/lib/portalProductModules";
import { BESPOKE_PRODUCT_MODULES } from "../src/lib/portalBespokeProductModules";

const BESPOKE_PRODUCT_NAMES = [
  "Combined group project",
  "Business and event photography",
  "Staff and personal branding photography",
  "Property media",
  "Automotive media",
  "Wedding and personal photography",
  "Sport and action media",
  "Google Profile foundation",
  "AquaOasis website build",
  "Creator presence setup",
  "Digital growth support",
  "Customer portal",
  "Internal operations system",
  "Bespoke ecommerce platform",
  "Business automation",
  "Operational dashboard",
] as const;
const LIFECYCLE_MODES = ["onboarding", "designing", "developed-launch", "maintenance"] as const;

function assertCompleteLifecycle(product: PortalProductSelection) {
  const lifecycle = portalProductLifecycle(product);
  assert.deepEqual(Object.keys(lifecycle), LIFECYCLE_MODES);
  assert.equal(new Set(LIFECYCLE_MODES.map(mode => lifecycle[mode].label)).size, 4);
  for (const mode of LIFECYCLE_MODES) {
    const stage = lifecycle[mode];
    assert.ok(stage.heading.length >= 20);
    assert.ok(stage.body.length >= 70);
    assert.ok(stage.focus.length >= 20);
    assert.equal(stage.tasks.length, 4);
    assert.ok(stage.pageId);
    assert.ok(stage.actionLabel);
  }
}

describe("bespoke product portal modules", () => {
  it("keeps a neutral four-stage programme around combined product systems", () => {
    assert.deepEqual(Object.keys(PORTAL_PROGRAMME_LIFECYCLE), LIFECYCLE_MODES);
    assert.deepEqual(LIFECYCLE_MODES.map(mode => PORTAL_PROGRAMME_LIFECYCLE[mode].label), [
      "Programme setup",
      "Coordinated delivery",
      "Combined delivery",
      "Programme care",
    ]);
    for (const mode of LIFECYCLE_MODES) assert.equal(PORTAL_PROGRAMME_LIFECYCLE[mode].tasks.length, 4);
  });

  it("gives every catalogue product a complete and distinct three-part system", () => {
    const moduleLabels = new Set<string>();
    for (const product of PORTAL_PRODUCT_CATALOG) {
      const module = portalProductModule(product);
      assertCompleteLifecycle(product);
      assert.equal(module.pages.length, 3, `${product.name} should have three module pages`);
      assert.ok(module.promise.length >= 70, `${product.name} should explain its operating system`);
      assert.ok(!moduleLabels.has(module.label), `${module.label} should be unique`);
      moduleLabels.add(module.label);

      const pageIds = new Set<string>();
      const navLabels = new Set<string>();
      for (const page of module.pages) {
        assert.ok(!pageIds.has(page.id), `${product.name} page ids should be unique`);
        assert.ok(!navLabels.has(page.navLabel), `${product.name} navigation should be unique`);
        pageIds.add(page.id);
        navLabels.add(page.navLabel);
        assert.equal(page.checklist.length, 4);
        assert.equal(page.outputs.length, 4);
        assert.ok(page.title.length >= 20);
        assert.ok(page.body.length >= 70);
        assert.ok(page.actionLabel);
      }
    }
    assert.equal(moduleLabels.size, PORTAL_PRODUCT_CATALOG.length);
  });

  it("turns a custom product into a viable standalone portal system", () => {
    const product: PortalProductSelection = {
      id: "bespoke-advisory",
      name: "Founder advisory",
      description: "Focused commercial and operating advice for a growing founder-led business.",
      deliverables: ["Monthly advisory session", "Decision notes", "Priority plan"],
    };
    const module = portalProductModule(product);
    assertCompleteLifecycle(product);
    assert.equal(module.label, "Founder advisory workspace");
    assert.deepEqual(module.pages.map(page => page.id), ["plan", "workspace", "delivery"]);
    assert.deepEqual(module.pages[0].outputs, product.deliverables);
    assert.match(module.pages[0].title, /Founder advisory/i);
  });

  it("gives every established specialist product its own complete operating system", () => {
    assert.equal(Object.keys(BESPOKE_PRODUCT_MODULES).length, BESPOKE_PRODUCT_NAMES.length);
    const systemLabels = new Set<string>();

    for (const [index, name] of BESPOKE_PRODUCT_NAMES.entries()) {
      const product: PortalProductSelection = {
        id: `specialist-${index}`,
        name,
        description: `${name} specialist delivery.`,
        deliverables: ["One", "Two", "Three"],
      };
      const module = portalProductModule(product);
      assertCompleteLifecycle(product);
      assert.ok(!systemLabels.has(module.label), `${name} should have a unique system label`);
      systemLabels.add(module.label);
      assert.equal(module.pages.length, 3);
      assert.equal(new Set(module.pages.map(page => page.navLabel)).size, 3);
      assert.ok(module.promise.length >= 80);
      for (const page of module.pages) {
        assert.equal(page.checklist.length, 4);
        assert.equal(page.outputs.length, 4);
        assert.ok(page.body.length >= 100);
        assert.doesNotMatch(page.navLabel, /Working space|Delivery & support/);
      }
    }
  });

  it("composes product navigation, routes, previews, and shared operational data", async () => {
    const [chrome, views, customerRoute, preview, portalData, studio, setup, control] = await Promise.all([
      readFile(new URL("../src/app/portal/customer/_CustomerPortalChrome.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/customer/_CustomerPortalViews.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/customer/[...rest]/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/client-preview/[clientId]/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/customer/_portalData.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/portals/editor/_ClientPortalStudio.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/server/clientPortalSetup.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/tenants/customer-portal-control/route.ts", import.meta.url), "utf8"),
    ]);

    assert.match(chrome, /portalProductModule/);
    assert.match(chrome, /connected service systems/);
    assert.match(chrome, /Shared workspace/);
    assert.match(chrome, /service&productId=/);
    assert.match(chrome, /\/portal\/customer\/service\//);
    assert.match(views, /ProductModuleView/);
    assert.match(views, /ProductLifecycleRail/);
    assert.match(views, /productLifecycleContent/);
    assert.match(views, /ProductSystems/);
    assert.match(views, /systems, working as one/);
    assert.match(views, /Shared data, one client account/);
    assert.match(customerRoute, /section === "service"/);
    assert.match(preview, /requestedProductId/);
    assert.match(preview, /activePreviewModuleId/);
    assert.match(preview, /requestedProductIds/);
    assert.match(portalData, /portalProductSelectionFromAgencyProduct/);
    assert.match(portalData, /options\.scope === "template"/);
    assert.match(portalData, /options\.productIds/);
    assert.match(portalData, /customerPortalModeLabel/);
    assert.match(studio, /Preview product composition/);
    assert.match(studio, /previewProductIds/);
    assert.match(setup, /portalProducts\.length > 1/);
    assert.match(control, /portalProducts\.length === 1/);
  });
});
