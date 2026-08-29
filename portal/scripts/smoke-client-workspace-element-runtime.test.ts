import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, describe, it } from "node:test";
import { readFile } from "node:fs/promises";

import type { CurrentAccessActor } from "../src/server/accessControl";
import type { AccessCapability, AccessScope, PortalState, ServerUser } from "../src/server/types";

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

type ClientAccessModule = typeof import("../src/lib/server/access/clientWorkspaceElementAccess");
type StorageModule = typeof import("../src/server/storage");

let assertClientWorkspaceElementAccess: ClientAccessModule["assertClientWorkspaceElementAccess"];
let clientWorkspaceElementLevel: ClientAccessModule["clientWorkspaceElementLevel"];
let resolveActorClientWorkspaceElementAccess: ClientAccessModule["resolveActorClientWorkspaceElementAccess"];
let visibleClientWorkspaceTabs: ClientAccessModule["visibleClientWorkspaceTabs"];
let createEmptyPortalState: StorageModule["createEmptyPortalState"];

before(async () => {
  ({
    assertClientWorkspaceElementAccess,
    clientWorkspaceElementLevel,
    resolveActorClientWorkspaceElementAccess,
    visibleClientWorkspaceTabs,
  } = await import("../src/lib/server/access/clientWorkspaceElementAccess"));
  ({ createEmptyPortalState } = await import("../src/server/storage"));
});

const AGENCY = "agency-test";
const CLIENT_A = "client-a";
const CLIENT_B = "client-b";

function actor(options?: {
  role?: ServerUser["role"];
  grant?: { scope: AccessScope; capabilities: AccessCapability[] };
  readOnly?: boolean;
}): CurrentAccessActor {
  const state = createEmptyPortalState();
  state.agencies[AGENCY] = {
    id: AGENCY,
    name: "Test Agency",
    slug: "test-agency",
    brand: { primaryColor: "#000000" },
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  };
  for (const [id, name] of [[CLIENT_A, "Client A"], [CLIENT_B, "Client B"]] as const) {
    state.clients[id] = {
      id,
      agencyId: AGENCY,
      name,
      slug: id,
      status: "active",
      stage: "live",
      brand: { primaryColor: "#000000" },
      createdAt: 1,
      updatedAt: 1,
    } as PortalState["clients"][string];
  }
  const role = options?.role ?? "agency-staff";
  const user: ServerUser = {
    id: "person",
    email: "person@example.test",
    name: "Person",
    passwordHash: "test-only",
    role,
    agencyId: AGENCY,
    agencyIds: [AGENCY],
    createdAt: 1,
    updatedAt: 1,
  };
  state.users[user.email] = user;
  if (options?.grant) {
    state.accessGrants.policy = {
      id: "policy",
      agencyId: AGENCY,
      userId: user.id,
      scope: options.grant.scope,
      environment: "live",
      capabilities: options.grant.capabilities,
      createdBy: "owner",
      createdAt: 1,
      updatedAt: 1,
    };
  }
  return {
    session: {
      userId: user.id,
      email: user.email,
      role,
      agencyId: AGENCY,
      ...(options?.readOnly ? { publicShowcase: true } : {}),
    },
    user,
    agencyId: AGENCY,
    resourceAgencyId: AGENCY,
    environment: "live",
    governanceState: state,
    resourceState: state,
  };
}

describe("canonical client workspace element runtime", () => {
  it("keeps the legacy client workspace usable until an identity receives its first governed grant", () => {
    const access = resolveActorClientWorkspaceElementAccess(actor(), CLIENT_A, 10);
    assert.equal(access.source, "legacy");
    assert.equal(clientWorkspaceElementLevel(access, "client.overview"), "manage");
    assert.equal(clientWorkspaceElementLevel(access, "client.settings"), "manage");
  });

  it("does not let an unrelated Fulfilment grant tunnel into any client workspace", () => {
    const current = actor({ grant: {
      scope: { kind: "workspace", id: "fulfilment" },
      capabilities: ["workspace.view", "element.fulfilment.overview.view"],
    } });
    const access = resolveActorClientWorkspaceElementAccess(current, CLIENT_A, 10);
    assert.equal(access.source, "canonical-deny");
    assert.deepEqual(visibleClientWorkspaceTabs(access), []);
    assert.throws(() => assertClientWorkspaceElementAccess(access, "client.overview", "view"));
  });

  it("does not migrate unrelated client behavior merely because a project grant exists", () => {
    const current = actor({ grant: {
      scope: { kind: "project", id: "missing-project" },
      capabilities: ["project.view"],
    } });
    // A nonexistent project grant can never become effective, but also must
    // not silently rewrite this identity's unrelated migration fallback.
    const access = resolveActorClientWorkspaceElementAccess(current, CLIENT_A, 10);
    assert.equal(access.source, "legacy");
    assert.equal(clientWorkspaceElementLevel(access, "client.overview"), "manage");
  });

  it("makes an exact client element grant authoritative and exposes only the selected tabs", () => {
    const current = actor({ grant: {
      scope: { kind: "client", id: CLIENT_A },
      capabilities: ["workspace.view", "element.client.overview.view", "element.client.files.use"],
    } });
    const access = resolveActorClientWorkspaceElementAccess(current, CLIENT_A, 10);
    assert.equal(access.source, "canonical-grant");
    assert.equal(access.agencyWidePolicy, false);
    assert.deepEqual(visibleClientWorkspaceTabs(access), ["overview", "files"]);
    assert.equal(clientWorkspaceElementLevel(access, "client.overview"), "view");
    assert.equal(clientWorkspaceElementLevel(access, "client.files"), "use");
    assert.equal(clientWorkspaceElementLevel(access, "client.commercial"), "hidden");
    assert.doesNotThrow(() => assertClientWorkspaceElementAccess(access, "client.files", "use"));
    assert.throws(() => assertClientWorkspaceElementAccess(access, "client.files", "manage"));
  });

  it("does not carry one exact client grant into a sibling client", () => {
    const current = actor({ grant: {
      scope: { kind: "client", id: CLIENT_A },
      capabilities: ["element.client.overview.view"],
    } });
    const sibling = resolveActorClientWorkspaceElementAccess(current, CLIENT_B, 10);
    assert.equal(sibling.source, "canonical-deny");
    assert.deepEqual(visibleClientWorkspaceTabs(sibling), []);
  });

  it("applies an agency policy only when it explicitly names client elements", () => {
    const current = actor({ grant: {
      scope: { kind: "agency", id: AGENCY },
      capabilities: ["element.client.relationship.use"],
    } });
    const access = resolveActorClientWorkspaceElementAccess(current, CLIENT_B, 10);
    assert.equal(access.source, "canonical-grant");
    assert.equal(access.agencyWidePolicy, true);
    assert.deepEqual(visibleClientWorkspaceTabs(access), ["relationship"]);
    assert.equal(clientWorkspaceElementLevel(access, "client.relationship"), "use");
  });

  it("keeps the owner baseline complete and caps read-only environments to View", () => {
    const owner = resolveActorClientWorkspaceElementAccess(actor({ role: "agency-owner" }), CLIENT_A, 10);
    assert.equal(owner.source, "owner-baseline");
    assert.equal(clientWorkspaceElementLevel(owner, "client.settings"), "manage");

    const readOnly = resolveActorClientWorkspaceElementAccess(actor({ role: "agency-owner", readOnly: true }), CLIENT_A, 10);
    assert.equal(clientWorkspaceElementLevel(readOnly, "client.settings"), "view");
  });

  it("wires client navigation, direct routes and representative mutations to the same keys", async () => {
    const [layout, page, settings, catchAll, accessPanel, statusRoute, recordRoute, productRoute, taskRoute] = await Promise.all([
      readFile(new URL("../src/app/portal/clients/[clientId]/layout.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/clients/[clientId]/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/clients/[clientId]/settings/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/clients/[clientId]/[...rest]/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/access/AccessControlPanel.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/tenants/client-status/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/tenants/client-record/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/tenants/client-products/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/tenants/client-tasks/route.ts", import.meta.url), "utf8"),
    ]);
    assert.match(layout, /clientWorkspaceHasAnyVisibleElement\(clientAccess\)/);
    assert.match(layout, /clientElementVisible\("client\.commercial"\)/);
    assert.match(page, /accessVisibleTabs\.includes\(tab\)/);
    assert.match(page, /clientWorkspaceElementAtLeast\(activeElementLevel, "use"\)/);
    assert.match(settings, /clientWorkspaceElementLevel\(clientAccess, "client\.settings"\)/);
    assert.match(catchAll, /clientWorkspaceElementLevel\(clientAccess, "client\.systems"\)/);
    assert.match(accessPanel, /"Fulfilment", "Client", "Development"/);
    assert.match(statusRoute, /"client\.settings", "manage"/);
    assert.match(recordRoute, /"client\.record", "use"/);
    assert.match(productRoute, /"client\.fulfilment", "manage"/);
    assert.match(taskRoute, /"client\.fulfilment", write \? "use" : "view"/);
  });

  it("maps shared client APIs to their owning element without collapsing external portal branches", async () => {
    const [files, upload, content, contracts, contractTemplates, plans, finance, payments, stripe, connections, portalControl, portalDesign, properties, provision, publish, deploy, requests, approvals, paymentRequest] = await Promise.all([
      readFile(new URL("../src/app/api/tenants/client-files/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/tenants/client-files/upload/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/tenants/client-files/content/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/tenants/client-contracts/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/portal/contracts/templates/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/tenants/client-payment-plans/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/built-ins/modules/agency-finance/src/api/handlers.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/built-ins/modules/agency-finance/src/api/handlers-r007.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/built-ins/modules/agency-finance/src/api/handlers-stripe.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/portal/connections/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/tenants/customer-portal-control/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/portal/client-portal-design/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/tenants/client-properties/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/tenants/client-projects/provision/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/tenants/client-projects/publish/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/tenants/client-projects/deploy/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/tenants/client-requests/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/tenants/client-approvals/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/portal/journey/payment-request/route.ts", import.meta.url), "utf8"),
    ]);
    for (const source of [files, upload, content]) assert.match(source, /clientFileWorkspaceElementKey/);
    assert.match(contracts, /"client\.commercial",[\s\S]*action === "delete" \? "manage" : "use"/);
    assert.match(contractTemplates, /"client\.commercial", "manage"/);
    assert.match(plans, /"client\.commercial"/);
    assert.match(finance, /clientCommercialGate\(existing\.clientId, "manage"\)/);
    assert.match(payments, /clientCommercialGate\(invoice\.clientId, "manage"\)/);
    assert.match(stripe, /clientCommercialGate\(invoice\.clientId, "use"\)/);
    assert.match(stripe, /clientCommercialGate\(payment\.clientId, "manage"\)/);
    assert.match(connections, /"client\.portal", "manage"/);
    assert.match(portalControl, /"client\.portal", "manage"/);
    // The portal-design route splits its element level by how destructive the
    // action is: low-impact edits and the read-only `update-plan` need `use`,
    // everything that changes a live portal needs `manage`. Pinned as the
    // PROPERTY rather than one exact ternary, so adding a legitimate read does
    // not fail while quietly demoting a destructive action still does.
    assert.match(portalDesign, /body\.action === "save-draft"[\s\S]{0,160}\? "use"\s*: "manage"/);
    for (const readOnlyAction of ["save-draft", "checkpoint", "update-plan"]) {
      assert.ok(
        new RegExp(`body\\.action === "${readOnlyAction}"`).test(portalDesign),
        `${readOnlyAction} must be named on the "use" side of the portal-design gate`,
      );
    }
    // …and the destructive ones must NOT be, or they would fall to `use`.
    for (const destructive of ["publish", "reset-client", "update-apply"]) {
      assert.ok(
        !new RegExp(`body\\.action === "${destructive}"[^\\n]*\\? "use"`).test(portalDesign),
        `${destructive} must stay on the "manage" side`,
      );
    }
    assert.match(properties, /"client\.systems", "use"/);
    for (const source of [provision, publish, deploy]) assert.match(source, /"client\.systems", "manage"/);
    assert.match(requests, /requireCurrentClientWorkspaceElementAccess\([\s\S]*"client\.communications", "use"\)/);
    assert.match(approvals, /"client\.portal", "use"/);
    assert.match(paymentRequest, /"client\.commercial", "use"/);
    assert.match(requests, /CLIENT_ROLES, "end-customer"/);
    assert.match(approvals, /requireRoleForClient\(\["end-customer"\]/);
  });
});
