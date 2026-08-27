import { NextResponse } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { AGENCY_ROLES } from "@/server/types";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { logActivity } from "@/server/activity";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

const NOTE_KEYS = ["notes", "sessionNotes", "meetingNotes", "supportNotes"] as const;

export async function POST(request: Request) {
  await ensureHydrated();
  const body = await request.json().catch(() => null) as { clientId?: unknown; notes?: Record<string, unknown> } | null;
  const clientId = clean(body?.clientId, 120);
  if (!clientId || !body?.notes) return NextResponse.json({ ok: false, error: "clientId and notes required" }, { status: 400 });
  let session;
  try {
    session = await requireRoleForClient([...AGENCY_ROLES], clientId);
    await requireCurrentClientWorkspaceElementAccess(clientId, "client.record", "use");
  } catch (error) {
    return authErrorResponse(error);
  }
  const client = getClientForAgency(session.agencyId, clientId);
  if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
  const patch = Object.fromEntries(NOTE_KEYS.map(key => [key, clean(body.notes?.[key], 20_000)]));
  const updated = updateClient(session.agencyId, clientId, { metadata: patch });
  if (!updated) return NextResponse.json({ ok: false, error: "notes update failed" }, { status: 500 });
  logActivity({ agencyId: session.agencyId, clientId, actorUserId: session.userId, actorEmail: session.email, category: "tenant", action: "client.notes.updated", message: `Updated internal notes for ${client.name}.` });
  return NextResponse.json({ ok: true, notes: patch });
}

function clean(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}
