// Agency-scoped plugin APIs must not stop at a broad role check.
//
// Scouting lives in the agency-scoped leads-pipeline install. Before this
// contract, a manager whose canonical Growth grant hid Outreach could still
// call `/api/portal/leads-pipeline/prospects*` directly because the dynamic
// dispatcher only applied element access to client-scoped calls.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  agencyPluginApiAccessRequirements,
  isAgencyPluginApiRouteClassified,
} from "../src/lib/server/portal/pluginAgencyRouteAccess";

const OUTREACH_VIEW = [{ workspace: "growth", element: "growth.outreach", level: "view" }];
const OUTREACH_USE = [{ workspace: "growth", element: "growth.outreach", level: "use" }];
const OUTREACH_MANAGE = [{ workspace: "growth", element: "growth.outreach", level: "manage" }];
const LEADS_VIEW = [{ workspace: "growth", element: "growth.leads", level: "view" }];
const LEADS_USE = [{ workspace: "growth", element: "growth.leads", level: "use" }];
const LEADS_MANAGE = [{ workspace: "growth", element: "growth.leads", level: "manage" }];
const CONTACTS_VIEW = [{ workspace: "growth", element: "growth.contacts", level: "view" }];
const CONTACTS_USE = [{ workspace: "growth", element: "growth.contacts", level: "use" }];
const CONTACTS_MANAGE = [{ workspace: "growth", element: "growth.contacts", level: "manage" }];
const CAMPAIGNS_VIEW = [{ workspace: "growth", element: "growth.campaigns", level: "view" }];
const CAMPAIGNS_USE = [{ workspace: "growth", element: "growth.campaigns", level: "use" }];
const CAMPAIGNS_MANAGE = [{ workspace: "growth", element: "growth.campaigns", level: "manage" }];

describe("agency plugin route element policy", () => {
  it("keeps the complete Prospect and discovery API surface owner/manager-only", () => {
    const source = readFileSync("src/built-ins/modules/leads-pipeline/src/api/routes.ts", "utf8");
    const scouting = source.slice(source.indexOf("// Scouting"), source.indexOf("// Leads"));
    const routes = [...scouting.matchAll(/\{\s*path:\s*"([^"]+)"[\s\S]*?visibleToRoles:\s*\[\.\.\.([A-Z_]+)\]\s*\}/g)]
      .map(match => ({ path: match[1], roles: match[2] }));

    assert.deepEqual(routes.map(route => route.path), [
      "prospects",
      "google-places/search",
      "prospects/import",
      "prospects/outreach",
      "prospects/follow-ups",
      "prospects/inspection",
      "prospects/notes",
      "prospects/start-dossier",
      "prospects/qualify",
      "prospects/dismiss",
      "prospects/restore",
    ]);
    assert.ok(routes.every(route => route.roles === "AGENCY_ADMIN"),
      `a Prospect/discovery route is wider than owner/manager: ${JSON.stringify(routes)}`);
  });

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

  it("reserves bulk import and not-qualified lifecycle changes for Outreach Manage", () => {
    assert.deepEqual(
      agencyPluginApiAccessRequirements("leads-pipeline", ["prospects", "import"], "POST"),
      OUTREACH_MANAGE,
    );
    assert.deepEqual(
      agencyPluginApiAccessRequirements("leads-pipeline", ["prospects", "dismiss"], "POST"),
      OUTREACH_MANAGE,
    );
    assert.deepEqual(
      agencyPluginApiAccessRequirements("leads-pipeline", ["prospects", "restore"], "POST"),
      OUTREACH_MANAGE,
    );
  });

  it("requires both Outreach Use and Leads Use before qualification", () => {
    const expected = [
      { workspace: "growth", element: "growth.outreach", level: "use" },
      { workspace: "growth", element: "growth.leads", level: "use" },
    ];
    assert.deepEqual(
      agencyPluginApiAccessRequirements("leads-pipeline", ["prospects", "qualify"], "POST"),
      expected,
    );
    assert.deepEqual(
      agencyPluginApiAccessRequirements("leads-pipeline", ["prospects", "start-dossier"], "POST"),
      expected,
      "repairing a legacy Lead dossier writes both the Outreach and Journey sides",
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

  it("assigns Lead, Contact, commercial and Campaign routes to their exact Growth elements", () => {
    assert.deepEqual(agencyPluginApiAccessRequirements("leads-pipeline", ["leads"], "GET"), LEADS_VIEW);
    assert.deepEqual(agencyPluginApiAccessRequirements("leads-pipeline", ["leads"], "POST"), LEADS_USE);
    assert.deepEqual(agencyPluginApiAccessRequirements("leads-pipeline", ["leads", "meeting"], "POST"), LEADS_USE);
    assert.deepEqual(agencyPluginApiAccessRequirements("leads-pipeline", ["leads", "purge"], "POST"), LEADS_MANAGE);

    assert.deepEqual(agencyPluginApiAccessRequirements("leads-pipeline", ["contacts"], "GET"), CONTACTS_VIEW);
    assert.deepEqual(agencyPluginApiAccessRequirements("leads-pipeline", ["contacts"], "PATCH"), CONTACTS_USE);
    assert.deepEqual(agencyPluginApiAccessRequirements("leads-pipeline", ["contacts", "meeting"], "POST"), CONTACTS_USE);
    assert.deepEqual(agencyPluginApiAccessRequirements("leads-pipeline", ["import-csv"], "POST"), CONTACTS_MANAGE);
    assert.deepEqual(agencyPluginApiAccessRequirements("leads-pipeline", ["contacts", "add-to-board"], "POST"), [
      ...CONTACTS_USE,
      ...LEADS_USE,
    ]);
    assert.deepEqual(agencyPluginApiAccessRequirements("leads-pipeline", ["leads", "convert-to-client"], "POST"), [
      ...LEADS_MANAGE,
      ...CONTACTS_MANAGE,
    ]);

    assert.deepEqual(agencyPluginApiAccessRequirements("leads-pipeline", ["commercial"], "GET"), [
      ...LEADS_VIEW,
      ...CONTACTS_VIEW,
    ]);
    assert.deepEqual(agencyPluginApiAccessRequirements("leads-pipeline", ["commercial", "send"], "POST"), [
      ...LEADS_MANAGE,
      ...CONTACTS_MANAGE,
    ]);
    assert.deepEqual(agencyPluginApiAccessRequirements("leads-pipeline", ["campaigns"], "GET"), CAMPAIGNS_VIEW);
    assert.deepEqual(agencyPluginApiAccessRequirements("leads-pipeline", ["campaigns"], "POST"), CAMPAIGNS_MANAGE);
    assert.deepEqual(agencyPluginApiAccessRequirements("leads-pipeline", ["campaigns", "preview-audience"], "POST"), [
      ...CAMPAIGNS_USE,
      ...LEADS_VIEW,
    ]);
    assert.deepEqual(agencyPluginApiAccessRequirements("leads-pipeline", ["campaigns", "send"], "POST"), [
      ...CAMPAIGNS_MANAGE,
      ...LEADS_USE,
    ]);
  });

  it("explicitly exempts only the signed public webhook and leaves other plugins unchanged", () => {
    assert.equal(isAgencyPluginApiRouteClassified("leads-pipeline", ["commercial", "stripe-webhook"], "POST"), true);
    assert.deepEqual(agencyPluginApiAccessRequirements("leads-pipeline", ["commercial", "stripe-webhook"], "POST"), []);
    assert.equal(isAgencyPluginApiRouteClassified("leads-pipeline", ["prospects", "future"], "POST"), false);
    assert.equal(isAgencyPluginApiRouteClassified("leads-pipeline", ["leads"], "DELETE"), false);
    assert.deepEqual(agencyPluginApiAccessRequirements("client-crm", ["prospects"], "GET"), []);
    assert.equal(isAgencyPluginApiRouteClassified("client-crm", ["prospects"], "GET"), false);
  });

  it("classifies every leads-pipeline method declared by the shipped manifest", () => {
    const source = readFileSync("src/built-ins/modules/leads-pipeline/src/api/routes.ts", "utf8");
    const declared = [...source.matchAll(/\{\s*path:\s*"([^"]+)",\s*methods:\s*\[([^\]]+)\]/g)]
      .map(match => ({
        path: match[1]!,
        methods: [...match[2]!.matchAll(/"([A-Z]+)"/g)].map(method => method[1]!),
      }));

    assert.ok(declared.length > 0, "the manifest still declares API routes");
    assert.equal(declared.length, [...source.matchAll(/\bpath:\s*"/g)].length, "the manifest parser must see every route declaration");
    const exemptions: string[] = [];
    for (const route of declared) {
      for (const method of route.methods) {
        assert.equal(
          isAgencyPluginApiRouteClassified("leads-pipeline", route.path.split("/"), method),
          true,
          `${method} ${route.path} must declare an agency workspace-element policy`,
        );
        if (agencyPluginApiAccessRequirements("leads-pipeline", route.path.split("/"), method).length === 0) {
          exemptions.push(`${method} ${route.path}`);
        }
      }
    }
    assert.deepEqual(exemptions, ["POST commercial/stripe-webhook"], "only the signed public webhook may bypass actor element checks");
  });
});

describe("the dynamic plugin dispatcher keeps every existing gate", () => {
  it("runs tenant, role and feature gates before agency/client element gates and the handler", () => {
    const source = readFileSync("src/app/api/portal/[module]/[...rest]/route.ts", "utf8");
    const body = source.slice(source.indexOf("async function dispatch("));

    const tenant = body.indexOf("resolveApiTenantScope({");
    const role = body.indexOf("apiRouteAllowsRole(plugin");
    const feature = body.indexOf("route.requiresFeature");
    const failClosed = body.indexOf('moduleId === "leads-pipeline" && !isAgencyPluginApiRouteClassified');
    const agencyElement = body.indexOf("agencyPluginApiAccessRequirements(moduleId, rest, method)");
    const clientElement = body.indexOf("clientElementForModule(moduleId)");
    const handler = body.indexOf("await route.handler(");

    assert.ok(tenant > 0, "tenant scope is still resolved");
    assert.ok(role > tenant, "role gate follows tenant resolution");
    assert.ok(feature > role, "feature gate follows the role gate");
    assert.ok(failClosed > feature, "route classification follows the existing role and feature gates");
    assert.ok(agencyElement > failClosed, "agency element access follows fail-closed classification");
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
    assert.match(body, /workspace_element_unclassified/);
    assert.match(body, /moduleId === "leads-pipeline"/);
  });

  it("does not re-scope the signed access actor from request input", () => {
    const source = readFileSync("src/app/api/portal/[module]/[...rest]/route.ts", "utf8");
    const body = source.slice(source.indexOf("async function dispatch("));

    assert.match(body, /const actor = await requireCurrentAccessActor\(\)/);
    assert.doesNotMatch(body, /currentActor\.resourceAgencyId === scopeAgencyId/);
    assert.doesNotMatch(body, /agencyId: scopeAgencyId,\s*resourceAgencyId: scopeAgencyId,/);
  });
});
