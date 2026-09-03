import "server-only";

import {
  assertClientWorkspaceElementAccess,
  resolveActorClientWorkspaceElementAccess,
} from "@/lib/server/access/clientWorkspaceElementAccess";
import {
  assertWorkspaceElementAccess,
  resolveActorWorkspaceElementAccess,
} from "@/lib/server/access/workspaceElementAccess";
import { loadOwnedEnquiry, type OwnedEnquiryRow } from "@/lib/supabase/ownedEnquiry";
import type { ScopedSupabaseClient } from "@/lib/supabase/scoped";
import type { CurrentAccessActor } from "@/server/accessControl";

export type WebsiteEnquiryAccessLevel = "view" | "use";

/**
 * Return every durable client association carried by an enquiry.
 *
 * `metadata.clientId` is the current canonical link. Older rows can carry the
 * same link only inside the stored identity resolution, while a partially
 * repaired row can briefly contain both. Requiring access to every distinct
 * association fails closed during that disagreement instead of choosing the
 * more permissive value.
 */
export function websiteEnquiryLinkedClientIds(
  enquiry: Pick<OwnedEnquiryRow, "metadata">,
): string[] {
  const metadata = enquiry.metadata && typeof enquiry.metadata === "object"
    ? enquiry.metadata
    : {};
  const identityResolution = metadata.identityResolution && typeof metadata.identityResolution === "object"
    ? metadata.identityResolution as Record<string, unknown>
    : {};
  return [...new Set([
    cleanId(metadata.clientId),
    cleanId(identityResolution.clientId),
  ].filter((value): value is string => Boolean(value)))];
}

export function assertActorWebsiteEnquiryAccess(
  actor: CurrentAccessActor,
  enquiry: Pick<OwnedEnquiryRow, "metadata">,
  required: WebsiteEnquiryAccessLevel,
): void {
  assertWorkspaceElementAccess(
    resolveActorWorkspaceElementAccess(actor, "staff"),
    "workspace.inbox",
    required,
  );
  for (const clientId of websiteEnquiryLinkedClientIds(enquiry)) {
    assertClientWorkspaceElementAccess(
      resolveActorClientWorkspaceElementAccess(actor, clientId),
      "client.communications",
      required,
    );
  }
}

/**
 * Load the live, tenant-owned row and authorize its current association.
 * Call this again immediately before an external send, file staging or write
 * whenever request preparation introduced a gap after the first read.
 */
export async function loadActorWebsiteEnquiry<
  Row extends OwnedEnquiryRow = OwnedEnquiryRow,
>(
  actor: CurrentAccessActor,
  supabase: ScopedSupabaseClient,
  input: { id: string; required: WebsiteEnquiryAccessLevel; columns?: readonly string[] },
): Promise<Row | null> {
  const enquiry = await loadOwnedEnquiry<Row>(supabase, {
    id: input.id,
    agencyId: actor.resourceAgencyId,
    columns: input.columns,
  });
  if (!enquiry) return null;
  assertActorWebsiteEnquiryAccess(actor, enquiry, input.required);
  return enquiry;
}

function cleanId(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
