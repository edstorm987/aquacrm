import { NextResponse, type NextRequest } from "next/server";

// Edge proxy (Next 16 renamed `middleware.ts` → `proxy.ts`). Two jobs:
//   1. Gate `/portal/*` behind an `lk_session_v1` cookie (presence-only;
//      full HMAC + role check happens server-side in the route handlers).
//   2. Enforce tenant-scope match — if the URL says
//      `/portal/clients/<X>/...`, decode the cookie payload and refuse if
//      the session's `clientId` is set to something else (cross-tenant
//      defense in depth — the page component also checks).
//
// Edge runtime can't reach our cloud storage. The cookie's signature is
// verified the way `verifyToken` does — but we keep the imports edge-safe
// (no fs/crypto.scrypt, only crypto.subtle via WebCrypto). Edge here uses
// node:crypto via the Node 22 edge polyfill that Next 16 ships.

const COOKIE = "lk_session_v1";

// A public showcase session must never trap a real user outside their own
// workspace. These routes only replace or clear authentication state; they do
// not mutate CRM records. Keep this list exact so every business API remains
// read-only while the public showcase token is active.
const PUBLIC_SHOWCASE_SESSION_ESCAPE_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/login/browser",
  "/api/auth/logout",
]);

// A signed private sandbox may always change environment or return to live
// state, even when its current access policy is read-only.
const SANDBOX_SESSION_ESCAPE_PATHS = new Set([
  "/api/auth/sandbox-mode",
  "/api/auth/logout",
]);

// GET is safe from mutation, but not automatically safe from disclosure. A
// public product-tour token may explore the fictional CRM; it may not browse
// this repository, internal Dev Team material, workspace settings or the
// source/editor APIs behind those tools. Leaf routes still re-check access —
// this proxy list is the fast optimistic boundary, not the only boundary.
const PUBLIC_SHOWCASE_PRIVATE_PAGE_ROOTS = [
  "/portal/dev-team",
  "/portal/dev-workspace",
  "/portal/agency/dev-docs",
  "/portal/agency/development/code",
  "/portal/agency/settings",
] as const;

const PUBLIC_SHOWCASE_AGENCY_PAGE_ROOTS = [
  "/portal/agency/inbox",
  "/portal/agency/operations",
  "/portal/agency/tools",
  "/portal/agency/marketing",
  "/portal/agency/fulfilment",
  "/portal/agency/battle",
  "/portal/agency/radar",
  "/portal/agency/sops",
  "/portal/agency/sop-library",
  "/portal/agency/company",
] as const;

const PUBLIC_SHOWCASE_PRIVATE_API_ROOTS = [
  "/api/portal/access",
  "/api/portal/dev",
  "/api/portal/dev-team",
  "/api/portal/site-editor/files",
] as const;

// These endpoints perform work despite using GET (OAuth hand-offs, cron/sweep
// entry points, materialising reads and APIs that mark/touch state). Method-
// only protection cannot describe that. A public showcase token is refused by
// operation before any route code runs.
const PUBLIC_SHOWCASE_MUTATING_GET_ROOTS = [
  "/api/auth/oauth/google/callback",
  "/api/cron",
  "/api/internal/sweep",
  "/api/v1",
  "/api/portal/advisor/radar",
  "/api/portal/attention",
  "/api/portal/automations",
  "/api/portal/calendar/google",
  "/api/portal/client-portal-design",
  "/api/portal/development",
  "/api/portal/inbox/meta",
  "/api/portal/notifications",
  "/api/portal/products",
  "/api/portal/team-chat",
  "/api/portal/website",
  "/api/portal/website-sources",
  "/api/tenants/client-telemetry",
] as const;

function matchesRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

interface ProxySession {
  role?: string;
  agencyId?: string;
  clientId?: string;
  exp?: number;
  publicShowcase?: boolean;
  sandbox?: {
    access?: "read-only" | "writable";
  };
}

function decodePayload(token: string | undefined): ProxySession | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const b64 = token.slice(0, dot);
  try {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const decoded: number[] = [];
    let accumulator = 0;
    let bitCount = 0;
    for (const character of b64) {
      const value = alphabet.indexOf(character);
      if (value < 0) throw new Error("Invalid base64url payload");
      accumulator = (accumulator << 6) | value;
      bitCount += 6;
      if (bitCount >= 8) {
        bitCount -= 8;
        decoded.push((accumulator >>> bitCount) & 0xff);
        accumulator &= bitCount ? (1 << bitCount) - 1 : 0;
      }
    }
    const bytes = Uint8Array.from(decoded);
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as ProxySession;
  } catch {
    return null;
  }
}

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const token = req.cookies.get(COOKIE)?.value;
  const payload = decodePayload(token);
  const safeMethod = ["GET", "HEAD", "OPTIONS"].includes(req.method);
  const publicShowcaseSessionEscape = PUBLIC_SHOWCASE_SESSION_ESCAPE_PATHS.has(path);
  const sandboxSessionEscape = SANDBOX_SESSION_ESCAPE_PATHS.has(path);
  const privateReadOnlySandbox = payload?.publicShowcase !== true && payload?.sandbox?.access === "read-only";

  // Staff identities use the deliberately scoped Team workspace. Keep
  // owner agency pages and unrelated agency APIs out of their blast radius
  // even when PORTAL_SECURITY is relaxed in local development. Staff and
  // Fulfilment are the migration exceptions: their leaf pages and APIs enforce
  // the canonical element grant, so an explicitly delegated person can mount
  // them without opening the rest of the agency shell.
  if (payload?.role === "agency-staff") {
    const delegatedAgencyPageRoots = [
      "/portal/agency/people",
      "/portal/agency/fulfilment",
      "/portal/agency/portals",
    ];
    if (path.startsWith("/portal/agency")
      && !delegatedAgencyPageRoots.some(root => path === root || path.startsWith(`${root}/`))) {
      const url = req.nextUrl.clone();
      url.pathname = "/portal/team";
      url.search = "";
      return NextResponse.redirect(url);
    }
    if (path.startsWith("/api/portal/")) {
      const staffApiRoots = [
        "/api/portal/access",
        "/api/portal/dev",
        "/api/portal/site-editor/files",
        "/api/portal/dashboard-planning",
        "/api/portal/tasks",
        "/api/portal/calendar",
        "/api/portal/people",
        "/api/portal/notepad",
        "/api/portal/team-chat",
        "/api/portal/pipelines/move-client",
        "/api/portal/products",
        "/api/portal/aqua-tags/detect",
        "/api/portal/website-sources",
        "/api/portal/website-injections",
      ];
      if (!staffApiRoots.some(root => path === root || path.startsWith(`${root}/`))) {
        return NextResponse.json({ ok: false, error: "This API is not available in the employee workspace." }, { status: 403 });
      }
    }
  }

  // A public product-tour token is signed and later re-verified by the
  // route itself. Catch mutations here so the real UI remains explorable
  // without allowing visitors to alter even the fictional shared tenant.
  if (payload?.publicShowcase && !safeMethod && !publicShowcaseSessionEscape) {
    return NextResponse.json(
      { ok: false, error: "This public showcase is read-only." },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }

  if (privateReadOnlySandbox && !safeMethod && !sandboxSessionEscape) {
    return NextResponse.json(
      { ok: false, error: "This sandbox is read-only. Change its access policy in Settings → Environment." },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }

  if (privateReadOnlySandbox) {
    const mutatingGet = safeMethod && (
      PUBLIC_SHOWCASE_MUTATING_GET_ROOTS.some(root => matchesRoot(path, root))
      || /^\/api\/portal\/clients\/[^/]+\/radar(?:\/|$)/.test(path)
    );
    if (mutatingGet) {
      return NextResponse.json(
        { ok: false, error: "This operation is unavailable while the sandbox is read-only." },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }
  }

  if (payload?.publicShowcase) {
    const mutatingGet = safeMethod && (
      PUBLIC_SHOWCASE_MUTATING_GET_ROOTS.some(root => matchesRoot(path, root))
      || /^\/api\/portal\/clients\/[^/]+\/radar(?:\/|$)/.test(path)
    );
    if (mutatingGet) {
      return NextResponse.json(
        { ok: false, error: "This operation is not available in the read-only public showcase." },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }
    const unsupportedAgencyPage = path.startsWith("/portal/agency/")
      && !PUBLIC_SHOWCASE_AGENCY_PAGE_ROOTS.some(root => matchesRoot(path, root));
    if (unsupportedAgencyPage || PUBLIC_SHOWCASE_PRIVATE_PAGE_ROOTS.some(root => matchesRoot(path, root))) {
      const url = req.nextUrl.clone();
      url.pathname = "/portal/agency";
      url.search = "";
      return NextResponse.redirect(url);
    }
    if (PUBLIC_SHOWCASE_PRIVATE_API_ROOTS.some(root => matchesRoot(path, root))) {
      return NextResponse.json(
        { ok: false, error: "This internal surface is not part of the public showcase." },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }
  }

  const env = process.env.NEXT_PUBLIC_PORTAL_SECURITY;
  const isStrict = env === "strict" || env === "true";
  if (!isStrict) return NextResponse.next();

  if (!path.startsWith("/portal")) return NextResponse.next();

  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Best-effort tenant-scope check based on the un-verified payload. The
  // signature is re-verified server-side; this catches obvious cross-
  // tenant probes early. URL pattern: `/portal/clients/<clientId>/...`.
  const match = /^\/portal\/clients\/([^/]+)/.exec(path);
  if (match) {
    const urlClientId = match[1];
    if (payload && (payload.exp ?? 0) < Math.floor(Date.now() / 1000)) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", path);
      return NextResponse.redirect(url);
    }
    if (payload?.role?.startsWith("client-") && payload.clientId && payload.clientId !== urlClientId) {
      // 403 — wrong client. Send to /portal so the role-aware redirect
      // can route them to their own scope.
      const url = req.nextUrl.clone();
      url.pathname = "/portal";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/portal/:path*", "/api/:path*"],
};
