import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { messageFreelancerAgency } from "@/server/freelancerWorkspace";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (session.role !== "freelancer") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    const body = await request.json().catch(() => null) as { jobId?: string; message?: string } | null;
    const jobId = body?.jobId?.trim().slice(0, 120) ?? "";
    const message = body?.message?.trim().slice(0, 4_000) ?? "";
    if (!jobId || !message) return NextResponse.json({ ok: false, error: "jobId and message are required" }, { status: 400 });
    const messages = messageFreelancerAgency({ agencyId: session.agencyId, userId: session.userId, jobId, body: message });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, messages }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("not available")) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 403 });
    }
    return authErrorResponse(error);
  }
}
