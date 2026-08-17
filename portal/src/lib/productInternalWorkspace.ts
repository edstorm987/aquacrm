import type {
  AgencyProductInternalWorkspace,
  AgencyProductPortalMode,
  AgencyProductPortalTemplateKey,
  AgencyProductWorkspaceModule,
} from "@/server/types";

export const PRODUCT_WORKSPACE_MODULES: ReadonlyArray<{
  id: AgencyProductWorkspaceModule;
  label: string;
  description: string;
}> = [
  { id: "relationship", label: "Relationship", description: "Contacts, health and account context" },
  { id: "commercial", label: "Commercial", description: "Scope, contracts, plans and payments" },
  { id: "delivery", label: "Delivery", description: "Milestones, tasks and service work" },
  { id: "communications", label: "Messages", description: "Client requests and conversations" },
  { id: "files", label: "Files", description: "Uploads, evidence and shared assets" },
  { id: "portal", label: "Client portal", description: "Approvals and the shared experience" },
  { id: "systems", label: "Systems", description: "Properties, telemetry and technical health" },
  { id: "marketing", label: "Marketing", description: "Campaigns, content and performance" },
  { id: "sops", label: "SOPs", description: "Linked operating procedures" },
];

const WORKSPACE_MODULE_IDS = new Set<AgencyProductWorkspaceModule>(PRODUCT_WORKSPACE_MODULES.map(module => module.id));
const MARKETING_TEMPLATES = new Set<AgencyProductPortalTemplateKey>(["content", "google-profile", "social-ads"]);
const SYSTEM_TEMPLATES = new Set<AgencyProductPortalTemplateKey>(["website", "automation", "custom-software", "ongoing-care", "health-check"]);

export function isProductWorkspaceModule(value: unknown): value is AgencyProductWorkspaceModule {
  return typeof value === "string" && WORKSPACE_MODULE_IDS.has(value as AgencyProductWorkspaceModule);
}

export function productWorkspaceModuleLabel(module: AgencyProductWorkspaceModule): string {
  return PRODUCT_WORKSPACE_MODULES.find(item => item.id === module)?.label ?? module;
}

export const PRODUCT_STAGE_PORTAL_MODES: ReadonlyArray<{ id: AgencyProductPortalMode; label: string }> = [
  { id: "onboarding", label: "Onboarding experience" },
  { id: "designing", label: "Work in progress" },
  { id: "developed-launch", label: "Review and delivery" },
  { id: "maintenance", label: "Live or ongoing care" },
];

export function defaultProductInternalWorkspace(product: {
  id?: string;
  name?: string;
  portalTemplateKey?: AgencyProductPortalTemplateKey;
  sopIds?: string[];
}): AgencyProductInternalWorkspace {
  const name = product.name?.trim() || "Service";
  const template = product.portalTemplateKey;
  const specialistModule: AgencyProductWorkspaceModule = template && MARKETING_TEMPLATES.has(template)
    ? "marketing"
    : template && SYSTEM_TEMPLATES.has(template)
      ? "systems"
      : "delivery";
  const sopIds = product.sopIds ?? [];
  const quickActions = uniqueModules(["delivery", specialistModule, "communications", "files", "sops"]);
  const advancedModules = uniqueModules([
    specialistModule,
    "portal",
    ...(specialistModule === "systems" ? ["files" as const] : []),
    ...(specialistModule === "marketing" ? ["systems" as const] : []),
  ]);

  return {
    title: `${name} delivery plan`,
    objective: `Move ${name} from an agreed brief to a reviewed, client-ready outcome without losing decisions or evidence.`,
    lifecycleStages: [
      { id: `${product.id || "service"}-onboarding`, label: "Onboarding", description: "Agree the outcome and collect everything required to begin.", portalMode: "onboarding" },
      { id: `${product.id || "service"}-production`, label: "In progress", description: "Produce the work and retain decisions as it moves.", portalMode: "designing" },
      { id: `${product.id || "service"}-review`, label: "Review", description: "Gather feedback, approval and final changes.", portalMode: "developed-launch" },
      { id: `${product.id || "service"}-live`, label: "Delivered / live", description: "Handover the result and manage any ongoing care.", portalMode: "maintenance" },
    ],
    quickActions,
    processSteps: [
      {
        id: `${product.id || "service"}-brief`,
        title: "Confirm the brief and inputs",
        instruction: "Retain the result, dependencies, owner and everything required before work starts.",
        stageId: `${product.id || "service"}-onboarding`,
        module: "delivery",
        sopIds: sopIds.slice(0, 1),
      },
      {
        id: `${product.id || "service"}-produce`,
        title: "Produce the agreed work",
        instruction: "Work the delivery plan and retain decisions, files and progress as they happen.",
        stageId: `${product.id || "service"}-production`,
        module: specialistModule,
        sopIds: sopIds.slice(1, 2),
      },
      {
        id: `${product.id || "service"}-review`,
        title: "Review with the client",
        instruction: "Capture feedback and approval before anything is treated as complete.",
        stageId: `${product.id || "service"}-review`,
        module: "portal",
        sopIds: [],
      },
      {
        id: `${product.id || "service"}-handover`,
        title: "Complete and hand over",
        instruction: "Deliver the final outputs, record what changed and set the next review or care action.",
        stageId: `${product.id || "service"}-live`,
        module: "delivery",
        sopIds: [],
        advanced: true,
      },
    ],
    advancedModules,
  };
}

function uniqueModules(modules: AgencyProductWorkspaceModule[]): AgencyProductWorkspaceModule[] {
  return [...new Set(modules)];
}
