import { NextResponse } from "next/server";

import { resolveAgencyProductAssignment, resolvePortalProductAssignment } from "@/lib/products/productAssignments";
import { portalProductSelectionFromAgencyProduct } from "@/lib/portal/portalProducts";
import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { logActivity } from "@/server/activity";
import { ensureDefaultAgencyProducts, getAgencyProduct } from "@/server/agencyProducts";
import {
  ensureProductPortalTemplate,
  getClientPortalInstance,
  publishPortalDesign,
  resetClientPortalFromTemplate,
} from "@/server/clientPortalDesigns";
import { reconcileClientProductWorkspaces } from "@/server/productWorkspaces";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

type RolloutAction = "sync-catalogue" | "adopt-template";

interface Body {
  action?: unknown;
  productId?: unknown;
  clientIds?: unknown;
}

function cleanId(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

function cleanIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanId).filter(Boolean))].slice(0, 100);
}

function portalMode(value: unknown) {
  return value === "designing" || value === "developed-launch" || value === "maintenance"
    ? value
    : "onboarding";
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const body = await request.json().catch(() => null) as Body | null;
    const action = body?.action as RolloutAction;
    const productId = cleanId(body?.productId);
    const clientIds = cleanIds(body?.clientIds);
    if (!productId || !clientIds.length || !["sync-catalogue", "adopt-template"].includes(action)) {
      return NextResponse.json({ ok: false, error: "productId, clientIds and a supported action are required" }, { status: 400 });
    }

    const product = getAgencyProduct(session.agencyId, productId);
    if (!product) return NextResponse.json({ ok: false, error: "product not found" }, { status: 404 });
    const catalogue = ensureDefaultAgencyProducts(session.agencyId);
    const clients = clientIds.flatMap(clientId => {
      const client = getClientForAgency(session.agencyId, clientId);
      return client ? [client] : [];
    });
    if (clients.length !== clientIds.length) {
      return NextResponse.json({ ok: false, error: "One or more clients are unavailable." }, { status: 409 });
    }
    for (const client of clients) {
      await requireCurrentClientWorkspaceElementAccess(
        client.id,
        action === "sync-catalogue" ? "client.fulfilment" : "client.portal",
        "manage",
      );
    }

    let updated = 0;
    let preserved = 0;
    let shared = 0;

    if (action === "sync-catalogue") {
      for (const client of clients) {
        const current = resolvePortalProductAssignment(client.metadata ?? {}, catalogue);
        if (!current.selectedIds.includes(productId) && !current.effectiveIds.includes(productId)) continue;
        const assignment = resolveAgencyProductAssignment(catalogue, current.selectedIds);
        const products = assignment.effectiveProducts.map(portalProductSelectionFromAgencyProduct);
        const workspaces = reconcileClientProductWorkspaces(client, products, portalMode(client.metadata?.portalMode));
        const syncedAt = Date.now();
        const history = Array.isArray(client.metadata?.portalProductAssignmentHistory)
          ? client.metadata.portalProductAssignmentHistory.slice(-19)
          : [];
        const saved = updateClient(session.agencyId, client.id, {
          metadata: {
            portalSelectedProductIds: assignment.selectedIds,
            portalProductIds: assignment.effectiveIds,
            portalProducts: products,
            portalProductWorkspaces: workspaces,
            portalProductAssignmentHistory: [...history, {
              selectedProductIds: assignment.selectedIds,
              effectiveProductIds: assignment.effectiveIds,
              products,
              assignedAt: syncedAt,
              assignedBy: session.userId,
              source: "product-rollout",
            }],
            serviceAssignmentUpdatedAt: syncedAt,
          },
        });
        if (saved) updated += 1;
      }
    } else {
      if (product.portalRequirement === "none") {
        return NextResponse.json({ ok: false, error: "This product does not use a client portal template." }, { status: 409 });
      }
      const template = ensureProductPortalTemplate(session.agencyId, product, session.userId);
      for (const client of clients) {
        const instance = getClientPortalInstance(session.agencyId, client.id);
        if (!instance) {
          preserved += 1;
          continue;
        }
        if (instance.templateId !== template.id) {
          shared += 1;
          continue;
        }
        const reset = resetClientPortalFromTemplate({ agencyId: session.agencyId, clientId: client.id, actorUserId: session.userId });
        const published = reset ? publishPortalDesign({
          agencyId: session.agencyId,
          scope: "client",
          recordId: reset.id,
          actorUserId: session.userId,
          label: `Adopted ${product.name} template`,
        }) : null;
        if (published) updated += 1;
      }
    }

    logActivity({
      agencyId: session.agencyId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "fulfillment",
      action: action === "sync-catalogue" ? "product.catalogue_rolled_out" : "product.template_rolled_out",
      message: `${action === "sync-catalogue" ? "Synced" : "Rolled out"} ${product.name} across ${updated} client${updated === 1 ? "" : "s"}.`,
      metadata: { productId, clientIds, updated, preserved, shared },
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, updated, preserved, shared });
  } catch (error) {
    return authErrorResponse(error);
  }
}
