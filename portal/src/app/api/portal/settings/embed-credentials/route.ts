import { NextResponse, type NextRequest } from "next/server";

import { AuthError, requireRole } from "@/lib/server/auth/auth";
import { requireCsrf } from "@/lib/server/auth/csrf";
import {
  createEmbedCredential,
  listEmbedCredentials,
  normaliseEmbedOrigin,
  readBoundedEmbedJson,
  revokeEmbedCredential,
} from "@/lib/server/embedCredentialAuthority";
import { ensureHydrated } from "@/server/storage";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import { getClientForAgency } from "@/server/tenants";

export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}
export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    return json({ ok: true, credentials: listEmbedCredentials(session.agencyId) });
  } catch (error) {
    if (error instanceof AuthError) return json({ ok: false, error: "Unauthorised." }, error.status);
    return json({ ok: false, error: "Embed credentials are temporarily unavailable." }, 503);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    if (request.headers.get("origin") !== request.nextUrl.origin) {
      return json({ ok: false, error: "This request could not be verified." }, 403);
    }
    const csrf = requireCsrf(request);
    if (!csrf.ok) return json({ ok: false, error: csrf.error }, 403);
    const parsed = await readBoundedEmbedJson(request);
    if (!parsed.ok) return json({ ok: false, error: "Invalid credential request." }, parsed.status);
    const action = parsed.value.action;

    if (action === "create") {
      const clientId = typeof parsed.value.clientId === "string" ? parsed.value.clientId.trim().slice(0, 160) : "";
      const maxMode = parsed.value.maxMode;
      if (maxMode !== "client" && maxMode !== "admin") {
        return json({ ok: false, error: "Choose a valid maximum mode." }, 400);
      }
      if (clientId && !getClientForAgency(session.agencyId, clientId)) {
        return json({ ok: false, error: "Choose a client in this workspace." }, 400);
      }
      const allowedOriginRaw = typeof parsed.value.allowedOrigin === "string"
        ? parsed.value.allowedOrigin.trim().slice(0, 500)
        : "";
      if (allowedOriginRaw && !normaliseEmbedOrigin(allowedOriginRaw)) {
        return json({ ok: false, error: "Use one exact HTTPS origin, without a path, query or credentials." }, 400);
      }
      const created = await withPortalStateTransaction(`aqua-embed-credentials:${session.agencyId}`, () => {
        if (clientId && !getClientForAgency(session.agencyId, clientId)) throw new Error("embed_client_not_found");
        return createEmbedCredential({
          agencyId: session.agencyId,
          clientId: clientId || undefined,
          label: typeof parsed.value.label === "string" ? parsed.value.label : undefined,
          maxMode,
          allowedOrigin: allowedOriginRaw || undefined,
          actorUserId: session.userId,
        });
      });
      return json({ ok: true, credential: created.credential, secret: created.secret }, 201);
    }

    if (action === "revoke") {
      const credentialId = typeof parsed.value.credentialId === "string"
        ? parsed.value.credentialId.trim().slice(0, 160)
        : "";
      if (!credentialId) return json({ ok: false, error: "Choose a credential to revoke." }, 400);
      await withPortalStateTransaction(`aqua-embed-credentials:${session.agencyId}`, () => {
        revokeEmbedCredential({ agencyId: session.agencyId, credentialId, actorUserId: session.userId });
      });
      return json({ ok: true, credentials: listEmbedCredentials(session.agencyId) });
    }

    return json({ ok: false, error: "Unsupported credential action." }, 400);
  } catch (error) {
    if (error instanceof AuthError) return json({ ok: false, error: "Unauthorised." }, error.status);
    const code = error instanceof Error ? error.message : "";
    if (code === "embed_client_not_found" || code === "embed_credential_not_found") {
      return json({ ok: false, error: "The scoped credential could not be found." }, 404);
    }
    if (code === "embed_origin_invalid") {
      return json({ ok: false, error: "Use one exact HTTPS origin." }, 400);
    }
    return json({ ok: false, error: "Embed credential changes could not be saved." }, 503);
  }
}
