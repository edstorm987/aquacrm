import { NextResponse } from "next/server";

import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth";
import { portalProductSelectionFromAgencyProduct, type PortalProductMode } from "@/lib/portalProducts";
import { ensureDefaultAgencyProducts } from "@/server/agencyProducts";
import { logActivity } from "@/server/activity";
import { reconcileClientProductWorkspaces } from "@/server/productWorkspaces";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";

interface Body {
  clientId?: unknown;
  productIds?: unknown;
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

    const session = await requireRoleForClient([...AGENCY_ROLES], clientId);
    const client = getClientForAgency(session.agencyId, clientId);
    if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });

    const requestedIds = cleanProductIds(body.productIds);
    const productById = new Map(ensureDefaultAgencyProducts(session.agencyId).map(product => [product.id, product]));
    const missing = requestedIds.filter(id => !productById.has(id));
    if (missing.length) {
      return NextResponse.json({ ok: false, error: "One or more selected services are no longer available." }, { status: 409 });
    }

    const products = requestedIds.map(id => portalProductSelectionFromAgencyProduct(productById.get(id)!));
    const mode = portalMode(client.metadata?.portalMode);
    const workspaces = reconcileClientProductWorkspaces(client, products, mode);
    const updated = updateClient(session.agencyId, client.id, {
      metadata: {
        portalProducts: products,
        portalProductWorkspaces: workspaces,
        serviceAssignmentUpdatedAt: Date.now(),
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
        ? `Assigned ${products.map(product => product.name).join(", ")} to ${client.name}.`
        : `Removed all service assignments from ${client.name}.`,
      metadata: { productIds: requestedIds, productNames: products.map(product => product.name) },
    });
    await flushPendingWrites();

    return NextResponse.json({ ok: true, products });
  } catch (error) {
    return authErrorResponse(error);
  }
}
