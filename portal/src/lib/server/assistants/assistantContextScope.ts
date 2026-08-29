import "server-only";

// What an AI may be TOLD, for this person.
//
// Ed, 2026-08-27: *"same for all AI scopes actually."* The external assistant
// API was bound to its principal first (issue #181); this is the in-app half.
//
// ── Why a gate was never going to be enough ──────────────────────────────
//
// `/api/assistant` gated on ROLE — `requireRole(["agency-owner",
// "agency-manager"])` — and then built a context containing the agency, EVERY
// user with their email and role, EVERY client, end customers, pipelines,
// pipeline cards, recent activity, and up to 500 raw entries from EVERY
// installed module. Finance. HR pay. All of it, handed to a model.
//
// So a manager whose element access had been narrowed could not open Finance in
// the UI and could ask the Assistant instead. The role check said "manager" and
// stopped. Making the gate stricter would not have fixed that: the question is
// not *may you call this endpoint*, it is *what may this endpoint know about
// you*. The answer has to be assembled per person.
//
// ── The rule ─────────────────────────────────────────────────────────────
//
// Every section of the context names an element. A section is included only if
// the actor holds `view` on that element at the agency scope. A module with no
// element mapping contributes NOTHING — the safe default, and the opposite of
// what happened before, where an unclassified module's data went out because
// nobody had thought about it.
//
// `ownerBaseline` gets everything, for the same reason it does everywhere else:
// an owner is not narrowed by grants they never needed.

import { agencyElementForModule } from "@/lib/server/portal/pluginClientElement";
import type { AccessCapability, AccessElementKey } from "@/server/types";
// TYPE only, and every value from the access kernel is pulled in dynamically
// below. The healthy owner shell must not statically reach `accessControl.ts` —
// it is a heavy graph and the speed work split it out deliberately, with
// `smoke-shared-graph-split` guarding the boundary. A static import here put it
// straight back through the Advisor drawer.
import type { CurrentAccessActor } from "@/server/accessControl";

/** The parts of an assistant context, and the element each one belongs to. */
export const ASSISTANT_CONTEXT_SECTIONS = {
  /** The tenant itself: name, brand, status. */
  agency: "workspace.overview",
  /** Names, emails and roles of everybody in the agency. */
  team: "staff.people",
  /** Every client record. */
  clients: "client.overview",
  /** The clients' own customers. */
  endCustomers: "client.overview",
  /** Boards and the cards on them. */
  pipelines: "fulfilment.projects",
  pipelineCards: "fulfilment.projects",
  /** The activity log. */
  recentActivity: "workspace.overview",
} as const satisfies Readonly<Record<string, AccessElementKey>>;

export type AssistantContextSection = keyof typeof ASSISTANT_CONTEXT_SECTIONS;

export interface AssistantContextScope {
  /** Sections this person may be told about. */
  sections: ReadonlySet<AssistantContextSection>;
  /** Whether a given installed module's data may be included. */
  allowsModule: (moduleId: string) => boolean;
  /** True when nothing at all is permitted — the caller should refuse, not answer emptily. */
  empty: boolean;
  /** Named for the audit trail and for an honest "what was left out" line. */
  withheld: AssistantContextSection[];
}

function holdsView(capabilities: readonly AccessCapability[], element: AccessElementKey): boolean {
  return capabilities.includes(`element.${element}.view` as AccessCapability)
    || capabilities.includes(`element.${element}.use` as AccessCapability)
    || capabilities.includes(`element.${element}.manage` as AccessCapability);
}

/** Everything — an owner, or a caller the kernel has already cleared wholesale. */
export function fullAssistantContextScope(): AssistantContextScope {
  return {
    sections: new Set(Object.keys(ASSISTANT_CONTEXT_SECTIONS) as AssistantContextSection[]),
    allowsModule: () => true,
    empty: false,
    withheld: [],
  };
}

/**
 * What an AI may be told, given what the kernel already resolved.
 *
 * Pure, and takes the resolved capabilities rather than an actor, so this
 * module never has to import the access kernel to answer.
 */
export function assistantContextScopeFromCapabilities(
  capabilities: readonly AccessCapability[],
  ownerBaseline: boolean,
): AssistantContextScope {
  if (ownerBaseline) return fullAssistantContextScope();

  const sections = new Set<AssistantContextSection>();
  const withheld: AssistantContextSection[] = [];
  for (const [section, element] of Object.entries(ASSISTANT_CONTEXT_SECTIONS) as [AssistantContextSection, AccessElementKey][]) {
    if (holdsView(capabilities, element)) sections.add(section);
    else withheld.push(section);
  }

  return {
    sections,
    allowsModule: (moduleId: string) => {
      const element = agencyElementForModule(moduleId);
      // No mapping means no answer. A module nobody has classified is exactly
      // the one whose data should not be quietly handed to a model.
      return element ? holdsView(capabilities, element) : false;
    },
    empty: sections.size === 0,
    withheld,
  };
}

/**
 * The context, already scoped to the CURRENT actor.
 *
 * The four in-app callers use this rather than resolving a scope each — one
 * home for the rule, so they cannot drift into four readings of it. It resolves
 * the actor itself because the scope is an access-kernel question and a session
 * is not an actor.
 */
export async function currentAssistantBusinessContext(agencyId: string) {
  const { requireCurrentAccessActor, resolveActorAccess } = await import("@/server/accessControl");
  const { buildAssistantBusinessContext } = await import("@/lib/server/assistants/assistantBusinessContext");
  const actor = await requireCurrentAccessActor();
  const resolution = resolveActorAccess(actor, { kind: "agency", id: actor.agencyId });
  const scope = assistantContextScopeFromCapabilities(resolution.capabilities, resolution.ownerBaseline);
  return buildAssistantBusinessContext(agencyId, scope);
}

/**
 * The element gate for an in-app AI surface.
 *
 * These routes gated on ROLE — `requireRole(["agency-owner","agency-manager"])`
 * — which is the confused deputy one level in: a manager whose element access
 * has been narrowed still passes the role check, and the AI then answers from
 * data the UI hides from them.
 *
 * There is no `requireCurrentWorkspaceElementAccess` for these, because that
 * helper is bound to the two GOVERNED workspaces (staff, fulfilment) and an
 * Advisor is neither. So this asks the kernel directly at the agency scope,
 * which is the same thing `requireDevProjectAccess` does for a project.
 */
export async function requireAssistantElement(
  element: AccessElementKey,
  action: "view" | "use" | "manage" = "view",
): Promise<CurrentAccessActor> {
  const { requireCurrentAccessActor, requireAccessCapability } = await import("@/server/accessControl");
  const actor = await requireCurrentAccessActor();
  await requireAccessCapability({
    capability: `element.${element}.${action}` as AccessCapability,
    scope: { kind: "agency", id: actor.agencyId },
  });
  return actor;
}
