import "server-only";

import {
  assertClientWorkspaceElementAccess,
  resolveActorClientWorkspaceElementAccess,
} from "@/lib/server/access/clientWorkspaceElementAccess";
import { loadActorWebsiteEnquiry, type WebsiteEnquiryAccessLevel } from "@/lib/server/access/websiteEnquiryAccess";
import {
  assertWorkspaceElementAccess,
  resolveActorWorkspaceElementAccess,
} from "@/lib/server/access/workspaceElementAccess";
import { getInboxConversation } from "@/lib/server/inbox/inboxStore";
import type { InboxMediaTargetKind } from "@/lib/server/inbox/inboxMedia";
import { createScopedSupabaseClient } from "@/lib/supabase/scoped";
import type { CurrentAccessActor } from "@/server/accessControl";
import { getClientForAgency } from "@/server/tenants";

/** Resolve the target from its live store and enforce its semantic leaf. */
export async function inboxMediaTargetExistsForActor(
  actor: CurrentAccessActor,
  kind: InboxMediaTargetKind,
  targetId: string,
  required: WebsiteEnquiryAccessLevel,
): Promise<boolean> {
  assertWorkspaceElementAccess(
    resolveActorWorkspaceElementAccess(actor, "staff"),
    "workspace.inbox",
    required,
  );

  if (kind === "website") {
    return Boolean(await loadActorWebsiteEnquiry(
      actor,
      await createScopedSupabaseClient(),
      { id: targetId, required },
    ));
  }

  if (kind === "social") {
    const conversation = await getInboxConversation(actor.resourceAgencyId, targetId);
    if (!conversation) return false;
    if (conversation.identity.clientId) {
      assertClientCommunications(actor, conversation.identity.clientId, required);
    }
    return true;
  }

  const separator = targetId.indexOf(":");
  if (separator < 1) return false;
  const clientId = targetId.slice(0, separator);
  const requestId = targetId.slice(separator + 1);
  const client = getClientForAgency(actor.resourceAgencyId, clientId);
  if (!client) return false;
  assertClientCommunications(actor, clientId, required);
  const requests = Array.isArray(client.metadata?.clientRequests) ? client.metadata.clientRequests : [];
  return requests.some(item => item && typeof item === "object" && (item as { id?: unknown }).id === requestId);
}

function assertClientCommunications(
  actor: CurrentAccessActor,
  clientId: string,
  required: WebsiteEnquiryAccessLevel,
): void {
  assertClientWorkspaceElementAccess(
    resolveActorClientWorkspaceElementAccess(actor, clientId),
    "client.communications",
    required,
  );
}
