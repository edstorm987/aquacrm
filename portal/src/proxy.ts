import { NextResponse, type NextRequest } from "next/server";

import {
  STAFF_WORKSPACE_API_REFUSAL,
  STAFF_WORKSPACE_ROLE,
  isStaffDelegatedAgencyPagePath,
  isStaffWorkspaceApiPath,
} from "@/lib/staffWorkspacePolicy";

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

// The environment freeze is the restore-safe outer wall. It must reject a
// mutating request before route code can reach a provider or a database that is
// outside PortalState. These exact paths remain available so an operator can
// authenticate, inspect, and lift containment; they are not business writes.
const GLOBAL_FREEZE_ESCAPE_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/login/browser",
  "/api/auth/logout",
  "/api/portal/security/actions",
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

export function isOutOfBandWriteFreezeRefusal(input: {
  frozen: string | undefined;
  method: string;
  path: string;
}): boolean {
  if (input.frozen !== "1" || GLOBAL_FREEZE_ESCAPE_PATHS.has(input.path)) return false;
  if (!["GET", "HEAD", "OPTIONS"].includes(input.method.toUpperCase())) return true;
  return PUBLIC_SHOWCASE_MUTATING_GET_ROOTS.some(root => matchesRoot(input.path, root))
    || /^\/api\/portal\/clients\/[^/]+\/radar(?:\/|$)/.test(input.path);
}

/**
 * FAIL CLOSED (assume-breach containment, 2026-09-08). The portal gate used to
 * be conditional on NEXT_PUBLIC_PORTAL_SECURITY alone — unset (or any value
 * but "strict"/"true") switched the /portal cookie gate OFF, in production
 * too. Production is now ALWAYS strict regardless of the env var (NODE_ENV is
 * baked at build, so this is server-controlled and cannot be relaxed by
 * configuration drift). Development keeps the opt-in behaviour. Exported pure
 * so the boot regression suite can prove both halves.
 */
export function isPortalSecurityStrict(nodeEnv: string | undefined, securityEnv: string | undefined): boolean {
  if (nodeEnv === "production") return true;
  return securityEnv === "strict" || securityEnv === "true";
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

// ─── CSRF gate: exact-origin + Fetch Metadata (assume-breach, Phase 4) ──────
//
// COOKIE-AUTHENTICATED browser APIs refuse a cross-site MUTATION. The guarded
// set is every root whose routes authenticate with the `lk_session_v1` cookie:
//   • /api/portal/*  • /api/auth/*  • /api/tenants/*
// The Phase-4 merge exempted /api/tenants believing it token-authenticated; it
// is NOT — ~35 mutating /api/tenants routes gate with requireRole(ForClient)
// on the session cookie, so a cross-site POST to them was a live CSRF hole.
//
// EXEMPT (verified NOT cookie-authenticated — cross-origin by design, each
// authenticates per-request): /api/v1/* (bearer token), /api/public/* (public
// intake incl. brand-enquiry, form-capture, careers), /api/webhooks/* (provider
// callbacks with their own signature), /api/telemetry/* (public collect). These
// are exempt because they are NOT under a guarded root — do not add them.
//
// TWO independent signals, either of which refuses:
//   1. Origin host must equal the request host EXACTLY. Exact-host (not eTLD+1)
//      also refuses a malicious SAME-SITE sibling subdomain
//      (evil.aqua-crm.com ≠ www.aqua-crm.com).
//   2. Fetch Metadata: `Sec-Fetch-Site: cross-site | same-site` is refused
//      outright — this is the browser's own first-party assertion and catches a
//      sibling subdomain even if an Origin were somehow absent.
// A request with NO Origin AND no cross/same-site Fetch-Metadata signal passes:
// non-browser callers (curl, server-to-server, native apps) carry no ambient
// cookie, and SameSite=Lax is the cookie-level backstop we do NOT rely on alone.
// `Origin: null` (sandboxed iframe, opaque origin) is refused on a guarded
// mutation. Exported pure for tests.
const CSRF_GUARDED_API_ROOTS = ["/api/portal/", "/api/auth/", "/api/tenants/", "/api/internal/"] as const;

export function isCrossOriginBrowserMutation(input: {
  method: string;
  path: string;
  origin: string | null;
  host: string | null;
  secFetchSite?: string | null;
}): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(input.method)) return false;
  if (!CSRF_GUARDED_API_ROOTS.some(root => input.path.startsWith(root))) return false;

  // Signal 2 — Fetch Metadata. Modern browsers always send it; a genuine
  // cross-site or same-site (sibling subdomain) request is refused outright.
  const sfs = (input.secFetchSite ?? "").toLowerCase();
  if (sfs === "cross-site" || sfs === "same-site") return true;

  // Signal 1 — exact-origin.
  if (input.origin === "null") return true; // opaque origin (sandboxed iframe)
  if (input.origin !== null) {
    let originHost: string;
    try {
      originHost = new URL(input.origin).host.toLowerCase();
    } catch {
      return true; // malformed Origin on a guarded mutation → refuse
    }
    if (originHost !== (input.host ?? "").toLowerCase()) return true;
  }
  // Origin absent AND Fetch-Metadata is same-origin/none/absent → allow.
  return false;
}

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (isOutOfBandWriteFreezeRefusal({
    frozen: process.env.PORTAL_WRITES_FROZEN,
    method: req.method,
    path,
  })) {
    return NextResponse.json(
      { ok: false, error: "The service is in emergency read-only mode." },
      { status: 503, headers: { "cache-control": "no-store", "retry-after": "60" } },
    );
  }
  // CSRF origin gate — before anything else touches the request.
  if (
    isCrossOriginBrowserMutation({
      method: req.method,
      path,
      origin: req.headers.get("origin"),
      host: req.headers.get("host"),
      secFetchSite: req.headers.get("sec-fetch-site"),
    })
  ) {
    return NextResponse.json(
      { ok: false, error: "Cross-origin request refused." },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }
  // Forward one proxy-owned path header so the nested agency layout can apply
  // the same canonical staff page policy even when framework-private pathname
  // headers are absent. Overwrite, rather than trust, any inbound value.
  const forwardedHeaders = new Headers(req.headers);
  forwardedHeaders.set("x-aqua-route-path", path);
  const next = () => NextResponse.next({ request: { headers: forwardedHeaders } });
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
  // The enumeration itself lives in `@/lib/staffWorkspacePolicy` — one list
  // for the proxy, the shell and the tests, so a surface the employee
  // workspace offers can never be a surface this boundary refuses. Do not
  // re-declare either list here.
  if (payload?.role === STAFF_WORKSPACE_ROLE) {
    if (path.startsWith("/portal/agency") && !isStaffDelegatedAgencyPagePath(path)) {
      const url = req.nextUrl.clone();
      url.pathname = "/portal/team";
      url.search = "";
      return NextResponse.redirect(url);
    }
    if (path.startsWith("/api/portal/") && !isStaffWorkspaceApiPath(path)) {
      return NextResponse.json({ ok: false, error: STAFF_WORKSPACE_API_REFUSAL }, { status: 403 });
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

  if (!isPortalSecurityStrict(process.env.NODE_ENV, process.env.NEXT_PUBLIC_PORTAL_SECURITY)) return next();

  if (!path.startsWith("/portal")) return next();

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

  return next();
}

export const config = {
  matcher: ["/portal/:path*", "/api/:path*"],
};
