import "server-only";

import { cleanClientProductProcessState, setClientProductStage, type ClientProductProcessEntry } from "@/lib/clients/clientProductProcess";
import {
  accountStageForProductTruth,
  aggregateClientProductPortalMode,
  resolveClientProductStage,
} from "@/lib/products/clientProductStageTruth";
import { defaultProductInternalWorkspace } from "@/lib/products/productInternalWorkspace";
import { resolvePortalProductAssignment } from "@/lib/products/productAssignments";
import { mergePortalProductWorkspaceStore } from "@/lib/portal/portalProductWorkspaces";
import { logActivity } from "@/server/activity";
import { listAgencyProducts } from "@/server/agencyProducts";
import { mutateClientProductWorkspaceVersioned } from "@/server/productWorkspaces";
import type { AgencyProduct, Client } from "@/server/types";

export interface ProductStageTransitionResult {
  status: "saved";
  client: Client;
  entry: ClientProductProcessEntry;
  product: AgencyProduct;
  stageId: string;
  portalMode: "onboarding" | "designing" | "developed-launch" | "maintenance";
  previousStageId: string;
  changed: boolean;
  reconciled: boolean;
  workspaceRevision: number;
}

export interface ProductStageTransitionConflict {
  status: "conflict";
  client: Client;
  workspaceRevision: number;
}

export interface ProductStageTransitionInput {
  client: Client;
  product: AgencyProduct;
  stageId: string;
  actorUserId?: string;
  actorEmail: string;
  expectedRevision: number;
  now?: number;
}

interface ComputedProductStageTransition {
  entry: ClientProductProcessEntry;
  previousStageId: string;
  accountStage: Client["stage"];
  changed: boolean;
  reconciled: boolean;
}

/**
 * Move every product-stage projection in one client mutation. There are no
 * asynchronous/provider boundaries between the process, board, portal and
 * account-lifecycle writes, so a retry either observes the old state or the
 * complete new state. The activity key is stable for the open history entry.
 */
export function transitionClientProductStage(input: ProductStageTransitionInput): ProductStageTransitionResult | ProductStageTransitionConflict | null {
  const { client, product } = input;
  if (client.agencyId !== product.agencyId) return null;
  const now = input.now ?? Date.now();
  const catalogue = listAgencyProducts(client.agencyId, true);
  const assignment = resolvePortalProductAssignment(client.metadata ?? {}, catalogue);
  if (!assignment.effectiveIds.includes(product.id)) return null;

  const lifecycle = (product.internalWorkspace ?? defaultProductInternalWorkspace(product)).lifecycleStages;
  const target = lifecycle.find(stage => stage.id === input.stageId);
  if (!target) return null;

  let computed: ComputedProductStageTransition | null = null;
  const commit = mutateClientProductWorkspaceVersioned({
    agencyId: client.agencyId,
    clientId: client.id,
    productId: product.id,
    expectedRevision: input.expectedRevision,
    change: current => {
      const before = resolveClientProductStage(current.client, product);
      const process = setClientProductStage(
        cleanClientProductProcessState(current.client.metadata?.clientProductProcess),
        product.id,
        target.id,
        input.actorEmail,
        now,
      );
      const workspace = { ...current.workspace, stage: target.portalMode, updatedAt: now };
      const currentPipelineStages = current.client.metadata?.productPipelineStages;
      const productPipelineStages = currentPipelineStages && typeof currentPipelineStages === "object" && !Array.isArray(currentPipelineStages)
        ? { ...currentPipelineStages as Record<string, unknown>, [product.id]: target.id }
        : { [product.id]: target.id };
      const portalProductWorkspaces = mergePortalProductWorkspaceStore(
        current.client.metadata?.portalProductWorkspaces,
        [workspace],
      );
      const metadata: Record<string, unknown> = {
        ...(current.client.metadata ?? {}),
        clientProductProcess: process,
        productPipelineStages,
        portalProductWorkspaces,
      };
      const currentAssignment = resolvePortalProductAssignment(metadata, catalogue);
      const assignedProducts = catalogue.filter(item => currentAssignment.effectiveIds.includes(item.id));
      const prospective = { ...current.client, metadata };
      const portalMode = aggregateClientProductPortalMode(prospective, assignedProducts);
      const accountStage = accountStageForProductTruth(prospective, assignedProducts);
      const rawPortalWorkspaces = current.client.metadata?.portalProductWorkspaces;
      const priorPortalStage = rawPortalWorkspaces && typeof rawPortalWorkspaces === "object" && !Array.isArray(rawPortalWorkspaces)
        ? ((rawPortalWorkspaces as Record<string, unknown>)[product.id] as { stage?: unknown } | undefined)?.stage
        : undefined;
      const priorPipelineStage = currentPipelineStages && typeof currentPipelineStages === "object" && !Array.isArray(currentPipelineStages)
        ? (currentPipelineStages as Record<string, unknown>)[product.id]
        : undefined;
      const entry = process[product.id]!;
      const priorProcess = cleanClientProductProcessState(current.client.metadata?.clientProductProcess)[product.id];
      const changed = before.stageId !== target.id;
      const reconciled = priorProcess?.currentStageId !== target.id
        || priorPipelineStage !== target.id
        || priorPortalStage !== target.portalMode
        || current.client.metadata?.portalMode !== portalMode
        || current.client.stage !== accountStage;
      computed = {
        entry,
        previousStageId: before.stageId,
        accountStage,
        changed,
        reconciled,
      };
      return {
        workspace,
        metadata: { clientProductProcess: process, productPipelineStages, portalMode },
        stage: accountStage,
        write: changed || reconciled,
      };
    },
  });
  if (commit.status === "not-found") return null;
  if (commit.status === "conflict") {
    return { status: "conflict", client: commit.client, workspaceRevision: commit.workspace.revision };
  }
  if (!computed) return null;
  const details = computed as ComputedProductStageTransition;
  const { entry, changed, accountStage } = details;
  if (changed) {
    const enteredAt = entry.stageHistory?.find(history => history.stageId === target.id && !history.exitedAt)?.enteredAt ?? entry.updatedAt ?? now;
    logActivity({
      idempotencyKey: `client-product-stage:${client.id}:${product.id}:${target.id}:${enteredAt}`,
      agencyId: client.agencyId,
      clientId: client.id,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      category: "fulfillment",
      action: "client_product_stage.moved",
      message: `Moved ${product.name} to ${target.label}.`,
      metadata: {
        productId: product.id,
        fromStage: details.previousStageId,
        toStage: target.id,
        portalMode: target.portalMode,
        accountStage,
      },
    });
  }

  return {
    status: "saved",
    client: commit.client,
    entry,
    product,
    stageId: target.id,
    portalMode: target.portalMode,
    previousStageId: details.previousStageId,
    changed,
    reconciled: details.reconciled,
    workspaceRevision: commit.workspace.revision,
  };
}
