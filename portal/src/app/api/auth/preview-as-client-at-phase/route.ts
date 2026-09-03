import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import {
  getSessionFromRequest,
  issueSession,
  sessionCookie,
  getActiveAgencyId,
} from "@/lib/server/auth/auth";
import { effectiveRole } from "@/lib/server/auth/effectiveRole";
import { canUseDevMode } from "@/lib/server/dev/devModeAccess";
import { getUser } from "@/server/users";
import { getPhase } from "@/server/phases";
import {
  seedDemoAgency,
  DEMO_CLIENT_EMAIL,
  DEMO_CLIENT_SLUG,
} from "@/lib/server/seeds/demoSeed";
import { previewPhaseCookie } from "@/lib/server/portal/previewPhase";
import {
  PhaseMutationNotFoundError,
  PhaseMutationRequestError,
  isJsonRecord,
  phaseMutationErrorResponse,
} from "@/lib/server/phases/phaseMutationErrors";

const PREVIEW_FALLBACK = "Preview could not start.";

function parsePhaseId(value: unknown): string {
  if (!isJsonRecord(value)) throw new PhaseMutationRequestError("The request body must be valid JSON.");
  if (typeof value.phaseId !== "string" || !value.phaseId.trim()) throw new PhaseMutationRequestError("Choose a phase to preview.");
  return value.phaseId.trim();
}

// POST /api/auth/preview-as-client-at-phase — founder-only.
// Re-issues the session as the seeded demo client and stamps a
// short-lived `lk_preview_phase` cookie so the client portal can
// render as if at that phase. Answers `{ ok: true, phaseId, redirect }` —
// the demo client overview — so the browser can bind the receipt to the
// phase it asked for and validate the path before following it.
export async function POST(req: NextRequest) {
  // The same switch its sibling dev-mode route hangs off, and for the same
  // reason. This route re-issues the caller as a SEEDED DEMO CLIENT and calls
  // seedDemoAgency(), which writes a fixed-credential shared tenant — neither
  // belongs anywhere near production. Its only other gate is
  // `effectiveRole().isFounder`, and that maps EVERY agency-owner to "Founder",
  // so without this line every customer's owner could reach it on a live deploy.
  if (!canUseDevMode()) {
    return NextResponse.json(
      { ok: false, error: "Not available." },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }

  await ensureHydrated();
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const eff = effectiveRole(session);
  if (!eff.isFounder) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let phaseId: string | undefined;
  try {
    phaseId = parsePhaseId(await req.json().catch(() => null));
    const phase = getPhase(phaseId);
    if (!phase || phase.agencyId !== getActiveAgencyId(session)) {
      throw new PhaseMutationNotFoundError("That phase no longer exists in this agency.");
    }

    // Idempotent — fast-path snapshot when demo already seeded.
    await seedDemoAgency("phases-preview");
    const demo = getUser(DEMO_CLIENT_EMAIL);
    // The demo client missing after a seed is an internal failure: captured
    // server-side and answered generically, never as a caller mistake.
    if (!demo) throw new Error("preview-as-client: demo client user absent after seedDemoAgency()");

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
    const res = NextResponse.json({ ok: true, phaseId, redirect });
    res.cookies.set(session_c.name, session_c.value, session_c.options);
    res.cookies.set(preview_c.name, preview_c.value, preview_c.options);
    return res;
  } catch (error) {
    return phaseMutationErrorResponse(error, {
      fallback: PREVIEW_FALLBACK,
      breadcrumb: {
        agencyId: session.agencyId,
        userId: session.userId,
        extra: { route: "auth/preview-as-client-at-phase", method: "POST", phaseId },
      },
    });
  }
}
