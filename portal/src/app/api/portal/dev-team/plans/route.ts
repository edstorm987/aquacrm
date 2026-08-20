import { NextResponse, type NextRequest } from "next/server";

import { requireRole } from "@/lib/server/auth";
import { devDocsAccessible } from "@/lib/server/devDocs";
import { createPlan } from "@/lib/server/devTeamPlans";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

// Create a plan from the Dev Team portal. Founder + Dev Mode only — the same
// gate the portal itself asserts, re-asserted here so the endpoint can't be
// reached directly in any production-like context.
export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();

    let session;
    try {
      session = await requireRole([...AGENCY_ROLES]);
    } catch {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    if (!devDocsAccessible(session)) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null) as {
      title?: string;
      goal?: string;
      phases?: unknown;
      priority?: string;
      notes?: string;
    } | null;

    if (!body) return NextResponse.json({ ok: false, error: "Send a JSON body." }, { status: 400 });

    const phases = Array.isArray(body.phases)
      ? body.phases.filter((p): p is string => typeof p === "string")
      : typeof body.phases === "string"
        ? body.phases.split("\n")
        : [];

    const priority = body.priority === "high" || body.priority === "low" ? body.priority : "med";

    const result = await createPlan({
      title: String(body.title ?? ""),
      goal: String(body.goal ?? ""),
      phases,
      priority,
      notes: typeof body.notes === "string" ? body.notes : undefined,
    });

    return NextResponse.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create the plan.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
