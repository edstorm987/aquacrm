import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/server/auth";
import { createCustomAI, deleteCustomAI, listCustomAIs, updateCustomAI, type SaveCustomAIInput } from "@/server/customAIs";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";

type Body = SaveCustomAIInput & { action?: "create" | "update" | "delete"; id?: string };

export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    return NextResponse.json({ ok: true, records: listCustomAIs(session.agencyId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const body = await request.json().catch(() => null) as Body | null;
    if (!body?.action) return NextResponse.json({ ok: false, error: "action required" }, { status: 400 });
    if (body.action === "delete") {
      const ok = body.id ? deleteCustomAI(session.agencyId, body.id, session.userId) : false;
      await flushPendingWrites();
      return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
    }
    const record = body.action === "create"
      ? createCustomAI(session.agencyId, body, session.userId)
      : body.id ? updateCustomAI(session.agencyId, body.id, body, session.userId) : null;
    if (!record) return NextResponse.json({ ok: false, error: "Custom AI not found." }, { status: 404 });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save custom AI.";
    if (error instanceof AuthError) return authErrorResponse(error);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
