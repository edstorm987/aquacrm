import type { NextConfig } from "next";

// Strict by default. We do NOT use `eslint.ignoreDuringBuilds` or
// `typescript.ignoreBuildErrors` — every build runs the full ESLint +
// TS gate. If a warning needs suppressing, fix the code or carve out a
// scoped override in eslint.config.mjs.

const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
      "style-src 'self' 'unsafe-inline' https:",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "font-src 'self' data: https:",
      "connect-src 'self' https: wss:",
      // Aqua embeds and branded sign-in surfaces are hosted in client-owned portals.
      `frame-src 'self'${process.env.NODE_ENV === "production" ? "" : " http://localhost:3030 http://localhost:3031 http://localhost:3033 http://localhost:3034 http://localhost:3035 http://localhost:3036 http://localhost:3037"} https:`,
      `frame-ancestors 'self'${process.env.NODE_ENV === "production" ? "" : " http://localhost:3030 http://localhost:3031 http://localhost:3033 http://localhost:3034 http://localhost:3035 http://localhost:3036 http://localhost:3037"} https:`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Per-process build dir. Two dev servers sharing one `.next` fight over the
  // same compiler output and lock files (that's what left a stale folder-lock
  // and wedged :3032 before). `NEXT_DIST_DIR` gives a parallel worker its own
  // build output; unset → the normal `.next`, so nothing existing changes.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // Rewrite named imports from these barrels into direct per-module imports
    // so a page that uses six icons doesn't pull the whole library into its
    // chunk. `lucide-react` is imported by nearly every surface here (the
    // command centre alone names ~40 icons), so this trims every route.
    // Behaviour is identical — it only changes how the import is resolved.
    optimizePackageImports: ["lucide-react"],
  },
  // Anchor Turbopack + output-file tracing at this app root for Vercel.
  outputFileTracingRoot: new URL(".", import.meta.url).pathname,
  turbopack: {
    root: new URL(".", import.meta.url).pathname,
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
