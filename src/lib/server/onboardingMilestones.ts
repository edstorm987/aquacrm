import "server-only";

// Aqua-phase onboarding milestones (T1 R6 — chapter
// `04-agency-shell-onboarding-dashboard.md`).
//
// Per-phase deliverable list operators tick off as a client moves
// through Epic Intro → Mastery. Storage shape: `client.metadata
// .onboardingProgress[phaseStage] = MilestoneState[]`. Read-only
// constants live here; mutation lives in `tenants.updateClient`.

import type { Client, ClientStage } from "@/server/types";

export interface Milestone {
  id: string;
  label: string;
}

export interface MilestoneState {
  id: string;
  done: boolean;
  doneAt?: number;
}

export type OnboardingProgressMap = Partial<Record<ClientStage, MilestoneState[]>>;

export const AQUA_PHASE_ORDER: ClientStage[] = [
  "aqua-epic-intro",
  "aqua-blueprint",
  "aqua-diagnostics",
  "aqua-brand-builder",
  "aqua-traffic",
  "aqua-mastery",
];

export const AQUA_MILESTONES: Record<ClientStage, Milestone[]> = {
  "aqua-epic-intro": [
    { id: "welcome",        label: "Welcome message sent" },
    { id: "discovery",      label: "Discovery call scheduled" },
    { id: "gift",           label: "Onboarding gift sent" },
  ],
  "aqua-blueprint": [
    { id: "brand-audit",    label: "Brand audit complete" },
    { id: "system-form",    label: "System form returned" },
    { id: "playbook",       label: "Aqua playbook drafted" },
  ],
  "aqua-diagnostics": [
    { id: "foundations",    label: "Foundations report delivered" },
    { id: "website-draft",  label: "First website draft" },
  ],
  "aqua-brand-builder": [
    { id: "logo-colours",   label: "Logo + colour palette signed off" },
    { id: "verification",   label: "Verification (GMB / socials)" },
    { id: "photography",    label: "Brand photography shot" },
  ],
  "aqua-traffic": [
    { id: "first-ad",       label: "First ad campaign live" },
    { id: "first-lead",     label: "First inbound lead" },
    { id: "first-sale",     label: "First sale closed" },
  ],
  "aqua-mastery": [
    { id: "100-reviews",    label: "100 reviews milestone" },
    { id: "200-reviews",    label: "200 reviews milestone" },
    { id: "retainer",       label: "Monthly retainer signed" },
  ],
  // Non-Aqua stages are surfaced as no-op (panel hidden upstream).
  "lead":            [],
  "discovery":       [],
  "design":          [],
  "development":     [],
  "onboarding":      [],
  "live":            [],
  "churned":         [],
};

export function isAquaStage(stage: ClientStage): boolean {
  return AQUA_PHASE_ORDER.includes(stage);
}

export function getMilestoneState(client: Client, phaseStage: ClientStage): MilestoneState[] {
  const seed = AQUA_MILESTONES[phaseStage] ?? [];
  const stored = ((client.metadata ?? {}) as { onboardingProgress?: OnboardingProgressMap })
    .onboardingProgress?.[phaseStage] ?? [];
  const byId = new Map(stored.map(s => [s.id, s] as const));
  return seed.map(m => byId.get(m.id) ?? { id: m.id, done: false });
}

export function isPhaseComplete(client: Client, phaseStage: ClientStage): boolean {
  const state = getMilestoneState(client, phaseStage);
  if (state.length === 0) return false;
  return state.every(s => s.done);
}

// Pure merge — caller persists via `updateClient`.
export function tickMilestone(
  current: OnboardingProgressMap | undefined,
  phaseStage: ClientStage,
  milestoneId: string,
  done: boolean,
): OnboardingProgressMap {
  const next: OnboardingProgressMap = { ...(current ?? {}) };
  const seed = AQUA_MILESTONES[phaseStage] ?? [];
  const existing = next[phaseStage] ?? seed.map(m => ({ id: m.id, done: false }));
  const merged = seed.map(m => {
    const prior = existing.find(s => s.id === m.id) ?? { id: m.id, done: false };
    if (m.id !== milestoneId) return prior;
    return { id: m.id, done, doneAt: done ? Date.now() : undefined };
  });
  next[phaseStage] = merged;
  return next;
}
