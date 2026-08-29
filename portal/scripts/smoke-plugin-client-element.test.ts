// The dynamic plugin catch-all now asks WHICH client element a call belongs to.
//
// `/api/portal/<moduleId>/<...>` already decided tenant, role and feature. What
// it never decided was the client element — so a governed identity holding only
// Fulfilment could reach a client's Ecommerce or Memberships API through here,
// because nothing asked. The checklist has carried that as an open gap:
// "the dynamic plugin API catch-all still needs mappings for Fulfilment, Client
// CRM, Ecommerce, Memberships and Affiliates."
//
// Two properties matter, and the second is why this is safe to add at all:
//   1. a mapped module is enforced for a governed, client-scoped caller;
//   2. an UNMAPPED module is unchanged, and an un-migrated identity keeps its
//      legacy behaviour — the migration rule already built into
//      `requireCurrentClientWorkspaceElementAccess`.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, describe, it } from "node:test";

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_STORAGE_BACKEND ??= "memory";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

type Mapping = typeof import("../src/lib/server/portal/pluginClientElement");
let mapping: Mapping;

before(async () => {
  mapping = await import("../src/lib/server/portal/pluginClientElement");
});

describe("every built-in module is classified", () => {
  it("appears in exactly one of the two lists — mapped, or explicitly not", async () => {
    const { readdir } = await import("node:fs/promises");
    const modules = (await readdir("src/built-ins/modules", { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);

    assert.ok(modules.length > 0, "there are built-in modules to classify");
    for (const moduleId of modules) {
      const mapped = moduleId in mapping.MODULE_CLIENT_ELEMENT;
      const explicitlyUnmapped = moduleId in mapping.UNMAPPED_MODULES;
      assert.ok(
        mapped !== explicitlyUnmapped,
        `${moduleId} must be in exactly one list — "not yet classified" must not look like "no client data"`,
      );
    }
  });

  it("maps the five the checklist named, to the elements they belong to", () => {
    assert.deepEqual(mapping.MODULE_CLIENT_ELEMENT, {
      fulfillment: "client.fulfilment",
      "client-crm": "client.relationship",
      ecommerce: "client.commercial",
      memberships: "client.commercial",
      affiliates: "client.marketing",
    });
  });

  it("gives every unmapped module a stated reason, not a blank", () => {
    for (const [moduleId, reason] of Object.entries(mapping.UNMAPPED_MODULES)) {
      assert.ok(reason.trim().length > 20, `${moduleId} needs a real reason, got "${reason}"`);
    }
  });

  it("returns null for an unmapped module rather than inventing an element", () => {
    assert.equal(mapping.clientElementForModule("agency-hr"), null);
    assert.equal(mapping.clientElementForModule("a-module-that-does-not-exist"), null);
    assert.equal(mapping.clientElementForModule("ecommerce"), "client.commercial");
  });

  it("requires view to read and use to write — a floor, not a replacement", () => {
    assert.equal(mapping.clientElementLevelForMethod("GET"), "view");
    assert.equal(mapping.clientElementLevelForMethod("HEAD"), "view");
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      assert.equal(mapping.clientElementLevelForMethod(method), "use", `${method} writes`);
    }
  });
});

describe("the catch-all actually consults the mapping", () => {
  it("gates a client-scoped call on the module's element, at the method's level", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("src/app/api/portal/[module]/[...rest]/route.ts", "utf8");

    // The gate exists, is client-scoped, and uses the mapping rather than a
    // hard-coded element.
    assert.match(source, /if \(session && scopeClientId\)/, "only client-scoped calls are gated");
    assert.match(source, /clientElementForModule\(moduleId\)/, "the element comes from the mapping");
    assert.match(
      source,
      /requireCurrentClientWorkspaceElementAccess\(\s*scopeClientId,\s*element,\s*clientElementLevelForMethod\(method\)/,
      "…and the level from the method",
    );
    // An unmapped module must fall through untouched.
    assert.match(source, /if \(element\)/, "an unmapped module adds no requirement");

    // Ordering must be measured inside the DISPATCH BODY, not across the whole
    // file: every one of these names also appears in the import block at the
    // top, so `indexOf` over the file measures import order and would pass
    // whatever the code actually did.
    const body = source.slice(source.indexOf("async function dispatch("));
    const roleGate = body.indexOf("apiRouteAllowsRole(plugin");
    const elementGate = body.indexOf("clientElementForModule(moduleId)");
    const handlerCall = body.indexOf("await route.handler(");
    assert.ok(roleGate > 0, "the role gate is in the dispatch body");
    assert.ok(elementGate > roleGate, "the element gate follows it");
    assert.ok(handlerCall > elementGate, "and both run before the handler");
  });

  it("keeps the existing tenant, role and feature gates ahead of it", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("src/app/api/portal/[module]/[...rest]/route.ts", "utf8");
    const body = source.slice(source.indexOf("async function dispatch("));
    const tenant = body.indexOf("resolveApiTenantScope({");
    const feature = body.indexOf("route.requiresFeature");
    const elementGate = body.indexOf("clientElementForModule(moduleId)");
    assert.ok(tenant > 0 && tenant < elementGate, "tenancy is still decided first");
    assert.ok(feature > 0 && feature < elementGate, "and the feature flag still short-circuits");
  });
});
