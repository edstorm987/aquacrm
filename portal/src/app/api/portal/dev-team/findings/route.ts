import { NextResponse, type NextRequest } from "next/server";

import { requireRole } from "@/lib/server/auth";
import { devDocsAccessible } from "@/lib/server/devDocs";
import {
  createFinding,
  getFinding,
  listFindings,
  updateFinding,
  planFromFindings,
  type FindingSeverity,
} from "@/lib/server/devTeamFindings";
import { invalidateDevConsoleBadge } from "@/lib/server/devConsoleStatus";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

// Findings: capture what's wrong while using the app, then turn a batch of them
// into a plan. Founder + Dev Mode only, same gate as the rest of the portal.
export const dynamic = "force-dynamic";

async function gate() {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  if (!devDocsAccessible(session)) return null;
  return session;
}

export async function GET() {
  try {
    const session = await gate();
    if (!session) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, findings: await listFindings() }, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await gate();
    if (!session) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    const body = await request.json().catch(() => null) as {
      action?: "create" | "plan" | "status";
      title?: string;
      note?: string;
      where?: string;
      severity?: string;
      images?: unknown;
      slugs?: unknown;
      slug?: string;
      status?: string;
      planTitle?: string;
      planGoal?: string;
    } | null;

    if (!body) return NextResponse.json({ ok: false, error: "Send a JSON body." }, { status: 400 });

    // --- capture a finding -------------------------------------------------
    if (!body.action || body.action === "create") {
      const severities: FindingSeverity[] = ["blocker", "bug", "polish", "idea"];
      const severity = severities.includes(body.severity as FindingSeverity)
        ? body.severity as FindingSeverity
        : "bug";
      const images = Array.isArray(body.images)
        ? body.images.filter((i): i is string => typeof i === "string")
        : [];
      const finding = await createFinding({
        title: String(body.title ?? ""),
        note: String(body.note ?? ""),
        where: typeof body.where === "string" ? body.where : undefined,
        severity,
        images,
      });
      // The topbar console's badge is TTL-cached (it renders on every page).
      // Drop it here so a capture moves the count immediately rather than up to
      // twenty seconds later.
      invalidateDevConsoleBadge();
      return NextResponse.json({ ok: true, finding }, { headers: { "cache-control": "no-store" } });
    }

    // --- flip a finding's status ------------------------------------------
    if (body.action === "status") {
      const status = body.status === "open" || body.status === "planned" || body.status === "fixed"
        ? body.status
        : null;
      if (!body.slug || !status) {
        return NextResponse.json({ ok: false, error: "Send slug and a valid status." }, { status: 400 });
      }
      const finding = await updateFinding(body.slug, { status });
      if (!finding) return NextResponse.json({ ok: false, error: "No such finding." }, { status: 404 });
      // Closing a finding changes the open count the topbar badge shows.
      invalidateDevConsoleBadge();
      return NextResponse.json({ ok: true, finding }, { headers: { "cache-control": "no-store" } });
    }

    // --- turn findings into a plan ----------------------------------------
    if (body.action === "plan") {
      const slugs = Array.isArray(body.slugs) ? body.slugs.filter((s): s is string => typeof s === "string") : [];
      if (slugs.length === 0) {
        return NextResponse.json({ ok: false, error: "Pick at least one finding." }, { status: 400 });
      }
      const findings = (await Promise.all(slugs.map(getFinding))).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof getFinding>>>[];
      if (findings.length === 0) {
        return NextResponse.json({ ok: false, error: "Those findings no longer exist." }, { status: 404 });
      }

      // Title, goal, evidence block, collision retry, the "did every finding
      // actually make it into the plan?" check and the status flip all live in
      // planFromFindings — so the guarantee is testable without an HTTP session.
      const { plan, findings: planned } = await planFromFindings(findings, {
        title: body.planTitle,
        goal: body.planGoal,
      });
      invalidateDevConsoleBadge();
      return NextResponse.json({ ok: true, plan, count: planned.length }, {
        headers: { "cache-control": "no-store" },
      });
    }

    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the finding.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
