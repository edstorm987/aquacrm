import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse } from "@/lib/server/auth/auth";
import { buildMetaAuthorizeUrl, createMetaOAuthState, readMetaMessagingConfig } from "@/lib/server/integrations/metaMessaging";
import { ensureHydrated } from "@/server/storage";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";

export async function GET(request: NextRequest) {
  await ensureHydrated();
  let current;
  try {
    current = await requireCurrentWorkspaceElementAccess("staff", "workspace.inbox", "manage");
  } catch (cause) {
    return authErrorResponse(cause);
  }
  const session = current.actor.session;
  const agencyId = current.actor.resourceAgencyId;

  const mode = request.nextUrl.searchParams.get("mode") === "facebook"
    ? "facebook-login" as const
    : "instagram-login" as const;
  const returnUrl = safeReturnUrl(request.nextUrl.searchParams.get("return"));
  const config = readMetaMessagingConfig(agencyId, request.nextUrl.origin);
  if (!config) return redirectWithResult(request, returnUrl, "not-configured");

  const state = createMetaOAuthState({
    agencyId,
    userId: session.userId,
    mode,
    companyId: cleanId(request.nextUrl.searchParams.get("companyId")),
    marketingAssetId: cleanId(request.nextUrl.searchParams.get("marketingAssetId")),
    returnUrl,
  });
  return NextResponse.redirect(buildMetaAuthorizeUrl(config, state, mode), 302);
}

function redirectWithResult(request: NextRequest, returnUrl: string, result: string) {
  const target = new URL(returnUrl, request.nextUrl.origin);
  target.searchParams.set("meta", result);
  return NextResponse.redirect(target, 302);
}

function safeReturnUrl(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//")
    ? value.slice(0, 1_000)
    : "/portal/agency/inbox?view=social";
}

function cleanId(value: string | null): string | undefined {
  return value?.trim().slice(0, 160) || undefined;
}
