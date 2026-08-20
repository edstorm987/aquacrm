import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { createAgencyProduct, ensureDefaultAgencyProducts, listAgencyProducts, updateAgencyProduct } from "@/server/agencyProducts";
import { ensureProductPortalTemplate } from "@/server/clientPortalDesigns";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES, type AgencyProductInternalWorkspace, type AgencyProductKind, type AgencyProductPortalMode, type AgencyProductPortalRequirement, type AgencyProductPortalTemplateKey, type AgencyProductPricing, type AgencyProductStatus } from "@/server/types";

type Body = {
  action?: "create" | "update";
  productId?: string;
  kind?: AgencyProductKind;
  name?: string;
  category?: string;
  description?: string;
  buyerHeadline?: string;
  coverImageUrl?: string;
  accentColor?: string;
  portalRequirement?: AgencyProductPortalRequirement;
  portalTemplateKey?: AgencyProductPortalTemplateKey;
  portalHeadline?: string;
  portalWelcomeNote?: string;
  portalStageFocus?: Partial<Record<AgencyProductPortalMode, string>>;
  portalSupportCta?: string;
  includedProductIds?: string[];
  welcomePackItems?: string[];
  welcomePackNotes?: string;
  pricing?: AgencyProductPricing;
  priceCents?: number;
  billingInterval?: "month" | "quarter" | "year";
  depositPercent?: number;
  taxRatePercent?: number;
  paymentTermsDays?: number;
  billingNotes?: string;
  internalInfo?: string;
  internalWorkspace?: AgencyProductInternalWorkspace;
  deliverables?: string[];
  contractTitle?: string;
  contractBody?: string;
  sopIds?: string[];
  sopCategories?: string[];
  active?: boolean;
  status?: AgencyProductStatus;
  companyIds?: string[];
};

export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    ensureDefaultAgencyProducts(session.agencyId);
    return NextResponse.json({
      ok: true,
      products: listAgencyProducts(session.agencyId, true),
    });
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
    const input = {
      kind: body.kind,
      name: body.name ?? "",
      category: body.category,
      description: body.description,
      buyerHeadline: body.buyerHeadline,
      coverImageUrl: body.coverImageUrl,
      accentColor: body.accentColor,
      portalRequirement: body.portalRequirement,
      portalTemplateKey: body.portalTemplateKey,
      portalHeadline: body.portalHeadline,
      portalWelcomeNote: body.portalWelcomeNote,
      portalStageFocus: body.portalStageFocus,
      portalSupportCta: body.portalSupportCta,
      includedProductIds: body.includedProductIds,
      welcomePackItems: body.welcomePackItems,
      welcomePackNotes: body.welcomePackNotes,
      pricing: body.pricing,
      priceCents: body.priceCents,
      billingInterval: body.billingInterval,
      depositPercent: body.depositPercent,
      taxRatePercent: body.taxRatePercent,
      paymentTermsDays: body.paymentTermsDays,
      billingNotes: body.billingNotes,
      internalInfo: body.internalInfo,
      internalWorkspace: body.internalWorkspace,
      deliverables: body.deliverables,
      contractTitle: body.contractTitle,
      contractBody: body.contractBody,
      sopIds: body.sopIds,
      sopCategories: body.sopCategories,
      active: body.active,
      status: body.status,
      companyIds: body.companyIds,
    };
    const product = body.action === "create"
      ? createAgencyProduct(session.agencyId, input, session.userId)
      : body.productId
        ? updateAgencyProduct(session.agencyId, body.productId, input, session.userId)
        : null;
    if (!product) return NextResponse.json({ ok: false, error: "product not found" }, { status: 404 });
    const portalTemplate = product.status !== "archived" && product.portalRequirement !== "none"
      ? ensureProductPortalTemplate(session.agencyId, product, session.userId)
      : null;
    return NextResponse.json({ ok: true, product, portalTemplate: portalTemplate ? {
      id: portalTemplate.id,
      publishedVersionId: portalTemplate.publishedVersionId,
      productSourceUpdatedAt: portalTemplate.productSourceUpdatedAt,
    } : null });
  } catch (error) {
    return authErrorResponse(error);
  }
}
