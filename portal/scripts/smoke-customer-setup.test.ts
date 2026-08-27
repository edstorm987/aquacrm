import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf-8") as string;
const strip = (source: string) => source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("a customer's first minutes", () => {
  const route = () => strip(read("src", "app", "api", "portal", "customer", "setup", "route.ts"));
  const page = () => strip(read("src", "app", "setup", "page.tsx"));
  const screens = () => read("src", "app", "setup", "_CustomerSetup.tsx");
  const layout = () => strip(read("src", "app", "portal", "customer", "layout.tsx"));

  it("still marks a sandbox account's setup done, so it does not loop back", () => {
    // The .test guard returns early; without marking welcome complete there,
    // the customer layout would send a sandbox customer to /setup forever.
    const source = route();
    const guardBlock = source.slice(source.indexOf(".test$/i.test"), source.indexOf("sandbox: true"));
    assert.match(guardBlock, /markWelcomeComplete\(session\.userId\)/, "the sandbox branch never completes setup");
  });

  it("never creates a real sign-in for a sandbox account", () => {
    // `PORTAL_BACKEND` guards the state file, not Supabase — the admin client
    // reads its credentials from the environment. Walking this flow locally
    // created a real user in the real auth project once already.
    const source = route();
    assert.match(source, /\\.test\$\/i\.test/);
    const guardAt = source.indexOf(".test$/i.test");
    const provisionAt = source.indexOf("provisionSupabaseIdentity(");
    assert.ok(guardAt > 0 && guardAt < provisionAt, "the guard runs after provisioning, or not at all");
  });

  it("welcomes them before asking for anything", () => {
    // Somebody told "your portal is ready" should meet a welcome first; the
    // password is the price of admission, not the greeting.
    const source = screens();
    assert.match(source, /Welcome, \{firstName\}/);
    const welcomeAt = source.indexOf("Welcome, {firstName}");
    const passwordAt = source.indexOf("Choose a password");
    assert.ok(passwordAt < welcomeAt || source.indexOf('step === "password"') < welcomeAt,
      "the password screen is not reached before the welcome");
  });

  it("sends a first-timer to setup rather than into a portal they cannot re-enter", () => {
    // They were signed in by a link and hold no password. Dropping them
    // straight in leaves somebody locked out once the link is spent.
    assert.match(layout(), /user && !user\.welcomeCompletedAt\) redirect\("\/setup"\)/);
  });

  it("does not hold anybody on the welcome twice", () => {
    assert.match(page(), /user\?\.welcomeCompletedAt\) redirect\("\/portal\/customer"\)/);
  });

  it("points the setup email at setup, not at the portal", () => {
    const control = strip(read("src", "app", "api", "tenants", "customer-portal-control", "route.ts"));
    assert.match(control, /magicUrl\.searchParams\.set\("return", "\/setup"\)/);
  });

  it("tells iPhone users the one route that actually works there", () => {
    // `beforeinstallprompt` never fires in Safari, and iPhones are most of the
    // people who will see this.
    const source = screens();
    assert.match(source, /Add to Home Screen/);
    assert.match(source, /iPhone\|iPad\|iPod/);
  });

  it("ships a manifest, so installing gives an app and not a bookmark", () => {
    const manifest = JSON.parse(read("public", "manifest.webmanifest")) as {
      display?: string;
      start_url?: string;
      icons?: Array<{ purpose?: string }>;
    };
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.start_url, "/portal/customer");
    assert.ok(manifest.icons?.some(icon => icon.purpose === "maskable"));
  });

  it("leaves the video out rather than showing it broken", () => {
    assert.match(screens(), /videoUrl \?/);
  });

  it("lets the agency set the welcome video, and carries it through to setup", () => {
    // Ed asked for a VSL on the welcome. A slot nothing can fill is not a
    // feature — the field on the Portal tab, the save, and the read must line
    // up end to end.
    const form = read("src", "app", "portal", "clients", "[clientId]", "_FulfilmentPortalPreview.tsx");
    assert.match(form, /welcomeVideoUrl/, "the portal form has no video field");
    const control = strip(read("src", "app", "api", "tenants", "customer-portal-control", "route.ts"));
    assert.match(control, /portalWelcomeVideoUrl = cleanSupportUrl\(body\.welcomeVideoUrl\)/, "the save does not clean or persist it");
    assert.match(control, /portalWelcomeVideoUrl,/, "it is not written to metadata");
    assert.match(page(), /portalWelcomeVideoUrl/, "the setup page never reads it back");
  });
});
