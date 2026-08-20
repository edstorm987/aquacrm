import type { AdvisorDomain } from "@/engines/data/radar/businessRadar";
import type { AdvisorSkillRecipeId } from "@/server/types";

export type AdvisorSkillAccess = "read" | "draft" | "bounded-write";
export type AdvisorSkillApproval = "none" | "always";
export type AdvisorSkillMutation = "task.create";

export interface AdvisorSkillRecipe {
  id: AdvisorSkillRecipeId;
  name: string;
  description: string;
  domain: AdvisorDomain;
  access: AdvisorSkillAccess;
  approval: AdvisorSkillApproval;
  scopes: string[];
  maxRecords: number;
  allowedMutations: AdvisorSkillMutation[];
}

export interface AdvisorSkill extends AdvisorSkillRecipe {
  skillId: string;
  recipeId: AdvisorSkillRecipeId;
  enabled: boolean;
  builtIn: boolean;
  createdAt?: number;
}

export interface AdvisorSkillSafety {
  enabled: number;
  readOnly: number;
  draftOnly: number;
  boundedWrites: number;
  approvalRequired: number;
  rawDatabaseAccess: false;
  destructiveMutations: false;
  maximumWriteRecordsPerRun: number;
}

export const ADVISOR_SKILL_RECIPES: Record<AdvisorSkillRecipeId, AdvisorSkillRecipe> = {
  "executive-radar": {
    id: "executive-radar",
    name: "Executive radar",
    description: "Finds cross-business risks, weak metrics, blind spots and the next decision requiring attention.",
    domain: "company",
    access: "read",
    approval: "none",
    scopes: ["radar:read", "company-health:read", "alerts:read", "tasks:read"],
    maxRecords: 160,
    allowedMutations: [],
  },
  "lead-response-triage": {
    id: "lead-response-triage",
    name: "Lead response triage",
    description: "Specialises in speed to lead, enquiry waits, response breaches and sales follow-up priority.",
    domain: "sales",
    access: "read",
    approval: "none",
    scopes: ["radar:sales", "enquiries:read", "inbox:read"],
    maxRecords: 50,
    allowedMutations: [],
  },
  "client-health-review": {
    id: "client-health-review",
    name: "Client health review",
    description: "Surfaces contact gaps, support risk, delivery friction and clients needing a human touchpoint.",
    domain: "clients",
    access: "read",
    approval: "none",
    scopes: ["radar:clients", "clients:read", "support-alerts:read"],
    maxRecords: 100,
    allowedMutations: [],
  },
  "finance-guard": {
    id: "finance-guard",
    name: "Finance guard",
    description: "Reviews cash, budgets, obligations, overdue money and finance-related radar findings.",
    domain: "finance",
    access: "read",
    approval: "none",
    scopes: ["radar:finance", "company-targets:read", "finance-alerts:read"],
    maxRecords: 100,
    allowedMutations: [],
  },
  "delivery-blockers": {
    id: "delivery-blockers",
    name: "Delivery blocker review",
    description: "Finds blocked fulfilment, overdue work, client dependencies and delivery risks.",
    domain: "delivery",
    access: "read",
    approval: "none",
    scopes: ["radar:delivery", "delivery-alerts:read", "tasks:read"],
    maxRecords: 100,
    allowedMutations: [],
  },
  "reply-drafter": {
    id: "reply-drafter",
    name: "Reply drafter",
    description: "Drafts a response from a selected enquiry or conversation without sending or changing its status.",
    domain: "inbox",
    access: "draft",
    approval: "none",
    scopes: ["selected-conversation:read", "reply:draft"],
    maxRecords: 1,
    allowedMutations: [],
  },
  "priority-task-proposal": {
    id: "priority-task-proposal",
    name: "Priority task proposal",
    description: "Turns grounded radar evidence into a short task proposal without creating records.",
    domain: "operations",
    access: "draft",
    approval: "none",
    scopes: ["radar:read", "tasks:read", "task:draft"],
    maxRecords: 8,
    allowedMutations: [],
  },
  "single-task-create": {
    id: "single-task-create",
    name: "Single task creator",
    description: "Creates one validated task only after an owner or manager explicitly approves the preview.",
    domain: "operations",
    access: "bounded-write",
    approval: "always",
    scopes: ["task:create"],
    maxRecords: 1,
    allowedMutations: ["task.create"],
  },
};

export const BUILT_IN_ADVISOR_SKILL_IDS = Object.keys(ADVISOR_SKILL_RECIPES) as AdvisorSkillRecipeId[];

export function advisorSkillSafetySummary(skills: AdvisorSkill[]): AdvisorSkillSafety {
  const enabled = skills.filter(skill => skill.enabled);
  return {
    enabled: enabled.length,
    readOnly: enabled.filter(skill => skill.access === "read").length,
    draftOnly: enabled.filter(skill => skill.access === "draft").length,
    boundedWrites: enabled.filter(skill => skill.access === "bounded-write").length,
    approvalRequired: enabled.filter(skill => skill.approval === "always").length,
    rawDatabaseAccess: false,
    destructiveMutations: false,
    maximumWriteRecordsPerRun: Math.max(0, ...enabled.filter(skill => skill.access === "bounded-write").map(skill => skill.maxRecords)),
  };
}
