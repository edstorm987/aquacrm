import { NextResponse, type NextRequest } from "next/server";

import { ADVISOR_SKILL_RECIPES } from "@/lib/advisor/advisorSkills";
import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import {
  advisorSkillState,
  createAdvisorSkill,
  deleteAdvisorSkill,
  setAdvisorSkillEnabled,
} from "@/lib/server/assistants/advisorSkillsService";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { ensureHydrated } from "@/server/storage";
import type { AdvisorSkillRecipeId } from "@/server/types";

export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    return NextResponse.json({
      ok: true,
      ...advisorSkillState(session.agencyId),
      recipes: Object.values(ADVISOR_SKILL_RECIPES),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const origin = req.headers.get("origin");
    if (origin && origin !== new URL(req.url).origin) {
      return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
    }
    const limit = rateLimit({
      key: `advisor-skills:${session.userId}:${clientIpFromHeaders(req.headers)}`,
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
        actorUserId: session.userId,
        recipeId: body.recipeId,
        name: body.name ?? "",
        description: body.description,
      });
    } else if (body.action === "toggle" && body.skillId) {
      setAdvisorSkillEnabled({
        agencyId: session.agencyId,
        actorUserId: session.userId,
        skillId: body.skillId,
        enabled: body.enabled === true,
      });
    } else if (body.action === "delete" && body.skillId) {
      deleteAdvisorSkill({ agencyId: session.agencyId, actorUserId: session.userId, skillId: body.skillId });
    } else {
      return NextResponse.json({ ok: false, error: "Choose a supported skill action." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ...advisorSkillState(session.agencyId) });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse.status === 401 || authResponse.status === 403) return authResponse;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "The Advisor skill could not update." }, { status: 400 });
  }
}
