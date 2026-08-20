import type { PortalProductKey } from "@/lib/portal/portalProducts";
import { defaultProductInternalWorkspace } from "@/lib/products/productInternalWorkspace";
import type { AgencyProduct, ClientStage } from "@/server/types";

export interface ProductPipelineColumn {
  id: string;
  label: string;
  color: string;
}

export const PRODUCT_PIPELINE_COLUMNS: Record<PortalProductKey, ProductPipelineColumn[]> = {
  website: [
    { id: "brief", label: "Brief", color: "#7c8f8e" },
    { id: "content", label: "Content", color: "#9a7b4f" },
    { id: "design", label: "Design", color: "#8a6f9e" },
    { id: "build", label: "Build", color: "#527aa3" },
    { id: "review", label: "Review", color: "#c07842" },
    { id: "launch", label: "Launch", color: "#2f8b68" },
    { id: "care", label: "Live care", color: "#3f6f65" },
  ],
  photography: [
    { id: "brief", label: "Brief", color: "#7c8f8e" },
    { id: "planning", label: "Shoot plan", color: "#9a7b4f" },
    { id: "booked", label: "Booked", color: "#527aa3" },
    { id: "shot", label: "Shoot complete", color: "#8a6f9e" },
    { id: "editing", label: "Editing", color: "#c07842" },
    { id: "review", label: "Client review", color: "#3f8192" },
    { id: "delivered", label: "Delivered", color: "#2f8b68" },
  ],
  "brand-identity": [
    { id: "discovery", label: "Discovery", color: "#7c8f8e" },
    { id: "direction", label: "Creative direction", color: "#9a7b4f" },
    { id: "concepts", label: "Concepts", color: "#8a6f9e" },
    { id: "refinement", label: "Refinement", color: "#527aa3" },
    { id: "approval", label: "Approval", color: "#c07842" },
    { id: "assets", label: "Final assets", color: "#2f8b68" },
  ],
  "google-profile": [
    { id: "access", label: "Access", color: "#7c8f8e" },
    { id: "audit", label: "Audit", color: "#9a7b4f" },
    { id: "optimise", label: "Optimise", color: "#527aa3" },
    { id: "review", label: "Review", color: "#c07842" },
    { id: "live", label: "Live", color: "#2f8b68" },
    { id: "ongoing", label: "Ongoing", color: "#3f6f65" },
  ],
  content: [
    { id: "brief", label: "Brief", color: "#7c8f8e" },
    { id: "planning", label: "Planning", color: "#9a7b4f" },
    { id: "creation", label: "Creation", color: "#8a6f9e" },
    { id: "review", label: "Review", color: "#527aa3" },
    { id: "approved", label: "Approved", color: "#c07842" },
    { id: "published", label: "Published", color: "#2f8b68" },
  ],
  "social-ads": [
    { id: "brief", label: "Brief", color: "#7c8f8e" },
    { id: "access", label: "Account access", color: "#9a7b4f" },
    { id: "strategy", label: "Strategy", color: "#8a6f9e" },
    { id: "production", label: "Production", color: "#527aa3" },
    { id: "review", label: "Client review", color: "#c07842" },
    { id: "live", label: "Scheduled / live", color: "#2f8b68" },
    { id: "optimise", label: "Optimise", color: "#3f6f65" },
  ],
  automation: [
    { id: "discovery", label: "Discovery", color: "#7c8f8e" },
    { id: "mapping", label: "Workflow map", color: "#9a7b4f" },
    { id: "build", label: "Build", color: "#527aa3" },
    { id: "testing", label: "Testing", color: "#c07842" },
    { id: "live", label: "Live", color: "#2f8b68" },
    { id: "optimise", label: "Optimise", color: "#3f6f65" },
  ],
  "custom-software": [
    { id: "scope", label: "Scope", color: "#7c8f8e" },
    { id: "architecture", label: "Architecture", color: "#9a7b4f" },
    { id: "design", label: "Design", color: "#8a6f9e" },
    { id: "build", label: "Build", color: "#527aa3" },
    { id: "qa", label: "QA", color: "#c07842" },
    { id: "release", label: "Release", color: "#2f8b68" },
    { id: "support", label: "Support", color: "#3f6f65" },
  ],
  "ongoing-care": [
    { id: "setup", label: "Setup", color: "#7c8f8e" },
    { id: "monitoring", label: "Monitoring", color: "#527aa3" },
    { id: "requested", label: "Requested", color: "#9a7b4f" },
    { id: "in-progress", label: "In progress", color: "#8a6f9e" },
    { id: "review", label: "Review", color: "#c07842" },
    { id: "complete", label: "Complete", color: "#2f8b68" },
  ],
  "business-os": [
    { id: "snapshot", label: "Snapshot", color: "#7c8f8e" },
    { id: "priorities", label: "Priorities", color: "#9a7b4f" },
    { id: "plan", label: "Plan", color: "#8a6f9e" },
    { id: "implementation", label: "Implementation", color: "#527aa3" },
    { id: "review", label: "Review", color: "#2f8b68" },
  ],
  "health-check": [
    { id: "intake", label: "Intake", color: "#7c8f8e" },
    { id: "audit", label: "Audit", color: "#9a7b4f" },
    { id: "findings", label: "Findings", color: "#8a6f9e" },
    { id: "recommendations", label: "Recommendations", color: "#527aa3" },
    { id: "complete", label: "Complete", color: "#2f8b68" },
  ],
};

const PRODUCT_STAGE_COLORS = [
  "#7c8f8e",
  "#9a7b4f",
  "#8a6f9e",
  "#527aa3",
  "#c07842",
  "#3f8192",
  "#2f8b68",
  "#3f6f65",
  "#6b7280",
  "#9b6b7d",
  "#6c7c9b",
  "#718c55",
] as const;

const STAGE_PROGRESS: Record<ClientStage, number> = {
  lead: 0,
  discovery: 0,
  onboarding: 0,
  "aqua-epic-intro": 0,
  "aqua-blueprint": 1,
  "aqua-diagnostics": 2,
  design: 2,
  "aqua-brand-builder": 3,
  development: 3,
  "aqua-traffic": 4,
  live: 99,
  "aqua-mastery": 99,
  churned: 99,
};

export function defaultProductPipelineStage(productKey: PortalProductKey, clientStage: ClientStage): string {
  const columns = PRODUCT_PIPELINE_COLUMNS[productKey];
  const progress = STAGE_PROGRESS[clientStage] ?? 0;
  return columns[Math.min(progress, columns.length - 1)]?.id ?? columns[0]?.id ?? "brief";
}

/** The service workspace owns the stage names and their order. Legacy templates only lend colours. */
export function agencyProductPipelineColumns(product: Pick<AgencyProduct, "id" | "name" | "portalTemplateKey" | "internalWorkspace" | "sopIds">): ProductPipelineColumn[] {
  const workspace = product.internalWorkspace ?? defaultProductInternalWorkspace(product);
  const legacy = product.portalTemplateKey ? PRODUCT_PIPELINE_COLUMNS[product.portalTemplateKey] : [];
  return workspace.lifecycleStages.map((stage, index) => ({
    id: stage.id,
    label: stage.label,
    color: legacy[index]?.color ?? PRODUCT_STAGE_COLORS[index % PRODUCT_STAGE_COLORS.length]!,
  }));
}

export function defaultAgencyProductPipelineStage(
  product: Pick<AgencyProduct, "id" | "name" | "portalTemplateKey" | "internalWorkspace" | "sopIds">,
  clientStage: ClientStage,
): string {
  const columns = agencyProductPipelineColumns(product);
  if (!columns.length) return "onboarding";
  const progress = STAGE_PROGRESS[clientStage] ?? 0;
  const ratio = progress >= 99 ? 1 : Math.min(progress / 5, 0.8);
  return columns[Math.round(ratio * (columns.length - 1))]?.id ?? columns[0]!.id;
}
