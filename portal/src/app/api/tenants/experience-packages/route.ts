import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/server/auth";
import { createExperiencePackage, deleteExperiencePackage, listExperiencePackages, updateExperiencePackage } from "@/server/experiencePackages";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES, type ExperienceDeliveryMethod, type ExperiencePackageAudience } from "@/server/types";

type Body = {
  action?: "create" | "update" | "delete";
  id?: string;
  companyIds?: string[];
  name?: string;
  category?: string;
  summary?: string;
  audience?: ExperiencePackageAudience;
  deliveryMethod?: ExperienceDeliveryMethod;
  priceCents?: number;
  currency?: string;
  leadTimeDays?: number;
  supplier?: string;
  bookingUrl?: string;
  includedItems?: string[];
  fulfilmentSteps?: string[];
  active?: boolean;
};

export async function GET(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";
    return NextResponse.json({ ok: true, packages: listExperiencePackages(session.agencyId, includeArchived) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const body = await request.json().catch(() => null) as Body | null;
    if (!body?.action) return NextResponse.json({ ok: false, error: "action required" }, { status: 400 });
    if (body.action === "delete") {
      const ok = body.id ? deleteExperiencePackage(session.agencyId, body.id) : false;
      return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
    }
    const input = {
      companyIds: body.companyIds,
      name: body.name ?? "",
      category: body.category,
      summary: body.summary,
      audience: body.audience,
      deliveryMethod: body.deliveryMethod,
      priceCents: body.priceCents,
      currency: body.currency,
      leadTimeDays: body.leadTimeDays,
      supplier: body.supplier,
      bookingUrl: body.bookingUrl,
      includedItems: body.includedItems,
      fulfilmentSteps: body.fulfilmentSteps,
      active: body.active,
    };
    const item = body.action === "create"
      ? createExperiencePackage(session.agencyId, input, session.userId)
      : body.id
        ? updateExperiencePackage(session.agencyId, body.id, input, session.userId)
        : null;
    if (!item) return NextResponse.json({ ok: false, error: "package not found" }, { status: 404 });
    return NextResponse.json({ ok: true, package: item });
  } catch (error) {
    try {
      return authErrorResponse(error);
    } catch {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not save package." }, { status: 400 });
    }
  }
}
