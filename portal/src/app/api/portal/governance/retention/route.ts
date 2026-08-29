import { NextResponse } from "next/server";

import { authErrorResponse, getActiveAgencyId, requireRole } from "@/lib/server/auth/auth";
import { previewRetentionSweep, RETENTION_CATEGORIES } from "@/lib/server/compliance/retention";
import { logActivity } from "@/server/activity";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";
import { ensureHydrated, flushPendingWrites, mutate } from "@/server/storage";
import type { RetentionPolicy } from "@/server/types";

export const runtime = "nodejs";

/**
 * Set the retention periods.
 *
 * The mechanism to expire data already existed and was inert, because no period
 * could be entered anywhere — the number was the missing half and there was
 * nowhere to put it. This is that.
 *
 * ── Owner only ───────────────────────────────────────────────────────────
 *
 * Stricter than the rest of Governance, which is owner-or-manager. Setting a
 * period is not a read: the next sweep deletes by it, and deletion has no undo.
 * It sits with the erase button, not with the reports.
 *
 * ── Blank clears ─────────────────────────────────────────────────────────
 *
 * An empty field, a zero or anything unparseable removes the period and the
 * category returns to keep-forever. That is the safe direction: a typo must
 * never widen what gets deleted, and somebody clearing a box means "stop
 * expiring these", which is exactly what it does.
 *
 * The response carries a fresh PREVIEW rather than running anything, so the
 * screen can immediately say what the new numbers would remove. Saving a
 * period must never be the thing that deletes by it.
 */
export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner"]);
    const agencyId = getActiveAgencyId(session);

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const policy: RetentionPolicy = {};
    const applied: string[] = [];
    const cleared: string[] = [];

    for (const category of RETENTION_CATEGORIES) {
      const raw = body?.[category.id];
      const days = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
      if (Number.isFinite(days) && days > 0) {
        // A ceiling, not a policy: 50 years is already "keep forever" in every
        // practical sense, and it stops a slipped keypress storing a number so
        // large it silently means never.
        policy[category.id] = Math.min(Math.round(days), 18_250);
        applied.push(`${category.id}=${policy[category.id]}`);
      } else {
        cleared.push(category.id);
      }
    }

    // Built from `getAgencyWorkspaceSettings`, which merges defaults, so the
    // record EXISTS even for an agency that has never opened settings.
    //
    // The first version of this route did `if (!existing) return;` and answered
    // ok — a save that reported success and persisted nothing. Caught by
    // entering periods in the browser and reloading the page, not by any test.
    //
    // Deliberately NOT routed through `updateAgencyWorkspaceSettings`: it
    // rebuilds the record field by field and knows nothing about `retention`,
    // so it would drop what we just set — the same shape as the
    // `saveIntegrationConnection` wipe that the client-Supabase mapping had to
    // avoid.
    const current = getAgencyWorkspaceSettings(agencyId);
    mutate(state => {
      state.agencySettings[agencyId] = { ...current, retention: policy, updatedAt: Date.now() };
    });

    logActivity({
      agencyId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "tenant",
      action: "retention.policy_set",
      message: "Retention periods were changed.",
      // Periods only — no personal data, and the categories are already public
      // names of collections rather than anything about a person.
      metadata: { applied, cleared },
    });
    await flushPendingWrites();

    return NextResponse.json({
      ok: true,
      policy,
      // What these numbers WOULD remove. Counting only — see the note above.
      preview: previewRetentionSweep(agencyId),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
