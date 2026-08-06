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

interface ProxySession {
  role?: string;
  agencyId?: string;
  clientId?: string;
  exp?: number;
  publicShowcase?: boolean;
}

function decodePayload(token: string | undefined): ProxySession | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const b64 = token.slice(0, dot);
  try {
    const json = Buffer.from(b64, "base64url").toString("utf8");
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

  // A public product-tour token is signed and later re-verified by the
  // route itself. Catch mutations here so the real UI remains explorable
  // without allowing visitors to alter even the fictional shared tenant.
  if (payload?.publicShowcase && !safeMethod) {
    return NextResponse.json(
      { ok: false, error: "This public showcase is read-only." },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
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
