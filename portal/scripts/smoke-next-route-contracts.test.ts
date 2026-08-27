import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
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
  it("allows the staff Team Chat API through the employee proxy", () => {
    const proxy = read("src/proxy.ts");
    assert.match(proxy, /staffApiRoots[\s\S]*"\/api\/portal\/team-chat"/);
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
