import { NextResponse } from "next/server";

import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { applyClientProductVariations, buildClientProductVariation, clientProductVariations, variationHasOverrides } from "@/lib/clients/clientProductVariations";
import { resolvePortalProductAssignment } from "@/lib/products/productAssignments";
import { getAgencyProduct, agencyProductsForRead } from "@/server/agencyProducts";
import { logActivity } from "@/server/activity";
import { reconcileClientProductWorkspaces } from "@/server/productWorkspaces";
import { ensureHydrated, getState } from "@/server/storage";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";
import { privateObjectLifecycleLockKey } from "@/lib/server/privateObjectLifecycle";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import {
  assertProductSopReferencesExist,
  SopReferenceValidationError,
} from "@/engines/sop/server/sopReferences";

type Body = Record<string, unknown> & {
  action?: "save" | "reset";
  clientId?: string;
  productId?: string;
};

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const body = await request.json().catch(() => null) as Body | null;
    const clientId = cleanId(body?.clientId);
    const productId = cleanId(body?.productId);
    if (!clientId || !productId || (body?.action !== "save" && body?.action !== "reset")) {
      return NextResponse.json({ ok: false, error: "clientId, productId and a valid action are required" }, { status: 400 });
    }

    const session = await requireRoleForClient(["agency-owner", "agency-manager"], clientId);
    // Tenancy first, then permission (404, not 403) — see api/tenants/close-deal/route.ts.
    const client = getClientForAgency(session.agencyId, clientId);
    if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    await requireCurrentClientWorkspaceElementAccess(clientId, "client.fulfilment", "manage");
    return await withPortalStateTransaction(privateObjectLifecycleLockKey(session.agencyId), () => {
      const currentClient = getClientForAgency(session.agencyId, clientId);
      if (!currentClient) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
      const catalogue = agencyProductsForRead(session.agencyId);
      const baseProduct = getAgencyProduct(session.agencyId, productId);
      if (!baseProduct) return NextResponse.json({ ok: false, error: "service not found" }, { status: 404 });
      const currentAssignment = resolvePortalProductAssignment(currentClient.metadata ?? {}, catalogue);
      if (!currentAssignment.effectiveIds.includes(productId)) {
        return NextResponse.json({ ok: false, error: "Assign this service to the client before creating a variation." }, { status: 409 });
      }

      const variations = clientProductVariations(currentClient.metadata ?? {});
      if (body.action === "reset") {
        delete variations[productId];
      } else {
        const variation = buildClientProductVariation(baseProduct, body, session.userId);
        assertProductSopReferencesExist(getState(), session.agencyId, variation, "clientProductVariation");
        if (variationHasOverrides(variation)) variations[productId] = variation;
        else delete variations[productId];
      }

      const nextMetadata = { ...(currentClient.metadata ?? {}), clientProductVariations: variations };
      const variedCatalogue = applyClientProductVariations(nextMetadata, catalogue);
      const assignment = resolvePortalProductAssignment(nextMetadata, variedCatalogue);
      const mode = currentClient.metadata?.portalMode === "designing" || currentClient.metadata?.portalMode === "developed-launch" || currentClient.metadata?.portalMode === "maintenance"
        ? currentClient.metadata.portalMode
        : "onboarding";
      const workspaces = reconcileClientProductWorkspaces({ ...currentClient, metadata: nextMetadata }, assignment.products, mode);
      const savedAt = Date.now();
      const updated = updateClient(session.agencyId, currentClient.id, { metadata: {
        clientProductVariations: variations,
        portalProducts: assignment.products,
        portalProductWorkspaces: workspaces,
        serviceVariationUpdatedAt: savedAt,
      } });
      if (!updated) return NextResponse.json({ ok: false, error: "client variation could not be saved" }, { status: 500 });

      const effectiveProduct = variedCatalogue.find(product => product.id === productId) ?? baseProduct;
      logActivity({
        agencyId: session.agencyId,
        clientId,
        actorUserId: session.userId,
        actorEmail: session.email,
        category: "fulfillment",
        action: body.action === "reset" ? "client.service_variation_reset" : "client.service_variation_saved",
        message: body.action === "reset"
          ? `Reset ${baseProduct.name} to the catalogue service for ${currentClient.name}.`
          : `Saved a client-specific ${baseProduct.name} variation for ${currentClient.name}.`,
        metadata: { productId, baseProductName: baseProduct.name, effectiveProductName: effectiveProduct.name },
      });
      return NextResponse.json({ ok: true, product: effectiveProduct, varied: Boolean(variations[productId]) });
    });
  } catch (error) {
    if (error instanceof SopReferenceValidationError) {
      return NextResponse.json({
        ok: false,
        reason: error.code,
        error: error.message,
        field: error.field,
        sopIds: error.sopIds,
      }, { status: 422 });
    }
    return authErrorResponse(error);
  }
}

function cleanId(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}
