import { NextResponse, type NextRequest } from "next/server";

import { ADVISOR_SKILL_RECIPES } from "@/lib/advisor/advisorSkills";
import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { AccessControlError, accessErrorResponse } from "@/server/accessControl";
import {
  advisorSkillState,
  createAdvisorSkill,
  deleteAdvisorSkill,
  setAdvisorSkillEnabled,
} from "@/lib/server/assistants/advisorSkillsService";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { ensureHydrated } from "@/server/storage";
import type { AdvisorSkillRecipeId } from "@/server/types";
import { requireAssistantElement } from "@/lib/server/assistants/assistantContextScope";

export async function GET() {
  try {
    await ensureHydrated();
    // Issue #182 — an element, not a role. A role check passes a manager whose
    // element access has been narrowed, and the AI then answers from data the
    // UI hides from them; that is the confused deputy one level in.
    const session = await requireAssistantElement("workspace.overview");
    return NextResponse.json({
      ok: true,
      ...advisorSkillState(session.agencyId),
      recipes: Object.values(ADVISOR_SKILL_RECIPES),
    });
  } catch (error) {
    // AccessControlError FIRST. `authErrorResponse` rethrows anything that is
    // not an AuthError, and `requireAssistantElement` throws AccessControlError
    // — so an ordinary unauthenticated call escaped as an unhandled exception
    // and Next.js answered 500 to what the code had already decided was a 401.
    // Found by the Phase D mutating-route sweep, 2026-08-27.
    if (error instanceof AccessControlError) return accessErrorResponse(error);
    return authErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureHydrated();
    // Editing a skill is configuring what the Advisor does.
    const session = await requireAssistantElement("workspace.settings", "manage");
    const origin = req.headers.get("origin");
    if (origin && origin !== new URL(req.url).origin) {
      return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
    }
    const limit = rateLimit({
      key: `advisor-skills:${session.user.id}:${clientIpFromHeaders(req.headers)}`,
      max: 30,
      windowMs: 60_000,
    });
    if (!limit.allowed) {
      return NextResponse.json({ ok: false, error: `Too many skill changes. Try again in ${limit.retryAfterSec} seconds.` }, { status: 429 });
    }
    const body = await req.json().catch(() => ({})) as {
      action?: "create" | "toggle" | "delete";
      skillId?: string;
      recipeId?: AdvisorSkillRecipeId;
      name?: string;
      description?: string;
      enabled?: boolean;
    };
    if (body.action === "create" && body.recipeId) {
      createAdvisorSkill({
        agencyId: session.agencyId,
        actorUserId: session.user.id,
        recipeId: body.recipeId,
        name: body.name ?? "",
        description: body.description,
      });
    } else if (body.action === "toggle" && body.skillId) {
      setAdvisorSkillEnabled({
        agencyId: session.agencyId,
        actorUserId: session.user.id,
        skillId: body.skillId,
        enabled: body.enabled === true,
      });
    } else if (body.action === "delete" && body.skillId) {
      deleteAdvisorSkill({ agencyId: session.agencyId, actorUserId: session.user.id, skillId: body.skillId });
    } else {
      return NextResponse.json({ ok: false, error: "Choose a supported skill action." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ...advisorSkillState(session.agencyId) });
  } catch (error) {
    // Same reason as the GET above: this throws AccessControlError, and
    // `authErrorResponse` would rethrow it before the status check below ever
    // ran, turning a decided 401 into a 500.
    if (error instanceof AccessControlError) return accessErrorResponse(error);
    const authResponse = authErrorResponse(error);
    if (authResponse.status === 401 || authResponse.status === 403) return authResponse;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "The Advisor skill could not update." }, { status: 400 });
  }
}
