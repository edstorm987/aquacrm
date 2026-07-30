import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/server/auth";
import {
  createPerformanceExperiment,
  deletePerformanceExperiment,
  listPerformanceExperiments,
  updatePerformanceExperiment,
  type PerformanceExperimentInput,
} from "@/server/performanceExperiments";
import { ensureHydrated } from "@/server/storage";

const ROLES = new Set(["agency-owner", "agency-manager", "agency-staff"]);

export async function GET(req: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(req);
  if (!session || !ROLES.has(session.role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  return NextResponse.json({
    ok: true,
    experiments: listPerformanceExperiments(session.agencyId, req.nextUrl.searchParams.get("clientId") || undefined),
  });
}

export async function POST(req: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(req);
  if (!session || !ROLES.has(session.role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null) as (PerformanceExperimentInput & { id?: string }) | null;
  if (!body) return NextResponse.json({ ok: false, error: "experiment required" }, { status: 400 });
  try {
    const experiment = body.id
      ? updatePerformanceExperiment(session.agencyId, body.id, body, session.userId)
      : createPerformanceExperiment(session.agencyId, body, session.userId);
    if (!experiment) return NextResponse.json({ ok: false, error: "experiment not found" }, { status: 404 });
    return NextResponse.json({ ok: true, experiment }, { status: body.id ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not save experiment." }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(req);
  if (!session || !ROLES.has(session.role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id") || "";
  const ok = id ? deletePerformanceExperiment(session.agencyId, id) : false;
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
