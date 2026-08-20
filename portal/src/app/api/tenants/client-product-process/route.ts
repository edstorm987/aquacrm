import { NextResponse } from "next/server";

import { cleanRecordText } from "@/lib/clients/clientRelationshipRecord";
import { cleanClientProductProcessState, setClientProductStage, setClientProductStepCompletion } from "@/lib/clients/clientProductProcess";
import { defaultProductInternalWorkspace } from "@/lib/products/productInternalWorkspace";
import { resolvePortalProductAssignment } from "@/lib/products/productAssignments";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { logActivity } from "@/server/activity";
import { ensureDefaultAgencyProducts } from "@/server/agencyProducts";
import { clientProductWorkspaces, saveClientProductWorkspaces } from "@/server/productWorkspaces";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const clientId = cleanRecordText(body?.clientId, 120);
    const productId = cleanRecordText(body?.productId, 120);
    const action = body?.action === "set-stage" ? "set-stage" : "set-completion";
    if (!clientId || !productId) {
      return NextResponse.json({ ok: false, error: "clientId and productId are required" }, { status: 400 });
    }

    const session = await requireRoleForClient([...AGENCY_ROLES], clientId);
    const client = getClientForAgency(session.agencyId, clientId);
    if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });

    const catalogue = ensureDefaultAgencyProducts(session.agencyId);
    const assignment = resolvePortalProductAssignment(client.metadata ?? {}, catalogue);
    if (!assignment.effectiveIds.includes(productId)) {
      return NextResponse.json({ ok: false, error: "product is not assigned to this client" }, { status: 400 });
    }
    const product = catalogue.find(item => item.id === productId);
    if (!product) return NextResponse.json({ ok: false, error: "product is no longer available" }, { status: 404 });
    const workspace = product.internalWorkspace ?? defaultProductInternalWorkspace(product);
    const existingState = cleanClientProductProcessState(client.metadata?.clientProductProcess);

    if (action === "set-stage") {
      const stageId = cleanRecordText(body?.stageId, 160);
      const stage = workspace.lifecycleStages.find(item => item.id === stageId);
      if (!stage) return NextResponse.json({ ok: false, error: "stage is not part of this product lifecycle" }, { status: 400 });
      const processState = setClientProductStage(existingState, productId, stage.id, session.email);
      const updated = updateClient(session.agencyId, clientId, { metadata: { clientProductProcess: processState } });
      if (!updated) return NextResponse.json({ ok: false, error: "service stage could not be saved" }, { status: 500 });
      const portalWorkspaces = clientProductWorkspaces(updated);
      const portalWorkspace = portalWorkspaces.find(item => item.productId === productId);
      if (portalWorkspace) {
        portalWorkspace.stage = stage.portalMode;
        portalWorkspace.updatedAt = Date.now();
        saveClientProductWorkspaces(updated, portalWorkspaces);
      }
      logActivity({
        agencyId: session.agencyId,
        clientId,
        actorUserId: session.userId,
        actorEmail: session.email,
        category: "tenant",
        action: "client_product_stage.moved",
        message: `Moved ${product.name} to ${stage.label}.`,
        metadata: { productId, stageId: stage.id, portalMode: stage.portalMode },
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, entry: processState[productId] });
    }

    const stepId = cleanRecordText(body?.stepId, 160);
    if (!stepId || typeof body?.completed !== "boolean") {
      return NextResponse.json({ ok: false, error: "stepId and completed are required" }, { status: 400 });
    }
    const step = workspace.processSteps.find(item => item.id === stepId);
    if (!step) return NextResponse.json({ ok: false, error: "step is not part of this product process" }, { status: 400 });

    const processState = setClientProductStepCompletion(
      existingState,
      productId,
      stepId,
      body.completed,
      session.email,
    );
    const updated = updateClient(session.agencyId, clientId, { metadata: { clientProductProcess: processState } });
    if (!updated) return NextResponse.json({ ok: false, error: "process state could not be saved" }, { status: 500 });

    logActivity({
      agencyId: session.agencyId,
      clientId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "tenant",
      action: body.completed ? "client_product_step.completed" : "client_product_step.reopened",
      message: `${body.completed ? "Completed" : "Reopened"} ${step.title} for ${product.name}.`,
      metadata: { productId, stepId },
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, entry: processState[productId] });
  } catch (error) {
    return authErrorResponse(error);
  }
}
