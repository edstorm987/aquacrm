import { NextResponse } from "next/server";

import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { applyClientProductVariations, buildClientProductVariation, clientProductVariations, variationHasOverrides } from "@/lib/clients/clientProductVariations";
import { resolvePortalProductAssignment } from "@/lib/products/productAssignments";
import { getAgencyProduct, agencyProductsForRead } from "@/server/agencyProducts";
import { logActivity } from "@/server/activity";
import { reconcileClientProductWorkspaces } from "@/server/productWorkspaces";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

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
    await requireCurrentClientWorkspaceElementAccess(clientId, "client.fulfilment", "manage");
    const client = getClientForAgency(session.agencyId, clientId);
    if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    const catalogue = agencyProductsForRead(session.agencyId);
    const baseProduct = getAgencyProduct(session.agencyId, productId);
    if (!baseProduct) return NextResponse.json({ ok: false, error: "service not found" }, { status: 404 });
    const currentAssignment = resolvePortalProductAssignment(client.metadata ?? {}, catalogue);
    if (!currentAssignment.effectiveIds.includes(productId)) {
      return NextResponse.json({ ok: false, error: "Assign this service to the client before creating a variation." }, { status: 409 });
    }

    const variations = clientProductVariations(client.metadata ?? {});
    if (body.action === "reset") {
      delete variations[productId];
    } else {
      const variation = buildClientProductVariation(baseProduct, body, session.userId);
      if (variationHasOverrides(variation)) variations[productId] = variation;
      else delete variations[productId];
    }

    const nextMetadata = { ...(client.metadata ?? {}), clientProductVariations: variations };
    const variedCatalogue = applyClientProductVariations(nextMetadata, catalogue);
    const assignment = resolvePortalProductAssignment(nextMetadata, variedCatalogue);
    const mode = client.metadata?.portalMode === "designing" || client.metadata?.portalMode === "developed-launch" || client.metadata?.portalMode === "maintenance"
      ? client.metadata.portalMode
      : "onboarding";
    const workspaces = reconcileClientProductWorkspaces({ ...client, metadata: nextMetadata }, assignment.products, mode);
    const savedAt = Date.now();
    const updated = updateClient(session.agencyId, client.id, { metadata: {
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
        ? `Reset ${baseProduct.name} to the catalogue service for ${client.name}.`
        : `Saved a client-specific ${baseProduct.name} variation for ${client.name}.`,
      metadata: { productId, baseProductName: baseProduct.name, effectiveProductName: effectiveProduct.name },
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, product: effectiveProduct, varied: Boolean(variations[productId]) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

function cleanId(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}
