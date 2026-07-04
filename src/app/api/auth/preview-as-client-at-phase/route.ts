import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import {
  getSessionFromRequest,
  issueSession,
  sessionCookie,
  getActiveAgencyId,
} from "@/lib/server/auth";
import { effectiveRole } from "@/lib/server/effectiveRole";
import { getUser } from "@/server/users";
import { getPhase } from "@/server/phases";
import {
  seedDemoAgency,
  DEMO_CLIENT_EMAIL,
  DEMO_CLIENT_SLUG,
} from "@/lib/server/demoSeed";
import { previewPhaseCookie } from "@/lib/server/previewPhase";

interface Body { phaseId?: string }

// POST /api/auth/preview-as-client-at-phase — founder-only.
// Re-issues the session as the seeded demo client and stamps a
// short-lived `lk_preview_phase` cookie so the client portal can
// render as if at that phase. Redirects to the demo client overview.
export async function POST(req: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const eff = effectiveRole(session);
  if (!eff.isFounder) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: Body;
  try { body = (await req.json()) as Body; } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const phaseId = (body.phaseId ?? "").trim();
  if (!phaseId) return NextResponse.json({ ok: false, error: "phaseId_required" }, { status: 400 });

  const phase = getPhase(phaseId);
  if (!phase || phase.agencyId !== getActiveAgencyId(session)) {
    return NextResponse.json({ ok: false, error: "phase_not_found" }, { status: 404 });
  }

  // Idempotent — fast-path snapshot when demo already seeded.
  await seedDemoAgency("phases-preview");
  const demo = getUser(DEMO_CLIENT_EMAIL);
  if (!demo) {
    return NextResponse.json({ ok: false, error: "demo_not_seeded" }, { status: 500 });
  }

  const token = issueSession({
    userId: demo.id,
    email: demo.email,
    role: demo.role,
    agencyId: demo.agencyId,
    clientId: demo.clientId,
    isDemo: true,
    sessionRev: demo.sessionRev ?? 0,
  });
  const session_c = sessionCookie(token);
  const preview_c = previewPhaseCookie(phaseId);

  const redirect = `/portal/clients/${DEMO_CLIENT_SLUG}?previewPhase=${encodeURIComponent(phaseId)}`;
  const res = NextResponse.json({ ok: true, redirect });
  res.cookies.set(session_c.name, session_c.value, session_c.options);
  res.cookies.set(preview_c.name, preview_c.value, preview_c.options);
  return res;
}
