import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { createCustomAI, deleteCustomAI, listCustomAIs, updateCustomAI, type SaveCustomAIInput } from "@/server/customAIs";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { requireAssistantElement } from "@/lib/server/assistants/assistantContextScope";

type Body = SaveCustomAIInput & { action?: "create" | "update" | "delete"; id?: string };

export async function GET() {
  try {
    await ensureHydrated();
    // Issue #182 — an element, not a role. A role check passes a manager whose
    // element access has been narrowed, and the AI then answers from data the
    // UI hides from them; that is the confused deputy one level in.
    const session = await requireAssistantElement("workspace.overview");
    return NextResponse.json({ ok: true, records: listCustomAIs(session.agencyId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    // Creating a custom AI is configuration.
    const session = await requireAssistantElement("workspace.settings", "manage");
    const body = await request.json().catch(() => null) as Body | null;
    if (!body?.action) return NextResponse.json({ ok: false, error: "action required" }, { status: 400 });
    if (body.action === "delete") {
      const ok = body.id ? deleteCustomAI(session.agencyId, body.id, session.user.id) : false;
      await flushPendingWrites();
      return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
    }
    const record = body.action === "create"
      ? createCustomAI(session.agencyId, body, session.user.id)
      : body.id ? updateCustomAI(session.agencyId, body.id, body, session.user.id) : null;
    if (!record) return NextResponse.json({ ok: false, error: "Custom AI not found." }, { status: 404 });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save custom AI.";
    if (error instanceof AuthError) return authErrorResponse(error);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
