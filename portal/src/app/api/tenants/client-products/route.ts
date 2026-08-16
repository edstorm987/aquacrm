import { NextResponse } from "next/server";

import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth";
import { resolveAgencyProductAssignment, resolvePortalProductAssignment } from "@/lib/productAssignments";
import { portalProductSelectionFromAgencyProduct, type PortalProductMode } from "@/lib/portalProducts";
import { ensureDefaultAgencyProducts } from "@/server/agencyProducts";
import { logActivity } from "@/server/activity";
import { reconcileClientProductWorkspaces } from "@/server/productWorkspaces";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getAgency, getClientForAgency, updateClient } from "@/server/tenants";
import { getTradingCompany } from "@/server/tradingCompanies";

interface Body {
  clientId?: unknown;
  productIds?: unknown;
  companyId?: unknown;
}

function cleanId(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

function cleanProductIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanId).filter(Boolean))].slice(0, 24);
}

function portalMode(value: unknown): PortalProductMode {
  return value === "designing" || value === "developed-launch" || value === "maintenance"
    ? value
    : "onboarding";
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const body = await request.json().catch(() => null) as Body | null;
    const clientId = cleanId(body?.clientId);
    if (!clientId || !Array.isArray(body?.productIds)) {
      return NextResponse.json({ ok: false, error: "clientId and productIds are required" }, { status: 400 });
    }

    const session = await requireRoleForClient(["agency-owner", "agency-manager"], clientId);
    const client = getClientForAgency(session.agencyId, clientId);
    if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });

    const requestedIds = cleanProductIds(body.productIds);
    const catalogue = ensureDefaultAgencyProducts(session.agencyId);
    const previousAssignment = resolvePortalProductAssignment(client.metadata ?? {}, catalogue);
    const assignment = resolveAgencyProductAssignment(catalogue, requestedIds);
    if (assignment.missingIds.length) {
      return NextResponse.json({ ok: false, error: "One or more selected services are no longer available." }, { status: 409 });
    }
    const previouslyAssigned = new Set(previousAssignment.effectiveIds);
    const newlyArchived = assignment.effectiveProducts.filter(product => !product.active && !previouslyAssigned.has(product.id));
    if (newlyArchived.length) {
      return NextResponse.json({
        ok: false,
        error: `${newlyArchived.map(product => product.name).join(", ")} ${newlyArchived.length === 1 ? "is" : "are"} archived and cannot be added to a client.`,
      }, { status: 409 });
    }

    const products = assignment.effectiveProducts.map(portalProductSelectionFromAgencyProduct);
    const hasCompanyAssignment = Object.prototype.hasOwnProperty.call(body, "companyId");
    if (hasCompanyAssignment && body?.companyId !== null && typeof body?.companyId !== "string") {
      return NextResponse.json({ ok: false, error: "companyId must be a company id or null" }, { status: 400 });
    }
    const requestedCompanyId = cleanId(body?.companyId);
    const effectiveCompanyId = hasCompanyAssignment ? requestedCompanyId : client.companyId ?? "";
    const company = effectiveCompanyId ? getTradingCompany(session.agencyId, effectiveCompanyId) : null;
    if (effectiveCompanyId && !company) {
      return NextResponse.json({ ok: false, error: "The selected company is no longer available." }, { status: 409 });
    }
    if (company?.status === "archived" && company.id !== client.companyId) {
      return NextResponse.json({ ok: false, error: "Archived companies cannot take new client assignments." }, { status: 409 });
    }
    const mode = portalMode(client.metadata?.portalMode);
    const defaultProviderName = getAgency(session.agencyId)?.name?.trim() || "Agency workspace";
    const workspaces = reconcileClientProductWorkspaces(client, products, mode);
    const assignedAt = Date.now();
    const existingHistory = Array.isArray(client.metadata?.portalProductAssignmentHistory)
      ? client.metadata.portalProductAssignmentHistory.slice(-19)
      : [];
    const updated = updateClient(session.agencyId, client.id, {
      companyId: hasCompanyAssignment ? requestedCompanyId || null : undefined,
      metadata: {
        portalSelectedProductIds: assignment.selectedIds,
        portalProductIds: assignment.effectiveIds,
        portalProducts: products,
        portalProductWorkspaces: workspaces,
        portalProductAssignmentHistory: [...existingHistory, {
          selectedProductIds: assignment.selectedIds,
          effectiveProductIds: assignment.effectiveIds,
          products,
          assignedAt,
          assignedBy: session.userId,
        }],
        serviceAssignmentUpdatedAt: assignedAt,
      },
    });
    if (!updated) return NextResponse.json({ ok: false, error: "service assignment failed" }, { status: 500 });

    logActivity({
      agencyId: session.agencyId,
      clientId: client.id,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "fulfillment",
      action: "client.services_assigned",
      message: products.length
        ? `Assigned ${products.map(product => product.name).join(", ")} to ${client.name} under ${company?.name ?? defaultProviderName}.`
        : `Updated ${client.name} under ${company?.name ?? defaultProviderName} with no service assignments.`,
      metadata: { selectedProductIds: assignment.selectedIds, productIds: assignment.effectiveIds, productNames: products.map(product => product.name), companyId: effectiveCompanyId || null, companyName: company?.name ?? defaultProviderName },
    });
    await flushPendingWrites();

    return NextResponse.json({ ok: true, selectedProductIds: assignment.selectedIds, productIds: assignment.effectiveIds, products, company: company ? { id: company.id, name: company.name } : null });
  } catch (error) {
    return authErrorResponse(error);
  }
}
