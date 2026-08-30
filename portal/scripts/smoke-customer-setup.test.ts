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
  const installHelp = () => read("src", "app", "portal", "customer", "_InstallHelp.tsx");
  const portalViews = () => read("src", "app", "portal", "customer", "_CustomerPortalViews.tsx");

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
    const source = installHelp();
    assert.match(source, /Add to Home Screen/);
    assert.match(source, /iPhone\|iPad\|iPod/);
  });

  it("keeps the promise that the install help is waiting under Support", () => {
    // Setup's install scene signs off with "you can do this later — it is in
    // your portal under Support". Setup is marked complete BEFORE that scene,
    // and /setup redirects a completed customer away, so somebody who declined
    // or closed the tab never sees it again. Support has to actually carry it.
    assert.match(screens(), /it is in your portal under Support/,
      "the promise copy moved — re-point this test or drop the promise");
    const views = portalViews();
    assert.match(views, /import \{[^}]*\bInstallHelp\b[^}]*\} from "\.\/_InstallHelp"/,
      "the customer portal never imports the install help");
    const supportAt = views.indexOf("function SupportView(");
    const nextViewAt = views.indexOf("function SupportPromise(");
    assert.ok(supportAt > 0 && nextViewAt > supportAt, "SupportView is not where this test thinks");
    assert.match(views.slice(supportAt, nextViewAt), /<InstallHelp\b/,
      "SupportView offers contact options but no way to install the portal");
  });

  it("keeps one copy of the install guidance, not two that drift apart", () => {
    // Two copies is how the Support promise quietly stops matching what setup
    // showed. Setup renders the same component the portal does.
    const source = screens();
    assert.match(source, /import \{ InstallHelp \} from "@\/app\/portal\/customer\/_InstallHelp"/,
      "the setup scene does not use the shared install help");
    assert.match(source, /<InstallHelp\b/);
    assert.doesNotMatch(source, /beforeinstallprompt/,
      "the setup scene kept its own install prompt listener — that is the second copy");
    assert.doesNotMatch(source, /Add to Home Screen/,
      "the setup scene kept its own instructions — that is the second copy");
  });

  it("does not leave a spent install button pretending it still works", () => {
    // A `beforeinstallprompt` event is good for exactly one call. Firing it and
    // never reading `userChoice` means a decline looks identical to an install,
    // and the button stays on screen doing nothing.
    const source = installHelp();
    assert.match(source, /await event\.userChoice/, "the answer to the prompt is never read");
    assert.match(source, /outcome === "accepted"/, "accept and decline are not told apart");
    const installAt = source.indexOf("const install = useCallback");
    const promptAt = source.indexOf("await event.prompt()");
    assert.ok(installAt > 0 && promptAt > installAt);
    assert.match(source.slice(installAt, promptAt), /setPrompt\(null\)/,
      "the one-use prompt is not cleared, so the button survives being spent");
    assert.match(source, /setDeclined\(true\)/, "a decline leaves no state to fall back from");
  });

  it("does not offer an install to somebody already inside the installed app", () => {
    const source = installHelp();
    assert.match(source, /\(display-mode: standalone\)/, "standalone is never detected");
    assert.match(source, /navigator as Navigator & \{ standalone\?: boolean \}/,
      "iOS reports standalone only through navigator.standalone");
    assert.match(source, /if \(alreadyInstalled && hideWhenInstalled && !installed\) return null;/,
      "the Support card never hides itself for an installed app");
    const views = portalViews();
    const supportAt = views.indexOf("function SupportView(");
    const supportBody = views.slice(supportAt, views.indexOf("function SupportPromise("));
    assert.match(supportBody, /hideWhenInstalled/,
      "Support mounts the install help without asking it to hide when installed");
    // Hiding only the help leaves its surrounding card behind: the Surface is
    // server-rendered around it, so an installed app would get a bordered,
    // padded, empty panel under the request form instead of nothing at all.
    const wrapAt = supportBody.indexOf("<HideWhenInstalled>");
    const cardAt = supportBody.indexOf("<Surface", wrapAt);
    const helpAt = supportBody.indexOf("<InstallHelp", cardAt);
    assert.ok(wrapAt > 0 && cardAt > wrapAt && helpAt > cardAt,
      "the install card's own chrome is outside the hide, so an installed app is left an empty panel");
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
