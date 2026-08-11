import type { PortalProductMode, PortalProductSelection } from "./portalProducts";
import { portalProductModule, type PortalProductModulePage } from "./portalProductModules";

export type PortalWorkspaceActor = "agency" | "customer";
export type PortalWorkspaceOutputStatus = "planned" | "in-progress" | "ready" | "approved";
export type PortalWorkspaceCollectionStatus = "draft" | "review" | "changes-requested" | "approved" | "delivered" | "archived";
export type PortalWorkspaceDecisionStatus = "pending" | "approved" | "changes-requested" | "withdrawn";
export type PortalWorkspaceAssetStatus = "working" | "review" | "approved" | "delivered";

export interface PortalWorkspaceChecklistItem {
  id: string;
  label: string;
  complete: boolean;
  completedAt?: number;
  completedBy?: string;
  completedByActor?: PortalWorkspaceActor;
}

export interface PortalWorkspacePageState {
  pageId: string;
  fields: Record<string, string>;
  checklist: PortalWorkspaceChecklistItem[];
  outputs: Array<{
    id: string;
    label: string;
    status: PortalWorkspaceOutputStatus;
    updatedAt?: number;
    updatedBy?: string;
  }>;
  updatedAt: number;
}

export interface PortalWorkspaceUpdate {
  id: string;
  pageId: string;
  message: string;
  actor: PortalWorkspaceActor;
  author: string;
  createdAt: number;
}

export interface PortalWorkspaceDecision {
  id: string;
  pageId: string;
  title: string;
  detail?: string;
  status: PortalWorkspaceDecisionStatus;
  requestedAt: number;
  requestedBy: string;
  respondedAt?: number;
  respondedBy?: string;
  responseNote?: string;
}

export interface PortalWorkspaceAsset {
  id: string;
  fileId: string;
  title: string;
  caption?: string;
  status: PortalWorkspaceAssetStatus;
  selected: boolean;
  selectedAt?: number;
  selectedBy?: string;
  customerComment?: string;
  addedAt: number;
  addedBy: string;
}

export interface PortalWorkspaceCollection {
  id: string;
  pageId: string;
  title: string;
  description?: string;
  status: PortalWorkspaceCollectionStatus;
  selectionLimit?: number;
  downloadsEnabled: boolean;
  watermarkEnabled: boolean;
  watermarkLabel?: string;
  assets: PortalWorkspaceAsset[];
  createdAt: number;
  updatedAt: number;
}

export interface PortalProductWorkspace {
  schemaVersion: 1;
  productId: string;
  productName: string;
  stage: PortalProductMode;
  pages: Record<string, PortalWorkspacePageState>;
  collections: PortalWorkspaceCollection[];
  decisions: PortalWorkspaceDecision[];
  updates: PortalWorkspaceUpdate[];
  createdAt: number;
  updatedAt: number;
}

export interface PortalWorkspaceFieldDefinition {
  id: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
}

const STAGES: readonly PortalProductMode[] = ["onboarding", "designing", "developed-launch", "maintenance"];
const OUTPUT_STATUSES: readonly PortalWorkspaceOutputStatus[] = ["planned", "in-progress", "ready", "approved"];
const COLLECTION_STATUSES: readonly PortalWorkspaceCollectionStatus[] = ["draft", "review", "changes-requested", "approved", "delivered", "archived"];
const DECISION_STATUSES: readonly PortalWorkspaceDecisionStatus[] = ["pending", "approved", "changes-requested", "withdrawn"];
const ASSET_STATUSES: readonly PortalWorkspaceAssetStatus[] = ["working", "review", "approved", "delivered"];

function text(value: unknown, max = 2_000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function timestamp(value: unknown, fallback?: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function idPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "item";
}

function actor(value: unknown): PortalWorkspaceActor {
  return value === "customer" ? "customer" : "agency";
}

function isMediaProduct(product: PortalProductSelection): boolean {
  const name = product.name.toLowerCase();
  return product.catalogKey === "photography"
    || name.includes("photography")
    || name.includes("property media")
    || name.includes("automotive")
    || name.includes("video");
}

function pageSeed(page: PortalProductModulePage, now: number): PortalWorkspacePageState {
  return {
    pageId: page.id,
    fields: {},
    checklist: page.checklist.map((label, index) => ({
      id: `${page.id}-check-${index + 1}`,
      label,
      complete: false,
    })),
    outputs: page.outputs.map((label, index) => ({
      id: `${page.id}-output-${index + 1}`,
      label,
      status: "planned",
    })),
    updatedAt: now,
  };
}

export function createPortalProductWorkspace(
  product: PortalProductSelection,
  stage: PortalProductMode = "onboarding",
  now = Date.now(),
): PortalProductWorkspace {
  const module = portalProductModule(product);
  const finalPage = module.pages[module.pages.length - 1];
  const collectionTitle = isMediaProduct(product) ? `${product.name} gallery` : `${product.name} delivery`;
  return {
    schemaVersion: 1,
    productId: product.id,
    productName: product.name,
    stage,
    pages: Object.fromEntries(module.pages.map(page => [page.id, pageSeed(page, now)])),
    collections: finalPage ? [{
      id: `${idPart(product.id)}-delivery`,
      pageId: finalPage.id,
      title: collectionTitle,
      description: isMediaProduct(product)
        ? "Private proofs, selections and finished media for this project."
        : "Working previews and approved delivery files for this product.",
      status: "draft",
      downloadsEnabled: !isMediaProduct(product),
      watermarkEnabled: isMediaProduct(product),
      watermarkLabel: isMediaProduct(product) ? "PRIVATE CLIENT PROOF" : undefined,
      assets: [],
      createdAt: now,
      updatedAt: now,
    }] : [],
    decisions: [],
    updates: [],
    createdAt: now,
    updatedAt: now,
  };
}

function cleanChecklist(value: unknown, seed: PortalWorkspaceChecklistItem[]): PortalWorkspaceChecklistItem[] {
  const stored = new Map(list(value).map(item => {
    const source = record(item);
    return [text(source.id, 120), source] as const;
  }));
  return seed.map(item => {
    const source = stored.get(item.id);
    if (!source) return item;
    const complete = source.complete === true;
    return {
      ...item,
      label: text(source.label, 240) || item.label,
      complete,
      completedAt: complete ? timestamp(source.completedAt) : undefined,
      completedBy: complete ? text(source.completedBy, 180) || undefined : undefined,
      completedByActor: complete ? actor(source.completedByActor) : undefined,
    };
  });
}

function cleanOutputs(value: unknown, seed: PortalWorkspacePageState["outputs"]): PortalWorkspacePageState["outputs"] {
  const stored = new Map(list(value).map(item => {
    const source = record(item);
    return [text(source.id, 120), source] as const;
  }));
  return seed.map(item => {
    const source = stored.get(item.id);
    const status = source && OUTPUT_STATUSES.includes(source.status as PortalWorkspaceOutputStatus)
      ? source.status as PortalWorkspaceOutputStatus
      : item.status;
    return {
      ...item,
      label: source ? text(source.label, 240) || item.label : item.label,
      status,
      updatedAt: source ? timestamp(source.updatedAt) : undefined,
      updatedBy: source ? text(source.updatedBy, 180) || undefined : undefined,
    };
  });
}

function cleanFields(value: unknown): Record<string, string> {
  const source = record(value);
  return Object.fromEntries(Object.entries(source)
    .slice(0, 30)
    .flatMap(([key, fieldValue]) => {
      const safeKey = idPart(key);
      const safeValue = text(fieldValue, 4_000);
      return safeKey && safeValue ? [[safeKey, safeValue]] : [];
    }));
}

function cleanAsset(value: unknown): PortalWorkspaceAsset | null {
  const source = record(value);
  const id = text(source.id, 120);
  const fileId = text(source.fileId, 120);
  if (!id || !fileId) return null;
  return {
    id,
    fileId,
    title: text(source.title, 240) || "Project asset",
    caption: text(source.caption, 1_000) || undefined,
    status: ASSET_STATUSES.includes(source.status as PortalWorkspaceAssetStatus)
      ? source.status as PortalWorkspaceAssetStatus
      : "working",
    selected: source.selected === true,
    selectedAt: source.selected === true ? timestamp(source.selectedAt) : undefined,
    selectedBy: source.selected === true ? text(source.selectedBy, 180) || undefined : undefined,
    customerComment: text(source.customerComment, 1_500) || undefined,
    addedAt: timestamp(source.addedAt, Date.now())!,
    addedBy: text(source.addedBy, 180) || "Aqua team",
  };
}

function cleanCollection(value: unknown, defaultDownloadsEnabled: boolean): PortalWorkspaceCollection | null {
  const source = record(value);
  const id = text(source.id, 120);
  const pageId = text(source.pageId, 120);
  if (!id || !pageId) return null;
  const selectionLimit = typeof source.selectionLimit === "number" && Number.isFinite(source.selectionLimit)
    ? Math.max(0, Math.min(500, Math.round(source.selectionLimit))) || undefined
    : undefined;
  return {
    id,
    pageId,
    title: text(source.title, 200) || "Delivery collection",
    description: text(source.description, 1_000) || undefined,
    status: COLLECTION_STATUSES.includes(source.status as PortalWorkspaceCollectionStatus)
      ? source.status as PortalWorkspaceCollectionStatus
      : "draft",
    selectionLimit,
    downloadsEnabled: typeof source.downloadsEnabled === "boolean" ? source.downloadsEnabled : defaultDownloadsEnabled,
    watermarkEnabled: typeof source.watermarkEnabled === "boolean" ? source.watermarkEnabled : !defaultDownloadsEnabled,
    watermarkLabel: text(source.watermarkLabel, 80) || (!defaultDownloadsEnabled ? "PRIVATE CLIENT PROOF" : undefined),
    assets: list(source.assets).slice(0, 500).flatMap(item => {
      const cleaned = cleanAsset(item);
      return cleaned ? [cleaned] : [];
    }),
    createdAt: timestamp(source.createdAt, Date.now())!,
    updatedAt: timestamp(source.updatedAt, Date.now())!,
  };
}

function cleanDecision(value: unknown): PortalWorkspaceDecision | null {
  const source = record(value);
  const id = text(source.id, 120);
  const pageId = text(source.pageId, 120);
  const title = text(source.title, 240);
  if (!id || !pageId || !title) return null;
  return {
    id,
    pageId,
    title,
    detail: text(source.detail, 2_000) || undefined,
    status: DECISION_STATUSES.includes(source.status as PortalWorkspaceDecisionStatus)
      ? source.status as PortalWorkspaceDecisionStatus
      : "pending",
    requestedAt: timestamp(source.requestedAt, Date.now())!,
    requestedBy: text(source.requestedBy, 180) || "Aqua team",
    respondedAt: timestamp(source.respondedAt),
    respondedBy: text(source.respondedBy, 180) || undefined,
    responseNote: text(source.responseNote, 2_000) || undefined,
  };
}

function cleanUpdate(value: unknown): PortalWorkspaceUpdate | null {
  const source = record(value);
  const id = text(source.id, 120);
  const pageId = text(source.pageId, 120);
  const message = text(source.message, 2_000);
  if (!id || !pageId || !message) return null;
  return {
    id,
    pageId,
    message,
    actor: actor(source.actor),
    author: text(source.author, 180) || (actor(source.actor) === "customer" ? "Customer" : "Aqua team"),
    createdAt: timestamp(source.createdAt, Date.now())!,
  };
}

export function cleanPortalProductWorkspace(
  value: unknown,
  product: PortalProductSelection,
  fallbackStage: PortalProductMode = "onboarding",
  now = Date.now(),
): PortalProductWorkspace {
  const seed = createPortalProductWorkspace(product, fallbackStage, now);
  const source = record(value);
  const storedPages = record(source.pages);
  const pages = Object.fromEntries(Object.entries(seed.pages).map(([pageId, page]) => {
    const stored = record(storedPages[pageId]);
    return [pageId, {
      ...page,
      fields: cleanFields(stored.fields),
      checklist: cleanChecklist(stored.checklist, page.checklist),
      outputs: cleanOutputs(stored.outputs, page.outputs),
      updatedAt: timestamp(stored.updatedAt, page.updatedAt)!,
    } satisfies PortalWorkspacePageState];
  }));
  const storedCollections = list(source.collections).slice(0, 60).flatMap(item => {
    const cleaned = cleanCollection(item, !isMediaProduct(product));
    return cleaned ? [cleaned] : [];
  });
  const seedCollections = seed.collections.filter(item => !storedCollections.some(stored => stored.id === item.id));
  return {
    ...seed,
    productName: product.name,
    stage: STAGES.includes(source.stage as PortalProductMode) ? source.stage as PortalProductMode : fallbackStage,
    pages,
    collections: [...storedCollections, ...seedCollections],
    decisions: list(source.decisions).slice(0, 100).flatMap(item => {
      const cleaned = cleanDecision(item);
      return cleaned ? [cleaned] : [];
    }),
    updates: list(source.updates).slice(0, 200).flatMap(item => {
      const cleaned = cleanUpdate(item);
      return cleaned ? [cleaned] : [];
    }),
    createdAt: timestamp(source.createdAt, seed.createdAt)!,
    updatedAt: timestamp(source.updatedAt, seed.updatedAt)!,
  };
}

export function portalProductWorkspaceStore(value: unknown): Record<string, unknown> {
  return record(value);
}

export function cleanPortalProductWorkspaces(
  value: unknown,
  products: PortalProductSelection[],
  fallbackStage: PortalProductMode = "onboarding",
): PortalProductWorkspace[] {
  const store = portalProductWorkspaceStore(value);
  return products.map(product => cleanPortalProductWorkspace(store[product.id], product, fallbackStage));
}

export function mergePortalProductWorkspaceStore(
  value: unknown,
  workspaces: PortalProductWorkspace[],
): Record<string, unknown> {
  return {
    ...portalProductWorkspaceStore(value),
    ...Object.fromEntries(workspaces.map(workspace => [workspace.productId, workspace])),
  };
}

const FIELD_PRESETS: Partial<Record<NonNullable<PortalProductSelection["catalogKey"]>, string[][]>> = {
  photography: [
    ["Purpose and usage", "People or subjects", "Locations and access", "Timing and deadline"],
    ["Must-have photographs", "Visual direction", "Schedule and logistics", "Privacy or sensitivities"],
    ["Selection priorities", "Retouching notes", "Required formats", "Usage and delivery notes"],
  ],
  website: [
    ["Business objective", "Priority audiences", "Offers and conversion goals", "Required pages and features"],
    ["Content ownership", "Design references", "Feedback and decisions", "Integrations and dependencies"],
    ["Launch date", "Domain and access", "Final checks", "Handover requirements"],
  ],
  "brand-identity": [
    ["Brand story", "Priority audience", "Positioning and personality", "Competitors and references"],
    ["Direction feedback", "Logo requirements", "Colour and typography", "Applications to test"],
    ["Final refinements", "Required file formats", "Launch uses", "Brand guidance needs"],
  ],
  content: [
    ["Audience and objective", "Offers and messages", "Voice and boundaries", "Channels and cadence"],
    ["Draft feedback", "Proof and source material", "Calls to action", "Approval requirements"],
    ["Publishing details", "Final formats", "Distribution plan", "Measurement and learning"],
  ],
  automation: [
    ["Current process", "Triggers and inputs", "People and systems", "Exceptions and risks"],
    ["Workflow decisions", "Data and permissions", "Notifications", "Failure handling"],
    ["Test scenarios", "Go-live controls", "Monitoring", "Ownership and handover"],
  ],
  "custom-software": [
    ["Users and jobs", "Current workflow", "Required capabilities", "Success measures"],
    ["Journey feedback", "Data and permissions", "Business rules", "Edge cases"],
    ["Acceptance scenarios", "Release priorities", "Migration and access", "Support expectations"],
  ],
  "google-profile": [
    ["Business details", "Locations and service areas", "Priority services", "Customer questions"],
    ["Profile content", "Images and proof", "Categories and attributes", "Review approach"],
    ["Publication checks", "Tracking links", "Response ownership", "Visibility priorities"],
  ],
  "ongoing-care": [
    ["Current estate", "Support priorities", "Access and ownership", "Service expectations"],
    ["Active work", "Changes and incidents", "Dependencies", "Approval route"],
    ["Release record", "Monitoring", "Documentation", "Next-cycle priorities"],
  ],
  "business-os": [
    ["Teams and responsibilities", "Core workflows", "Records and systems", "Operational pain points"],
    ["Workspace decisions", "Permissions", "Handoffs and exceptions", "Reporting needs"],
    ["Adoption plan", "Migration", "Training and ownership", "Success measures"],
  ],
  "health-check": [
    ["Current concerns", "Commercial goals", "Systems in scope", "Known constraints"],
    ["Evidence and findings", "Priority risks", "Opportunities", "Decision criteria"],
    ["Recommended actions", "Owners and timing", "Measures", "Follow-up plan"],
  ],
};

export function portalWorkspacePageFields(
  product: PortalProductSelection,
  page: PortalProductModulePage,
): PortalWorkspaceFieldDefinition[] {
  const module = portalProductModule(product);
  const pageIndex = Math.max(0, module.pages.findIndex(item => item.id === page.id));
  const mediaFallback = isMediaProduct(product) ? FIELD_PRESETS.photography : undefined;
  const labels = (product.catalogKey ? FIELD_PRESETS[product.catalogKey]?.[pageIndex] : undefined)
    ?? mediaFallback?.[pageIndex]
    ?? [
      `${page.navLabel} objective`,
      "Requirements and constraints",
      "References and source material",
      "Decisions and next steps",
    ];
  return labels.map((label, index) => ({
    id: `${page.id}-field-${index + 1}`,
    label,
    placeholder: index === 0
      ? `Record the essential ${page.navLabel.toLowerCase()} context here.`
      : `Add clear ${label.toLowerCase()} for the shared project record.`,
    multiline: true,
  }));
}

export function portalWorkspaceProgress(workspace: PortalProductWorkspace): number {
  const pages = Object.values(workspace.pages);
  const checks = pages.flatMap(page => page.checklist);
  const outputs = pages.flatMap(page => page.outputs);
  const completedChecks = checks.filter(item => item.complete).length;
  const outputPoints = outputs.reduce((total, item) => total + OUTPUT_STATUSES.indexOf(item.status), 0);
  const max = checks.length + Math.max(1, outputs.length * 3);
  return Math.max(0, Math.min(100, Math.round(((completedChecks + outputPoints) / max) * 100)));
}

export function portalWorkspaceIsMedia(product: PortalProductSelection): boolean {
  return isMediaProduct(product);
}
