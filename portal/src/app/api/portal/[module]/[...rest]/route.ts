// Built-in module API catch-all dispatcher.
//
// All built-in module API routes live under `/api/portal/<moduleId>/<sub>`.
// We resolve to the matching route handler from the manifest
// and call it with a `PluginCtx` built from the live session + foundation
// services container.
//
// Tenant scope is decided by `resolveApiTenantScope` — see
// `@/lib/server/portal/apiTenantScope`, which carries the whole argument:
//   • A signed-in caller is scoped by their SESSION. `?agencyId=` may only
//     name an agency inside their own membership; naming anyone else is a 403,
//     not a change of scope.
//   • `?clientId=` selects the install within that agency. Client-side roles
//     are pinned to their own client; agency-side roles may only name a client
//     their agency owns.
//   • Only a `public: true` route (webhooks, the funnel capture) takes its
//     tenant from the URL, because it has no session to take it from.

import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { authErrorResponse, requireSession } from "@/lib/server/auth/auth";
import { resolvePluginApiRoute } from "@/built-ins/runtime/_routeResolver";
import { apiRouteAllowsRole } from "@/built-ins/runtime/_pageScope";
import { FOUNDATION_SERVICES } from "@/built-ins/runtime/foundation-adapters";
import type { PluginCtx } from "@/built-ins/runtime/_types";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { clientIdFromPortalReferer } from "@/lib/server/pluginRequestScope";
import { resolveApiTenantScope, tenantScopeSession } from "@/lib/server/portal/apiTenantScope";
import { getClient } from "@/server/tenants";

interface RouteParams {
  params: Promise<{ module: string; rest: string[] }>;
}

async function dispatch(req: NextRequest, params: RouteParams["params"], method: string): Promise<Response> {
  await ensureHydrated({ fresh: true });

  const { module: moduleId, rest } = await params;
  const url = new URL(req.url);
  const queryAgencyId = url.searchParams.get("agencyId") ?? req.headers.get("x-aqua-agency-id") ?? undefined;
  const queryClientId = url.searchParams.get("clientId")
    ?? req.headers.get("x-aqua-client-id")
    ?? clientIdFromPortalReferer(req.url, req.headers.get("referer"));

  // R032: peek the route to see if it's flagged `public: true`. We have to
  // resolve once before we can know whether a session is required — a Stripe
  // webhook has none, and for it the agency can only come from the URL.
  //
  // The peek answers THAT QUESTION AND NOTHING ELSE. It used to be reused as
  // the authoritative resolution (`const resolved = peeked ?? …`), which made
  // an attacker-supplied `?agencyId=` the tenant for every route, public or
  // not: an agency-owner in A POSTing `/api/portal/agency-hr/staff?agencyId=B`
  // got `201 { agencyId: "B" }` and could read it back, while their own agency
  // listed empty. `route.public` does not depend on the install, so asking the
  // peek only for the flag costs nothing and cannot be spoofed.
  const peeked = queryAgencyId
    ? resolvePluginApiRoute(moduleId, rest, { agencyId: queryAgencyId, clientId: queryClientId }, method)
    : null;
  const isPublic = peeked?.route.public === true;

  let session: Awaited<ReturnType<typeof requireSession>> | null = null;
  if (!isPublic) {
    try { session = await requireSession(); }
    catch (e) { return authErrorResponse(e); }
  }

  // TENANCY. The session decides, unless there is no session to decide with.
  const scope = resolveApiTenantScope({
    session: session ? tenantScopeSession(session) : null,
    queryAgencyId,
    queryClientId,
    isPublic,
    clientOwner: (clientId) => getClient(clientId)?.agencyId ?? null,
  });
  if (!scope.ok) {
    return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
  }
  const scopeAgencyId = scope.agencyId;
  const scopeClientId = scope.clientId;

  const resolved = resolvePluginApiRoute(
    moduleId,
    rest,
    { agencyId: scopeAgencyId, clientId: scopeClientId },
    method,
  );
  if (!resolved) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const { plugin, route, install } = resolved;

  // Role gate — only when session present (public routes skip).
  //
  // This used to be `route.visibleToRoles ?? route.roles`, which meant a route
  // that declared nothing answered anyone holding a session — and 133 of the
  // 312 registered routes declare nothing. The page layer stopped trusting
  // that fallback on 22 Aug 2026; the API that backs those same pages kept it,
  // so a closed page's writes stayed open. `apiRouteAllowsRole` applies the
  // same shape here: the route's surfaces come from the owning plugin, an
  // undeclared route inherits the ceiling instead of the door, a declared one
  // intersects it, and where a route hangs off a page's path that page's gate
  // IS the ceiling — so no route can be wider than the page it backs.
  if (session && !apiRouteAllowsRole(plugin, route, session.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  // Feature gate.
  if (route.requiresFeature && !install.features[route.requiresFeature]) {
    return NextResponse.json({ ok: false, error: "feature_disabled" }, { status: 404 });
  }

  const ctx: PluginCtx = {
    agencyId: install.agencyId,
    clientId: install.clientId ?? scopeClientId,
    install,
    storage: makePluginStorage(install.id),
    services: FOUNDATION_SERVICES,
    actor: session?.userId ?? "anonymous",
  };

  const response = await route.handler(req, ctx);
  if (method !== "GET") {
    try {
      await flushPendingWrites();
    } catch (error) {
      console.error(
        `[portal] ${moduleId}/${rest.join("/")} could not be persisted:`,
        error instanceof Error ? error.message : error,
      );
      return NextResponse.json(
        { ok: false, error: "storage_unavailable", message: "The change could not be saved. Please try again." },
        { status: 503 },
      );
    }
  }
  return response;
}

export async function GET(req: NextRequest, { params }: RouteParams) { return dispatch(req, params, "GET"); }
export async function POST(req: NextRequest, { params }: RouteParams) { return dispatch(req, params, "POST"); }
export async function PATCH(req: NextRequest, { params }: RouteParams) { return dispatch(req, params, "PATCH"); }
export async function PUT(req: NextRequest, { params }: RouteParams) { return dispatch(req, params, "PUT"); }
export async function DELETE(req: NextRequest, { params }: RouteParams) { return dispatch(req, params, "DELETE"); }
