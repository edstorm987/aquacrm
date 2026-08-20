import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { logActivity } from "@/server/activity";
import {
  getPipelineBySlug,
  listCards,
  migrateClientsToFulfilment,
  moveCard,
} from "@/server/pipelines";
import { ensureHydrated } from "@/server/storage";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { AGENCY_ROLES, type ClientStage } from "@/server/types";
import { resolvePortalProductAssignment } from "@/lib/products/productAssignments";
import { getAgencyProduct, listAgencyProducts } from "@/server/agencyProducts";
import { agencyProductPipelineColumns } from "@/lib/products/fulfilmentProductPipelines";

export async function POST(req: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const body = await req.json().catch(() => null) as { clientId?: string; columnId?: string; productKey?: string } | null;
    if (!body?.clientId || !body.columnId) {
      return NextResponse.json({ ok: false, error: "clientId and columnId are required" }, { status: 400 });
    }
    const client = getClientForAgency(session.agencyId, body.clientId);
    if (!client) {
      return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });
    }

    if (body.productKey) {
      const catalogue = listAgencyProducts(session.agencyId, true);
      const product = getAgencyProduct(session.agencyId, body.productKey)
        ?? catalogue.find(item => item.portalTemplateKey === body.productKey);
      const columns = product ? agencyProductPipelineColumns(product) : [];
      const column = columns?.find(item => item.id === body.columnId);
      const assigned = product && resolvePortalProductAssignment(client.metadata ?? {}, catalogue).products
        .some(selection => selection.id === product.id);
      if (!product || !column || !assigned) {
        return NextResponse.json({ ok: false, error: "Product or delivery stage not found" }, { status: 404 });
      }
      const currentStages = client.metadata?.productPipelineStages;
      const productPipelineStages = currentStages && typeof currentStages === "object"
        ? { ...currentStages as Record<string, unknown> }
        : {};
      const previous = typeof productPipelineStages[product.id] === "string"
        ? productPipelineStages[product.id]
        : product.portalTemplateKey && typeof productPipelineStages[product.portalTemplateKey] === "string"
          ? productPipelineStages[product.portalTemplateKey]
        : undefined;
      productPipelineStages[product.id] = column.id;
      const updated = updateClient(session.agencyId, client.id, {
        metadata: { productPipelineStages },
      });
      if (!updated) {
        return NextResponse.json({ ok: false, error: "Could not update product delivery" }, { status: 422 });
      }

      logActivity({
        agencyId: session.agencyId,
        clientId: client.id,
        actorUserId: session.userId,
        actorEmail: session.email,
        category: "fulfillment",
        action: "client.product-delivery-stage.moved",
        message: `Moved ${client.name}'s product delivery to ${column.label}.`,
        metadata: { productId: product.id, productKey: product.portalTemplateKey, fromStage: previous, toStage: column.id },
      });

      return NextResponse.json({
        ok: true,
        client: { id: updated.id, name: updated.name },
        productKey: product.id,
        columnId: column.id,
      });
    }

    const pipeline = getPipelineBySlug(session.agencyId, "fulfilment");
    const column = pipeline?.columns.find(item => item.id === body.columnId);
    if (!pipeline || !column) {
      return NextResponse.json({ ok: false, error: "Client or delivery stage not found" }, { status: 404 });
    }

    const updated = updateClient(session.agencyId, client.id, { stage: column.id as ClientStage });
    if (!updated) {
      return NextResponse.json({ ok: false, error: "Could not update the client stage" }, { status: 422 });
    }

    migrateClientsToFulfilment(session.agencyId);
    const card = listCards(pipeline.id).find(item => item.kind === "client" && item.clientId === client.id);
    if (card) moveCard(session.agencyId, card.id, column.id);

    logActivity({
      agencyId: session.agencyId,
      clientId: client.id,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "fulfillment",
      action: "client.delivery-stage.moved",
      message: `Moved ${client.name} to ${column.label}.`,
      metadata: { fromStage: client.stage, toStage: column.id, pipelineId: pipeline.id },
    });

    return NextResponse.json({
      ok: true,
      client: { id: updated.id, name: updated.name, stage: updated.stage },
      columnId: column.id,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
