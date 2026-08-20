import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { submitFreelancerJob } from "@/server/freelancerWorkspace";
import { ensureHydrated } from "@/server/storage";

// Freelancer marks a job's work submitted (→ delivered). Freelancer-only; the
// helper enforces ownership + the agency's config policy. Reads the session off
// the request (like the dev-mode route) so it's driveable in-process.
export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (session.role !== "freelancer") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

    const body = await request.json().catch(() => null) as { jobId?: string } | null;
    if (!body?.jobId) return NextResponse.json({ ok: false, error: "jobId required" }, { status: 400 });

    const result = submitFreelancerJob(session.agencyId, session.userId, body.jobId);
    if (result.ok) return NextResponse.json({ ok: true });
    const status = result.error === "not_your_job" ? 404 : result.error === "not_active" ? 409 : 403;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  } catch (error) {
    return authErrorResponse(error);
  }
}
