import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { logActivity } from "@/server/activity";
import {
  linkClientWorkspaces,
  listClientRelationshipWorkspaces,
  prepareLinkedClientWorkspaceCreation,
  unlinkClientWorkspace,
} from "@/server/clientRelationships";
import { flushPendingWrites } from "@/server/storage";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { getTradingCompany } from "@/server/tradingCompanies";
import { AGENCY_ROLES } from "@/server/types";
import { agencyProductsForRead } from "@/server/agencyProducts";
import { resolveAgencyProductAssignment } from "@/lib/products/productAssignments";
import { portalProductSelectionFromAgencyProduct } from "@/lib/portal/portalProducts";
import { reconcileClientProductWorkspaces } from "@/server/productWorkspaces";
import {
  ClientLifecycleOperationConflictError,
  ClientLifecyclePhaseNotFoundError,
  createClientWithLifecycleOperation,
  listAgencyLifecyclePhases,
} from "@/lib/server/clients/clientLifecycle";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

type Body = {
  action?: unknown;
  sourceClientId?: unknown;
  targetClientId?: unknown;
  name?: unknown;
  workspaceLabel?: unknown;
  websiteUrl?: unknown;
  companyId?: unknown;
  carryContact?: unknown;
  carryServices?: unknown;
  productIds?: unknown;
  operationId?: unknown;
};

function text(value: unknown, max = 160): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeWebsite(value: unknown): string | undefined {
  const raw = text(value, 2_000);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function ids(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap(item => {
    const id = text(item, 120);
    return id ? [id] : [];
  }))].slice(0, 24);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Body | null;
  const sourceClientId = text(body?.sourceClientId, 120);
  const action = text(body?.action, 30);
  if (!sourceClientId || !["create", "link", "unlink"].includes(action)) {
    return NextResponse.json({ ok: false, error: "A source workspace and valid action are required." }, { status: 400 });
  }

  try {
    const session = await requireRoleForClient([...AGENCY_ROLES], sourceClientId);
    await requireCurrentClientWorkspaceElementAccess(sourceClientId, "client.relationship", "manage");
    const source = getClientForAgency(session.agencyId, sourceClientId);
    if (!source) return NextResponse.json({ ok: false, error: "Client workspace not found." }, { status: 404 });

    if (action === "create") {
      const operationId = text(body?.operationId, 160) || `linked-workspace:${randomUUID()}`;
      const name = text(body?.name);
      if (!name) return NextResponse.json({ ok: false, error: "Enter the company or workspace name." }, { status: 400 });
      const companyId = text(body?.companyId, 120);
      if (companyId && !getTradingCompany(session.agencyId, companyId)) {
        return NextResponse.json({ ok: false, error: "The delivering company was not found." }, { status: 400 });
      }
      const rawWebsite = text(body?.websiteUrl, 2_000);
      const websiteUrl = safeWebsite(rawWebsite);
      if (rawWebsite && !websiteUrl) {
        return NextResponse.json({ ok: false, error: "Website must be a valid http or https URL." }, { status: 400 });
      }
      const hasExplicitProducts = Array.isArray(body?.productIds);
      const selectedProductIds = ids(body?.productIds);
      const catalogue = agencyProductsForRead(session.agencyId);
      const assignment = resolveAgencyProductAssignment(catalogue, selectedProductIds);
      if (hasExplicitProducts && assignment.missingIds.length) {
        return NextResponse.json({ ok: false, error: "One or more selected services are no longer available." }, { status: 409 });
      }
      if (hasExplicitProducts && assignment.inactiveIds.length) {
        return NextResponse.json({ ok: false, error: "Archived services cannot be assigned to a new workspace." }, { status: 409 });
      }
      const phases = await listAgencyLifecyclePhases(session.agencyId);
      const lifecycleStage = phases.some(phase => phase.stage === source.stage)
        ? source.stage
        : phases[0]?.stage;
      if (!lifecycleStage) {
        return NextResponse.json({ ok: false, error: "No lifecycle phase is available for the new workspace." }, { status: 409 });
      }
      const createInput = prepareLinkedClientWorkspaceCreation(session.agencyId, {
        sourceClientId,
        name,
        workspaceLabel: text(body?.workspaceLabel, 120),
        websiteUrl,
        companyId: companyId || undefined,
        carryContact: body?.carryContact !== false,
        carryServices: !hasExplicitProducts && body?.carryServices === true,
        selectedProductIds: hasExplicitProducts ? assignment.selectedIds : undefined,
        stage: lifecycleStage,
      });
      const creation = await createClientWithLifecycleOperation({
        agencyId: session.agencyId,
        actor: session.userId,
        operationId,
        createInput,
        requestFingerprint: {
          sourceClientId,
          name,
          workspaceLabel: text(body?.workspaceLabel, 120),
          websiteUrl,
          companyId: companyId || undefined,
          carryContact: body?.carryContact !== false,
          carryServices: !hasExplicitProducts && body?.carryServices === true,
          selectedProductIds: hasExplicitProducts ? assignment.selectedIds : undefined,
          stage: createInput.stage,
        },
      });
      const created = creation.client;
      if (!creation.ok) {
        return NextResponse.json({
          ok: false,
          error: creation.error ?? "Workspace lifecycle setup is incomplete.",
          code: "client_lifecycle_incomplete",
          clientId: created.id,
          lifecycle: creation.lifecycle,
          retryable: true,
        }, { status: 503 });
      }
      const assignedProducts = assignment.effectiveProducts.map(portalProductSelectionFromAgencyProduct);
      const assignmentHistory = Array.isArray(created.metadata?.portalProductAssignmentHistory)
        ? created.metadata.portalProductAssignmentHistory as Array<Record<string, unknown>>
        : [];
      const historyEntry = assignmentHistory.some(entry => entry.operationId === operationId)
        ? assignmentHistory
        : [...assignmentHistory, {
          operationId,
          selectedProductIds: assignment.selectedIds,
          effectiveProductIds: assignment.effectiveIds,
          products: assignedProducts,
          assignedAt: Date.now(),
          assignedBy: session.userId,
          source: "linked-workspace-creation",
        }];
      const workspace = hasExplicitProducts
        ? updateClient(session.agencyId, created.id, {
          metadata: {
            portalSelectedProductIds: assignment.selectedIds,
            portalProductIds: assignment.effectiveIds,
            portalProducts: assignedProducts,
            portalProductWorkspaces: reconcileClientProductWorkspaces(created, assignedProducts, "onboarding"),
            portalProductAssignmentHistory: historyEntry,
            serviceAssignmentUpdatedAt: Date.now(),
          },
        }) ?? created
        : created;
      logActivity({
        idempotencyKey: `client-workspace-created:${operationId}`,
        agencyId: session.agencyId,
        clientId: workspace.id,
        actorUserId: session.userId,
        actorEmail: session.email,
        category: "tenant",
        action: "client_workspace.created",
        message: `Created separate workspace “${workspace.name}” for the ${source.name} relationship.`,
        metadata: { sourceClientId, relationshipId: workspace.relationshipId, workspaceLabel: workspace.workspaceLabel, selectedProductIds: assignment.selectedIds, effectiveProductIds: assignment.effectiveIds },
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, client: workspace, workspaces: listClientRelationshipWorkspaces(session.agencyId, workspace.id) });
    }

    const targetClientId = text(body?.targetClientId, 120);
    if (!targetClientId) return NextResponse.json({ ok: false, error: "Choose a workspace." }, { status: 400 });
    // Linking or detaching changes both workspace records, so an exact grant
    // to only the source is deliberately insufficient.
    await requireRoleForClient([...AGENCY_ROLES], targetClientId);
    await requireCurrentClientWorkspaceElementAccess(targetClientId, "client.relationship", "manage");
    if (action === "link") {
      if (targetClientId === sourceClientId) return NextResponse.json({ ok: false, error: "Choose a different workspace." }, { status: 400 });
      const updated = linkClientWorkspaces(session.agencyId, sourceClientId, targetClientId);
      logActivity({
        agencyId: session.agencyId,
        clientId: sourceClientId,
        actorUserId: session.userId,
        actorEmail: session.email,
        category: "tenant",
        action: "client_workspace.linked",
        message: `Linked ${updated.length} workspaces into one client relationship.`,
        metadata: { sourceClientId, targetClientId, workspaceIds: updated.map(item => item.id) },
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, workspaces: listClientRelationshipWorkspaces(session.agencyId, sourceClientId) });
    }

    if (targetClientId === sourceClientId) {
      return NextResponse.json({ ok: false, error: "The current workspace cannot detach itself here." }, { status: 400 });
    }
    const siblings = listClientRelationshipWorkspaces(session.agencyId, sourceClientId, { includeArchived: true });
    if (!siblings.some(item => item.id === targetClientId)) {
      return NextResponse.json({ ok: false, error: "That workspace is not part of this relationship." }, { status: 409 });
    }
    const detached = unlinkClientWorkspace(session.agencyId, targetClientId, sourceClientId);
    if (!detached) return NextResponse.json({ ok: false, error: "Workspace could not be detached." }, { status: 500 });
    logActivity({
      agencyId: session.agencyId,
      clientId: targetClientId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "tenant",
      action: "client_workspace.unlinked",
      message: `Detached “${detached.name}” into its own client relationship.`,
      metadata: { sourceClientId, targetClientId },
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, workspaces: listClientRelationshipWorkspaces(session.agencyId, sourceClientId) });
  } catch (error) {
    if (error instanceof ClientLifecyclePhaseNotFoundError) {
      return NextResponse.json({ ok: false, error: error.message, code: "phase_not_found" }, { status: 409 });
    }
    if (error instanceof ClientLifecycleOperationConflictError) {
      return NextResponse.json({ ok: false, error: error.message, code: "operation_conflict" }, { status: 409 });
    }
    try {
      return authErrorResponse(error);
    } catch {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Workspace change failed." }, { status: 500 });
    }
  }
}
