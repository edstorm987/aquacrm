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
import { transitionClientProductStage } from "@/server/productStageTransitions";
import { resolveClientProductStage } from "@/lib/products/clientProductStageTruth";
import { ProductWorkspaceBusyError, withProductWorkspaceTransaction } from "@/server/productWorkspaceCoordinator";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

export async function POST(req: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const { actor } = await requireCurrentWorkspaceElementAccess("fulfilment", "fulfilment.services", "use");
    const agencyId = actor.resourceAgencyId;
    const body = await req.json().catch(() => null) as { clientId?: string; columnId?: string; productKey?: string; expectedRevision?: unknown } | null;
    if (!body?.clientId || !body.columnId) {
      return NextResponse.json({ ok: false, error: "clientId and columnId are required" }, { status: 400 });
    }
    const client = getClientForAgency(agencyId, body.clientId);
    if (!client) {
      return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });
    }
    await requireCurrentClientWorkspaceElementAccess(client.id, "client.fulfilment", "use");

    if (body.productKey) {
      if (typeof body.expectedRevision !== "number" || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) {
        return NextResponse.json({ ok: false, error: "expectedRevision is required" }, { status: 400 });
      }
      const catalogue = listAgencyProducts(agencyId, true);
      const product = getAgencyProduct(agencyId, body.productKey)
        ?? catalogue.find(item => item.portalTemplateKey === body.productKey);
      const columns = product ? agencyProductPipelineColumns(product) : [];
      const column = columns?.find(item => item.id === body.columnId);
      const assigned = product && resolvePortalProductAssignment(client.metadata ?? {}, catalogue).products
        .some(selection => selection.id === product.id);
      if (!product || !column || !assigned) {
        return NextResponse.json({ ok: false, error: "Product or delivery stage not found" }, { status: 404 });
      }
      const transition = await withProductWorkspaceTransaction({
        agencyId,
        clientId: client.id,
        productId: product.id,
      }, () => transitionClientProductStage({
          client,
          product,
          stageId: column.id,
          actorUserId: session.userId,
          actorEmail: session.email,
          expectedRevision: body.expectedRevision as number,
        }));
      if (!transition) {
        return NextResponse.json({ ok: false, error: "Could not update product delivery" }, { status: 422 });
      }
      if (transition.status === "conflict") {
        return NextResponse.json({
          ok: false,
          error: "This delivery record changed in another session. The latest stage has been loaded; review it and try again.",
          columnId: resolveClientProductStage(transition.client, product).stageId,
          workspaceRevision: transition.workspaceRevision,
        }, { status: 409 });
      }
      return NextResponse.json({
        ok: true,
        client: { id: transition.client.id, name: transition.client.name, stage: transition.client.stage },
        productKey: product.id,
        columnId: transition.stageId,
        portalMode: transition.portalMode,
        changed: transition.changed,
        workspaceRevision: transition.workspaceRevision,
      });
    }

    const pipeline = getPipelineBySlug(agencyId, "fulfilment");
    const column = pipeline?.columns.find(item => item.id === body.columnId);
    if (!pipeline || !column) {
      return NextResponse.json({ ok: false, error: "Client or delivery stage not found" }, { status: 404 });
    }

    const updated = updateClient(agencyId, client.id, { stage: column.id as ClientStage });
    if (!updated) {
      return NextResponse.json({ ok: false, error: "Could not update the client stage" }, { status: 422 });
    }

    migrateClientsToFulfilment(agencyId);
    const card = listCards(pipeline.id).find(item => item.kind === "client" && item.clientId === client.id);
    if (card) moveCard(agencyId, card.id, column.id);

    logActivity({
      agencyId,
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
    if (error instanceof ProductWorkspaceBusyError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    return authErrorResponse(error);
  }
}
