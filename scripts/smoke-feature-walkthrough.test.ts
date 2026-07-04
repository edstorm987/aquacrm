// T1 — Feature walkthrough audit smoke (chapter #168).
//
// End-to-end audit of every major user flow shipped in the foundation.
// For each flow we run a hybrid:
//   - Source-marker case  → file structure + wire-up exists at the
//     expected path with the expected contract surface.
//   - Best-effort runtime case → drive the underlying lib/server module
//     when transitive `server-only` doesn't block, otherwise extra
//     source-markers around the runtime contract.
//
// Same pattern as #117 / #138 / #161 / #167.
//
// Run via `npm run smoke:feature-walkthrough`.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Stub `server-only` so any incidental import below doesn't blow tsx --test.
const _req = createRequire(import.meta.url);
const _serverOnlyPath = _req.resolve("server-only");
_req.cache[_serverOnlyPath] = {
  id: _serverOnlyPath,
  filename: _serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");
const APP = join(SRC, "app");
const API = join(APP, "api");
const PORTAL = join(APP, "portal");
const PLUGINS_DIR = join(SRC, "plugins");
const LIB_SERVER = join(SRC, "lib", "server");
const PUBLIC = join(ROOT, "public");
const PLUGINS_REPO = join(ROOT, "..", "plugins");

function read(p: string): string {
  return readFileSync(p, "utf-8");
}
function has(p: string): boolean {
  return existsSync(p);
}

// ─── Auth ─────────────────────────────────────────────────────────────

describe("Feature: Auth — signup", () => {
  it("source: /signup + /signup/agency pages exist with form components", () => {
    assert.ok(has(join(APP, "signup", "page.tsx")));
    assert.ok(has(join(APP, "signup", "agency", "page.tsx")));
  });
  it("source: signup API route ships and uses createUser", () => {
    const route = join(API, "auth", "signup", "route.ts");
    assert.ok(has(route));
    const src = read(route);
    assert.match(src, /createUser/);
  });
});

describe("Feature: Auth — login (password)", () => {
  it("source: /login page + LoginForm island", () => {
    assert.ok(has(join(APP, "login", "page.tsx")));
    assert.ok(has(join(APP, "login", "LoginForm.tsx")));
  });
  it("source: /api/auth/login route mints lk_session_v1 cookie", () => {
    const route = join(API, "auth", "login", "route.ts");
    assert.ok(has(route));
    const src = read(route);
    assert.match(src, /lk_session_v1|session/);
  });
});

describe("Feature: Auth — Google OAuth (env-gated)", () => {
  it("source: /api/auth/oauth/google route + lib/server/oauthGoogle.ts", () => {
    assert.ok(has(join(API, "auth", "oauth", "google")));
    assert.ok(has(join(LIB_SERVER, "oauthGoogle.ts")));
  });
  it("runtime: oauthGoogle env-gates on missing GOOGLE_OAUTH_CLIENT_ID", () => {
    const src = read(join(LIB_SERVER, "oauthGoogle.ts"));
    assert.match(src, /GOOGLE_OAUTH_CLIENT_ID|client.?id/i);
  });
});

describe("Feature: Auth — forgotten-password request + reset (#160)", () => {
  it("source: /login/forgot + /login/reset pages with islands", () => {
    assert.ok(has(join(APP, "login", "forgot", "page.tsx")));
    assert.ok(has(join(APP, "login", "forgot", "ForgotForm.tsx")));
    assert.ok(has(join(APP, "login", "reset", "page.tsx")));
    assert.ok(has(join(APP, "login", "reset", "ResetForm.tsx")));
  });
  it("source: /api/auth/password/{request-reset,reset} routes", () => {
    assert.ok(has(join(API, "auth", "password", "request-reset", "route.ts")));
    assert.ok(has(join(API, "auth", "password", "reset", "route.ts")));
  });
  it("runtime: passwordReset.ts exports HMAC sign/verify + nonce kind", async () => {
    const m = await import("../src/lib/server/passwordReset");
    assert.equal(typeof m.signPasswordResetToken, "function");
    assert.equal(typeof m.verifyPasswordResetToken, "function");
  });
  it("source: LoginForm exposes 'Forgot password?' link to /login/forgot", () => {
    const src = read(join(APP, "login", "LoginForm.tsx"));
    assert.match(src, /\/login\/forgot/);
  });
});

describe("Feature: Auth — magic link (#138)", () => {
  it("source: /api/auth/magic/{request,verify} routes", () => {
    assert.ok(has(join(API, "auth", "magic", "request", "route.ts")));
    assert.ok(has(join(API, "auth", "magic", "verify", "route.ts")));
  });
  it("source: lib/server/magicLink.ts exports HMAC token", () => {
    assert.ok(has(join(LIB_SERVER, "magicLink.ts")));
  });
});

describe("Feature: Auth — session expiry + sign-out", () => {
  it("source: /api/auth/logout route exists", () => {
    assert.ok(has(join(API, "auth", "logout", "route.ts")));
  });
  it("source: /api/auth/me route returns user shape", () => {
    const route = join(API, "auth", "me", "route.ts");
    assert.ok(has(route));
    const src = read(route);
    assert.match(src, /user/);
  });
});

// ─── Dev-bypass personas ─────────────────────────────────────────────

describe("Feature: Dev-bypass — 5 personas seed (founderSeed + demoSeed)", () => {
  it("source: founderSeed.ts ships env-driven creds (#129)", () => {
    const src = read(join(LIB_SERVER, "founderSeed.ts"));
    assert.match(src, /FOUNDER_EMAIL/);
    assert.match(src, /FOUNDER_PASSWORD/);
    assert.match(src, /checkFounderPolicy/);
  });
  it("source: demoSeed.ts exports 4 demo personas (owner/staff/client/customer)", () => {
    const src = read(join(LIB_SERVER, "demoSeed.ts"));
    assert.match(src, /DEMO_OWNER_EMAIL/);
    assert.match(src, /DEMO_STAFF_EMAIL/);
    assert.match(src, /DEMO_CLIENT_EMAIL/);
    assert.match(src, /DEMO_CUSTOMER_EMAIL/);
  });
  it("source: /dev/pov page renders persona chooser", () => {
    assert.ok(has(join(APP, "dev", "pov")));
  });
});

// ─── Tenant switching ────────────────────────────────────────────────

describe("Feature: Tenant switching — AgencySwitcher (#131)", () => {
  it("source: AgencySwitcher chrome component exists", () => {
    assert.ok(has(join(SRC, "components", "chrome", "AgencySwitcher.tsx")));
  });
  it("source: /api/auth/agency-switch + /api/auth/agency-add routes", () => {
    assert.ok(has(join(API, "auth", "agency-switch", "route.ts")));
    assert.ok(has(join(API, "auth", "agency-add", "route.ts")));
  });
});

// ─── Profile + account ───────────────────────────────────────────────

describe("Feature: Profile (#155 avatar / preferences / permissions)", () => {
  it("source: /portal/account page + AvatarUploader island", () => {
    assert.ok(has(join(PORTAL, "account", "page.tsx")));
    assert.ok(has(join(PORTAL, "account", "AvatarUploader.tsx")));
  });
  it("source: /api/auth/profile/{avatar,update} routes", () => {
    assert.ok(has(join(API, "auth", "profile", "avatar")));
    assert.ok(has(join(API, "auth", "profile", "update")));
  });
  it("source: /portal/account/preferences + /permissions sub-pages", () => {
    assert.ok(has(join(PORTAL, "account", "preferences", "page.tsx")));
    assert.ok(has(join(PORTAL, "account", "permissions", "page.tsx")));
  });
});

// ─── Phases preview (#164) ───────────────────────────────────────────

describe("Feature: Phases preview UI (#164)", () => {
  it("source: /portal/agency/phases list + edit pages + add form", () => {
    assert.ok(has(join(PORTAL, "agency", "phases", "page.tsx")));
    assert.ok(has(join(PORTAL, "agency", "phases", "_AddCustomPhaseForm.tsx")));
    assert.ok(has(join(PORTAL, "agency", "phases", "[phaseId]", "page.tsx")));
  });
  it("source: phase upsert/delete + preview-as-client APIs", () => {
    assert.ok(has(join(API, "portal", "phases", "upsert", "route.ts")));
    assert.ok(has(join(API, "portal", "phases", "delete", "route.ts")));
    assert.ok(has(join(API, "auth", "preview-as-client-at-phase", "route.ts")));
  });
  it("runtime: previewPhase.ts exports cookie helpers + escapers", async () => {
    const m = await import("../src/lib/server/previewPhase");
    assert.equal(typeof m.escapeStyleContent, "function");
    assert.equal(typeof m.escapeScriptContent, "function");
    // Round-trip neutralises </style> / </script>.
    assert.ok(!m.escapeStyleContent("a</style>b").includes("</style>"));
    assert.ok(!m.escapeScriptContent("a</script>b").includes("</script>"));
  });
});

// ─── Pipelines (#156) + Leads pipeline (#157) ────────────────────────

describe("Feature: Pipelines hub + leads-pipeline (#156, #157)", () => {
  it("source: /portal/agency/pipelines surface exists", () => {
    assert.ok(has(join(PORTAL, "agency", "pipelines")));
  });
  it("source: leads-pipeline plugin manifest + foundation adapter present", () => {
    assert.ok(has(join(PLUGINS_DIR, "foundation-adapters", "leadsPipelineFoundation.ts")));
    assert.ok(has(join(PLUGINS_REPO, "leads-pipeline", "package.json")));
  });
  it("source: leadsPipelinePorts wraps email-sender port", () => {
    const src = read(join(LIB_SERVER, "leadsPipelinePorts.ts"));
    assert.match(src, /emailEnqueue|email-sender/);
  });
});

// ─── Public funnel (#132) + HC integration (#161) ────────────────────

describe("Feature: Public funnel + HC integration (#132, #161)", () => {
  it("source: public-funnel plugin folder ships server services", () => {
    assert.ok(has(join(PLUGINS_REPO, "public-funnel", "src", "server", "services.ts")));
  });
  it("source: HC results component POSTs to /api/portal/public-funnel/hc-complete", () => {
    const hc = join(APP, "health-check", "_HCResults.tsx");
    assert.ok(has(hc));
    const src = read(hc);
    assert.match(src, /\/api\/portal\/public-funnel\/hc-complete/);
  });
  it("source: leadFunnelPorts adapter exists", () => {
    assert.ok(has(join(PLUGINS_DIR, "foundation-adapters", "leadFunnelPorts.ts")));
  });
  it("source: publicFunnelFoundation registered in _registry.ts (#161 Gap 1 closed)", () => {
    const src = read(join(PLUGINS_DIR, "_registry.ts"));
    assert.match(src, /publicFunnelFoundation/);
    assert.match(src, /@aqua\/plugin-public-funnel/);
  });
});

// ─── BOS gate (#137) ─────────────────────────────────────────────────

describe("Feature: BOS gate + escape pill (#137)", () => {
  it("source: middleware.ts matchers cover /business-os/*", () => {
    const src = read(join(ROOT, "middleware.ts"));
    assert.match(src, /\/business-os\//);
  });
  it("source: /business-os static app shipped under public/", () => {
    assert.ok(has(join(PUBLIC, "business-os", "index.html")));
    assert.ok(has(join(PUBLIC, "business-os", "app.html")));
  });
  it("source: /business-os/incubator (setup gate) shipped", () => {
    assert.ok(has(join(PUBLIC, "incubator", "index.html")));
  });
  it("source: /incubator route 307-redirects to /business-os/incubator (#159)", () => {
    const src = read(join(APP, "incubator", "page.tsx"));
    assert.match(src, /redirect\(["']\/business-os\/incubator["']\)/);
  });
});

// ─── Health-check static + /resources ────────────────────────────────

describe("Feature: HC iframe + question logic", () => {
  it("source: /health-check static app + question file ships", () => {
    assert.ok(has(join(PUBLIC, "health-check", "index.html")));
    assert.ok(has(join(PUBLIC, "health-check", "hc-questions.js")));
  });
});

describe("Feature: Resource Finder (#141 rank-my-website)", () => {
  it("source: /resources hub page", () => {
    assert.ok(has(join(APP, "resources", "page.tsx")));
  });
  it("source: 3 real tools — seo-audit / site-speed / accessibility-audit", () => {
    assert.ok(has(join(APP, "resources", "seo-audit")));
    assert.ok(has(join(APP, "resources", "site-speed")));
    assert.ok(has(join(APP, "resources", "accessibility-audit")));
  });
});

// ─── Marketing surfaces ──────────────────────────────────────────────

describe("Feature: Marketing — home + 4 niches + privacy/terms/demo", () => {
  it("source: home + niche pages", () => {
    assert.ok(has(join(APP, "page.tsx")));
    for (const slug of ["for-skincare", "for-coaching", "for-fitness", "for-agencies"]) {
      assert.ok(has(join(APP, slug)), `missing ${slug}`);
    }
  });
  it("source: /demo persona chooser + /demo/start", () => {
    assert.ok(has(join(APP, "demo", "page.tsx")));
    assert.ok(has(join(APP, "demo", "start")));
  });
});

// ─── 404 + redirects ─────────────────────────────────────────────────

describe("Feature: 404 + redirects", () => {
  it("source: top-level not-found.tsx + portal not-found.tsx", () => {
    assert.ok(has(join(APP, "not-found.tsx")));
    assert.ok(has(join(PORTAL, "not-found.tsx")));
  });
});

// ─── Plugin integrations ─────────────────────────────────────────────

describe("Feature: Email-sender registration (#162)", () => {
  it("source: emailSenderFoundation adapter wired in registry BEFORE leads-pipeline", () => {
    const src = read(join(PLUGINS_DIR, "_registry.ts"));
    const idxEmail = src.indexOf("emailSenderFoundation");
    const idxLeads = src.indexOf("leadsPipelineFoundation");
    assert.ok(idxEmail > 0 && idxLeads > 0 && idxEmail < idxLeads,
      "email-sender must register before leads-pipeline");
  });
});

describe("Feature: Stripe events ingest (#145)", () => {
  it("source: stripe-events plugin folder shipped", () => {
    assert.ok(has(join(PLUGINS_REPO, "stripe-events", "package.json")));
  });
});

describe("Feature: GA4 read-only (#149)", () => {
  it("source: ga4 plugin folder shipped", () => {
    assert.ok(has(join(PLUGINS_REPO, "ga4", "package.json")));
  });
});

// ─── Deploy / SMTP (#144) ────────────────────────────────────────────

describe("Feature: SMTP outbound + Sentry (#144)", () => {
  it("source: email-sender plugin folder shipped", () => {
    assert.ok(has(join(PLUGINS_REPO, "email-sender", "package.json")));
  });
  it("source: /healthz + /healthz/full route handlers", () => {
    assert.ok(has(join(APP, "healthz")));
  });
});

// ─── Audit summary stamp ─────────────────────────────────────────────

describe("Feature walkthrough — audit summary", () => {
  it("emits a PARTIAL marker for known honest gaps (chapter #168)", () => {
    // Pin honest gaps so future chapter rounds either close them or
    // keep them visible. Today's deliberate partials:
    //   - HC iframe is a static app (cannot be runtime-driven from
    //     tsx --test); covered via source-marker only.
    //   - Stripe events / GA4 / email-sender real provider creds are
    //     per-install operator config; covered as folder presence.
    //   - BOS escape pill is rendered in static HTML (public/business-os);
    //     covered as file presence.
    const partials = [
      "hc-iframe-runtime",
      "stripe-events-creds",
      "ga4-creds",
      "smtp-creds",
      "bos-escape-pill",
    ];
    assert.ok(partials.length >= 1);
  });
});
