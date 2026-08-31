// Phase 18 — a CLIENT lands in their own portal, not in Ed's workspace.
//
// Ed settled the placement on 2026-08-27, by audience rather than by feature:
//
//   "inside the client internal workspace is for internal employees … for
//    clients anything they touch is inside their portal"
//   "existing customer portal actually meant to be"
//
// So `/portal/clients/<id>` is INTERNAL — Ed and his employees — and
// `/portal/customer` is the client's portal. `/portal` used to send
// `client-owner` / `client-staff` into the internal workspace. That was a
// placement mistake rather than an exposure (the internal mutation surface is
// already agency-role-only), but it put the client inside Ed's workspace.
//
// ── What this file pins, and why the third one matters most ─────────────────
//
//  1. the redirect: client roles now land on `/portal/customer`;
//  2. the host gate: the portal renders for exactly `end-customer`,
//     `client-owner`, `client-staff` — and refuses every other role;
//  3. THE BOUNDARY THAT WAS DELIBERATELY NOT WIDENED. Plugin pages on the
//     customer surface are capped by `SURFACE_ROLE_CEILING.customer`, which is
//     still `["end-customer"]`. That cap is load-bearing in a way that is easy
//     to miss: `effectivePageRoles` falls back to the WHOLE ceiling for a page
//     that declares no roles, so adding the client roles there would open every
//     unclassified customer plugin page at once. Those pages are shopper
//     surfaces — orders, profile, membership — and belong to the client's own
//     customers, not to the client. Anyone who "finishes the job" by widening
//     the ceiling has to argue with this test first.

// First, and statically — see the note in dev-console-request-scope.ts.
import { isNextNotFound, isNextRedirect, withRequestScope, withSession } from "./dev-console-request-scope";

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { readFileSync } from "node:fs";

process.env.PORTAL_BACKEND ??= "memory";

// The portal shell reaches `next/link`, which wants `React.createContext` —
// absent from the react-server build this suite runs under. The gate throws long
// before anything renders, so a stub is enough for the module graph to load and
// the real question to be asked. (Same trick as smoke-finance-section-gates.)
import * as React from "react";
type ReactShim = { createContext?: unknown; Component?: unknown; default?: ReactShim };
const stubContext = () => ({ Provider: null, Consumer: null, _currentValue: undefined });
class StubComponent { props: unknown; state: unknown; setState() {} render(): unknown { return null; } }
function shimReact(target: ReactShim | undefined) {
  if (!target) return;
  target.createContext ??= stubContext;
  target.Component ??= StubComponent;
  shimReact(target.default);
}
shimReact(React as unknown as ReactShim);

import { issueSession } from "../src/lib/server/auth/auth";
import { ensureHydrated } from "../src/server/storage";
import { createAgency, createClient } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import { ALL_ROLES, CUSTOMER_PORTAL_ROLES, type Role } from "../src/server/types";
import { SURFACE_ROLE_CEILING, effectivePageRoles } from "../src/built-ins/runtime/_pageScope";
import { listPlugins } from "../src/built-ins/runtime/_registry";

let agencyId = "";
let clientId = "";
const tokens = new Map<Role, string>();

before(async () => {
  await ensureHydrated();
  const agency = createAgency({ name: "Placement", slug: `placement-${Date.now()}` });
  agencyId = agency.id;
  const client = createClient(agency.id, { name: "Payer Ltd", slug: "payer" });
  clientId = client.id;

  for (const role of ALL_ROLES) {
    if (role === "lead") continue;   // leads are not agency-scoped; see LEAD_AGENCY_ID
    const user = createUser({
      email: `${role}-${Date.now()}@placement.test`,
      name: role,
      role,
      agencyId: agency.id,
      password: "placement-smoke-pass-phrase",
    });
    tokens.set(role, await issueSession({
      userId: user.id, email: user.email, role,
      agencyId: agency.id, agencyIds: [agency.id], activeAgencyId: agency.id,
      clientId: role === "agency-owner" || role === "agency-manager" || role === "agency-staff"
        ? undefined
        : client.id,
      sessionRev: user.sessionRev ?? 0,
    }));
  }
});

/** Where `/portal` sends this role — the redirect target, or how it refused. */
async function landingFor(role: Role): Promise<string> {
  const { default: PortalIndex } = await import("../src/app/portal/page");
  return withSession(tokens.get(role)!, async () => {
    try {
      await PortalIndex();
      return "rendered-nothing";
    } catch (error) {
      if (isNextRedirect(error)) {
        const digest = String((error as { digest: string }).digest);
        return digest.split(";")[2] ?? digest;
      }
      if (isNextNotFound(error)) return "404";
      throw error;
    }
  });
}

describe("a client lands in their own portal", () => {
  it("sends client-owner and client-staff to /portal/customer, not the internal workspace", async () => {
    for (const role of ["client-owner", "client-staff"] as const) {
      const landing = await landingFor(role);
      assert.equal(landing, "/portal/customer", `${role} landed on ${landing}`);
      assert.ok(!landing.startsWith("/portal/clients/"),
        `${role} is being sent into the agency-side workspace again`);
    }
  });

  it("leaves every other role where it already went", async () => {
    assert.equal(await landingFor("end-customer"), "/portal/customer");
    assert.equal(await landingFor("agency-owner"), "/portal/agency");
    assert.equal(await landingFor("agency-manager"), "/portal/agency");
    assert.equal(await landingFor("agency-staff"), "/portal/team");
    // The freelancer keeps their own limited workspace — it must not get
    // swept into the client portal by the branch above it.
    assert.equal(await landingFor("freelancer"), "/portal/freelancer");
  });
});

describe("the portal's host gate admits the client audience and nobody else", () => {
  it("names exactly the three roles", () => {
    assert.deepEqual([...CUSTOMER_PORTAL_ROLES].sort(),
      ["client-owner", "client-staff", "end-customer"]);
  });

  it("every host gate under /portal/customer uses that one list", () => {
    // Seven gates, one answer. A new page that reaches for `end-customer`
    // directly would silently exclude the client roles again.
    const gated = [
      "src/app/portal/customer/layout.tsx",
      "src/app/portal/customer/_requestContext.ts",
      "src/app/portal/customer/_subroute.tsx",
      "src/app/portal/customer/orders/page.tsx",
      "src/app/portal/customer/account/page.tsx",
      "src/app/portal/customer/[...rest]/page.tsx",
      "src/app/api/portal/customer/workspace/route.ts",
    ];
    for (const path of gated) {
      const source = readFileSync(path, "utf8");
      assert.match(source, /requireRole\(\[\.\.\.CUSTOMER_PORTAL_ROLES\]\)/,
        `${path} does not gate on CUSTOMER_PORTAL_ROLES`);
      assert.doesNotMatch(source, /requireRole\("end-customer"\)/,
        `${path} still has a bare end-customer gate — the client roles are excluded there`);
    }
  });
});

describe("the way in TERMINATES — no redirect loop", () => {
  // The bug this exists for, found in the browser walk on 2026-08-27 and not by
  // any unit test, because every gate was correct on its own and only the ROUND
  // TRIP was wrong:
  //
  //     /portal → /portal/customer → /setup → /portal → /portal/customer → …
  //
  // `/portal` sent the client role to their portal; the portal layout sent an
  // account with no `welcomeCompletedAt` to `/setup`; and `/setup` sent
  // everything that was not `end-customer` back to `/portal`. The browser sat on
  // "Preparing your workspace…" for ever and the server log showed the cycle
  // repeating at ~3 requests per second.
  //
  // So: follow the redirects and require the chain to STOP. A per-gate
  // assertion cannot catch this class; only walking the graph can.
  async function followFrom(role: Role, start: "portal" | "setup"): Promise<string[]> {
    const { default: PortalIndex } = await import("../src/app/portal/page");
    const { default: SetupPage } = await import("../src/app/setup/page");
    // The customer LAYOUT is the hop that made the loop, and leaving it out is
    // what made an earlier version of this test pass against the bug: it is the
    // layout — not the page — that sends an account with no `welcomeCompletedAt`
    // to `/setup`. Walk it, or this only re-states the source pins below.
    const { default: CustomerLayout } = await import("../src/app/portal/customer/layout");
    const visited: string[] = [];
    let at = start === "portal" ? "/portal" : "/setup";

    for (let hop = 0; hop < 8; hop += 1) {
      visited.push(at);
      const render = at === "/portal"
        ? PortalIndex
        : at === "/setup"
          ? SetupPage
          : at === "/portal/customer"
            ? (() => CustomerLayout({ children: null })) as () => Promise<unknown>
            : null;
      if (!render) break;                    // a real page — the chain ended
      const next = await withSession(tokens.get(role)!, async () => {
        try {
          await render();
          return null;                       // rendered, so it is terminal
        } catch (error) {
          if (isNextRedirect(error)) {
            const digest = String((error as { digest: string }).digest);
            return digest.split(";")[2] ?? digest;
          }
          if (isNextNotFound(error)) return null;
          throw error;
        }
      });
      if (!next) break;
      if (visited.includes(next)) { visited.push(next); return visited; }   // cycle
      at = next;
    }
    return visited;
  }

  for (const role of ["client-owner", "client-staff", "end-customer"] as const) {
    it(`${role} reaches a real page from /portal without cycling`, async () => {
      const chain = await followFrom(role, "portal");
      assert.equal(new Set(chain).size, chain.length,
        `redirect loop for ${role}: ${chain.join(" → ")}`);
      assert.ok(chain.length <= 4, `${role} took too many hops: ${chain.join(" → ")}`);
    });

    it(`${role} reaches a real page from /setup without cycling`, async () => {
      // The other entry point: a client following a welcome link lands on
      // /setup directly, which is where the loop actually started.
      const chain = await followFrom(role, "setup");
      assert.equal(new Set(chain).size, chain.length,
        `redirect loop for ${role}: ${chain.join(" → ")}`);
    });
  }

  it("an agency role is still bounced off /setup, and that bounce terminates too", async () => {
    // The original reason the line existed — "agency staff have no setup to do;
    // sending them here would be a dead end" — must survive the widening.
    const chain = await followFrom("agency-owner", "setup");
    assert.equal(new Set(chain).size, chain.length, `loop: ${chain.join(" → ")}`);
    assert.ok(chain.includes("/portal"), "an agency role is no longer sent away from /setup");
  });

  it("/setup names the portal audience rather than one role", () => {
    const src = readFileSync("src/app/setup/page.tsx", "utf8");
    assert.match(src, /CUSTOMER_PORTAL_ROLES as readonly string\[\]\)\.includes\(session\.role\)/,
      "/setup no longer admits the whole client-portal audience — the loop is back");
    assert.doesNotMatch(src, /session\.role !== "end-customer"/,
      "/setup is back to an end-customer-only check, which loops against /portal");
  });
});

describe("nothing strands a client on the way in", () => {
  it("the setup route serves the same audience as the portal", () => {
    // The trap this closes: the layout sends anyone with no `welcomeCompletedAt`
    // to `/setup`, and `setup` used to refuse everything that was not
    // `end-customer`. Widening the portal without this would have redirected a
    // fresh client to setup and then refused them there — no password, no way
    // in, and nothing on screen explaining why.
    const src = readFileSync("src/app/api/portal/customer/setup/route.ts", "utf8");
    assert.match(src, /CUSTOMER_PORTAL_ROLES\.includes\(session\.role\)/,
      "the setup route no longer serves the whole client-portal audience");
    assert.doesNotMatch(src, /session\.role !== "end-customer"/,
      "the setup route is back to end-customer only — a client role is stranded at /setup");
  });

  it("withdrawing your own portal connection serves that audience too", () => {
    const src = readFileSync("src/app/api/portal/customer/connections/route.ts", "utf8");
    assert.match(src, /CUSTOMER_PORTAL_ROLES\.includes\(session\.role\)/);
    assert.doesNotMatch(src, /session\.role !== "end-customer"/);
  });

  it("the portal chrome shows the viewer's REAL role, not a hardcoded one", () => {
    // The chrome hardcoded `role="end-customer"`, which was harmless while that
    // was the only role served and became a lie the moment client roles moved
    // in — a `client-owner` was told they were an "End customer".
    const chrome = readFileSync("src/app/portal/customer/_CustomerPortalChrome.tsx", "utf8");
    assert.match(chrome, /<ProfileMenu email=\{email\} role=\{viewerRole\}/,
      "the portal chrome is hardcoding a role again");
    assert.doesNotMatch(chrome, /role="end-customer"/,
      "a hardcoded end-customer role is back in the portal chrome");

    // …and the two links that role used to drive now follow the AUDIENCE, so a
    // client role still gets the portal's account page rather than the
    // agency-side one it cannot reach.
    const menu = readFileSync("src/components/chrome/ProfileMenu.tsx", "utf8");
    assert.match(menu, /const inClientPortal = \(CUSTOMER_PORTAL_ROLES as readonly string\[\]\)\.includes\(role\)/);
    assert.match(menu, /href=\{inClientPortal \? "\/portal\/customer\/account" : "\/portal\/account"\}/,
      "the account link is keyed on one role again — a client role would be sent to the agency account page");
  });
});

describe("the plugin ceiling was NOT widened, and must not be", () => {
  it("SURFACE_ROLE_CEILING.customer is still end-customer only", () => {
    assert.deepEqual([...SURFACE_ROLE_CEILING.customer], ["end-customer"],
      "the customer surface ceiling was widened — read the header of this file before doing that");
  });

  it("no customer plugin page serves a client role — including undeclared ones", () => {
    // The reason the assertion above is not enough on its own: an undeclared
    // page inherits the WHOLE ceiling, so this walks every real page and checks
    // the outcome rather than trusting the constant.
    let customerPages = 0;
    for (const plugin of listPlugins()) {
      for (const page of plugin.pages) {
        const roles = effectivePageRoles(plugin, page, "customer");
        if (!roles.length) continue;
        customerPages += 1;
        for (const role of ["client-owner", "client-staff"] as const) {
          assert.ok(!roles.includes(role),
            `${plugin.id}${page.path} now serves ${role} on the customer surface`);
        }
      }
    }
    assert.ok(customerPages > 0, "no customer plugin pages resolved — this test proved nothing");
  });
});

// ── The way OUT (todo #390) ────────────────────────────────────────────────
//
// The way IN was fixed on 2026-08-27; the exits were not. `/portal/account`
// computed its back-link with a hand-written ternary whose fall-through was
// `/portal/agency`, and the portal 404 hardcoded an "Agency dashboard" button.
// A `client-owner` who opened their profile, or mistyped a portal URL, was
// handed a door into Ed's workspace that their host gate then refuses — the
// same placement mistake as the redirect, one screen later.
//
// These render the real pages per role and read the links that actually ship,
// rather than pinning the ternary that used to produce them.

/** Every `href` in a rendered element tree, in document order. */
function collectHrefs(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const child of node) collectHrefs(child, out);
    return out;
  }
  if (!node || typeof node !== "object") return out;
  const props = (node as { props?: Record<string, unknown> }).props;
  if (!props) return out;
  if (typeof props.href === "string") out.push(props.href);
  collectHrefs(props.children, out);
  return out;
}

/** Where each role's workspace is — the one answer `/portal` already gives. */
const WORKSPACE_FOR: Record<string, string> = {
  "agency-owner": "/portal/agency",
  "agency-manager": "/portal/agency",
  "agency-staff": "/portal/team",
  "client-owner": "/portal/customer",
  "client-staff": "/portal/customer",
  freelancer: "/portal/freelancer",
  "end-customer": "/portal/customer",
};

const EXIT_ROLES = Object.keys(WORKSPACE_FOR) as Role[];

describe("the way OUT lands in the same place the way in does", () => {
  async function hrefsOf(mod: string, role: Role): Promise<string[]> {
    const { default: Page } = await import(mod) as { default: () => Promise<unknown> };
    return withSession(tokens.get(role)!, async () => collectHrefs(await Page()));
  }

  for (const role of EXIT_ROLES) {
    it(`/portal/account sends ${role} back to ${WORKSPACE_FOR[role]}`, async () => {
      const hrefs = await hrefsOf("../src/app/portal/account/page", role);
      assert.equal(hrefs[0], WORKSPACE_FOR[role],
        `the account back-link for ${role} is ${hrefs[0]}`);
    });

    it(`the portal 404 offers ${role} a door they can open`, async () => {
      const hrefs = await hrefsOf("../src/app/portal/not-found", role);
      assert.equal(hrefs[0], WORKSPACE_FOR[role],
        `the 404's primary button for ${role} is ${hrefs[0]}`);
      // …and the profile button follows the AUDIENCE, exactly as ProfileMenu does.
      const expectedProfile = (CUSTOMER_PORTAL_ROLES as readonly string[]).includes(role)
        ? "/portal/customer/account"
        : "/portal/account";
      assert.ok(hrefs.includes(expectedProfile),
        `the 404 profile link for ${role} is ${hrefs.join(", ")}`);
    });
  }

  it("neither exit points a non-manager at Team settings", async () => {
    // #92 stopped sending agency-staff to a Settings page that refuses them and
    // left client roles and freelancers pointing straight at it.
    for (const role of EXIT_ROLES) {
      const blocked = role !== "agency-owner" && role !== "agency-manager";
      if (!blocked) continue;
      for (const mod of ["../src/app/portal/account/page", "../src/app/portal/account/permissions/page"]) {
        const hrefs = await hrefsOf(mod, role);
        assert.ok(!hrefs.some(href => href.startsWith("/portal/agency/settings")),
          `${mod} still sends ${role} into Team settings (${hrefs.join(", ")})`);
      }
    }
  });

  it("an owner still keeps the Team settings link that is theirs to use", async () => {
    const hrefs = await hrefsOf("../src/app/portal/account/page", "agency-owner");
    assert.ok(hrefs.includes("/portal/agency/settings#access"),
      "the owner's Team settings guidance was removed along with the broken ones");
  });

  it("a signed-out 404 offers sign-in instead of guessing a workspace", async () => {
    const { default: PortalNotFound } = await import("../src/app/portal/not-found") as
      { default: () => Promise<unknown> };
    const hrefs = await withRequestScope({}, async () => collectHrefs(await PortalNotFound()));
    assert.equal(hrefs[0], "/login?next=/portal", `signed-out 404 leads to ${hrefs[0]}`);
    assert.ok(!hrefs.includes("/portal/agency"),
      "the signed-out 404 still offers the agency dashboard");
    assert.ok(!hrefs.includes("/portal/account"),
      "the signed-out 404 still offers a profile page there is no session for");
  });

  // A `lead` is the one role with a real session and NO portal workspace, and it
  // is the role these two surfaces get wrong most easily. The resolver answers
  // "/login" for them — and `/login` redirects an existing session straight back
  // through that same resolver (`src/app/login/page.tsx`), which answers
  // "/login" again. So a "/login" href offered to a SIGNED-IN lead is not a
  // door, it is a redirect loop. Neither exit may hand them one.
  describe("a signed-in lead is never handed the /login loop", () => {
    let leadToken = "";

    before(async () => {
      const lead = createUser({
        email: `lead-${Date.now()}@placement.test`,
        name: "lead",
        role: "lead",
        password: "placement-smoke-pass-phrase",
      });
      leadToken = await issueSession({
        userId: lead.id, email: lead.email, role: "lead",
        agencyId: lead.agencyId, agencyIds: [], activeAgencyId: lead.agencyId,
        sessionRev: lead.sessionRev ?? 0,
      });
    });

    it("the account back-link does not point a lead at /login", async () => {
      const { default: Page } = await import("../src/app/portal/account/page") as
        { default: () => Promise<unknown> };
      // hrefs[0] is the back-link; `/login/forgot` further down is the password
      // reset, a real door, so only the back-link is in question here.
      const hrefs = await withSession(leadToken, async () => collectHrefs(await Page()));
      assert.equal(hrefs[0], "/", `the account back-link sends a signed-in lead to ${hrefs[0]}`);
      assert.ok(!hrefs.includes("/portal/agency"),
        "the account page is back to offering a lead the agency workspace");
    });

    it("the 404 does not point a lead at /login", async () => {
      const { default: PortalNotFound } = await import("../src/app/portal/not-found") as
        { default: () => Promise<unknown> };
      const hrefs = await withSession(leadToken, async () => collectHrefs(await PortalNotFound()));
      assert.ok(!hrefs.some(href => href.startsWith("/login")),
        `the 404 sends a signed-in lead to ${hrefs.join(", ")}`);
      assert.ok(!hrefs.some(href => href.startsWith("/portal/")),
        `the 404 offers a lead a portal workspace they do not have (${hrefs.join(", ")})`);
      assert.ok(hrefs.includes("/"), "the lead is left with no door at all");
    });
  });
});
