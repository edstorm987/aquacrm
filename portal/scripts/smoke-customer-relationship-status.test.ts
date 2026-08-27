import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.PORTAL_BACKEND = "memory";

function textContent(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textContent).join(" ");
  if (!value || typeof value !== "object") return "";
  const element = value as { props?: { children?: unknown } };
  return textContent(element.props?.children);
}

function findHref(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const child of value) {
      const href = findHref(child);
      if (href) return href;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const element = value as { props?: { href?: unknown; children?: unknown } };
  if (typeof element.props?.href === "string") return element.props.href;
  return findHref(element.props?.children);
}

test("customer Billing maps every canonical relationship status to explicit copy and support", async () => {
  const {
    CustomerRelationshipStatus,
    customerRelationshipStatusPresentation,
  } = await import("../src/app/portal/customer/_CustomerRelationshipStatus");

  assert.deepEqual(customerRelationshipStatusPresentation("active", "Aqua Studio"), {
    label: "Active with Aqua Studio",
    detail: "Your service relationship is active. Billing history and payment options are available here.",
    actionLabel: "Get support",
  });
  assert.deepEqual(customerRelationshipStatusPresentation("suspended", "Aqua Studio"), {
    label: "Service suspended with Aqua Studio",
    detail: "Your service relationship is paused. You can still review billing history and settle existing invoices.",
    actionLabel: "Discuss restarting",
  });
  assert.deepEqual(customerRelationshipStatusPresentation("archived", "Aqua Studio"), {
    label: "Relationship archived with Aqua Studio",
    detail: "This service relationship is closed. Its billing history remains available for your records.",
    actionLabel: "Ask about this account",
  });

  const suspended = CustomerRelationshipStatus({
    status: "suspended",
    providerName: "Aqua Studio",
    supportHref: "/portal/customer/support",
  });
  assert.equal(suspended.props["data-relationship-status"], "suspended");
  assert.match(textContent(suspended), /Service suspended with Aqua Studio/);
  assert.match(textContent(suspended), /Discuss restarting/);
  assert.equal(findHref(suspended), "/portal/customer/support");
});

test("active and suspended linked workspaces remain accessible across fresh reads", async () => {
  const { ensureHydrated } = await import("../src/server/storage");
  const { createAgency, createClient, updateClient } = await import("../src/server/tenants");
  const { linkClientWorkspaces, listAccessibleClientPortals } = await import("../src/server/clientRelationships");
  await ensureHydrated();

  const agency = createAgency({ name: "Relationship status proof" });
  const active = createClient(agency.id, {
    name: "Active workspace",
    metadata: { portalLoginEmail: "buyer@example.test", portalBuiltAt: 10 },
  });
  const suspended = createClient(agency.id, {
    name: "Suspended workspace",
    metadata: { portalLoginEmail: "buyer@example.test", portalBuiltAt: 20 },
  });
  const archived = createClient(agency.id, {
    name: "Archived workspace",
    metadata: { portalLoginEmail: "buyer@example.test", portalBuiltAt: 30 },
  });
  updateClient(agency.id, suspended.id, { status: "suspended" });
  updateClient(agency.id, archived.id, { status: "archived" });
  linkClientWorkspaces(agency.id, active.id, suspended.id);
  linkClientWorkspaces(agency.id, active.id, archived.id);

  const firstRead = listAccessibleClientPortals(agency.id, active.id, "BUYER@example.test");
  const reloadRead = listAccessibleClientPortals(agency.id, active.id, "buyer@example.test");
  assert.deepEqual(new Set(firstRead.map(client => client.id)), new Set([active.id, suspended.id]));
  assert.deepEqual(reloadRead.map(client => [client.id, client.status]), firstRead.map(client => [client.id, client.status]));
  assert.ok(!reloadRead.some(client => client.id === archived.id));
});

test("Billing consumes the fresh client status without changing portal access or payment actions", async () => {
  const source = await readFile("src/app/portal/customer/_CustomerPortalViews.tsx", "utf8");
  const access = await readFile("src/server/clientRelationships.ts", "utf8");

  assert.match(source, /status=\{client\.status\}/);
  assert.match(source, /supportHref=\{customerHref\("support", previewHrefPrefix\)\}/);
  assert.doesNotMatch(source, />Active with \{providerName\}</);
  assert.match(source, /needsPayment && data\.billingUrl/);
  assert.match(access, /client\.status === "active" \|\| client\.status === "suspended"/);
});
