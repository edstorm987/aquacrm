import { NextResponse, type NextRequest } from "next/server";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import {
  clearClientTelemetry,
  ensureClientTelemetry,
  resetClientTelemetryKey,
} from "@/lib/server/clients/clientTelemetryService";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

export async function GET(req: NextRequest) {
  try {
    await ensureHydrated();
    const clientId = req.nextUrl.searchParams.get("clientId")?.trim();
    if (!clientId) {
      return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });
    }
    const session = await requireRoleForClient([...AGENCY_ROLES], clientId);
    const telemetry = ensureClientTelemetry(
      session.agencyId,
      clientId,
    );
    if (!telemetry) {
      return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, telemetry });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureHydrated();
    const body = await req.json().catch(() => null) as {
      clientId?: string;
      action?: "reset-key" | "clear-events";
    } | null;
    if (!body?.clientId || !body.action) {
      return NextResponse.json({ ok: false, error: "clientId and action required" }, { status: 400 });
    }
    const session = await requireRoleForClient([...AGENCY_ROLES], body.clientId);
    const telemetry = body.action === "reset-key"
      ? resetClientTelemetryKey(session.agencyId, body.clientId)
      : body.action === "clear-events"
        ? clearClientTelemetry(session.agencyId, body.clientId)
        : null;
    if (!telemetry) {
      return NextResponse.json({ ok: false, error: "invalid action or client not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, telemetry });
  } catch (error) {
    return authErrorResponse(error);
  }
}
