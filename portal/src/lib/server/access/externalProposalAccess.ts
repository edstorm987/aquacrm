import "server-only";

import type { ExternalAssistantActionProposal } from "@/server/types";
import type { CurrentAccessActor } from "@/server/accessControl";
import { resolveActorWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";
import {
  clientWorkspaceElementAtLeast,
  clientWorkspaceElementLevel,
  resolveActorClientWorkspaceElementAccess,
} from "@/lib/server/access/clientWorkspaceElementAccess";
import { resolveActorAccess } from "@/server/accessControl";

/** Build one pure filter so the Actions RSC and its direct API cannot drift. */
export function externalProposalVisibleToActor(
  actor: CurrentAccessActor,
): (proposal: ExternalAssistantActionProposal) => boolean {
  if (actor.session.role === "agency-owner") return () => true;
  const agency = resolveActorAccess(actor, { kind: "agency", id: actor.resourceAgencyId });
  const staff = resolveActorWorkspaceElementAccess(actor, "staff");
  const growth = resolveActorWorkspaceElementAccess(actor, "growth");
  const fulfilment = resolveActorWorkspaceElementAccess(actor, "fulfilment");
  const legacyManager = actor.session.role === "agency-manager"
    && agency.grantIds.length === 0
    && !staff.canonical
    && !growth.canonical
    && !fulfilment.canonical;
  const capabilities = new Set([
    ...agency.capabilities,
    ...staff.capabilities,
    ...growth.capabilities,
    ...fulfilment.capabilities,
  ]);
  return proposal => {
    // Older rows have no immutable authority envelope and are owner-only. A
    // self-declared category/source is not provenance and cannot safely grant
    // a narrowed role visibility into assistant-generated text or evidence.
    if (!proposal.requiredElements?.length) return false;
    const clientId = proposal.sourceHref?.match(/^\/portal\/clients\/([^/?#]+)/)?.[1];
    let decodedClientId: string | null = null;
    try {
      decodedClientId = clientId ? decodeURIComponent(clientId) : null;
    } catch {
      return false;
    }
    return proposal.requiredElements.every(element => {
      if (legacyManager) return true;
      if (decodedClientId && element.startsWith("client.")) {
        const clientAccess = resolveActorClientWorkspaceElementAccess(actor, decodedClientId);
        return clientWorkspaceElementAtLeast(clientWorkspaceElementLevel(clientAccess, element), "view");
      }
      return capabilities.has(`element.${element}.view`);
    });
  };
}
