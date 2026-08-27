import { ensureLeadsPipelineFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/leadsPipelineFoundation";
import { buildBusinessRecommendedActions } from "@/lib/intelligence/businessRecommendedActions";
import { getCachedBusinessIssueRadar } from "@/engines/data/server/radar/businessIssueRadar";
import { listExternalAssistantActionProposals } from "@/lib/server/assistants/externalAssistantProposals";
import { requireRole } from "@/lib/server/auth/auth";
import { isAssistantConfigured } from "@/lib/server/assistants/openaiAssistant";
import { listOperationalAlerts } from "@/lib/server/inbox/operationalAlerts";
import { listOperationalAlertViews } from "@/lib/server/inbox/operationalAlertPreferences";
import { withResolutionContext } from "@/lib/inbox/resolutionContext";
import { inferResolutionFocus } from "@/lib/inbox/resolutionFocus";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";
import { dashboardPlanningSnapshot } from "@/server/dashboardPlanning";
import { listCommandCalendarEntries } from "@/server/commandCalendar";
import { getCommandCalendarIntegrationSnapshot } from "@/lib/server/integrations/googleCalendar";
import { listSops } from "@/engines/sop/server/sops";
import { ensureHydrated } from "@/server/storage";
import { listAgencyTasks } from "@/server/tasks";
import { listClients } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";
import { listUsersForAgency } from "@/server/users";
import { containerFor } from "@aqua/plugin-leads-pipeline/server";
import { getPortalFormFields } from "@/server/portalEditor";

import type { ActionsView, GeneratedAction } from "./_ActionsWorkspace";
import { LazyActionsWorkspace } from "./_LazyActionsWorkspace";

const WEEK = 7 * 24 * 60 * 60 * 1000;

export async function AgencyActionsPage({
  initialView = "list",
  heading = "Actions",
  description,
}: {
  initialView?: ActionsView;
  heading?: string;
  description?: string;
}) {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const clients = listClients(session.agencyId);
  const now = Date.now();
  const initialTasks = listAgencyTasks(session.agencyId);
  const calendarIntegration = getCommandCalendarIntegrationSnapshot(session.agencyId, session.userId);
  const acceptedSourceIds = new Set(initialTasks.filter(task => task.status !== "done").map(task => task.sourceId).filter((id): id is string => Boolean(id)));
  const [businessRadar, liveAlerts] = await Promise.all([
    getCachedBusinessIssueRadar(session.agencyId),
    listOperationalAlerts(session.agencyId, now),
  ]);
  // Read through the same preferences Master Inbox uses, rather than the raw
  // list. On the raw list, parking or dismissing an item here held only until
  // the next refresh — the alert came straight back, while the inbox had it
  // hidden. Two views of one queue disagreeing is worse than either alone.
  // This also carries the deferral count, so work put off repeatedly says so.
  const operationalAlerts = listOperationalAlertViews(session.agencyId, session.userId, liveAlerts, now)
    .filter(alert => alert.state !== "parked");
  const actions: GeneratedAction[] = [];
  const calendarEvents: GeneratedAction[] = [];
  const leadsInstall = getInstall({ agencyId: session.agencyId }, "leads-pipeline");

  if (leadsInstall?.enabled) {
    ensureLeadsPipelineFoundationRegistered();
    const { leads, commercial } = containerFor({
      agencyId: session.agencyId,
      storage: makePluginStorage(leadsInstall.id) as never,
    });
    const leadRows = await leads.list();
    const commercialPacks = (await Promise.all(leadRows.map(lead => commercial.get("lead", lead.id)))).filter(pack => pack !== null);
    for (const lead of leadRows) {
      const name = lead.name || lead.company || lead.email;
      if (lead.nextMeetingAt && !["completed", "cancelled"].includes(lead.meetingStatus ?? "")) {
        calendarEvents.push(signal(`meeting:${lead.id}`, `Meeting with ${name}`, `${(lead.meetingMode ?? "Meeting").replaceAll("-", " ")} · ${lead.meetingLocation || "Open the lead for joining details."}`, "/portal/agency/pipelines/leads", "Meeting", "normal", lead.nextMeetingAt));
        if (!lead.meetingConfirmedAt) actions.push(signal(`${lead.id}:confirm`, `Confirm meeting with ${name}`, "Check the time, format, and joining details.", "/portal/agency/pipelines/leads", "Meeting", "high", lead.nextMeetingAt));
        if (lead.meetingMode === "google-meet" && !isGoogleMeetUrl(lead.meetingLink)) actions.push(signal(`${lead.id}:link`, `Add the Google Meet for ${name}`, "The meeting has no valid joining link.", "/portal/agency/pipelines/leads", "Meeting", "high", lead.nextMeetingAt));
        if (lead.meetingMode === "in-person" && !lead.meetingLocation?.trim()) actions.push(signal(`${lead.id}:location`, `Confirm location with ${name}`, "The in-person meeting has no location recorded.", "/portal/agency/pipelines/leads", "Meeting", "high", lead.nextMeetingAt));
        if (lead.meetingReminderAt && !lead.meetingReminderSentAt && lead.meetingReminderAt <= now) actions.push(signal(`${lead.id}:reminder`, `Send ${name} a meeting reminder`, "Send it manually, then record the attempt.", "/portal/agency/pipelines/leads", "Meeting", "urgent", lead.meetingReminderAt));
        if (lead.meetingStatus === "no-show") actions.push(signal(`${lead.id}:no-show`, `Follow up ${name}'s no-show`, "Record each contact attempt until the next step is clear.", "/portal/agency/pipelines/leads", "Meeting", "urgent", lead.nextMeetingAt));
      }
    }
    for (const pack of commercialPacks) {
      if (pack.dueAt < now && pack.invoiceStatus !== "paid" && pack.invoiceStatus !== "void") {
        actions.push(signal(`invoice:${pack.id}`, `Follow up overdue ${pack.invoiceNumber}`, `${pack.recipientName || pack.recipientEmail} has an unpaid invoice.`, "/portal/agency/agency-finance/invoices", "Finance", "urgent", pack.dueAt));
      }
    }
  }

  for (const client of clients.filter(client => client.status === "active")) {
    const lastContactedAt = Number(client.metadata?.lastContactedAt ?? 0);
    if (!lastContactedAt || now - lastContactedAt > WEEK) actions.push(signal(`${client.id}:contact`, `Check in with ${client.name}`, lastContactedAt ? "No client contact has been recorded for seven days." : "No client contact has been recorded yet.", `/portal/clients/${client.id}`, "Client", "high", lastContactedAt ? lastContactedAt + WEEK : client.createdAt, client.id));
    if (client.stage === "onboarding" || client.stage === "aqua-epic-intro") actions.push(signal(`${client.id}:onboarding`, `Continue ${client.name}'s onboarding`, "Collect the remaining information, access, content, or decisions.", `/portal/clients/${client.id}?tab=relationship`, "Journey", "normal", undefined, client.id));
    if (!client.ownerEmail) actions.push(signal(`${client.id}:email`, `Add ${client.name}'s account email`, "The client record is missing its main contact email.", `/portal/clients/${client.id}`, "Client", "high", undefined, client.id));
    if ((client.stage === "live" || client.stage === "aqua-mastery") && !client.websiteUrl) actions.push(signal(`${client.id}:live-link`, `Connect ${client.name}'s live website`, "Production is marked live but no website is linked.", `/portal/clients/${client.id}?tab=systems&systemView=properties`, "Development", "high", undefined, client.id));
    const requests = Array.isArray(client.metadata?.clientRequests) ? client.metadata.clientRequests as Array<{ id: string; type: string; status: string; submittedAt: number }> : [];
    for (const request of requests.filter(request => request.status === "open")) {
      actions.push(signal(`request:${client.id}:${request.id}`, `Respond to ${client.name}'s ${request.type.replaceAll("-", " ")}`, "Open the conversation and make the next step clear.", "/portal/agency/inbox", "Support", request.type === "support-ticket" ? "urgent" : "high", request.submittedAt, client.id));
    }
  }

  const team = listUsersForAgency(session.agencyId)
    .filter(user => AGENCY_ROLES.includes(user.role))
    .map(user => ({ id: user.id, name: user.name, email: user.email }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const planning = dashboardPlanningSnapshot(session.agencyId, session.userId);
  calendarEvents.push(...planning.weekPlans.filter(plan => plan.focus?.trim()).map(plan => signal(
    `plan:${plan.id}`,
    plan.focus!,
    `${plan.plannedHours || 0} planned hour${plan.plannedHours === 1 ? "" : "s"} · Daily outcome`,
    "/portal/agency",
    "Day plan",
    "normal",
    new Date(`${plan.date}T12:00:00`).getTime(),
  )));

  const commandRecommendations = buildBusinessRecommendedActions({
    radar: businessRadar,
    alerts: operationalAlerts,
    existingTaskTitles: initialTasks.filter(task => task.status !== "done").map(task => task.title),
    now,
    limit: 5,
  }).filter(recommendation => !acceptedSourceIds.has(recommendation.id));

  // ── Needs-attention alerts as first-class actions ──────────────────────
  //
  // These already reached this page, but only through
  // buildBusinessRecommendedActions, which drops every `notice` alert and caps
  // the result at five. That silently hid the bulk of the inbox from Actions —
  // including the classify-enquiry and company-membership questions, which are
  // `notice` by design and so could never appear.
  //
  // They enter the same queue as every other generated action, so they are
  // still approval-gated rather than becoming committed tasks on sight, and
  // they keep the resolution context already stamped on their href.
  const recommendedAlertIds = new Set(
    commandRecommendations.flatMap(recommendation => recommendation.sourceAlertIds ?? []),
  );
  for (const alert of operationalAlerts) {
    // Skip anything already surfaced as a recommendation or already accepted
    // as a task — the same job must not appear twice in one queue.
    if (recommendedAlertIds.has(alert.id)) continue;
    if (acceptedSourceIds.has(`attention:${alert.id}`)) continue;
    actions.push({
      ...signal(
        `attention:${alert.id}`,
        alert.title,
        alert.detail,
        alert.href,
        "Needs attention",
        alert.severity === "critical" ? "urgent" : alert.severity === "warning" ? "high" : "normal",
        alert.occurredAt,
        alert.clientId,
      ),
      origin: "inbox",
      // Carried from the alert rather than re-derived: the check already said
      // what kind of job this is.
      resolutionKind: alert.kind,
      deferrals: alert.deferrals,
      firstDeferredAt: alert.firstDeferredAt,
      // Evidence lands on the record itself. The trailing segment of an alert
      // id is the record that tripped it (`task:task_abc`,
      // `invoice:cli_1:INV-9`), so annotated rows get an exact hit and pages
      // without annotation fall back to the focus section rather than
      // breaking.
      evidenceHref: withResolutionContext(alert.href, {
        alertId: alert.id,
        focus: inferResolutionFocus(alert.id),
        record: alert.id.split(":").pop(),
      }),
    });
  }

  return <LazyActionsWorkspace
    initialTasks={initialTasks}
    initialExternalProposals={listExternalAssistantActionProposals(session.agencyId)}
    generatedActions={actions.filter(action => !acceptedSourceIds.has(action.id)).sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER))}
    commandRecommendations={commandRecommendations}
    recommendationsGeneratedAt={businessRadar.generatedAt}
    advisorConfigured={isAssistantConfigured(session.agencyId)}
    team={team}
    clients={clients.map(client => ({ id: client.id, name: client.name, status: client.status, stage: client.stage }))}
    sops={listSops(session.agencyId)}
    calendarEvents={calendarEvents}
    initialCalendarEntries={listCommandCalendarEntries(session.agencyId, session.userId)}
    initialCalendarIntegration={calendarIntegration}
    taskCustomFields={getPortalFormFields(session.agencyId, "tasks")}
    initialView={initialView}
    heading={heading}
    description={description}
  />;
}

function signal(id: string, title: string, detail: string, href: string, kind: string, priority: GeneratedAction["priority"], dueAt?: number, clientId?: string): GeneratedAction {
  return { id, title, detail, href, kind, priority, dueAt, clientId };
}

function priorityRank(priority: GeneratedAction["priority"]) {
  return priority === "urgent" ? 0 : priority === "high" ? 1 : 2;
}

function isGoogleMeetUrl(value?: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "meet.google.com" && url.pathname.length > 1;
  } catch {
    return false;
  }
}
