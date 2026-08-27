import "server-only";

import { createHash } from "node:crypto";

import {
  CLIENT_WORKSPACE_ELEMENT_KEYS,
  clientWorkspaceElementLevel,
  clientWorkspaceHasAnyVisibleElement,
  resolveActorClientWorkspaceElementAccess,
  type ClientWorkspaceElementAccess,
} from "@/lib/server/access/clientWorkspaceElementAccess";
import {
  FULFILMENT_VIEW_ELEMENT_KEYS,
  STAFF_COMMAND_ELEMENT_KEYS,
  STAFF_STATION_ELEMENT_KEYS,
  resolveActorWorkspaceElementAccess,
  workspaceElementLevel,
  type WorkspaceElementAccess,
} from "@/lib/server/access/workspaceElementAccess";
import type { CurrentAccessActor } from "@/server/accessControl";
import type { AccessElementKey } from "@/server/types";

export interface SearchCandidateDescriptor {
  category: string;
  href: string;
}

export interface SearchCandidateAccess {
  /** Stable cache dimension derived from authoritative, current access. */
  fingerprint: string;
  visible(candidate: SearchCandidateDescriptor): boolean;
}

const FULL_ACCESS: SearchCandidateAccess = {
  fingerprint: "full",
  visible: () => true,
};

function visible(level: string): boolean {
  return level !== "hidden";
}

function clientIdFromHref(href: string): string | null {
  const match = /^\/portal\/clients\/([^/?#]+)/.exec(href);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function clientElementFor(candidate: SearchCandidateDescriptor): AccessElementKey {
  if (/\/(?:files|deliverables)(?:[/?#]|$)/.test(candidate.href) || candidate.category === "File") return "client.files";
  if (["Invoice", "Expense", "Income", "Contract"].includes(candidate.category)) return "client.commercial";
  if (["Message", "Request"].includes(candidate.category)) return "client.communications";
  if (["Campaign", "Audience"].includes(candidate.category)) return "client.marketing";
  if (["Product", "SOP", "Milestone", "Task", "Resource", "Knowledge"].includes(candidate.category)) return "client.fulfilment";
  if (["Website", "Data", "Check", "Radar", "KPI", "Evidence", "Source"].includes(candidate.category)) return "client.systems";
  if (candidate.category === "Form") return "client.portal";
  if (["Contact", "Client data", "Note", "Activity"].includes(candidate.category)) return "client.record";
  return "client.overview";
}

function staffElementFor(href: string): AccessElementKey | null {
  if (href.startsWith("/portal/clients?view=staff")) return "staff.people";
  if (href.startsWith("/portal/agency/notepad")) return "workspace.files";
  if (href.startsWith("/portal/agency/actions")) return "workspace.actions";
  if (href.startsWith("/portal/agency/team-chat")) return "staff.chat";

  if (href.startsWith("/portal/team")) {
    const section = /^\/portal\/team\/([^/?#]+)/.exec(href)?.[1] ?? "my-day";
    const bySection = STAFF_STATION_ELEMENT_KEYS as Readonly<Record<string, AccessElementKey>>;
    return bySection[section] ?? "staff.overview";
  }

  if (!href.startsWith("/portal/agency/people")) return null;
  const url = new URL(href, "http://search.local");
  if (url.searchParams.has("employee")) return STAFF_COMMAND_ELEMENT_KEYS.team;
  if (url.searchParams.has("application")) return STAFF_COMMAND_ELEMENT_KEYS.candidates;
  const view = url.searchParams.get("view") ?? "overview";
  const byView = STAFF_COMMAND_ELEMENT_KEYS as Readonly<Record<string, AccessElementKey>>;
  return byView[view] ?? STAFF_COMMAND_ELEMENT_KEYS.overview;
}

function fulfilmentElementFor(href: string): AccessElementKey | null {
  if (href.startsWith("/portal/agency/development")) return "fulfilment.projects";
  if (href.startsWith("/portal/agency/portals")) return "fulfilment.portals";
  if (href.startsWith("/portal/agency/aqua-tags")) return "fulfilment.tags";
  if (href.startsWith("/portal/agency/products") || href.startsWith("/portal/agency/pipelines")) return "fulfilment.services";
  if (!href.startsWith("/portal/agency/fulfilment")) return null;

  const url = new URL(href, "http://search.local");
  if (/^\/portal\/agency\/fulfilment\/technical(?:[/?#]|$)/.test(href)) return "fulfilment.projects";
  const view = url.searchParams.get("view") ?? "overview";
  const byView = FULFILMENT_VIEW_ELEMENT_KEYS as Readonly<Record<string, AccessElementKey>>;
  return byView[view] ?? FULFILMENT_VIEW_ELEMENT_KEYS.overview;
}

function accessShape(
  actor: CurrentAccessActor,
  staff: WorkspaceElementAccess,
  fulfilment: WorkspaceElementAccess,
  clients: ReadonlyMap<string, ClientWorkspaceElementAccess>,
): string {
  const levelEntries = (access: WorkspaceElementAccess) => Object.entries(access.levels)
    .sort(([left], [right]) => left.localeCompare(right));
  const clientEntries = [...clients.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([clientId, access]) => [
      clientId,
      CLIENT_WORKSPACE_ELEMENT_KEYS.map(key => [key, clientWorkspaceElementLevel(access, key)]),
    ]);
  return JSON.stringify({
    accessRev: actor.user.accessRev ?? 0,
    environment: actor.environment,
    staff: levelEntries(staff),
    fulfilment: levelEntries(fulfilment),
    clients: clientEntries,
  });
}

/**
 * Search is mounted in the shared Topbar, including delegated Staff shells.
 * Owners/managers retain the existing complete index. Canonically governed
 * staff receive only records whose destination element is visible to the same
 * authoritative projection used by navigation and direct route guards.
 */
export function searchCandidateAccess(actor: CurrentAccessActor): SearchCandidateAccess {
  if (actor.session.role !== "agency-staff") return FULL_ACCESS;

  const staff = resolveActorWorkspaceElementAccess(actor, "staff");
  const fulfilment = resolveActorWorkspaceElementAccess(actor, "fulfilment");
  const clients = new Map(
    Object.values(actor.resourceState.clients)
      .filter(client => client.agencyId === actor.resourceAgencyId)
      .map(client => [client.id, resolveActorClientWorkspaceElementAccess(actor, client.id)]),
  );
  const fingerprint = createHash("sha256")
    .update(accessShape(actor, staff, fulfilment, clients))
    .digest("base64url");

  return {
    fingerprint: `${actor.user.accessRev ?? 0}:${fingerprint}`,
    visible(candidate) {
      const clientId = clientIdFromHref(candidate.href);
      if (clientId) {
        const access = clients.get(clientId);
        if (!access) return false;
        if (candidate.category === "Client") return clientWorkspaceHasAnyVisibleElement(access);
        return visible(clientWorkspaceElementLevel(access, clientElementFor(candidate)));
      }

      const staffElement = staffElementFor(candidate.href);
      if (staffElement) return visible(workspaceElementLevel(staff, staffElement));
      const fulfilmentElement = fulfilmentElementFor(candidate.href);
      if (fulfilmentElement) return visible(workspaceElementLevel(fulfilment, fulfilmentElement));

      // No delegated destination means no delegated discoverability. In
      // particular, agency Finance, Inbox, Radar and executive records cannot
      // be recovered through search when the Staff shell has no route to them.
      return false;
    },
  };
}
