import "server-only";

import { resolveClientProductStage } from "@/lib/products/clientProductStageTruth";
import { resolvePortalProductAssignment } from "@/lib/products/productAssignments";
import type { PortalProductMode, PortalProductSelection } from "@/lib/portal/portalProducts";
import {
  cleanPortalProductWorkspaces,
  mergePortalProductWorkspaceStore,
  type PortalProductWorkspace,
} from "@/lib/portal/portalProductWorkspaces";
import type { Client, ClientStage } from "./types";
import { listAgencyProducts } from "./agencyProducts";
import { emit } from "./eventBus";
import { mutate } from "./storage";
import { updateClient } from "./tenants";

interface ProductWorkspaceMetadata {
  portalMode?: PortalProductMode;
  portalSelectedProductIds?: string[];
  portalProductIds?: string[];
  portalProducts?: PortalProductSelection[];
  portalProductWorkspaces?: Record<string, unknown>;
}

function metadata(client: Client): ProductWorkspaceMetadata {
  return (client.metadata ?? {}) as ProductWorkspaceMetadata;
}

function fallbackStage(value: unknown): PortalProductMode {
  return value === "designing" || value === "developed-launch" || value === "maintenance"
    ? value
    : "onboarding";
}

export function clientProductWorkspaces(client: Client): PortalProductWorkspace[] {
  const meta = metadata(client);
  const catalogue = listAgencyProducts(client.agencyId, true);
  const products = resolvePortalProductAssignment(meta, catalogue).products;
  const definitions = new Map(catalogue.flatMap(product => [
    [product.id, product] as const,
    ...(product.portalTemplateKey ? [[product.portalTemplateKey, product] as const] : []),
  ]));
  return cleanPortalProductWorkspaces(
    meta.portalProductWorkspaces,
    products,
    fallbackStage(meta.portalMode),
  ).map(workspace => {
    const selection = products.find(product => product.id === workspace.productId);
    const definition = definitions.get(workspace.productId)
      ?? (selection?.catalogKey ? definitions.get(selection.catalogKey) : undefined);
    if (!definition) return workspace;
    return { ...workspace, stage: resolveClientProductStage(client, definition).portalMode };
  });
}

export function saveClientProductWorkspaces(
  client: Client,
  workspaces: PortalProductWorkspace[],
): Client | null {
  const meta = metadata(client);
  return updateClient(client.agencyId, client.id, {
    metadata: {
      portalProductWorkspaces: mergePortalProductWorkspaceStore(meta.portalProductWorkspaces, workspaces),
    },
  });
}

export interface ProductWorkspaceVersionedChange {
  workspace: PortalProductWorkspace;
  metadata?: Record<string, unknown>;
  stage?: ClientStage;
  /** Set false when the requested projection is already fully converged. */
  write?: boolean;
}

export type ProductWorkspaceVersionedResult =
  | { status: "saved"; client: Client; workspace: PortalProductWorkspace }
  | { status: "conflict"; client: Client; workspace: PortalProductWorkspace }
  | { status: "not-found" };

/**
 * Compare-and-swap one product workspace inside the client row. Related
 * metadata/file projections supplied by the reducer commit in the same state
 * mutation; callers never need a second save that can split from the workspace.
 */
export function mutateClientProductWorkspaceVersioned(input: {
  agencyId: string;
  clientId: string;
  productId: string;
  expectedRevision: number;
  change: (current: { client: Client; workspace: PortalProductWorkspace }) => ProductWorkspaceVersionedChange;
}): ProductWorkspaceVersionedResult {
  let result: ProductWorkspaceVersionedResult = { status: "not-found" };
  let stageEvent: { from: ClientStage; to: ClientStage } | null = null;
  let wrote = false;
  mutate(state => {
    const current = state.clients[input.clientId];
    if (!current || current.agencyId !== input.agencyId) return;
    const currentWorkspace = clientProductWorkspaces(current).find(workspace => workspace.productId === input.productId);
    if (!currentWorkspace) return;
    if (currentWorkspace.revision !== input.expectedRevision) {
      result = { status: "conflict", client: current, workspace: currentWorkspace };
      return;
    }

    const change = input.change({ client: current, workspace: structuredClone(currentWorkspace) });
    if (change.write === false) {
      result = { status: "saved", client: current, workspace: currentWorkspace };
      return;
    }
    const nextWorkspace: PortalProductWorkspace = {
      ...change.workspace,
      schemaVersion: 1,
      revision: currentWorkspace.revision + 1,
      productId: currentWorkspace.productId,
      productName: currentWorkspace.productName,
    };
    const nextStage = change.stage ?? current.stage;
    const nextMetadata = {
      ...(current.metadata ?? {}),
      ...(change.metadata ?? {}),
      portalProductWorkspaces: mergePortalProductWorkspaceStore(
        current.metadata?.portalProductWorkspaces,
        [nextWorkspace],
      ),
    };
    const saved: Client = {
      ...current,
      stage: nextStage,
      metadata: nextMetadata,
      updatedAt: Date.now(),
    };
    state.clients[input.clientId] = saved;
    wrote = true;
    if (nextStage !== current.stage) stageEvent = { from: current.stage, to: nextStage };
    result = { status: "saved", client: saved, workspace: nextWorkspace };
  });
  const finalResult = result as ProductWorkspaceVersionedResult;
  if (finalResult.status === "saved" && wrote) {
    emit({ agencyId: input.agencyId, clientId: input.clientId }, "client.updated", { clientId: input.clientId });
    if (stageEvent) {
      const transition = stageEvent as { from: ClientStage; to: ClientStage };
      emit({ agencyId: input.agencyId, clientId: input.clientId }, "client.stage_changed", {
        clientId: input.clientId,
        from: transition.from,
        to: transition.to,
      });
    }
  }
  return finalResult;
}

export function reconcileClientProductWorkspaces(
  client: Client,
  products: PortalProductSelection[],
  stage: PortalProductMode,
): Record<string, unknown> {
  const meta = metadata(client);
  const workspaces = cleanPortalProductWorkspaces(meta.portalProductWorkspaces, products, stage);
  return mergePortalProductWorkspaceStore(meta.portalProductWorkspaces, workspaces);
}
