// Plugin API catch-all dispatcher.
//
// All plugin-contributed API routes live under `/api/portal/<pluginId>/<sub>`.
// We resolve to the matching `PluginApiRoute.handler` from the manifest
// and call it with a `PluginCtx` built from the live session + foundation
// services container.
//
// Tenant scope is inferred:
//   • Pass `?clientId=<id>` (or send it as a header / body) to scope to a
//     specific client.
//   • Otherwise the install resolves at the agency scope.

import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { authErrorResponse, requireSession } from "@/lib/server/auth";
import { resolvePluginApiRoute } from "@/plugins/_routeResolver";
import { FOUNDATION_SERVICES } from "@/plugins/foundation-adapters";
import type { PluginCtx } from "@/plugins/_types";
import { makePluginStorage } from "@/lib/server/pluginStorage";

interface RouteParams {
  params: Promise<{ plugin: string; rest: string[] }>;
}

async function dispatch(req: NextRequest, params: RouteParams["params"], method: string): Promise<Response> {
  await ensureHydrated();

  const { plugin: pluginId, rest } = await params;
  const url = new URL(req.url);
  const queryAgencyId = url.searchParams.get("agencyId") ?? req.headers.get("x-aqua-agency-id") ?? undefined;
  const queryClientId = url.searchParams.get("clientId") ?? req.headers.get("x-aqua-client-id") ?? undefined;

  // R032: peek the route to see if it's flagged `public: true`. We need
  // to resolve at least once before knowing whether session is required;
  // for public routes the agency must come from the URL/headers (no
  // session to fall back on).
  const peekScope = {
    agencyId: queryAgencyId ?? "",
    clientId: queryClientId,
  };
  const peeked = peekScope.agencyId
    ? resolvePluginApiRoute(pluginId, rest, peekScope, method)
    : null;
  const isPublic = peeked?.route.public === true;

  let session: Awaited<ReturnType<typeof requireSession>> | null = null;
  if (!isPublic) {
    try { session = await requireSession(); }
    catch (e) { return authErrorResponse(e); }
  }

  // For client-* roles the URL clientId must match their session's clientId.
  if (session && (session.role.startsWith("client-") || session.role === "freelancer" || session.role === "end-customer")) {
    if (queryClientId && session.clientId && queryClientId !== session.clientId) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
  }
  const scopeAgencyId = session?.agencyId ?? queryAgencyId ?? "";
  const scopeClientId = queryClientId ?? (session?.role.startsWith("client-") ? session.clientId : undefined);

  const resolved = peeked ?? resolvePluginApiRoute(
    pluginId,
    rest,
    { agencyId: scopeAgencyId, clientId: scopeClientId },
    method,
  );
  if (!resolved) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const { route, install } = resolved;

  // Role gate — only when session present (public routes skip).
  if (session) {
    const allowed = route.visibleToRoles ?? route.roles;
    if (allowed && !allowed.includes(session.role)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
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

  return route.handler(req, ctx);
}

export async function GET(req: NextRequest, { params }: RouteParams) { return dispatch(req, params, "GET"); }
export async function POST(req: NextRequest, { params }: RouteParams) { return dispatch(req, params, "POST"); }
export async function PATCH(req: NextRequest, { params }: RouteParams) { return dispatch(req, params, "PATCH"); }
export async function PUT(req: NextRequest, { params }: RouteParams) { return dispatch(req, params, "PUT"); }
export async function DELETE(req: NextRequest, { params }: RouteParams) { return dispatch(req, params, "DELETE"); }
