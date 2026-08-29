import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse, getActiveAgencyId, requireRole } from "@/lib/server/auth/auth";
import { AccessControlError, accessErrorResponse } from "@/server/accessControl";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";
import { setClientSupabaseColumnMapping } from "@/lib/server/clientForms/clientSupabaseMapping";
import { getClient } from "@/server/tenants";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

export const runtime = "nodejs";

const COLUMN_KEYS = ["columnName", "columnEmail", "columnPhone", "columnMessage", "columnSubmittedAt"] as const;

/**
 * Accept a detected form mapping for one client.
 *
 * The website-sources panel works out which column plays which role and shows
 * it; this is the button that keeps it. What lands is five column NAMES on that
 * client's Supabase connection — no data, and nothing that could not already be
 * read off their own form's markup.
 *
 * ── Gated as the Tag is ──────────────────────────────────────────────────
 *
 * `fulfilment.tags` at `use`, the same element that governs scanning a site in
 * the first place. Somebody who may not scan a client's forms should not be
 * able to decide how those forms are read either — and reusing the element
 * means the two move together rather than drifting apart.
 *
 * The client is validated against the caller's agency before anything is
 * written, so a client id from the body cannot reach another tenant.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole([...AGENCY_ROLES]);
    const agencyId = getActiveAgencyId(session);
    await ensureHydrated();
    await requireCurrentWorkspaceElementAccess("fulfilment", "fulfilment.tags", "use");

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";
    if (!clientId) {
      return NextResponse.json({ ok: false, error: "client_required" }, { status: 400 });
    }

    // The client must belong to THIS agency. Without this, a client id from the
    // request body would be enough to write onto another tenant's connection.
    const client = getClient(clientId);
    if (!client || client.agencyId !== agencyId) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const mapping: Record<string, string> = {};
    for (const key of COLUMN_KEYS) {
      const value = body?.[key];
      // A blank clears the override and returns that field to detection.
      mapping[key] = typeof value === "string" ? value.trim().slice(0, 120) : "";
    }

    const result = setClientSupabaseColumnMapping(agencyId, clientId, mapping);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: "no_connection", message: "Connect this client's Supabase before saving a mapping." },
        { status: 409 },
      );
    }
    await flushPendingWrites();
    return NextResponse.json({ ok: true, connectionId: result.connectionId });
  } catch (cause) {
    if (cause instanceof AccessControlError) return accessErrorResponse(cause);
    if (cause instanceof AuthError) return authErrorResponse(cause);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 400 });
  }
}
