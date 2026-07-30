import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/server/auth";
import {
  buildExternalAssistantContext,
  EXTERNAL_ASSISTANT_MODULES,
} from "@/lib/server/externalAssistantApi";
import { logActivity } from "@/server/activity";
import { ensureHydrated, getState } from "@/server/storage";

const ALLOWED_ROLES = new Set(["agency-owner", "agency-manager"]);

export async function GET(req: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(req);
  if (!session || !ALLOWED_ROLES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({ ok: true, connection: connectionStatus(session.agencyId) }, {
    headers: { "cache-control": "private, no-store" },
  });
}

export async function POST(req: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(req);
  if (!session || !ALLOWED_ROLES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) {
    return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
  }

  const status = connectionStatus(session.agencyId);
  if (!status.ready) {
    return NextResponse.json({
      ok: false,
      error: status.tokenConfigured
        ? "The configured AI agency does not match this workspace."
        : "Add MILESYMEDIA_ASSISTANT_API_TOKEN to the deployment environment, then restart or redeploy.",
      connection: status,
    }, { status: 409 });
  }

  const context = buildExternalAssistantContext(session.agencyId);
  logActivity({
    agencyId: session.agencyId,
    actorUserId: session.userId,
    actorEmail: session.email,
    category: "integrations",
    action: "external_ai.connection_tested",
    message: "Tested the external AI data connection.",
    metadata: {
      modules: context.modules.length,
      records: context.modules.reduce((total, module) => total + module.recordCount, 0),
    },
  });
  return NextResponse.json({
    ok: true,
    connection: status,
    testedAt: new Date().toISOString(),
    moduleCount: context.modules.length,
    recordCount: context.modules.reduce((total, module) => total + module.recordCount, 0),
  });
}

function connectionStatus(sessionAgencyId: string) {
  const token = process.env.MILESYMEDIA_ASSISTANT_API_TOKEN?.trim() ?? "";
  const agencyId = process.env.MILESYMEDIA_ASSISTANT_AGENCY_ID?.trim() || "milesymedia";
  const agencyExists = Boolean(getState().agencies[agencyId]);
  const tokenStrongEnough = token.length >= 32;
  const tokenConfigured = token.length > 0;
  return {
    ready: tokenConfigured && tokenStrongEnough && agencyExists && agencyId === sessionAgencyId,
    readOnly: true,
    tokenConfigured,
    tokenStrongEnough,
    tokenFingerprint: token ? crypto.createHash("sha256").update(token).digest("hex").slice(0, 12) : null,
    agencyId,
    agencyExists,
    agencyMatchesWorkspace: agencyId === sessionAgencyId,
    modules: EXTERNAL_ASSISTANT_MODULES,
  };
}
