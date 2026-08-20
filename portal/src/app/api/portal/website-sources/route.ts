import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { listClients } from "@/server/tenants";
import { listTradingCompanies } from "@/server/tradingCompanies";
import { logActivity } from "@/server/activity";
import {
  addWebsiteSource,
  ensureAgencyMasterSiteKey,
  listWebsiteSources,
  masterTagSnippet,
  removeWebsiteSource,
  updateWebsiteSourceRouting,
} from "@/server/websiteSources";
import { importFormSchemasForSite, listSiteFormSchemas } from "@/server/websiteFormSchemas";
import { connectionLinkOrigin } from "@/lib/server/portalConnections";
import { AGENCY_ROLES } from "@/server/types";

/**
 * Managing where tagged websites route their submissions.
 *
 * The list comes back with the agency's clients too, so the destination picker
 * never has to make a second call to know who a site can be pointed at.
 */
export async function GET(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const masterKey = ensureAgencyMasterSiteKey(session.agencyId);
    await flushPendingWrites();
    const origin = connectionLinkOrigin(request.nextUrl.origin);
    const sources = listWebsiteSources(session.agencyId);
    return NextResponse.json({
      ok: true,
      sources,
      clients: listClients(session.agencyId).map(client => ({ id: client.id, name: client.name })),
      companies: listTradingCompanies(session.agencyId).map(company => ({ id: company.id, name: company.name, website: company.website })),
      masterTag: { siteKey: masterKey, snippet: masterTagSnippet(origin, masterKey) },
      // Any forms already imported per site, so the panel can show them on load.
      formSchemasBySource: Object.fromEntries(sources.map(source => [source.id, listSiteFormSchemas(session.agencyId, source.id)])),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const action = typeof body?.action === "string" ? body.action : "add";
    const str = (value: unknown) => typeof value === "string" ? value : undefined;

    if (action === "add") {
      try {
        const source = addWebsiteSource({
          agencyId: session.agencyId,
          host: str(body?.host) ?? "",
          label: str(body?.label),
          destinationClientId: str(body?.destinationClientId) || undefined,
          destinationCompanyId: str(body?.destinationCompanyId) || undefined,
          createdBy: session.userId,
        });
        logActivity({
          agencyId: session.agencyId,
          clientId: source.destinationClientId,
          actorUserId: session.userId,
          actorEmail: session.email,
          category: "integrations",
          action: "website_source.added",
          message: `Routed submissions from ${source.host} to ${source.destinationCompanyId ? "one of your companies" : source.destinationClientId ? "a client's inbox" : "the agency inbox"}.`,
          metadata: { host: source.host, destinationClientId: source.destinationClientId, destinationCompanyId: source.destinationCompanyId },
        });
        await flushPendingWrites();
        return NextResponse.json({ ok: true, source }, { status: 201 });
      } catch (error) {
        return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "That could not be added." }, { status: 400 });
      }
    }

    if (action === "update") {
      try {
        const source = updateWebsiteSourceRouting({
          agencyId: session.agencyId,
          id: str(body?.id) ?? "",
          destinationClientId: str(body?.destinationClientId) || undefined,
          destinationCompanyId: str(body?.destinationCompanyId) || undefined,
          label: str(body?.label),
        });
        if (!source) return NextResponse.json({ ok: false, error: "That website source was not found." }, { status: 404 });
        await flushPendingWrites();
        return NextResponse.json({ ok: true, source });
      } catch (error) {
        return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "That could not be updated." }, { status: 400 });
      }
    }

    if (action === "remove") {
      const removed = removeWebsiteSource(session.agencyId, str(body?.id) ?? "");
      if (!removed) return NextResponse.json({ ok: false, error: "That website source was not found." }, { status: 404 });
      await flushPendingWrites();
      return NextResponse.json({ ok: true });
    }

    if (action === "import-forms") {
      const result = await importFormSchemasForSite({ agencyId: session.agencyId, websiteSourceId: str(body?.id) ?? "" });
      if (!result.ok) {
        const notFound = result.error === "That website was not found.";
        return NextResponse.json({ ok: false, error: result.error ?? "The forms could not be imported." }, { status: notFound ? 404 : 400 });
      }
      const capturable = result.schemas.filter(form => form.capturable).length;
      logActivity({
        agencyId: session.agencyId,
        actorUserId: session.userId,
        actorEmail: session.email,
        category: "integrations",
        action: "website_source.forms_imported",
        message: `Imported ${result.schemas.length} form${result.schemas.length === 1 ? "" : "s"} (${capturable} capturable) from ${result.importedFrom ?? "the site"}.`,
        metadata: { websiteSourceId: str(body?.id), forms: result.schemas.length, capturable },
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, schemas: result.schemas, importedFrom: result.importedFrom });
    }

    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
