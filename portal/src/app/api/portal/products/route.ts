import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { agencyProductsForRead, createAgencyProduct, listAgencyProducts, updateAgencyProduct } from "@/server/agencyProducts";
import { ensureProductPortalTemplate } from "@/server/clientPortalDesigns";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES, type AgencyProductInternalWorkspace, type AgencyProductKind, type AgencyProductPortalMode, type AgencyProductPortalRequirement, type AgencyProductPortalTemplateKey, type AgencyProductPricing, type AgencyProductStatus } from "@/server/types";
import { PortalFormValidationError } from "@/lib/forms/portalFormValues";
import {
  requireCurrentWorkspaceElementAccess,
  workspaceElementAtLeast,
  workspaceElementLevel,
} from "@/lib/server/access/workspaceElementAccess";

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
  customFields?: Record<string, unknown>;
};

export async function GET() {
  try {
    await ensureHydrated();
    await requireRole([...AGENCY_ROLES]);
    const { actor } = await requireCurrentWorkspaceElementAccess("fulfilment", "fulfilment.services", "view");
    // Reads no longer seed or repair on disk (issue #21): the default product is
    // seeded at `bootstrapAgency`, and the legacy-field repair is applied in
    // memory by `agencyProductsForRead`. A GET that wrote whenever the caller
    // happened to hold `manage` meant the same request did different things for
    // different people, which is a strange thing for a listing to do.
    return NextResponse.json({
      ok: true,
      products: agencyProductsForRead(actor.resourceAgencyId, true),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const { actor } = await requireCurrentWorkspaceElementAccess("fulfilment", "fulfilment.services", "manage");
    const agencyId = actor.resourceAgencyId;
    const body = await request.json().catch(() => null) as Body | null;
    if (!body?.action) return NextResponse.json({ ok: false, error: "action required" }, { status: 400 });
    const existing = body.productId
      ? listAgencyProducts(agencyId, true).find(product => product.id === body.productId)
      : undefined;
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
      customFields: body.customFields ?? existing?.customFields ?? {},
    };
    const product = body.action === "create"
      ? createAgencyProduct(agencyId, input, session.userId)
      : body.productId
        ? updateAgencyProduct(agencyId, body.productId, input, session.userId)
        : null;
    if (!product) return NextResponse.json({ ok: false, error: "product not found" }, { status: 404 });
    const portalTemplate = product.status !== "archived" && product.portalRequirement !== "none"
      ? ensureProductPortalTemplate(agencyId, product, session.userId)
      : null;
    return NextResponse.json({ ok: true, product, portalTemplate: portalTemplate ? {
      id: portalTemplate.id,
      publishedVersionId: portalTemplate.publishedVersionId,
      productSourceUpdatedAt: portalTemplate.productSourceUpdatedAt,
    } : null });
  } catch (error) {
    if (error instanceof PortalFormValidationError) {
      return NextResponse.json({ ok: false, error: error.message, fieldId: error.fieldId }, { status: 422 });
    }
    return authErrorResponse(error);
  }
}
