import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { createPlan } from "@/lib/server/dev/devTeamPlans";
import {
  addItem, updateItem, removeItem, linkPlan, buildRoadmap,
  type Horizon, type ItemStatus, type ItemSize,
} from "@/lib/server/dev/devTeamRoadmap";
import { ensureDevTeamWorkspaceHydrated } from "@/lib/server/dev/devWorkspaceFiles";
import { AGENCY_ROLES } from "@/server/types";

// The roadmap's write surface. Founder-only Dev Team access, re-asserted here — a
// gate on the page protects the screen, not the write.
//
// Every handler answers an auth failure with `authErrorResponse` BEFORE the
// generic 400. `requireRole` throws `AuthError`, and letting that fall through
// to "could not save that, 400" made the status code an oracle: an anonymous
// POST here answered 400 while the same POST to a route that does not exist
// answered 401 from the catch-all, so a caller with no credentials at all could
// enumerate which dev-team endpoints are real — the one fact the 404 exists to
// hide. It also mislabelled an expired session as a client bad-request.
export const dynamic = "force-dynamic";

async function gate() {
    await ensureDevTeamWorkspaceHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  return devDocsAccessible(session) ? session : null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export async function GET() {
  try {
    if (!await gate()) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, roadmap: await buildRoadmap() }, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
}

/**
 * Add an item, or turn one into a plan.
 *
 * `action: "plan"` is the loop that makes the roadmap worth having: an outcome
 * Ed typed becomes a real plan file on the board, linked back to the item that
 * asked for it, so progress starts flowing to the roadmap immediately.
 */
export async function POST(request: NextRequest) {
  try {
    if (!await gate()) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ ok: false, error: "Nothing sent." }, { status: 400 });

    if (body.action === "plan") {
      const id = str(body.id);
      const title = str(body.title);
      const goal = str(body.goal);
      if (!id || !title || !goal) {
        return NextResponse.json({ ok: false, error: "A plan needs the item, a title and a goal." }, { status: 400 });
      }
      const plan = await createPlan({ title, goal });
      const item = await linkPlan(id, plan.slug);
      return NextResponse.json({ ok: true, plan, item }, { headers: { "cache-control": "no-store" } });
    }

    const item = await addItem({
      title: String(body.title ?? ""),
      why: str(body.why),
      horizon: str(body.horizon) as Horizon | undefined,
      status: str(body.status) as ItemStatus | undefined,
      target: str(body.target),
      size: str(body.size) as ItemSize | undefined,
      owner: str(body.owner),
      plans: Array.isArray(body.plans) ? body.plans.filter((p): p is string => typeof p === "string") : undefined,
      source: str(body.source),
      notes: str(body.notes),
    });
    return NextResponse.json({ ok: true, item }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    const message = error instanceof Error ? error.message : "Could not save that.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!await gate()) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const id = str(body?.id);
    if (!id) return NextResponse.json({ ok: false, error: "Which item?" }, { status: 400 });

    const item = await updateItem({
      id,
      title: str(body?.title),
      horizon: str(body?.horizon) as Horizon | undefined,
      status: str(body?.status) as ItemStatus | undefined,
      target: str(body?.target),
      size: str(body?.size) as ItemSize | undefined,
      owner: str(body?.owner),
      why: str(body?.why),
      plans: Array.isArray(body?.plans) ? body.plans.filter((p): p is string => typeof p === "string") : undefined,
      notes: str(body?.notes),
    });
    return NextResponse.json({ ok: true, item }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    const message = error instanceof Error ? error.message : "Could not save that.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!await gate()) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const id = str(body?.id);
    if (!id) return NextResponse.json({ ok: false, error: "Which item?" }, { status: 400 });
    const { removed } = await removeItem(id);
    return NextResponse.json({ ok: true, removed }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    const message = error instanceof Error ? error.message : "Could not remove that.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
