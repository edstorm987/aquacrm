import { cleanClientProductProcessState } from "@/lib/clients/clientProductProcess";
import { defaultProductInternalWorkspace } from "@/lib/products/productInternalWorkspace";
import { defaultAgencyProductPipelineStage } from "@/lib/products/fulfilmentProductPipelines";
import type { PortalProductMode } from "@/lib/portal/portalProducts";
import type { AgencyProduct, Client, ClientStage } from "@/server/types";

type StageProduct = Pick<AgencyProduct, "id" | "name" | "portalTemplateKey" | "internalWorkspace" | "sopIds">;

export interface ClientProductStageTruth {
  stageId: string;
  portalMode: PortalProductMode;
  source: "process" | "legacy-pipeline" | "portal-workspace" | "account-fallback";
}

const PORTAL_MODE_ORDER: readonly PortalProductMode[] = [
  "onboarding",
  "designing",
  "developed-launch",
  "maintenance",
];

const ACCOUNT_STAGE_BY_PORTAL_MODE: Record<PortalProductMode, ClientStage> = {
  onboarding: "aqua-epic-intro",
  designing: "aqua-brand-builder",
  "developed-launch": "aqua-traffic",
  maintenance: "aqua-mastery",
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function productLifecycle(product: StageProduct) {
  return (product.internalWorkspace ?? defaultProductInternalWorkspace(product)).lifecycleStages;
}

/**
 * Resolve one product stage through a single precedence contract. The process
 * record is canonical. The older board and portal fields remain migration
 * fallbacks only, so old clients keep their last known position until the next
 * transition materialises every mirror.
 */
export function resolveClientProductStage(
  client: Pick<Client, "stage" | "metadata">,
  product: StageProduct,
): ClientProductStageTruth {
  const lifecycle = productLifecycle(product);
  const byId = new Map(lifecycle.map(stage => [stage.id, stage]));
  const metadata = record(client.metadata);
  const process = cleanClientProductProcessState(metadata.clientProductProcess);
  const processStage = text(process[product.id]?.currentStageId);
  const fromProcess = byId.get(processStage);
  if (fromProcess) return { stageId: fromProcess.id, portalMode: fromProcess.portalMode, source: "process" };

  const legacy = record(metadata.productPipelineStages);
  const legacyStage = text(legacy[product.id]) || (product.portalTemplateKey ? text(legacy[product.portalTemplateKey]) : "");
  const fromLegacy = byId.get(legacyStage);
  if (fromLegacy) return { stageId: fromLegacy.id, portalMode: fromLegacy.portalMode, source: "legacy-pipeline" };

  const workspace = record(record(metadata.portalProductWorkspaces)[product.id]);
  const workspaceMode = text(workspace.stage) as PortalProductMode;
  const fromWorkspace = PORTAL_MODE_ORDER.includes(workspaceMode)
    ? lifecycle.find(stage => stage.portalMode === workspaceMode)
    : undefined;
  if (fromWorkspace) return { stageId: fromWorkspace.id, portalMode: fromWorkspace.portalMode, source: "portal-workspace" };

  const fallbackId = defaultAgencyProductPipelineStage(product, client.stage);
  const fallback = byId.get(fallbackId) ?? lifecycle[0];
  return {
    stageId: fallback?.id ?? "onboarding",
    portalMode: fallback?.portalMode ?? "onboarding",
    source: "account-fallback",
  };
}

export function aggregateClientProductPortalMode(
  client: Pick<Client, "stage" | "metadata">,
  products: StageProduct[],
): PortalProductMode {
  if (!products.length) {
    const stored = text(record(client.metadata).portalMode) as PortalProductMode;
    return PORTAL_MODE_ORDER.includes(stored) ? stored : "onboarding";
  }
  return products
    .map(product => resolveClientProductStage(client, product).portalMode)
    .reduce((earliest, mode) => PORTAL_MODE_ORDER.indexOf(mode) < PORTAL_MODE_ORDER.indexOf(earliest) ? mode : earliest, "maintenance");
}

export function accountStageForProductTruth(
  client: Pick<Client, "stage" | "metadata">,
  products: StageProduct[],
): ClientStage {
  if (client.stage === "churned") return "churned";
  return ACCOUNT_STAGE_BY_PORTAL_MODE[aggregateClientProductPortalMode(client, products)];
}

