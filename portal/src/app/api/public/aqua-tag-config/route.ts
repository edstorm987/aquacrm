import { NextResponse, type NextRequest } from "next/server";

import { ensureHydrated } from "@/server/storage";
import { resolveAgencyByMasterSiteKey } from "@/server/websiteSources";
import { listEnabledInjectionsForHost } from "@/server/websiteInjections";

/**
 * The Aqua Tag fetches its site's injection config here — keyed by its
 * `data-site-key` + the host it is installed on — and injects each tool when its
 * consent category is granted. The response is deliberately not cached: a new
 * page load must see an operator's latest on/off decision. It is CORS-open
 * because the tag calls it cross-origin from whatever site it lives on.
 *
 * Returns only what the tag needs to inject and gate: `{kind, value,
 * consentCategory}`. The values are the providers' **public** ids/keys (they ship
 * in the page's HTML anyway), so nothing here is secret; internal record
 * ids/labels and the owning agency are never exposed. An unknown key or a host
 * with no configured, enabled tools yields an empty list — the safe default.
 *
 * v1 resolves the **master** tag key (the owner's own sites, the primary case);
 * per-client-key sites are a later slice.
 */

const CONFIG_HEADERS = {
  "cache-control": "no-store, max-age=0",
  pragma: "no-cache",
  "access-control-allow-origin": "*",
} as const;

export async function GET(request: NextRequest) {
  await ensureHydrated();
  const params = request.nextUrl.searchParams;
  const key = params.get("key") ?? undefined;
  // The host is the site's own public domain (not sensitive). Prefer the
  // explicit param the tag sends; fall back to the cross-origin request's Origin.
  const host = params.get("host") ?? originHost(request.headers.get("origin"));

  const agencyId = resolveAgencyByMasterSiteKey(key);
  const injections = agencyId
    ? listEnabledInjectionsForHost(agencyId, host).map(injection => ({
        kind: injection.kind,
        value: injection.value,
        consentCategory: injection.consentCategory,
      }))
    : [];

  return NextResponse.json({ injections }, { headers: CONFIG_HEADERS });
}

export function OPTIONS() {
  return new NextResponse(null, {
    headers: { ...CONFIG_HEADERS, "access-control-allow-methods": "GET, OPTIONS" },
  });
}

function originHost(origin: string | null): string | undefined {
  if (!origin) return undefined;
  try { return new URL(origin).host; } catch { return undefined; }
}
