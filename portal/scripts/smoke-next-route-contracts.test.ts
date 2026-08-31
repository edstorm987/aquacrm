import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// `import.meta.dirname` is undefined when this file is loaded through tsx's
// CJS transform (no `"type": "module"` in package.json), which made the whole
// suite throw before a single assertion ran. `import.meta.url` is populated in
// both loaders.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("Next route contracts", () => {
  it("exports a required request parameter from the Dev Projects GET handler", () => {
    const source = read("src/app/api/portal/dev/projects/route.ts");
    assert.match(source, /export async function GET\(request: NextRequest\)/);
    assert.doesNotMatch(source, /export async function GET\(request\?:/);
  });

  it("keeps server-only plugin ports out of declared client page entries", () => {
    const host = read("src/app/portal/clients/[clientId]/[...rest]/page.tsx");
    const branch = host.indexOf("if (page.clientComponent)");
    const ports = host.indexOf("services: FOUNDATION_SERVICES");
    assert.ok(branch >= 0 && ports > branch, "the serializable client branch must run before server ports are constructed");
    assert.match(host.slice(branch, ports), /<ClientComponent\s*\/>/);
    assert.doesNotMatch(host.slice(branch, ports), /FOUNDATION_SERVICES|makePluginStorage/);
  });

  it("declares every direct Website Editor client page at the safe boundary", () => {
    const manifest = read("src/built-ins/modules/website-editor/index.ts");
    const clientPages = [
      "PagesPage", "PageDetailPage", "PortalsPage", "CustomisePage", "SitesPage",
      "ThemesPage", "ThemeDetailPage", "SectionsPage", "AssetsPage", "PopupsPage", "GitStatusPage",
    ];
    for (const page of clientPages) {
      const entry = new RegExp(`clientComponent: true,[\\s\\S]{0,120}import\\(\\"\\./src/pages/${page}\\"\\)`);
      assert.match(manifest, entry, `${page} must not receive server-only PluginPageProps`);
    }
  });
});

describe("confirmed browser regressions", () => {
  it("allows the staff Team Chat API through the employee proxy", async () => {
    const { isStaffWorkspaceApiPath } = await import("../src/lib/staffWorkspacePolicy");
    assert.equal(isStaffWorkspaceApiPath("/api/portal/team-chat"), true);
    // The proxy must ASK the policy rather than keep a second copy of it —
    // the two drifting apart is what refused Team Chat in the first place.
    const proxy = read("src/proxy.ts");
    assert.match(proxy, /isStaffWorkspaceApiPath\(path\)/);
    assert.match(proxy, /isStaffDelegatedAgencyPagePath\(path\)/);
    assert.doesNotMatch(proxy, /staffApiRoots|delegatedAgencyPageRoots/,
      "the employee-workspace allowlist is declared in the proxy again");
  });

  it("prevents stale Team Chat requests from repainting a newer selection", () => {
    const chat = read("src/components/people/TeamChat.tsx");
    assert.match(chat, /intentId !== intentSequence\.current/);
    assert.match(chat, /channelId !== desiredChannel\.current/);
    assert.match(chat, /requestId < appliedSequence\.current/);
    assert.match(chat, /load\(channel\.id, true\)/);
  });

  it("keeps Finance currency resolution read-only", () => {
    const currency = read("src/lib/server/finance/financeCurrency.ts");
    assert.doesNotMatch(currency, /patchInstall|getInstall|ukDefaultCurrencyV1/);
    assert.match(currency, /return normaliseCurrency\(configured, "gbp"\)/);
  });

  it("returns the configured Finance currency without rewriting its meaning", async () => {
    const { resolveFinanceDefaultCurrency } = await import("../src/lib/server/finance/financeCurrency");
    assert.equal(resolveFinanceDefaultCurrency("agency_test", "usd"), "usd");
    assert.equal(resolveFinanceDefaultCurrency("agency_test", "eur"), "eur");
    assert.equal(resolveFinanceDefaultCurrency("agency_test", "not-a-currency"), "gbp");
  });

  it("gives the avatar file input an accessible name", () => {
    const avatar = read("src/app/portal/account/AvatarUploader.tsx");
    assert.match(avatar, /type="file"[\s\S]{0,160}aria-label="Upload profile photo"/);
  });

  it("does not override intentional portal-shell max widths", () => {
    const css = read("src/app/globals.css");
    const shellRule = css.match(/\.mm-portal-root,\s*\.mm-portal-root > \*,\s*\.mm-portal-root main#main-content,\s*\.mm-route-canvas > \*\s*\{([^}]*)\}/)?.[1] ?? "";
    assert.doesNotMatch(shellRule, /max-width:\s*100%/);
    assert.match(css, /\.mm-route-canvas\s*>\s*\*\s*\{\s*max-width:\s*100%/);
  });

  it("requires client-bearing writes to resolve a real client before persistence", () => {
    const routes = [
      "src/app/api/portal/identity-resolution/route.ts",
      "src/app/api/portal/inbox/conversations/route.ts",
      "src/app/api/portal/people/route.ts",
      "src/app/api/portal/dev/projects/route.ts",
      "src/app/api/portal/performance/experiments/route.ts",
      "src/app/api/portal/plugins/settings/route.ts",
    ];
    for (const route of routes) {
      const source = read(route);
      assert.match(source, /!\w+\.client/);
      assert.match(source, /status:\s*404|error\([^\n]+,\s*404\)/);
    }
  });
});

// One enumerated employee-workspace policy, swept against the surfaces that
// actually call it. Before `src/lib/staffWorkspacePolicy.ts` the proxy kept its
// own allowlist while the shell and the leaf routes decided independently, so
// chrome a staff account was SHOWN could call an API the proxy refused —
// the Team Chat refusal (#25), and after it the department switcher, the
// topbar pin layout, My Radar quick look and records search.
describe("employee workspace access policy", () => {
  // Client components the employee workspace mounts: the `/portal/team` body
  // and Team Chat, plus the shared topbar chrome `Topbar` renders for EVERY
  // agency role (`isAgencyRole`), which staff also carry onto the delegated
  // agency pages the policy lets them mount, plus the pages the employee
  // sidebar itself links to — `/portal/team/layout.tsx` puts "My profile"
  // (`/portal/account`) in the Settings panel of every staff shell, and that
  // page is where two-factor is switched on.
  const STAFF_SHELL_SURFACES = [
    "src/app/portal/team/_TeamWorkspace.tsx",
    "src/components/people/TeamChat.tsx",
    "src/components/chrome/DepartmentSwitcher.tsx",
    "src/components/chrome/MyRadarQuickLookPanel.tsx",
    "src/components/chrome/TopbarOverflow.tsx",
    "src/components/chrome/PinnedTabs.tsx",
    "src/components/chrome/pinnedTabsStore.ts",
    "src/components/chrome/PortalSearch.tsx",
    "src/components/chrome/QuickNoteWindow.tsx",
    "src/app/portal/account/TwoFactorPanel.tsx",
    "src/components/auth/TwoFactorSetup.tsx",
  ];

  function portalEndpointsIn(source: string): string[] {
    const found = new Set<string>();
    for (const raw of source.match(/["'`]\/api\/portal\/[^"'`\s]*/g) ?? []) {
      const path = raw.slice(1).split("?")[0].split("${")[0].replace(/\/$/, "");
      if (path.startsWith("/api/portal/")) found.add(path);
    }
    return [...found];
  }

  it("grants every portal API the employee workspace actually calls", async () => {
    const { isStaffWorkspaceApiPath } = await import("../src/lib/staffWorkspacePolicy");
    const seen: string[] = [];
    for (const surface of STAFF_SHELL_SURFACES) {
      for (const endpoint of portalEndpointsIn(read(surface))) {
        seen.push(endpoint);
        assert.ok(isStaffWorkspaceApiPath(endpoint),
          `${surface} calls ${endpoint}, which the employee proxy refuses — the shell offers what the boundary denies`);
      }
    }
    // A scan that matched nothing would pass vacuously.
    assert.ok(seen.length >= 8, `expected the staff shell to call several portal APIs, found ${seen.length}`);
  });

  it("keeps records search reachable for the staff who are offered it", async () => {
    const { isStaffWorkspaceApiPath, STAFF_DELEGATED_AGENCY_PAGE_ROOTS } = await import("../src/lib/staffWorkspacePolicy");
    // The delegated pages render under the agency layout, which does not turn
    // records search off, and Topbar's default enables it for agency-staff —
    // so a delegated staff account really does reach `/api/portal/search`.
    assert.ok(STAFF_DELEGATED_AGENCY_PAGE_ROOTS.includes("/portal/agency/people"));
    assert.doesNotMatch(read("src/app/portal/agency/layout.tsx"), /searchRecordsEnabled/);
    assert.match(read("src/components/chrome/Topbar.tsx"),
      /const recordsEnabled = searchRecordsEnabled \?\?[^\n]*"agency-staff"/);
    assert.equal(isStaffWorkspaceApiPath("/api/portal/search"), true);
  });

  it("lets the employee shell through the real proxy and still holds the rest shut", async () => {
    const { NextRequest } = await import("next/server");
    const { proxy } = await import("../src/proxy");
    const token = `${Buffer.from(JSON.stringify({ role: "agency-staff" })).toString("base64url")}.test-signature`;
    const request = (path: string) => new NextRequest(`http://localhost:3032${path}`, {
      headers: { cookie: `lk_session_v1=${token}` },
    });

    for (const path of [
      "/api/portal/team-chat",
      "/api/portal/chrome/department",
      "/api/portal/chrome/layout",
      "/api/portal/intelligence/my-radar",
      "/api/portal/search",
      "/api/portal/tasks",
      // "My profile" is in the employee sidebar, and this is the only route
      // behind switching two-factor on. Refusing it left staff unable to
      // protect their own account.
      "/api/portal/mfa/enrol",
      "/api/portal/mfa/verify",
    ]) {
      assert.equal(proxy(request(path)).status, 200, `${path} is offered to staff but refused at the proxy`);
    }
    // Narrowing is still real — the policy is an enumeration, not an opening.
    for (const path of ["/api/portal/inbox/conversations", "/api/portal/settings/activity-log", "/api/portal/intelligence"]) {
      assert.equal(proxy(request(path)).status, 403, `${path} must stay outside the employee workspace`);
    }
    assert.equal(proxy(request("/portal/agency/people")).status, 200);
    assert.equal(proxy(request("/portal/agency/settings")).status, 307);
  });

  it("never advertises a staff surface with nothing behind it", async () => {
    const { STAFF_DELEGATED_AGENCY_PAGE_ROOTS, STAFF_WORKSPACE_API_ROOTS } =
      await import("../src/lib/staffWorkspacePolicy");
    for (const root of STAFF_WORKSPACE_API_ROOTS) {
      assert.ok(existsSync(join(ROOT, "src/app", root)), `the policy grants ${root}, which has no route`);
    }
    for (const root of STAFF_DELEGATED_AGENCY_PAGE_ROOTS) {
      assert.ok(existsSync(join(ROOT, "src/app", root)), `the policy delegates ${root}, which has no page`);
    }
  });
});
