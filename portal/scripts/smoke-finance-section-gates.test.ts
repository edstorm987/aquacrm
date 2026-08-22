// Plugin PAGE access control — the finance hole, and the class behind it.
//
// Finding 2026-08-22 "agency-staff can read FINANCE_ADMIN pages, including
// salaries, by URL": the agency-finance manifest hid Budgets / Operations /
// Planning / Settings from `agency-staff` in `navItems`, and declared nothing
// at all on `pages[]`. `pluginPageAllowedRoles(page)` therefore returned
// `undefined`, the host's only remaining gate was `requireRole(AGENCY_ROLES)`,
// and typing the URL got staff straight in — with `OperationsPage` calling
// `listCompensationProfiles` / `listPayments` SERVER-side, so salaries and
// bonuses were already in the HTML by the time the admin-only API 403 could
// have stopped a refresh.
//
// Hiding a link is not access control. Two layers here:
//
//   1. FINANCE — every FINANCE_ADMIN section's page refuses agency-staff, the
//      viewer sections still admit them, the real host route 404s a staff
//      request for /operations, and `routes.ts` agrees with `sections.ts`
//      about who may GET budgets.
//   2. THE CLASS — a generic guard over EVERY registered plugin: a page whose
//      nav entry is narrower than the plugin's widest nav entry in the same
//      scope must declare roles at least as narrow. This is the test that
//      stops the class reopening when the next plugin is written.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// First, and statically — see the note in dev-console-request-scope.ts.
import { isNextNotFound, withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND ??= "memory";

// The host route imports `next/link`, which reaches for `React.createContext`
// — absent from the react-server build the suite runs under. The role gate
// throws long before anything renders, so a stub is enough to let the module
// graph load and the real question be asked. (Same trick as
// smoke-dev-team-gates.test.ts.)
import * as React from "react";
type ReactShim = { createContext?: unknown; Component?: unknown; default?: ReactShim };
const stubContext = () => ({ Provider: null, Consumer: null, _currentValue: undefined });
class StubComponent { props: unknown; state: unknown; setState() {} render(): unknown { return null; } }
function shimReact(target: ReactShim | undefined) {
  if (!target) return;
  target.createContext ??= stubContext;      // next/link
  target.Component ??= StubComponent;        // components/ui/ErrorBoundary
  shimReact(target.default);
}
shimReact(React as unknown as ReactShim);

import { issueSession } from "../src/lib/server/auth/auth";
import { ensureHydrated } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import { upsertInstall } from "../src/server/pluginInstalls";
import { listPlugins } from "../src/built-ins/runtime/_registry";
import { navItemAllowedRoles, pluginPageAllowedRoles } from "../src/built-ins/runtime/_types";
import { pluginPageForNavHref, resolveAgencyPluginPage } from "../src/built-ins/runtime/_routeResolver";
import {
  FINANCE_ADMIN_ROLES,
  FINANCE_SECTIONS,
  financePageRoles,
  financeSectionPagePath,
} from "../src/built-ins/modules/agency-finance/src/lib/sections";
import { ROUTES as FINANCE_ROUTES } from "../src/built-ins/modules/agency-finance/src/api/routes";
import type { Role } from "../src/server/types";

// ─── Fixture ──────────────────────────────────────────────────────────────

let seq = 0;

async function agencyWithFinance() {
  await ensureHydrated();
  seq += 1;
  const agency = createAgency({ name: "Gate Finance", slug: `gate-finance-${Date.now()}-${seq}` });
  upsertInstall({
    pluginId: "agency-finance",
    scope: { agencyId: agency.id },
    enabled: true,
    config: {},
    features: {},
  });
  return agency;
}

async function sessionAs(agencyId: string, role: Role) {
  const user = createUser({
    email: `${role}-${agencyId}-${seq}@gate.test`,
    name: role,
    role,
    agencyId,
    password: "gate-pass-phrase",
  });
  return issueSession({
    userId: user.id, email: user.email, role,
    agencyId, agencyIds: [agencyId], activeAgencyId: agencyId,
    sessionRev: user.sessionRev ?? 0,
  });
}

// ─── 1. Finance ───────────────────────────────────────────────────────────

describe("agency-finance — the manifest gates the pages, not just the tabs", () => {
  it("every FINANCE_ADMIN section's resolved page refuses agency-staff", async () => {
    const agency = await agencyWithFinance();
    const adminSections = FINANCE_SECTIONS.filter(section => section.roles === FINANCE_ADMIN_ROLES);
    // Budgets, Operations, Planning, Settings — the four the finding named.
    assert.deepEqual(
      adminSections.map(section => section.key),
      ["budgets", "operations", "planning", "settings"],
      "the FINANCE_ADMIN section set changed — re-read the finding before widening it",
    );

    for (const section of adminSections) {
      const rest = ["agency-finance", ...financeSectionPagePath(section).split("/").filter(Boolean)];
      const resolved = resolveAgencyPluginPage({ agencyId: agency.id, rest });
      assert.ok(resolved, `${section.key}: the URL must resolve, or the 404 below proves nothing`);
      const allowed = pluginPageAllowedRoles(resolved.page);
      assert.ok(allowed, `${section.key}: page declares no roles — this is exactly the hole`);
      assert.ok(!allowed.includes("agency-staff"), `${section.key}: agency-staff can open it`);
      assert.ok(allowed.includes("agency-owner"), `${section.key}: locked the owner out`);
      assert.ok(allowed.includes("agency-manager"), `${section.key}: locked the manager out`);
    }
  });

  it("the viewer sections still admit agency-staff (the gate is not a blanket lockout)", async () => {
    const agency = await agencyWithFinance();
    for (const section of FINANCE_SECTIONS.filter(s => s.roles !== FINANCE_ADMIN_ROLES)) {
      const rest = ["agency-finance", ...financeSectionPagePath(section).split("/").filter(Boolean)];
      const resolved = resolveAgencyPluginPage({ agencyId: agency.id, rest });
      assert.ok(resolved, `${section.key} must resolve`);
      const allowed = pluginPageAllowedRoles(resolved.page);
      assert.ok(allowed?.includes("agency-staff"), `${section.key}: staff lost a page they are meant to read`);
    }
  });

  it("a detail page inherits its section's roles rather than opening up", () => {
    assert.deepEqual([...financePageRoles("invoices/:id")], [...financePageRoles("invoices")]);
    // An unknown page falls back to the VIEWER set, never to "undefined".
    assert.ok(financePageRoles("something-new").length > 0);
  });

  it("the real host route 404s an agency-staff request for /operations", async () => {
    const agency = await agencyWithFinance();
    const staff = await sessionAs(agency.id, "agency-staff");
    const host = (await import("../src/app/portal/agency/[...rest]/page")).default;

    // Control: the URL resolves for this agency, and agency-finance is a known
    // plugin — so the host's "not active" branch would return a friendly page,
    // not notFound(). A 404 here can only be the role gate.
    assert.ok(resolveAgencyPluginPage({ agencyId: agency.id, rest: ["agency-finance", "operations"] }));

    const thrown = await withSession(staff, async () => {
      try {
        await host({
          params: Promise.resolve({ rest: ["agency-finance", "operations"] }),
          searchParams: Promise.resolve({}),
        });
        return null;
      } catch (error) {
        return error;
      }
    });
    assert.ok(thrown, "staff rendered the Operations page — salaries are in the SSR props");
    assert.ok(isNextNotFound(thrown), `expected notFound(), got ${String(thrown)}`);
  });

  it("routes.ts and sections.ts agree that budgets is FINANCE_ADMIN", () => {
    const budgetsGet = FINANCE_ROUTES.find(route => route.path === "budgets" && route.methods.includes("GET"));
    assert.ok(budgetsGet, "budgets GET route disappeared");
    const allowed = budgetsGet.visibleToRoles ?? budgetsGet.roles;
    assert.ok(allowed, "budgets GET declares no roles");
    // Used to be AGENCY_VIEWERS — a 200 for staff while the page said admin.
    assert.ok(!allowed.includes("agency-staff"), "budgets GET answers agency-staff again");
    assert.deepEqual([...allowed].sort(), [...FINANCE_ADMIN_ROLES].sort());
  });
});

// ─── 2. The class ─────────────────────────────────────────────────────────

// A nav item's host scope. Only same-scope items are comparable: an agency nav
// entry is legitimately invisible to `end-customer` because a DIFFERENT host
// (with its own `requireRole`) serves that surface.
function navScope(href: string): string | null {
  if (href.startsWith("/portal/agency/")) return "agency";
  if (href.startsWith("/portal/clients/")) return "client";
  if (href.startsWith("/portal/customer/")) return "customer";
  return null;
}

describe("plugin pages — nav-only access control cannot come back", () => {
  it("every page behind an admin-narrowed nav entry declares roles at least as narrow", () => {
    const violations: string[] = [];

    for (const plugin of listPlugins()) {
      // Widest declared role set per scope — the "everyone this plugin shows
      // anything to, here" baseline. A nav item narrower than its scope's
      // baseline is making an access-control claim.
      const widest = new Map<string, Set<Role>>();
      for (const item of plugin.navItems) {
        const scope = navScope(item.href);
        const roles = navItemAllowedRoles(item);
        if (!scope || !roles) continue;
        const bucket = widest.get(scope) ?? new Set<Role>();
        for (const role of roles) bucket.add(role);
        widest.set(scope, bucket);
      }

      for (const item of plugin.navItems) {
        const scope = navScope(item.href);
        const navRoles = navItemAllowedRoles(item);
        if (!scope || !navRoles) continue;
        const baseline = widest.get(scope)!;
        const hiddenFrom = [...baseline].filter(role => !navRoles.includes(role));
        if (hiddenFrom.length === 0) continue;

        // Which page does this nav entry actually open? `null` = an app route
        // or another plugin's surface — a legitimate nav entry, not a gap.
        const page = pluginPageForNavHref(plugin, item.href);
        if (!page) continue;

        const pageRoles = pluginPageAllowedRoles(page);
        if (!pageRoles) {
          violations.push(
            `${plugin.id} · nav "${item.id}" (${item.href}) hides the tab from ${hiddenFrom.join(", ")} `
            + `but page "${page.path}" declares NO roles — reachable by URL`,
          );
          continue;
        }
        const stillIn = hiddenFrom.filter(role => pageRoles.includes(role));
        if (stillIn.length) {
          violations.push(
            `${plugin.id} · nav "${item.id}" (${item.href}) hides the tab from ${stillIn.join(", ")} `
            + `but page "${page.path}" still admits them`,
          );
        }
      }
    }

    assert.deepEqual(violations, [], `nav-only access control:\n  ${violations.join("\n  ")}`);
  });

  it("the guard can actually see a hole (mutation check)", () => {
    // Prove the walk above is not silently skipping everything: strip the
    // roles off the finance Settings page in a COPY of the manifest and the
    // same logic must report it.
    const finance = listPlugins().find(plugin => plugin.id === "agency-finance");
    assert.ok(finance);
    const settingsNav = finance.navItems.find(item => item.href.endsWith("/settings"));
    assert.ok(settingsNav, "finance settings nav entry vanished");
    const settingsPage = pluginPageForNavHref(finance, settingsNav.href);
    assert.ok(settingsPage, "pluginPageForNavHref no longer maps the settings nav to its page");
    assert.equal(settingsPage.path, "settings");

    const stripped = { ...settingsPage, visibleToRoles: undefined, roles: undefined };
    assert.equal(pluginPageAllowedRoles(stripped), undefined);
    assert.ok(pluginPageAllowedRoles(settingsPage), "and the real one is declared");
  });
});
