// Agency-scoped plugin APIs must not stop at a broad role check.
//
// Scouting lives in the agency-scoped leads-pipeline install. Before this
// contract, a manager whose canonical Growth grant hid Outreach could still
// call `/api/portal/leads-pipeline/prospects*` directly because the dynamic
// dispatcher only applied element access to client-scoped calls.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { agencyPluginApiAccessRequirements } from "../src/lib/server/portal/pluginAgencyRouteAccess";

const OUTREACH_VIEW = [{ workspace: "growth", element: "growth.outreach", level: "view" }];
const OUTREACH_USE = [{ workspace: "growth", element: "growth.outreach", level: "use" }];
const OUTREACH_MANAGE = [{ workspace: "growth", element: "growth.outreach", level: "manage" }];

describe("agency plugin route element policy", () => {
  it("requires View for the prospect read and Use for ordinary dossier work", () => {
    assert.deepEqual(agencyPluginApiAccessRequirements("leads-pipeline", ["prospects"], "GET"), OUTREACH_VIEW);
    assert.deepEqual(agencyPluginApiAccessRequirements("leads-pipeline", ["prospects"], "POST"), OUTREACH_USE);
    assert.deepEqual(agencyPluginApiAccessRequirements("leads-pipeline", ["prospects"], "PATCH"), OUTREACH_USE);
    assert.deepEqual(
      agencyPluginApiAccessRequirements("leads-pipeline", ["google-places", "search"], "POST"),
      OUTREACH_USE,
      "provider-backed discovery is an Outreach action, not an ungoverned role-only endpoint",
    );

    for (const [rest, method] of [
      [["prospects", "outreach"], "POST"],
      [["prospects", "follow-ups"], "POST"],
      [["prospects", "follow-ups"], "PATCH"],
      [["prospects", "inspection"], "POST"],
      [["prospects", "notes"], "POST"],
    ] as const) {
      assert.deepEqual(agencyPluginApiAccessRequirements("leads-pipeline", rest, method), OUTREACH_USE);
    }
  });

  it("reserves bulk import and dismissal for Outreach Manage", () => {
    assert.deepEqual(
      agencyPluginApiAccessRequirements("leads-pipeline", ["prospects", "import"], "POST"),
      OUTREACH_MANAGE,
    );
    assert.deepEqual(
      agencyPluginApiAccessRequirements("leads-pipeline", ["prospects", "dismiss"], "POST"),
      OUTREACH_MANAGE,
    );
  });

  it("requires both Outreach Use and Leads Use before qualification", () => {
    assert.deepEqual(
      agencyPluginApiAccessRequirements("leads-pipeline", ["prospects", "qualify"], "POST"),
      [
        { workspace: "growth", element: "growth.outreach", level: "use" },
        { workspace: "growth", element: "growth.leads", level: "use" },
      ],
    );
  });

  it("keeps lifecycle and ledger fields out of the generic prospect PATCH", () => {
    const handlers = readFileSync("src/built-ins/modules/leads-pipeline/src/api/handlers.ts", "utf8");
    assert.match(handlers, /const EDITABLE_PROSPECT_PATCH_KEYS = \[/);
    assert.match(handlers, /const EDITABLE_PROSPECT_CREATE_KEYS = \[/);
    assert.match(handlers, /const patch = editableProspectPatch\(body\)/);
    assert.match(handlers, /const input = editableProspectCreate\(body\)/);
    const start = handlers.indexOf("const EDITABLE_PROSPECT_PATCH_KEYS");
    const allowlist = handlers.slice(start, handlers.indexOf("] as const satisfies", start));
    for (const forbidden of ["status", "qualifiedLeadId", "agencyId", "outreachAttempts", "followUps", "notes", "inspectionChecks", "inspectedAt"]) {
      assert.doesNotMatch(allowlist, new RegExp(`"${forbidden}"`), `${forbidden} must stay server-owned`);
    }
    assert.match(handlers, /No editable prospect fields supplied/,
      "a lifecycle-only PATCH must be refused rather than reported as a successful no-op");
  });

  it("does not change unrelated leads-pipeline routes or other plugins", () => {
    assert.deepEqual(agencyPluginApiAccessRequirements("leads-pipeline", ["leads"], "GET"), []);
    assert.deepEqual(agencyPluginApiAccessRequirements("client-crm", ["prospects"], "GET"), []);
    assert.deepEqual(agencyPluginApiAccessRequirements("leads-pipeline", ["prospects", "future"], "POST"), []);
  });

  it("classifies every Scouting method declared by the shipped manifest", () => {
    const source = readFileSync("src/built-ins/modules/leads-pipeline/src/api/routes.ts", "utf8");
    const declared = [...source.matchAll(/\{\s*path:\s*"([^"]+)",\s*methods:\s*\[([^\]]+)\]/g)]
      .map(match => ({
        path: match[1]!,
        methods: [...match[2]!.matchAll(/"([A-Z]+)"/g)].map(method => method[1]!),
      }))
      .filter(route => route.path === "prospects"
        || route.path.startsWith("prospects/")
        || route.path === "google-places/search");

    assert.ok(declared.length > 0, "the manifest still declares Scouting routes");
    for (const route of declared) {
      for (const method of route.methods) {
        assert.ok(
          agencyPluginApiAccessRequirements("leads-pipeline", route.path.split("/"), method).length > 0,
          `${method} ${route.path} must declare an agency workspace-element requirement`,
        );
      }
    }
  });
});

describe("the dynamic plugin dispatcher keeps every existing gate", () => {
  it("runs tenant, role and feature gates before agency/client element gates and the handler", () => {
    const source = readFileSync("src/app/api/portal/[module]/[...rest]/route.ts", "utf8");
    const body = source.slice(source.indexOf("async function dispatch("));

    const tenant = body.indexOf("resolveApiTenantScope({");
    const role = body.indexOf("apiRouteAllowsRole(plugin");
    const feature = body.indexOf("route.requiresFeature");
    const agencyElement = body.indexOf("agencyPluginApiAccessRequirements(moduleId, rest, method)");
    const clientElement = body.indexOf("clientElementForModule(moduleId)");
    const handler = body.indexOf("await route.handler(");

    assert.ok(tenant > 0, "tenant scope is still resolved");
    assert.ok(role > tenant, "role gate follows tenant resolution");
    assert.ok(feature > role, "feature gate follows the role gate");
    assert.ok(agencyElement > feature, "agency element access follows the existing gates");
    assert.ok(clientElement > agencyElement, "the existing client-element gate remains in place");
    assert.ok(handler > clientElement, "all authorization completes before the plugin handler");
  });

  it("uses the canonical workspace resolver, checks every requirement, and converts refusals", () => {
    const source = readFileSync("src/app/api/portal/[module]/[...rest]/route.ts", "utf8");
    const body = source.slice(source.indexOf("async function dispatch("));

    assert.match(body, /if \(session\) \{[\s\S]*agencyPluginApiAccessRequirements\(moduleId, rest, method\)/);
    assert.match(body, /const actor = await requireCurrentAccessActor\(\)/);
    assert.match(body, /resolveActorWorkspaceElementAccess\(actor, requirement\.workspace\)/);
    assert.match(body, /assertWorkspaceElementAccess\(access, requirement\.element, requirement\.level\)/);
    assert.match(body, /catch \(error\) \{\s*return accessErrorResponse\(error\);/);
  });

  it("does not re-scope the signed access actor from request input", () => {
    const source = readFileSync("src/app/api/portal/[module]/[...rest]/route.ts", "utf8");
    const body = source.slice(source.indexOf("async function dispatch("));

    assert.match(body, /const actor = await requireCurrentAccessActor\(\)/);
    assert.doesNotMatch(body, /currentActor\.resourceAgencyId === scopeAgencyId/);
    assert.doesNotMatch(body, /agencyId: scopeAgencyId,\s*resourceAgencyId: scopeAgencyId,/);
  });
});
