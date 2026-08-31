import "server-only";

// Which client element owns an AGENCY-SIDE record that merely NAMES a client.
//
// The plugin catch-all was classified in `pluginClientElement.ts`; this is the
// other half the checklist kept open — *"freelancer-job and generic
// task/task-template client associations remain genuinely unclassified"*.
//
// ── Why they were hard, and what settles them ──────────────────────────────
//
// These records are agency work. An Action, a task template and a freelancer
// job all belong to the AGENCY's workspace and are already gated there
// (`workspace.actions`, an agency role, People). What none of them had was a
// rule about the one field that reaches across the boundary: `clientId`.
//
// The reason nobody classified them is real: a GENERIC task belongs to no
// single client element. It might be about money, or delivery, or a
// conversation. Picking `client.fulfilment` for it would be a guess, and a
// guess that reads as enforced is worse than an honest gap.
//
// The answer is that a generic association does not need the element that owns
// the SUBJECT — it needs the element that says **you may see this client at
// all**. That element exists and is not a guess: `client.overview` is the
// client workspace's landing tab, the thing a person loses first when they are
// restricted away from a client. A freelancer job is different: it is delivery
// work placed with a contractor for a named client, which is exactly what
// `client.fulfilment` covers.
//
// ── What this deliberately does NOT do ─────────────────────────────────────
//
// It does not touch the FREELANCER's own view of their job. That is governed by
// `FreelancerAccessConfig` — the per-agency, per-job policy deciding whether the
// client is even named to them (`freelancerWorkspace.ts`). The checklist calls
// for preserving named alternative authorities rather than "forcing the wrong
// client gate", and this is one: the contractor is not an agency identity and
// must not be evaluated as one.
//
// It also keeps the migration rule, because it routes through
// `requireCurrentClientWorkspaceElementAccess`: an identity that has not
// entered canonical governance retains its legacy behaviour, and only a CEILING
// refusal is a hard no (see issues #166).

import type { AccessElementKey } from "@/server/types";
import {
  requireCurrentClientWorkspaceElementAccess,
  resolveActorClientWorkspaceElementAccess,
  clientWorkspaceElementAtLeast,
  type ClientWorkspaceElementLevel,
} from "@/lib/server/access/clientWorkspaceElementAccess";
import type { CurrentAccessActor } from "@/server/accessControl";

/**
 * Agency-side records that carry a `clientId`, and the element that association
 * answers to. The reasoning is the part worth arguing with:
 *
 *  • `agency-task`      → a generic Action. No single element owns its subject,
 *                         so the association asks only whether this person may
 *                         see the client at all: `client.overview`.
 *  • `agency-task-template` → the same record before it is instantiated. Same
 *                         answer, and it matters more here: the template route
 *                         had no element gate whatsoever.
 *  • `freelancer-job`   → delivery work placed with a contractor for a named
 *                         client. That is `client.fulfilment`, the element the
 *                         client workspace calls Delivery.
 */
export const CLIENT_ASSOCIATION_ELEMENT = {
  "agency-task": "client.overview",
  "agency-task-template": "client.overview",
  "freelancer-job": "client.fulfilment",
} as const satisfies Readonly<Record<string, AccessElementKey>>;

export type ClientAssociationKind = keyof typeof CLIENT_ASSOCIATION_ELEMENT;

/**
 * Agency-side surfaces that name a client and are deliberately NOT gated here,
 * with the authority that governs them instead. Kept explicit so "decided
 * elsewhere" cannot be mistaken for "nobody looked" — the same discipline as
 * `UNMAPPED_MODULES` in pluginClientElement.ts.
 */
export const CLIENT_ASSOCIATION_ALTERNATIVE_AUTHORITY: Readonly<Record<string, string>> = {
  "freelancer-job-as-seen-by-the-freelancer":
    "FreelancerAccessConfig decides whether the client is named to the contractor at all "
    + "(freelancerWorkspace.ts). A freelancer is not an agency identity and must not be "
    + "evaluated as one.",
  "close-deal":
    "api/tenants/close-deal resolves tenancy first and then requires client.commercial at "
    + "manage on its own — a stronger, money-specific gate than this generic one.",
  "phase-apply":
    "api/portal/phases/apply proves the client belongs to the session's agency before the "
    + "applier runs (phaseApplier.ts), and answers client_not_found for anything else.",
  "portal-search":
    "searchCandidateAccess decides discoverability by DESTINATION element: an Action's href is "
    + "/portal/agency/actions, so it answers to workspace.actions, and owners/managers keep the "
    + "complete index by design. That is deliberately coarser than this rule — a staff member "
    + "holding Actions can see the TITLE of an Action naming a client they cannot open — and it "
    + "is recorded rather than quietly changed, because search applies one model to every "
    + "category and moving Actions alone would split it.",
};

/** The element this association answers to, or null when it is not classified. */
export function clientAssociationElement(kind: string): AccessElementKey | null {
  return (CLIENT_ASSOCIATION_ELEMENT as Record<string, AccessElementKey>)[kind] ?? null;
}

/**
 * Require the caller may associate this record with this client.
 *
 * A no-op when there is no client — an unattached Action is agency-only work and
 * has nothing to say to this rule.
 */
export async function requireClientAssociation(
  kind: ClientAssociationKind,
  clientId: string | null | undefined,
  level: Exclude<ClientWorkspaceElementLevel, "hidden">,
): Promise<void> {
  if (!clientId) return;
  await requireCurrentClientWorkspaceElementAccess(
    clientId,
    CLIENT_ASSOCIATION_ELEMENT[kind],
    level,
  );
}

/**
 * The read side, for lists.
 *
 * A list endpoint cannot throw per row, so it filters instead. The actor is
 * resolved ONCE by the caller and reused, because `resolveActorClientWorkspaceElementAccess`
 * is pure over a resolved actor — a per-row `requireCurrent…` would re-read the
 * session for every task in the list.
 *
 * Records with no client are always kept: they are agency work.
 */
export function canReadClientAssociation(
  actor: CurrentAccessActor,
  kind: ClientAssociationKind,
  clientId: string | null | undefined,
): boolean {
  if (!clientId) return true;
  const access = resolveActorClientWorkspaceElementAccess(actor, clientId);
  const level = access.levels[CLIENT_ASSOCIATION_ELEMENT[kind]] ?? "hidden";
  return clientWorkspaceElementAtLeast(level, "view");
}
