// Read-only template registry. Templates are bundled — operators pick
// one at board-creation time. After creation, columns + cards are
// fully editable; the templateId is preserved on the Board for
// metadata only.
//
// R2 (Aqua templates): swapped placeholder column lists for Ed's
// actual operating columns sourced from chapter
// `04-aqua-internals-reference.md` (MASTER #59) §6 + §11. Added a
// fifth `founder-todos` template gated to Founder role, agency-scope.

import type { TemplateDefinition, TemplateId } from "../lib/domain";

export const TEMPLATES: Record<TemplateId, TemplateDefinition> = {
  "fulfillment-mirror": {
    id: "fulfillment-mirror",
    name: "Fulfillment mirror (Aqua phases)",
    description:
      "Six Aqua phases — Epic Intro / Blueprint Setup / Diagnostics / Brand Builder / Traffic / Mastery. Visually parallel to the rigid phase-board for teams that want a flexible scratchpad alongside the lifecycle.",
    columns: [
      { label: "Epic Intro" },
      { label: "Blueprint Setup" },
      { label: "Diagnostics" },
      { label: "Brand Builder" },
      { label: "Traffic" },
      { label: "Mastery", color: "#7c3aed" },
    ],
    cards: [
      { columnIndex: 0, title: "Welcome scroll signed", tags: ["sample"] },
      { columnIndex: 1, title: "Aqua Playbook walkthrough", tags: ["sample"] },
    ],
  },
  "lead-pipeline": {
    id: "lead-pipeline",
    name: "Lead pipeline (Aqua sales)",
    description:
      "Pre-Sales → Onboarded — the real Aqua sales funnel from inbound to system-build complete.",
    columns: [
      { label: "Pre-Sales" },
      { label: "Discovery Call Booked" },
      { label: "Discovery Call Done" },
      { label: "Invoice Sent" },
      { label: "Aqua Incubator Active" },
      { label: "Shock & Awe Sent" },
      { label: "System Build" },
      { label: "Onboarded", color: "#16a34a" },
    ],
    cards: [
      { columnIndex: 0, title: "Inbound from website form", tags: ["sample"] },
      { columnIndex: 1, title: "Discovery call booked", tags: ["sample"] },
    ],
  },
  "client-tasks": {
    id: "client-tasks",
    name: "Client tasks (Aqua weekly cadence)",
    description:
      "Backlog / This Week / Doing / Waiting On Client / Review / Done — the weekly cadence Aqua uses to actually ship for therapists.",
    columns: [
      { label: "Backlog" },
      { label: "This Week" },
      { label: "Doing" },
      { label: "Waiting On Client" },
      { label: "Review" },
      { label: "Done", color: "#16a34a" },
    ],
    cards: [
      { columnIndex: 0, title: "Sample task", tags: ["sample"] },
      { columnIndex: 1, title: "Sample task — this week", tags: ["sample"] },
    ],
  },
  "blank": {
    id: "blank",
    name: "Blank",
    description: "Single 'To do' column. Build the board your way.",
    columns: [{ label: "To do" }],
    cards: [],
  },
  "founder-todos": {
    id: "founder-todos",
    name: "Founder to-dos",
    description:
      "Founder-only. Today / This Week / Backlog / Done — Ed's personal triage board for the things only the Founder can move.",
    columns: [
      { label: "Today" },
      { label: "This Week" },
      { label: "Backlog" },
      { label: "Done", color: "#16a34a" },
    ],
    cards: [
      { columnIndex: 0, title: "Review week's pipeline", tags: ["sample"] },
      { columnIndex: 0, title: "Plan next round of social posts", tags: ["sample"] },
    ],
    requiresRole: "founder",
    requiresScope: "agency",
  },
};

export function getTemplate(id: TemplateId): TemplateDefinition {
  const t = TEMPLATES[id];
  if (!t) throw new Error(`Unknown kanban template: ${id}`);
  return t;
}

// Lists every bundled template — including role-gated ones. Internal
// callers (BoardService) trust this; UI/API callers should prefer
// `listTemplatesForRoles` to honour `requiresRole`.
export function listTemplates(): TemplateDefinition[] {
  return Object.values(TEMPLATES);
}

// Returns templates the operator's role(s) are allowed to see.
// `requiresRole` matches case-insensitively; templates without
// `requiresRole` are always visible.
export function listTemplatesForRoles(roles: string[] | undefined): TemplateDefinition[] {
  const lowered = (roles ?? []).map(r => r.toLowerCase());
  return Object.values(TEMPLATES).filter(t => {
    if (!t.requiresRole) return true;
    return lowered.includes(t.requiresRole.toLowerCase());
  });
}
