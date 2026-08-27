import { NextResponse } from "next/server";

import { cleanRecordText } from "@/lib/clients/clientRelationshipRecord";
import { cleanClientProductProcessState, setClientProductStepCompletion } from "@/lib/clients/clientProductProcess";
import { defaultProductInternalWorkspace } from "@/lib/products/productInternalWorkspace";
import { resolvePortalProductAssignment } from "@/lib/products/productAssignments";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { logActivity } from "@/server/activity";
import { ensureDefaultAgencyProducts } from "@/server/agencyProducts";
import { transitionClientProductStage } from "@/server/productStageTransitions";
import { mutateClientProductWorkspaceVersioned } from "@/server/productWorkspaces";
import { ProductWorkspaceBusyError, withProductWorkspaceTransaction } from "@/server/productWorkspaceCoordinator";
import { ensureHydrated } from "@/server/storage";
import { getClientForAgency } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

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
    const expectedRevision = body?.expectedRevision;
    if (typeof expectedRevision !== "number" || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      return NextResponse.json({ ok: false, error: "expectedRevision is required" }, { status: 400 });
    }

    const session = await requireRoleForClient([...AGENCY_ROLES], clientId);
    await requireCurrentClientWorkspaceElementAccess(clientId, "client.fulfilment", "use");
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
    if (action === "set-stage") {
      const stageId = cleanRecordText(body?.stageId, 160);
      const stage = workspace.lifecycleStages.find(item => item.id === stageId);
      if (!stage) return NextResponse.json({ ok: false, error: "stage is not part of this product lifecycle" }, { status: 400 });
      const transition = await withProductWorkspaceTransaction({
        agencyId: session.agencyId,
        clientId,
        productId,
      }, () => transitionClientProductStage({
          client,
          product,
          stageId: stage.id,
          actorUserId: session.userId,
          actorEmail: session.email,
          expectedRevision,
        }));
      if (!transition) return NextResponse.json({ ok: false, error: "service stage could not be saved" }, { status: 500 });
      if (transition.status === "conflict") {
        return NextResponse.json({
          ok: false,
          error: "This service record changed in another session. The latest version has been loaded; review it and try again.",
          entry: cleanClientProductProcessState(transition.client.metadata?.clientProductProcess)[productId],
          workspaceRevision: transition.workspaceRevision,
        }, { status: 409 });
      }
      return NextResponse.json({
        ok: true,
        entry: transition.entry,
        portalMode: transition.portalMode,
        accountStage: transition.client.stage,
        changed: transition.changed,
        workspaceRevision: transition.workspaceRevision,
      });
    }

    const stepId = cleanRecordText(body?.stepId, 160);
    if (!stepId || typeof body?.completed !== "boolean") {
      return NextResponse.json({ ok: false, error: "stepId and completed are required" }, { status: 400 });
    }
    const step = workspace.processSteps.find(item => item.id === stepId);
    if (!step) return NextResponse.json({ ok: false, error: "step is not part of this product process" }, { status: 400 });

    let savedEntry;
    const commit = await withProductWorkspaceTransaction({
      agencyId: session.agencyId,
      clientId,
      productId,
    }, () => mutateClientProductWorkspaceVersioned({
        agencyId: session.agencyId,
        clientId,
        productId,
        expectedRevision,
        change: current => {
          const processState = setClientProductStepCompletion(
            cleanClientProductProcessState(current.client.metadata?.clientProductProcess),
            productId,
            stepId,
            body.completed as boolean,
            session.email,
          );
          savedEntry = processState[productId];
          return { workspace: current.workspace, metadata: { clientProductProcess: processState } };
        },
      }));
    if (commit.status === "not-found") return NextResponse.json({ ok: false, error: "process state could not be saved" }, { status: 500 });
    if (commit.status === "conflict") {
      return NextResponse.json({
        ok: false,
        error: "This service record changed in another session. The latest version has been loaded; review it and try again.",
        entry: cleanClientProductProcessState(commit.client.metadata?.clientProductProcess)[productId],
        workspaceRevision: commit.workspace.revision,
      }, { status: 409 });
    }

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
    return NextResponse.json({ ok: true, entry: savedEntry, workspaceRevision: commit.workspace.revision });
  } catch (error) {
    if (error instanceof ProductWorkspaceBusyError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    return authErrorResponse(error);
  }
}
