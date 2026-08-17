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
import { applyClientProductVariations } from "@/lib/clientProductVariations";
import { productStatus } from "@/server/agencyProducts";

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
    const catalogue = applyClientProductVariations(client.metadata ?? {}, ensureDefaultAgencyProducts(session.agencyId));
    const previousAssignment = resolvePortalProductAssignment(client.metadata ?? {}, catalogue);
    const assignment = resolveAgencyProductAssignment(catalogue, requestedIds);
    if (assignment.missingIds.length) {
      return NextResponse.json({ ok: false, error: "One or more selected services are no longer available." }, { status: 409 });
    }
    const previouslyAssigned = new Set(previousAssignment.effectiveIds);
    const unavailable = assignment.effectiveProducts.filter(product => productStatus(product) !== "live" && !previouslyAssigned.has(product.id));
    if (unavailable.length) {
      return NextResponse.json({
        ok: false,
        error: `${unavailable.map(product => product.name).join(", ")} ${unavailable.length === 1 ? "is" : "are"} still draft or archived and cannot be added to a client.`,
      }, { status: 409 });
    }

    const products = assignment.effectiveProducts.map(portalProductSelectionFromAgencyProduct);
    const previousSelectedIds = new Set(previousAssignment.selectedIds);
    const currentSelectedIds = new Set(assignment.selectedIds);
    const addedProductIds = assignment.selectedIds.filter(id => !previousSelectedIds.has(id));
    const removedProductIds = previousAssignment.selectedIds.filter(id => !currentSelectedIds.has(id));
    const addedProductNames = addedProductIds.map(id => catalogue.find(product => product.id === id)?.name).filter((name): name is string => Boolean(name));
    const removedProductNames = removedProductIds.map(id => catalogue.find(product => product.id === id)?.name).filter((name): name is string => Boolean(name));
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
    const changeType = existingHistory.length === 0 && previousAssignment.selectedIds.length === 0
      ? "initial"
      : addedProductIds.length > 0 && removedProductIds.length === 0
        ? "upsell"
        : removedProductIds.length > 0 && addedProductIds.length === 0
          ? "contraction"
          : addedProductIds.length || removedProductIds.length
            ? "reconfiguration"
            : "unchanged";
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
          addedProductIds,
          addedProductNames,
          removedProductIds,
          removedProductNames,
          changeType,
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
      action: changeType === "upsell" ? "client.services_expanded" : changeType === "contraction" ? "client.services_reduced" : "client.services_assigned",
      message: changeType === "upsell"
        ? `Expanded ${client.name} with ${addedProductNames.join(", ")}.`
        : changeType === "contraction"
          ? `Removed ${removedProductNames.join(", ")} from ${client.name}.`
          : products.length
            ? `Assigned ${products.map(product => product.name).join(", ")} to ${client.name} under ${company?.name ?? defaultProviderName}.`
            : `Updated ${client.name} under ${company?.name ?? defaultProviderName} with no service assignments.`,
      metadata: { selectedProductIds: assignment.selectedIds, productIds: assignment.effectiveIds, productNames: products.map(product => product.name), addedProductIds, addedProductNames, removedProductIds, removedProductNames, changeType, companyId: effectiveCompanyId || null, companyName: company?.name ?? defaultProviderName },
    });
    await flushPendingWrites();

    return NextResponse.json({ ok: true, selectedProductIds: assignment.selectedIds, productIds: assignment.effectiveIds, products, company: company ? { id: company.id, name: company.name } : null });
  } catch (error) {
    return authErrorResponse(error);
  }
}
