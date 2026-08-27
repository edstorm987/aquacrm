// Six default phase definitions. Seeded into the phase store on first
// agency creation (`seedDefaultPhases`). Agencies can edit / add / archive
// later — these are *defaults*, not enums. See `04-architecture.md §7`.
//
// Each preset specifies:
//   - the `ClientStage` it represents (one of the seven canonical stages)
//   - the plugin preset (ids that get installed when entering this phase)
//   - the starter portal-variant id (T3 owns the variant content)
//   - the checklist template (internal + client items)
//
// The preset plugin ids all refer to manifests in the current first-party
// registry. Client creation reports any missing install or starter variant as
// incomplete and remains resumable; it never translates a partial preset into
// success.

import { makeId } from "../lib/ids";
import type { AgencyId, PhaseDefinition, PhaseChecklistItem } from "../lib/tenancy";

export interface PhasePresetSeed {
  stage: PhaseDefinition["stage"];
  label: string;
  description: string;
  order: number;
  pluginPreset: string[];
  starterVariantId?: string;
  internalTasks: string[];
  clientTasks: string[];
}

// Aqua Incubator 3.0 — the real progression Ed runs. Chapter #59 §5/§5a
// is the source of truth for both the phase ordering and the per-phase
// plugin install map. Each phase extends the previous (per architecture
// §7 the auto-disable diff only removes plugins NOT in the new preset).
export const DEFAULT_PHASE_PRESETS: readonly PhasePresetSeed[] = [
  {
    stage: "aqua-epic-intro",
    label: "Epic Intro",
    description: "Collect the brief, contacts, content, and access needed to begin.",
    order: 10,
    pluginPreset: ["website-editor"],
    starterVariantId: "aqua-incubator",
    internalTasks: [
      "Send Epic Intro pack",
      "Schedule Blueprint call",
      "Confirm WhatsApp group invite",
    ],
    clientTasks: [
      "Review the welcome and next steps",
      "Confirm the project deposit",
    ],
  },
  {
    stage: "aqua-blueprint",
    label: "Blueprint Setup",
    description: "Aqua Playbook walk-through; gather brand + audience signals.",
    order: 20,
    pluginPreset: ["website-editor", "client-crm"],
    starterVariantId: "aqua-incubator",
    internalTasks: [
      "Run Blueprint call",
      "Capture audience + offer notes",
      "Open the practice's CRM record",
    ],
    clientTasks: [
      "Complete Aqua Playbook",
      "Submit brand assets",
    ],
  },
  {
    stage: "aqua-diagnostics",
    label: "Diagnostics / Foundations",
    description: "Diagnostics surveys + foundation content generation.",
    order: 30,
    pluginPreset: ["website-editor", "client-crm"],
    starterVariantId: "aqua-incubator",
    internalTasks: [
      "Issue diagnostics surveys",
      "Generate foundation copy via AI builder",
      "Internal review of diagnostics",
    ],
    clientTasks: [
      "Complete diagnostics surveys",
      "Approve foundation copy",
    ],
  },
  {
    stage: "aqua-brand-builder",
    label: "Brand Builder + Verification",
    description: "Brand kit baked into website-editor; identity verified.",
    order: 40,
    // Same plugin set as diagnostics — brand-kit lives inside
    // website-editor, no extra install needed.
    pluginPreset: ["website-editor", "client-crm"],
    starterVariantId: "aqua-incubator",
    internalTasks: [
      "Apply brand kit to portal variants",
      "Verify identity (Stripe / business)",
      "Lock in tone-of-voice samples",
    ],
    clientTasks: [
      "Approve brand kit",
      "Submit verification docs",
    ],
  },
  {
    stage: "aqua-traffic",
    label: "Traffic (Expansion Plan)",
    description: "Storefront + marketing + email distribution go live.",
    order: 50,
    pluginPreset: ["website-editor", "client-crm", "ecommerce", "agency-marketing", "email-sender"],
    starterVariantId: "aqua-incubator",
    internalTasks: [
      "Wire Stripe + email sender",
      "Schedule first 30-day content calendar",
      "Configure agency-marketing campaigns",
    ],
    clientTasks: [
      "Provide payment processor + email sender details",
      "Approve first content batch",
    ],
  },
  {
    stage: "aqua-mastery",
    label: "Mastery & Ascension",
    description: "Memberships + affiliates layer; Live custom-portal stage.",
    order: 60,
    pluginPreset: ["website-editor", "client-crm", "ecommerce", "agency-marketing", "email-sender", "memberships", "affiliates"],
    starterVariantId: "aqua-incubator",
    internalTasks: [
      "Launch membership tier",
      "Open affiliate programme",
      "Plan the Live custom-portal build",
    ],
    clientTasks: [
      "Welcome members + affiliates",
      "Review monthly performance reports",
    ],
  },
  {
    stage: "churned",
    label: "Churned",
    description: "Engagement ended. All plugins disabled, config preserved.",
    order: 90,
    pluginPreset: [],
    internalTasks: [
      "Archive deliverables",
      "Final invoice",
      "Offboard team",
    ],
    clientTasks: [
      "Receive deliverables export",
    ],
  },
] as const;

// Build PhaseDefinition rows from the presets, scoped to a single agency.
// Called once on agency creation; agency owners can edit afterwards.
export function buildDefaultPhases(agencyId: AgencyId): PhaseDefinition[] {
  return DEFAULT_PHASE_PRESETS.map(preset => buildPhaseFromPreset(agencyId, preset));
}

function buildPhaseFromPreset(agencyId: AgencyId, preset: PhasePresetSeed): PhaseDefinition {
  const phaseId = `phase_${agencyId}_${preset.stage}`;
  const checklist: PhaseChecklistItem[] = [
    ...preset.internalTasks.map(label => ({
      id: makeId("task"),
      label,
      visibility: "internal" as const,
    })),
    ...preset.clientTasks.map(label => ({
      id: makeId("task"),
      label,
      visibility: "client" as const,
    })),
  ];
  return {
    id: phaseId,
    agencyId,
    stage: preset.stage,
    label: preset.label,
    description: preset.description,
    order: preset.order,
    pluginPreset: [...preset.pluginPreset],
    portalVariantId: preset.starterVariantId,
    checklist,
  };
}
