import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

// Real filesystem path of this app root. `new URL(".", import.meta.url).pathname`
// percent-encodes spaces (this project lives under ".../Web Development/...").
// `fileURLToPath` keeps output tracing and optional Turbopack use anchored to the
// real path. The main port-3032 development scripts now use Turbopack's persistent
// cache; explicit Webpack fallbacks remain in package.json, and production builds
// stay on Webpack until the separate build contract is migrated and accepted.
const APP_ROOT = fileURLToPath(new URL(".", import.meta.url));

// Dev Team deliberately inspects the checked-in project rather than only the
// JavaScript chunks Next produces. Vercel's output tracing cannot infer these
// dynamic `process.cwd()` reads, so include the bounded source/documentation
// trees for the internal routes that need them. The Library scans Markdown and
// the Dev Team's authored artifacts live under docs/. Production source editing
// is GitHub-backed, so shipping every TS/TSX file and every test script into
// every function is both unnecessary and extremely expensive. In particular,
// those broad globs made one isolated build directory exceed 7 GiB and made the
// shared dev server rebuild while workers edited source. Keep this list at the
// runtime data boundary, not the repository boundary.
const DEV_TEAM_RUNTIME_FILES = [
  "./*.md",
  "./docs/**/*",
  "./scripts/**/*.md",
  "./src/**/*.md",
];

// Output tracing is a deployment-packaging concern. Supplying thousands of
// traced data files to the dev compiler makes ordinary worker edits invalidate
// a huge graph even though local Dev Team reads go straight to the working tree.
const DEV_TEAM_OUTPUT_TRACING: NextConfig["outputFileTracingIncludes"] =
  process.env.NODE_ENV === "production"
    ? {
        "/portal/dev-team/**": DEV_TEAM_RUNTIME_FILES,
        "/portal/agency/dev-docs": DEV_TEAM_RUNTIME_FILES,
        "/api/portal/dev-team/**": DEV_TEAM_RUNTIME_FILES,
        "/api/portal/dev/**": DEV_TEAM_RUNTIME_FILES,
      }
    : undefined;

// The supervised repository preview chooses an ephemeral loopback port. Both
// the host editor and a previewed Next app need to permit that local frame:
// `frame-src` lets AquaCRM load it, while `frame-ancestors` lets an AquaCRM
// project running in the preview process be embedded by the editor on :3032.
// Production keeps the strict self/HTTPS policy and never receives this
// loopback exception.
const DEV_LOOPBACK_FRAME_SOURCES = process.env.NODE_ENV === "production"
  ? ""
  : " http://localhost:* http://127.0.0.1:*";

// Strict by default. We do NOT use `eslint.ignoreDuringBuilds` or
// `typescript.ignoreBuildErrors` — every build runs the full ESLint +
// TS gate. If a warning needs suppressing, fix the code or carve out a
// scoped override in eslint.config.mjs.

// `'unsafe-eval'` is a DEV need, not a production one.
//
// Webpack's dev runtime and React Refresh evaluate code at runtime, so the dev
// server genuinely needs it. A production Next build does not, and leaving it in
// the shipped policy is not a small thing: together with `'unsafe-inline'` it
// removes most of what CSP is FOR. An injected string that reaches a sink can
// execute, which is the exact class of bug a Content-Security-Policy exists to
// contain.
//
// Split rather than deleted, because deleting it outright would have broken the
// dev server the moment anybody ran it (2026-08-27, Phase D header audit).
// Assume-breach containment (Phase 0-C): the broad `https:` source is REMOVED
// from script-src. It let a stored/injected `<script src="https://evil.example/…">`
// load and run from ANY https origin — the exact escalation CSP exists to stop.
// Scripts are now `'self'` only (plus the CDNs the app genuinely loads, if any
// are added later, pinned by host). `'unsafe-inline'` remains until the
// nonce/hash migration lands (tracked PARTIAL): that migration must thread a
// per-request nonce through the layouts' inline scripts, which is a larger,
// separately-tested change — but narrowing script hosts is the higher-value
// half and ships now. `'unsafe-eval'` stays dev-only.
// AUTH-001: the managed bot-challenge (Cloudflare Turnstile) loads its widget
// script from this ONE pinned host — the sanctioned "CDNs the app genuinely
// loads, pinned by host" extension referenced above. The widget's own iframe
// and network calls are already covered by `frame-src https:` / `connect-src
// https:` below. No wildcard is added; if Turnstile is not configured the host
// is simply unused. Kept in both variants so the dev widget renders too.
const TURNSTILE_SCRIPT_HOST = "https://challenges.cloudflare.com";
const SCRIPT_SRC = process.env.NODE_ENV === "production"
  ? `script-src 'self' 'unsafe-inline' ${TURNSTILE_SCRIPT_HOST}`
  : `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${TURNSTILE_SCRIPT_HOST}`;

const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      SCRIPT_SRC,
      "style-src 'self' 'unsafe-inline' https:",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "font-src 'self' data: https:",
      "connect-src 'self' https: wss:",
      // Aqua embeds and branded sign-in surfaces are hosted in client-owned portals.
      `frame-src 'self'${DEV_LOOPBACK_FRAME_SOURCES} https:`,
      // Assume-breach containment (Phase 0-C): frame-ancestors narrowed from
      // `https:` (which let ANY https site frame the authenticated portal — a
      // clickjacking surface) to 'self' only. The editor previews same-origin
      // content, so 'self' is sufficient; the dev-loopback exception stays.
      `frame-ancestors 'self'${DEV_LOOPBACK_FRAME_SOURCES}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Dev-only: lets a verification browser reach this dev server as 127.0.0.1.
  // localhost and 127.0.0.1 are different origins to Next's dev-asset guard,
  // and different COOKIE JARS to the browser — which is exactly why the
  // automated browser walk uses 127.0.0.1: it cannot collide with the live
  // localhost:3051 session. Ignored in production builds.
  allowedDevOrigins: ["127.0.0.1"],

  reactStrictMode: true,
  // Per-process build dir. Two dev servers sharing one `.next` fight over the
  // same compiler output and lock files (that's what left a stale folder-lock
  // and wedged :3032 before). `NEXT_DIST_DIR` gives a parallel worker its own
  // build output; unset → the normal `.next`, so nothing existing changes.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // A supervised local preview uses a child-lifetime generated tsconfig outside
  // its disposable build directory. It extends the checked-in configuration,
  // while Next treats the shim as the selected config and leaves the real
  // tsconfig untouched when a preview gets project/realm-specific output.
  typescript: {
    tsconfigPath: process.env.NEXT_TYPESCRIPT_CONFIG_PATH || "tsconfig.json",
  },
  experimental: {
    // Rewrite named imports from these barrels into direct per-module imports
    // so a page that uses six icons doesn't pull the whole library into its
    // chunk. `lucide-react` is imported by nearly every surface here (the
    // command centre alone names ~40 icons), so this trims every route.
    // Behaviour is identical — it only changes how the import is resolved.
    optimizePackageImports: ["lucide-react"],
    // Lower Webpack's peak build memory: frees per-module cached source/AST once
    // a module is sealed instead of retaining the whole graph. Trades a little
    // build time for a lower memory ceiling. Behaviour of the output is unchanged.
    webpackMemoryOptimizations: true,
    // Client Router Cache reuse. Next 16 defaults the dynamic staleTime to 0, so
    // every back/forward or quick re-visit to a /portal route refetches the whole
    // RSC from the (cross-region) origin and re-hydrates. A short window makes the
    // click-around pattern instant. This cache is per-browser and client-side —
    // never shared across users — so there is no tenancy/RLS risk; a hard reload
    // is always fresh, and a soft revisit may show data up to `dynamic` seconds old.
    staleTimes: { dynamic: 30, static: 300 },
  },
  // Anchor optional Turbopack use + output-file tracing at this app root for Vercel.
  outputFileTracingRoot: APP_ROOT,
  outputFileTracingIncludes: DEV_TEAM_OUTPUT_TRACING,
  turbopack: {
    root: APP_ROOT,
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/",
          destination: "/aquacrm-site/index.html",
        },
        {
          source: "/projects",
          destination: "/aquacrm-site/projects/index.html",
        },
        {
          source: "/projects/",
          destination: "/aquacrm-site/projects/index.html",
        },
        {
          source: "/privacy",
          destination: "/aquacrm-site/privacy/index.html",
        },
        {
          source: "/privacy/",
          destination: "/aquacrm-site/privacy/index.html",
        },
        {
          source: "/contact",
          destination: "/aquacrm-site/contact/index.html",
        },
        {
          source: "/contact/",
          destination: "/aquacrm-site/contact/index.html",
        },
        {
          source: "/styles.css",
          destination: "/aquacrm-site/styles.css",
        },
        {
          source: "/site-experience.js",
          destination: "/aquacrm-site/site-experience.js",
        },
        {
          source: "/projects.js",
          destination: "/aquacrm-site/projects.js",
        },
        {
          source: "/assets/:path*",
          destination: "/aquacrm-site/assets/:path*",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
