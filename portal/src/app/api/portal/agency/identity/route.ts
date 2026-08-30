import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { validateBrandPatch } from "@/lib/brands/brandFieldValidation";
import { logActivity } from "@/server/activity";
import { ensureHydrated, flushPendingWrites, getState, mutate } from "@/server/storage";

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

/**
 * The agency's own name and brand — the first write path a non-founder has had.
 *
 * Verified before building (2026-08-30): `/api/portal/settings` writes only
 * `AgencyWorkspaceSettings`, and the sole writer of `Agency.brand` was the
 * Dev-Team editor, whose route 404s every non-founder. So the "Brand colour"
 * tile in Settings was a read-only Stat and a manager could not change the
 * workspace name through any endpoint — while `/api/portal/trading-companies`
 * happily let owner|manager write a brand for a trading company. This closes
 * that inconsistency rather than opening anything new; the role gate and the
 * shape are copied from the trading-companies route.
 *
 * The SLUG is deliberately not accepted — ignored, not 400'd, so an optimistic
 * client sending the whole identity object does not break. It is authority,
 * not presentation: five public routes resolve the founder tenant by slug, and
 * `radarSourceInspection` gates founder-only inspection on it. Renaming the
 * workspace must never quietly move where public enquiry forms deliver.
 */
export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);

    const body = await request.json().catch(() => null) as { name?: unknown; brand?: unknown } | null;
    if (!body) return NextResponse.json({ ok: false, error: "Send JSON." }, { status: 400 });

    let name: string | undefined;
    if (body.name !== undefined) {
      if (typeof body.name !== "string") return NextResponse.json({ ok: false, error: "Name must be text." }, { status: 400 });
      name = body.name.trim();
      if (!name || name.length > 120) return NextResponse.json({ ok: false, error: "Name must be 1–120 characters." }, { status: 400 });
      if (/[<>]/.test(name) || CONTROL_CHARS.test(name)) {
        return NextResponse.json({ ok: false, error: "Name cannot contain angle brackets or control characters." }, { status: 400 });
      }
    }

    let brandPatch: Record<string, string> | undefined;
    if (body.brand !== undefined) {
      const checked = validateBrandPatch(body.brand);
      if (!checked.ok) return NextResponse.json({ ok: false, error: checked.error }, { status: 400 });
      brandPatch = checked.patch;
    }

    if (name === undefined && (!brandPatch || !Object.keys(brandPatch).length)) {
      return NextResponse.json({ ok: false, error: "Nothing to save." }, { status: 400 });
    }

    mutate(state => {
      const agency = state.agencies[session.agencyId];
      if (!agency) return;
      if (name !== undefined) agency.name = name;
      if (brandPatch && Object.keys(brandPatch).length) {
        agency.brand = { ...agency.brand, ...brandPatch };
      }
    });

    logActivity({
      agencyId: session.agencyId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "settings",
      action: "agency.identity_updated",
      message: `${session.email} updated the workspace ${[name !== undefined ? "name" : null, brandPatch && Object.keys(brandPatch).length ? "brand" : null].filter(Boolean).join(" and ")}.`,
    });

    // The brand feeds ThemeInjector on the next render; flush so a serverless
    // instance going away cannot lose the write behind the debounce.
    await flushPendingWrites();

    const agency = getState().agencies[session.agencyId];
    return NextResponse.json({ ok: true, name: agency?.name ?? name, brand: agency?.brand ?? null });
  } catch (error) {
    return authErrorResponse(error);
  }
}
