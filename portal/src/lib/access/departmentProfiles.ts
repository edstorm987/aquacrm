// Worker profiles — the departments a person can be working AS.
//
// Ed, 2026-08-29: *"say owner needs to do sales, he will go to owner's profile
// and then switch to sales profile… if you look at the micro you'll see the
// impact rather than a macro view. As a freelancer one-man band you have to
// judge the departments not the person, since if you judge the departments
// you'll see if enough is allocated or not or whether expansion is needed."*
//
// ── These are role templates, not a new permission system ─────────────────
//
// Ed: *"it depends on how their role is configured, they should only see what
// is configured access for them — everything is roles."* He is right, and this
// file is deliberately thin because of it. AquaCRM already has element-level
// RBAC: `ACCESS_ELEMENT_KEYS` × view/use/manage, `AccessRoleTemplate` to name a
// bundle of them, `AccessGrant` to give somebody one in a scope. A worker
// profile is therefore a PRESET over that, not a parallel mechanism.
//
// Building a second access layer beside the audited one is how you get a hole:
// two systems that must agree about who sees what will eventually disagree, and
// the disagreement is a breach rather than a bug. So a profile decides what a
// template CONTAINS; the existing authority still decides what it MEANS.
//
// ── Why a profile is also a lens ──────────────────────────────────────────
//
// The same preset does double duty. Granted permanently it is a hired caller's
// seat. Worn temporarily by the owner it is "I am doing sales this morning" —
// and because the nav is assembled from what the actor can view, stepping into
// it narrows the screen to that department. That narrowing is the whole point:
// a macro dashboard averages five departments into one reassuring number.

import type { AccessCapability, AccessElementKey } from "@/server/types";

export type DepartmentId = "sales" | "delivery" | "finance" | "marketing" | "support";

export interface DepartmentProfile {
  id: DepartmentId;
  /** The name on the switcher and on the hire's seat. */
  label: string;
  /** One line saying what this person's job actually is. */
  purpose: string;
  /**
   * Elements this department can USE, in the RBAC's own vocabulary.
   *
   * `use` rather than `manage` throughout: a department worker does the work,
   * and configuring the department is the owner's job. A profile that hands a
   * new commission caller `manage` on anything would be a preset that quietly
   * widens access every time it is granted.
   */
  use: AccessElementKey[];
  /** Elements they can see but not act on — context, not controls. */
  view: AccessElementKey[];
}

/**
 * The presets.
 *
 * Every one of them is a claim about what a job needs, and each is meant to be
 * argued with and edited — they are seeded as ordinary role templates, so an
 * agency can change them without touching this file. What must NOT drift is the
 * principle behind each: the narrowest set that lets the job be done.
 */
export const DEPARTMENT_PROFILES: readonly DepartmentProfile[] = [
  {
    id: "sales",
    label: "Sales",
    purpose: "Work a call list, book meetings, and move real opportunities to a yes or no.",
    // A commission caller: contacts and outreach are the job; the board is how
    // they see their own pipeline.
    use: ["growth.contacts", "growth.outreach", "growth.leads", "workspace.actions", "workspace.calendar"],
    // Campaigns are DELIBERATELY absent, even from `view`. Bulk sending from an
    // agency address is a reputational action, and a new caller on a trial is
    // the last person who should reach it.
    view: ["growth.overview", "workspace.overview", "staff.overview"],
  },
  {
    id: "delivery",
    label: "Delivery",
    purpose: "Run the client work — onboarding, builds, milestones and handover.",
    use: [
      "fulfilment.projects", "fulfilment.services", "fulfilment.portals",
      "client.fulfilment", "client.communications", "client.files",
      "workspace.actions", "workspace.calendar", "workspace.files",
    ],
    view: ["fulfilment.overview", "client.overview", "workspace.overview", "staff.overview"],
  },
  {
    id: "finance",
    label: "Finance",
    purpose: "Invoices out, expenses in, and the numbers that say whether this works.",
    use: ["client.commercial", "workspace.actions", "workspace.files"],
    // `staff.pay` is view-only even here. Seeing payroll to reconcile it is the
    // job; changing it is not, and the two are one keystroke apart.
    view: ["client.overview", "workspace.overview", "staff.overview", "staff.pay"],
  },
  {
    id: "marketing",
    label: "Marketing",
    purpose: "Fill the top of the pipeline — campaigns, content and funnels.",
    use: ["growth.campaigns", "growth.leads", "client.marketing", "workspace.actions", "workspace.files"],
    // Contacts are viewable so a campaign audience can be understood, but the
    // dialler is not here: outreach is the sales seat's tool.
    view: ["growth.overview", "growth.contacts", "workspace.overview", "staff.overview"],
  },
  {
    id: "support",
    label: "Support",
    purpose: "Answer what comes in, and keep every client's thread in one place.",
    use: ["workspace.inbox", "client.communications", "workspace.actions"],
    view: ["client.overview", "client.record", "workspace.overview", "staff.overview"],
  },
];

const BY_ID = new Map(DEPARTMENT_PROFILES.map(profile => [profile.id, profile]));

export function departmentProfile(id: string | undefined): DepartmentProfile | undefined {
  return id ? BY_ID.get(id as DepartmentId) : undefined;
}

/**
 * The capability list a department's role template holds.
 *
 * `workspace.view` is always included: without it there is no shell to put the
 * rest of the grant inside, and a seat that grants five elements but not the
 * door is a seat nobody can sit in.
 */
export function departmentCapabilities(profile: DepartmentProfile): AccessCapability[] {
  return [
    "workspace.view" as AccessCapability,
    ...profile.use.map(key => `element.${key}.use` as AccessCapability),
    ...profile.view.map(key => `element.${key}.view` as AccessCapability),
  ];
}

/** The template name an agency sees in its own access settings. */
export function departmentTemplateName(profile: DepartmentProfile): string {
  return `${profile.label} — worker profile`;
}
