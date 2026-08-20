import { NextResponse } from "next/server";

import { isLocalDevelopmentUrl, normalizeWebsiteUrl } from "@/lib/public/publicUrl";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { logActivity } from "@/server/activity";
import { ensureHydrated } from "@/server/storage";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";

interface StoredProperty {
  id: string;
  kind?: string;
  liveUrl?: string;
  updatedAt?: number;
  [key: string]: unknown;
}

interface Body {
  clientId?: string;
  websiteUrl?: unknown;
  syncPropertyId?: unknown;
}

export async function POST(req: Request) {
  try {
    await ensureHydrated();
    const body = await req.json().catch(() => null) as Body | null;
    if (!body?.clientId) {
      return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });
    }

    const session = await requireRoleForClient([...AGENCY_ROLES], body.clientId);
    const client = getClientForAgency(session.agencyId, body.clientId);
    if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });

    const submitted = typeof body.websiteUrl === "string" ? body.websiteUrl.trim() : "";
    const websiteUrl = normalizeWebsiteUrl(submitted);
    if (submitted && !websiteUrl) {
      return NextResponse.json({ ok: false, error: "Enter a valid website address." }, { status: 400 });
    }
    if (websiteUrl && isLocalDevelopmentUrl(websiteUrl)) {
      return NextResponse.json({
        ok: false,
        error: "The official website cannot be a localhost address. Keep localhost in the property's Preview URL instead.",
      }, { status: 400 });
    }

    const syncPropertyId = typeof body.syncPropertyId === "string" ? body.syncPropertyId.trim() : "";
    const metadata = { ...(client.metadata ?? {}) };
    const storedProperties = Array.isArray(metadata.properties)
      ? metadata.properties.filter((item): item is StoredProperty => Boolean(item) && typeof item === "object" && typeof (item as StoredProperty).id === "string")
      : [];

    if (syncPropertyId) {
      const selected = storedProperties.find(property => property.id === syncPropertyId);
      if (!selected || selected.kind !== "website") {
        return NextResponse.json({ ok: false, error: "Select a valid website property." }, { status: 400 });
      }
      metadata.properties = storedProperties.map(property => property.id === syncPropertyId
        ? { ...property, liveUrl: websiteUrl, updatedAt: Date.now() }
        : property);
    }

    const updated = updateClient(session.agencyId, body.clientId, {
      websiteUrl: websiteUrl ?? null,
      metadata,
    });
    if (!updated) return NextResponse.json({ ok: false, error: "update failed" }, { status: 500 });

    logActivity({
      agencyId: session.agencyId,
      clientId: body.clientId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "tenant",
      action: "client.website_domain_updated",
      message: websiteUrl
        ? `Official website changed to ${websiteUrl}.`
        : "Official website removed.",
      metadata: { websiteUrl, syncPropertyId: syncPropertyId || undefined },
    });

    return NextResponse.json({
      ok: true,
      websiteUrl: updated.websiteUrl,
      properties: metadata.properties ?? storedProperties,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
