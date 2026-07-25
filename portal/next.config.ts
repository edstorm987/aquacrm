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
      // /embed/login must be iframe-able by client-owned domains.
      "frame-src 'self' https:",
      "frame-ancestors 'self' https:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Anchor Turbopack + output-file tracing at this app root for Vercel.
  outputFileTracingRoot: new URL(".", import.meta.url).pathname,
  turbopack: {
    root: new URL(".", import.meta.url).pathname,
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
