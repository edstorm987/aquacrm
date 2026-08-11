import "server-only";

import { cleanPortalProducts, type PortalProductMode, type PortalProductSelection } from "@/lib/portalProducts";
import {
  cleanPortalProductWorkspaces,
  mergePortalProductWorkspaceStore,
  type PortalProductWorkspace,
} from "@/lib/portalProductWorkspaces";
import type { Client } from "./types";
import { updateClient } from "./tenants";

interface ProductWorkspaceMetadata {
  portalMode?: PortalProductMode;
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
  const products = cleanPortalProducts(meta.portalProducts);
  return cleanPortalProductWorkspaces(
    meta.portalProductWorkspaces,
    products,
    fallbackStage(meta.portalMode),
  );
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

export function reconcileClientProductWorkspaces(
  client: Client,
  products: PortalProductSelection[],
  stage: PortalProductMode,
): Record<string, unknown> {
  const meta = metadata(client);
  const workspaces = cleanPortalProductWorkspaces(meta.portalProductWorkspaces, products, stage);
  return mergePortalProductWorkspaceStore(meta.portalProductWorkspaces, workspaces);
}
