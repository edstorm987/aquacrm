import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { listActivity } from "@/server/activity";
import { getSessionFromRequest } from "@/lib/server/auth/auth";
import { AGENCY_ROLES } from "@/server/types";

export async function GET(req: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(req);
  if (!session || !AGENCY_ROLES.includes(session.role)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const clientId = url.searchParams.get("clientId") ?? undefined;
  const entries = listActivity({
    agencyId: session.agencyId,
    clientId,
    limit: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : 50,
  });

  return NextResponse.json({ ok: true, entries });
}
