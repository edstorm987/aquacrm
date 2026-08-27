import { NextResponse, type NextRequest } from "next/server";
import { ensurePublicFunnelFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/publicFunnelFoundation";
import { funnelMePort } from "@/built-ins/runtime/foundation-adapters/leadFunnelPorts";
import { getSessionFromRequest, isSessionFresh } from "@/lib/server/auth/auth";
import { ensureHydrated } from "@/server/storage";
import { getUserById } from "@/server/users";

export const runtime = "nodejs";

function contextResponse(context: unknown) {
  return NextResponse.json(
    { ok: true, context },
    { headers: { "cache-control": "private, no-store, max-age=0" } },
  );
}

export async function GET(request: NextRequest) {
  await ensureHydrated({ fresh: true });
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "lead") return contextResponse(null);

  const user = getUserById(session.userId);
  if (!user || user.role !== "lead" || !isSessionFresh(session, user)) {
    return contextResponse(null);
  }

  ensurePublicFunnelFoundationRegistered();
  const context = await funnelMePort.getMeContextByUserId(user.id);
  return contextResponse(context);
}
