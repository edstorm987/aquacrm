// Aqua-resources domain.

import type { UserId } from "./tenancy";

// Aqua's 6 phases per chapter §11. Resources can be tagged to one or
// more — empty array = all phases.
export type AquaPhase =
  | "epic-intro" | "blueprint-setup" | "diagnostics"
  | "brand-builder" | "traffic" | "mastery";

export const ALL_PHASES: readonly AquaPhase[] =
  ["epic-intro", "blueprint-setup", "diagnostics", "brand-builder", "traffic", "mastery"] as const;

export const PHASE_LABELS: Record<AquaPhase, string> = {
  "epic-intro": "Epic Intro",
  "blueprint-setup": "Blueprint Setup",
  diagnostics: "Diagnostics",
  "brand-builder": "Brand Builder",
  traffic: "Traffic",
  mastery: "Mastery",
};

export type ResourceItemKind = "sop" | "module" | "tutorial" | "video" | "link";

export const RESOURCE_KINDS: readonly ResourceItemKind[] =
  ["sop", "module", "tutorial", "video", "link"] as const;

export interface ResourceItem {
  id: string;
  kind: ResourceItemKind;
  ref: string;            // e.g. SOP slug, Incubator URL path, video URL, external link
  title: string;
  coverImg?: string;
  notes?: string;
  order: number;          // within the parent collection
}

export interface ResourceCollection {
  id: string;
  agencyId: string;
  name: string;
  description?: string;
  phaseScope: AquaPhase[];   // empty = all phases
  items: ResourceItem[];
  builtIn: boolean;          // true for default-seeded; protects from delete
  order: number;             // top-level ordering
  createdBy?: UserId;
  createdAt: number;
  updatedAt: number;
}

export interface CreateCollectionInput {
  name: string;
  description?: string;
  phaseScope?: AquaPhase[];
  items?: Array<Omit<ResourceItem, "id" | "order">>;
}

export interface UpdateCollectionPatch {
  name?: string;
  description?: string;
  phaseScope?: AquaPhase[];
  order?: number;
}

export interface AddItemInput {
  kind: ResourceItemKind;
  ref: string;
  title: string;
  coverImg?: string;
  notes?: string;
}

export interface UpdateItemPatch {
  kind?: ResourceItemKind;
  ref?: string;
  title?: string;
  coverImg?: string;
  notes?: string;
}

export interface CollectionFilter {
  phase?: AquaPhase;
  builtIn?: boolean;
  query?: string;
}

// Default seeded collections — 5 starters per chapter §15c. Each
// `items` entry will be assigned a fresh id + order on seed.
export const DEFAULT_COLLECTIONS: ReadonlyArray<{
  name: string;
  description: string;
  phaseScope: AquaPhase[];
  items: Array<Omit<ResourceItem, "id" | "order">>;
}> = [
  {
    name: "Incubator Modules",
    description: "Lesson library + SOPs tagged for Aqua's incubator phases.",
    phaseScope: ["epic-intro", "blueprint-setup", "diagnostics"],
    items: [
      { kind: "module", ref: "/incubator/intro/welcome", title: "Welcome — what's Aqua?" },
      { kind: "module", ref: "/incubator/blueprint/setup", title: "Blueprint setup — your operating model" },
      { kind: "sop", ref: "incubator/discovery-checklist", title: "Discovery checklist (SOP)" },
      { kind: "sop", ref: "incubator/blueprint-template", title: "Blueprint template (SOP)" },
    ],
  },
  {
    name: "Personal AI Assistants",
    description: "Aqua AI tutorial + the prompt library Ed actually uses day-to-day.",
    phaseScope: [],
    items: [
      { kind: "tutorial", ref: "/incubator/ai/intro", title: "Tutorial — Personal AI Assistants" },
      { kind: "link", ref: "https://prompts.aqua.app", title: "Aqua prompt library" },
      { kind: "video", ref: "https://videos.aqua.app/ai-101", title: "Video — Aqua AI 101 (12 min)" },
    ],
  },
  {
    name: "AquaSuite GHL Tutorial",
    description: "End-to-end walkthrough of the AquaSuite GoHighLevel build.",
    phaseScope: ["brand-builder", "traffic"],
    items: [
      { kind: "tutorial", ref: "/incubator/ghl/intro", title: "AquaSuite GHL — overview" },
      { kind: "video", ref: "https://videos.aqua.app/ghl-walkthrough", title: "Video — AquaSuite GHL walkthrough (38 min)" },
      { kind: "sop", ref: "incubator/ghl-onboarding", title: "AquaSuite GHL onboarding SOP" },
    ],
  },
  {
    name: "My Business OS Tutorial",
    description: "How the Business OS (BOS) lead-magnet app maps to the portal.",
    phaseScope: [],
    items: [
      { kind: "tutorial", ref: "/incubator/bos/intro", title: "Tutorial — My Business OS" },
      { kind: "link", ref: "https://milesymedia.co/bos", title: "Live BOS demo" },
      { kind: "module", ref: "/incubator/bos/leads-trackers-tasks", title: "Module — Leads / Trackers / Tasks" },
    ],
  },
  {
    name: "Where Time Is No Longer Tied To Income",
    description: "Mastery-phase essay + supporting lessons.",
    phaseScope: ["mastery"],
    items: [
      { kind: "module", ref: "/incubator/mastery/decoupling-time", title: "Decoupling time from income" },
      { kind: "video", ref: "https://videos.aqua.app/mastery-time", title: "Video — Mastery: time vs income (24 min)" },
      { kind: "sop", ref: "mastery/team-handoff", title: "Team handoff SOP" },
    ],
  },
] as const;
