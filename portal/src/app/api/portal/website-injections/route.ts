import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { listWebsiteSources } from "@/server/websiteSources";
import {
  INJECTION_PROVIDERS,
  addInjection,
  listInjections,
  removeInjection,
  updateInjection,
} from "@/server/websiteInjections";
import { logActivity } from "@/server/activity";
import { AGENCY_ROLES } from "@/server/types";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";

/**
 * Managing the third-party tools the Aqua Tag injects on each site — the
 * consent-aware tag manager's control surface. The GET returns every tagged site
 * with its current injections plus the allow-listed provider catalogue, so the
 * workspace never has to make a second call to render the picker. All writes are
 * agency-scoped; the store validates the provider + value.
 */

// The provider's value RegExp stays server-side; the client gets only what it
// needs to render the picker and label the input.
const PROVIDER_CATALOGUE = INJECTION_PROVIDERS.map(provider => ({
  kind: provider.kind,
  label: provider.label,
  valueLabel: provider.valueLabel,
  defaultConsentCategory: provider.defaultConsentCategory,
}));

export async function GET() {
  try {
    await ensureHydrated();
    await requireRole([...AGENCY_ROLES]);
    const { actor } = await requireCurrentWorkspaceElementAccess("fulfilment", "fulfilment.tags", "view");
    const sites = listWebsiteSources(actor.resourceAgencyId).map(source => ({
      id: source.id,
      host: source.host,
      label: source.label,
      injections: listInjections(actor.resourceAgencyId, source.id),
    }));
    await flushPendingWrites();
    return NextResponse.json({ ok: true, sites, providers: PROVIDER_CATALOGUE });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const { actor } = await requireCurrentWorkspaceElementAccess("fulfilment", "fulfilment.tags", "manage");
    const agencyId = actor.resourceAgencyId;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const action = typeof body?.action === "string" ? body.action : "";
    const str = (value: unknown) => typeof value === "string" ? value : undefined;
    const siteId = str(body?.siteId) ?? "";

    if (action === "add") {
      try {
        const injection = addInjection({
          agencyId,
          websiteSourceId: siteId,
          kind: str(body?.kind) ?? "",
          value: str(body?.value) ?? "",
          consentCategory: str(body?.consentCategory),
          label: str(body?.label),
        });
        logActivity({
          agencyId,
          actorUserId: session.userId,
          actorEmail: session.email,
          category: "integrations",
          action: "website_injection.added",
          message: `Configured ${injection.kind} on a tagged site.`,
          metadata: { siteId, kind: injection.kind, consentCategory: injection.consentCategory },
        });
        await flushPendingWrites();
        return NextResponse.json({ ok: true, injection }, { status: 201 });
      } catch (error) {
        return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "That could not be added." }, { status: 400 });
      }
    }

    if (action === "update") {
      try {
        const injection = updateInjection({
          agencyId,
          websiteSourceId: siteId,
          injectionId: str(body?.injectionId) ?? "",
          enabled: typeof body?.enabled === "boolean" ? body.enabled : undefined,
          consentCategory: str(body?.consentCategory),
          value: str(body?.value),
          label: str(body?.label),
        });
        if (!injection) return NextResponse.json({ ok: false, error: "That tool was not found." }, { status: 404 });
        await flushPendingWrites();
        return NextResponse.json({ ok: true, injection });
      } catch (error) {
        return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "That could not be updated." }, { status: 400 });
      }
    }

    if (action === "remove") {
      const removed = removeInjection(agencyId, siteId, str(body?.injectionId) ?? "");
      if (!removed) return NextResponse.json({ ok: false, error: "That tool was not found." }, { status: 404 });
      await flushPendingWrites();
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
