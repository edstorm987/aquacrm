import "server-only";

import type { OperationalAlert } from "@/lib/intelligence/operationalAttention";
import {
  clientWorkspaceElementAtLeast,
  clientWorkspaceElementLevel,
  resolveActorClientWorkspaceElementAccess,
} from "@/lib/server/access/clientWorkspaceElementAccess";
import {
  resolveActorWorkspaceElementAccess,
  workspaceElementAtLeast,
  workspaceElementLevel,
} from "@/lib/server/access/workspaceElementAccess";
import {
  actorHasActiveNonProjectAccessPolicy,
  resolveActorAccess,
  type CurrentAccessActor,
} from "@/server/accessControl";
import type { AccessCapability, AccessElementKey } from "@/server/types";
import { externalProposalVisibleToActor } from "@/lib/server/access/externalProposalAccess";

function clientDestinationElement(alert: OperationalAlert): AccessElementKey | null {
  if (!alert.clientId) return null;
  const tab = new URL(alert.href, "https://aquacrm.local").searchParams.get("tab");
  return ({
    relationship: "client.relationship",
    delivery: "client.fulfilment",
    fulfilment: "client.fulfilment",
    marketing: "client.marketing",
    systems: "client.systems",
    finance: "client.commercial",
    communications: "client.communications",
    files: "client.files",
    portal: "client.portal",
    notes: "client.record",
  } as const)[tab ?? ""] ?? null;
}

function requiredAlertElements(alert: OperationalAlert): AccessElementKey[] | null {
  // Calendar rows are person-owned but the legacy alert shape carries no
  // owner. The personal Radar reads them from the owner-bound source instead.
  if (alert.id.startsWith("calendar-reminder:")) return null;
  // This legacy aggregate is calculated for the agency owner and has no actor
  // provenance. It may only pass through the explicit owner baseline below.
  if (alert.id === "people:chat-attention") return null;
  if (alert.id.startsWith("people:leave")) return ["staff.schedule"];
  if (alert.id.startsWith("people:training")) return ["staff.training"];
  if (alert.id.startsWith("people:")) return ["staff.people"];

  if (alert.href.startsWith("/portal/agency/agency-finance")) {
    return alert.id === "finance:people-payments-due"
      ? ["client.commercial", "staff.pay"]
      : ["client.commercial"];
  }
  if (alert.category === "support") {
    return ["workspace.inbox", ...(alert.clientId ? ["client.communications" as const] : [])];
  }
  if (alert.category === "task") {
    return ["workspace.actions", ...(alert.clientId ? ["client.overview" as const] : [])];
  }
  if (alert.category === "outage") return alert.clientId ? ["client.systems"] : ["workspace.overview"];
  if (alert.category === "money") return ["client.commercial"];
  if (alert.category === "meeting") return ["growth.leads"];
  if (alert.category === "client") {
    if (alert.href.startsWith("/portal/agency/inbox")) {
      return ["workspace.inbox", ...(alert.clientId ? ["client.communications" as const] : [])];
    }
    if (alert.href.startsWith("/portal/agency/pipelines")) return ["growth.leads"];
    const destination = clientDestinationElement(alert);
    return destination ? [destination] : alert.clientId ? ["client.overview"] : ["growth.contacts"];
  }
  if (alert.category === "marketing") return alert.clientId ? ["client.marketing"] : ["growth.campaigns"];
  if (alert.category === "development") return alert.clientId ? ["client.systems"] : ["fulfilment.projects"];
  if (alert.category === "contract") return alert.clientId ? ["client.commercial"] : ["workspace.settings"];
  if (alert.category === "compliance") return ["workspace.settings"];
  return null;
}

function actorAlertPredicate(actor: CurrentAccessActor): (alert: OperationalAlert) => boolean {
  if (actor.session.role === "agency-owner") {
    return alert => !alert.id.startsWith("calendar-reminder:");
  }
  if (actor.session.role === "agency-manager" && !actorHasActiveNonProjectAccessPolicy(actor)) {
    const proposalVisible = externalProposalVisibleToActor(actor);
    return alert => {
      if (alert.id.startsWith("calendar-reminder:") || alert.id === "people:chat-attention") return false;
      if (!alert.id.startsWith("external-proposal:")) return true;
      const proposalId = alert.id.slice("external-proposal:".length);
      const proposal = actor.resourceState.externalAssistantActionProposals[proposalId];
      return Boolean(proposal && proposalVisible(proposal));
    };
  }
  const agency = resolveActorAccess(actor, { kind: "agency", id: actor.resourceAgencyId });
  const staff = resolveActorWorkspaceElementAccess(actor, "staff");
  const growth = resolveActorWorkspaceElementAccess(actor, "growth");
  const fulfilment = resolveActorWorkspaceElementAccess(actor, "fulfilment");
  const clients = new Map<string, ReturnType<typeof resolveActorClientWorkspaceElementAccess>>();
  const proposalVisible = externalProposalVisibleToActor(actor);

  return alert => {
    if (alert.id === "people:chat-attention") return false;
    if (alert.id.startsWith("external-proposal:")) {
      const proposalId = alert.id.slice("external-proposal:".length);
      const proposal = actor.resourceState.externalAssistantActionProposals[proposalId];
      if (!proposal || !proposalVisible(proposal)) return false;
    }
    const required = requiredAlertElements(alert);
    if (!required?.length) return false;
    let client = alert.clientId ? clients.get(alert.clientId) : undefined;
    if (alert.clientId && !client) {
      client = resolveActorClientWorkspaceElementAccess(actor, alert.clientId);
      clients.set(alert.clientId, client);
    }
    return required.every(element => {
      if (element.startsWith("client.") && client) {
        return clientWorkspaceElementAtLeast(clientWorkspaceElementLevel(client, element), "view");
      }
      if (element.startsWith("staff.") || element.startsWith("workspace.")) {
        return workspaceElementAtLeast(workspaceElementLevel(staff, element), "view");
      }
      if (element.startsWith("growth.")) {
        return workspaceElementAtLeast(workspaceElementLevel(growth, element), "view");
      }
      if (element.startsWith("fulfilment.")) {
        return workspaceElementAtLeast(workspaceElementLevel(fulfilment, element), "view");
      }
      return agency.capabilities.includes(`element.${element}.view` as AccessCapability);
    });
  };
}

/** Project one operational alert through the same stable element gates as its destination. */
export function operationalAlertVisibleToActor(
  actor: CurrentAccessActor,
  alert: OperationalAlert,
): boolean {
  return actorAlertPredicate(actor)(alert);
}

export function filterOperationalAlertsForActor<T extends OperationalAlert>(
  actor: CurrentAccessActor,
  alerts: readonly T[],
): T[] {
  const visible = actorAlertPredicate(actor);
  return alerts.filter(alert => visible(alert));
}
