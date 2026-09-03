import { ensureLeadsPipelineFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/leadsPipelineFoundation";
import { buildBusinessRecommendedActions } from "@/lib/intelligence/businessRecommendedActions";
import { getCachedBusinessIssueRadar } from "@/engines/data/server/radar/businessIssueRadar";
import { listExternalAssistantActionProposals } from "@/lib/server/assistants/externalAssistantProposals";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { AuthError } from "@/lib/server/auth/auth";
import { isAssistantConfigured } from "@/lib/server/assistants/openaiAssistant";
import { listOperationalAlerts } from "@/lib/server/inbox/operationalAlerts";
import { listOperationalAlertViews } from "@/lib/server/inbox/operationalAlertPreferences";
import { filterOperationalAlertsForActor } from "@/lib/server/access/operationalAlertAccess";
import { withResolutionContext } from "@/lib/inbox/resolutionContext";
import { inferResolutionFocus } from "@/lib/inbox/resolutionFocus";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";
import { dashboardPlanningSnapshot } from "@/server/dashboardPlanning";
import { listVisibleCommandCalendarEntries as listCommandCalendarEntries } from "@/server/commandCalendar";
import { getCommandCalendarIntegrationSnapshot } from "@/lib/server/integrations/googleCalendar";
import { listSops } from "@/engines/sop/server/sops";
import { listAgencyTasks } from "@/server/tasks";
import { listClients } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";
import { listUsersForAgency } from "@/server/users";
import { containerFor } from "@aqua/plugin-leads-pipeline/server";
import { getPortalFormFields } from "@/server/portalEditor";
import { alertOccurrenceKey } from "@/lib/client/actionsMutationTruth";
import {
  currentWorkspaceElementAccess,
  resolveActorWorkspaceElementAccess,
  workspaceElementAtLeast,
  workspaceElementLevel,
} from "@/lib/server/access/workspaceElementAccess";
import { canReadClientAssociation } from "@/lib/server/access/clientAssociationElement";
import { resolvePersonalCommandAccessForActor, resolvePersonalRadarAccessForActor } from "@/lib/server/intelligence/personalRadarAccess";
import { resolveActorAccess } from "@/server/accessControl";
import { externalProposalVisibleToActor } from "@/lib/server/access/externalProposalAccess";
import {
  clientWorkspaceElementAtLeast,
  clientWorkspaceElementLevel,
  resolveActorClientWorkspaceElementAccess,
} from "@/lib/server/access/clientWorkspaceElementAccess";

import type { ActionsView, GeneratedAction } from "./_ActionsWorkspace";
import { LazyActionsWorkspace } from "./_LazyActionsWorkspace";

const WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Everything the Actions surface is made of, gathered once.
 *
 * Extracted from the component on 2026-08-30 so the Master Inbox can COUNT
 * this queue without rendering it twice. Ed: *"needs you notifications is
 * wrong it says 0 but theres actions in there — its meant to combine the
 * actions + others things into one."* The badge was `attentionAlerts.length`
 * alone, because the actions lived in an opaque server slot the client could
 * not see into. The inbox page now assembles once, hands the data to the slot
 * AND the count to the tab.
 */
export async function assembleAgencyActions() {
  const { actor, access: staffAccess } = await currentWorkspaceElementAccess("staff");
  const session = actor.session;
  if (!AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "unauthorized");
  const now = Date.now();
  const agencyId = actor.resourceAgencyId;
  const actionLevel = workspaceElementLevel(staffAccess, "workspace.actions");
  const actionsAvailable = workspaceElementAtLeast(actionLevel, "view");
  const actionsWritable = workspaceElementAtLeast(actionLevel, "use");
  const { goalsAvailable: calendarAvailable, goalsWritable: calendarWritable } = await resolvePersonalRadarAccessForActor(actor);
  const personalCommandAvailable = (await resolvePersonalCommandAccessForActor(actor)).available;
  const calendarIntegration = calendarAvailable
    ? getCommandCalendarIntegrationSnapshot(agencyId, session.userId)
    : { configured: false, connections: [], sources: [], events: [], generatedAt: now };
  if (!actionsAvailable) {
    return {
      agencyId,
      session,
      clients: [],
      initialTasks: [],
      calendarIntegration,
      businessRadar: null,
      generatedActions: [],
      commandRecommendations: [],
      externalProposals: [],
      calendarEvents: [],
      team: [],
      openActionCount: 0,
      actionsAvailable,
      actionsWritable,
      calendarAvailable,
      calendarWritable,
      sops: [],
      taskCustomFields: [],
    };
  }

  const canReadClient = (clientId?: string) => session.role === "agency-owner"
    || canReadClientAssociation(actor, "agency-task", clientId);
  const clients = listClients(agencyId).filter(client => canReadClient(client.id));
  const initialTasks = listAgencyTasks(agencyId)
    .filter(task => session.role !== "agency-staff" || task.assigneeUserId === session.userId || task.createdBy === session.userId)
    .filter(task => canReadClient(task.clientId));
  const acceptedSourceIds = new Set(initialTasks.filter(task => task.status !== "done").map(task => task.sourceId).filter((id): id is string => Boolean(id)));
  const agencyAccess = resolveActorAccess(actor, { kind: "agency", id: agencyId });
  const businessOverviewAvailable = await import("@/lib/server/intelligence/personalRadarAccess")
    .then(({ resolveBusinessRadarAccessForActor }) => resolveBusinessRadarAccessForActor(actor));
  const inboxAvailable = workspaceElementAtLeast(workspaceElementLevel(staffAccess, "workspace.inbox"), "view");
  const financeAvailable = agencyAccess.ownerBaseline
    || agencyAccess.capabilities.includes("element.client.commercial.view");
  const businessRadar = businessOverviewAvailable
    ? await getCachedBusinessIssueRadar(agencyId)
    : null;
  const liveAlerts = businessOverviewAvailable && inboxAvailable
    ? await listOperationalAlerts(agencyId, now)
    : [];
  // Read through the same preferences Master Inbox uses, rather than the raw
  // list. On the raw list, parking or dismissing an item here held only until
  // the next refresh — the alert came straight back, while the inbox had it
  // hidden. Two views of one queue disagreeing is worse than either alone.
  // This also carries the deferral count, so work put off repeatedly says so.
  const operationalAlerts = listOperationalAlertViews(
    agencyId,
    session.userId,
    filterOperationalAlertsForActor(actor, liveAlerts),
    now,
  )
    .filter(alert => alert.state !== "parked")
    .filter(alert => canReadClient(alert.clientId));
  const actions: GeneratedAction[] = [];
  const calendarEvents: GeneratedAction[] = [];
  const growthAccess = resolveActorWorkspaceElementAccess(actor, "growth");
  const leadsAvailable = workspaceElementAtLeast(workspaceElementLevel(growthAccess, "growth.leads"), "view");
  const leadsInstall = leadsAvailable ? getInstall({ agencyId }, "leads-pipeline") : null;

  if (leadsInstall?.enabled) {
    ensureLeadsPipelineFoundationRegistered();
    const { leads, commercial } = containerFor({
      agencyId,
      storage: makePluginStorage(leadsInstall.id) as never,
    });
    const leadRows = await leads.list();
    const commercialPacks = financeAvailable
      ? (await Promise.all(leadRows.map(lead => commercial.get("lead", lead.id)))).filter(pack => pack !== null)
      : [];
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
    const clientAccess = resolveActorClientWorkspaceElementAccess(actor, client.id);
    const communicationsAvailable = clientWorkspaceElementAtLeast(clientWorkspaceElementLevel(clientAccess, "client.communications"), "view");
    const relationshipAvailable = clientWorkspaceElementAtLeast(clientWorkspaceElementLevel(clientAccess, "client.relationship"), "view");
    const systemsAvailable = clientWorkspaceElementAtLeast(clientWorkspaceElementLevel(clientAccess, "client.systems"), "view");
    const lastContactedAt = Number(client.metadata?.lastContactedAt ?? 0);
    if (communicationsAvailable && (!lastContactedAt || now - lastContactedAt > WEEK)) actions.push(signal(`${client.id}:contact`, `Check in with ${client.name}`, lastContactedAt ? "No client contact has been recorded for seven days." : "No client contact has been recorded yet.", `/portal/clients/${client.id}`, "Client", "high", lastContactedAt ? lastContactedAt + WEEK : client.createdAt, client.id));
    if (relationshipAvailable && (client.stage === "onboarding" || client.stage === "aqua-epic-intro")) actions.push(signal(`${client.id}:onboarding`, `Continue ${client.name}'s onboarding`, "Collect the remaining information, access, content, or decisions.", `/portal/clients/${client.id}?tab=relationship`, "Journey", "normal", undefined, client.id));
    if (communicationsAvailable && !client.ownerEmail) actions.push(signal(`${client.id}:email`, `Add ${client.name}'s account email`, "The client record is missing its main contact email.", `/portal/clients/${client.id}`, "Client", "high", undefined, client.id));
    if (systemsAvailable && (client.stage === "live" || client.stage === "aqua-mastery") && !client.websiteUrl) actions.push(signal(`${client.id}:live-link`, `Connect ${client.name}'s live website`, "Production is marked live but no website is linked.", `/portal/clients/${client.id}?tab=systems&systemView=properties`, "Development", "high", undefined, client.id));
    const requests = Array.isArray(client.metadata?.clientRequests) ? client.metadata.clientRequests as Array<{ id: string; type: string; status: string; submittedAt: number }> : [];
    for (const request of communicationsAvailable && inboxAvailable ? requests.filter(request => request.status === "open") : []) {
      actions.push(signal(`request:${client.id}:${request.id}`, `Respond to ${client.name}'s ${request.type.replaceAll("-", " ")}`, "Open the conversation and make the next step clear.", "/portal/agency/inbox", "Support", request.type === "support-ticket" ? "urgent" : "high", request.submittedAt, client.id));
    }
  }

  const canViewTeam = workspaceElementAtLeast(workspaceElementLevel(staffAccess, "staff.people"), "view");
  const team = listUsersForAgency(agencyId)
    .filter(user => AGENCY_ROLES.includes(user.role))
    .filter(user => canViewTeam || user.id === session.userId)
    .map(user => ({ id: user.id, name: user.name, email: user.email }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (calendarAvailable && personalCommandAvailable) {
    const planning = dashboardPlanningSnapshot(agencyId, session.userId);
    calendarEvents.push(...planning.weekPlans.filter(plan => plan.focus?.trim()).map(plan => signal(
      `plan:${plan.id}`,
      plan.focus!,
      `${plan.plannedHours || 0} planned hour${plan.plannedHours === 1 ? "" : "s"} · Daily outcome`,
      "/portal/agency",
      "Day plan",
      "normal",
      new Date(`${plan.date}T12:00:00`).getTime(),
    )));
  }

  const commandRecommendations = businessRadar ? buildBusinessRecommendedActions({
    radar: businessRadar,
    alerts: operationalAlerts,
    existingTaskTitles: initialTasks.filter(task => task.status !== "done").map(task => task.title),
    now,
    limit: 5,
  }).filter(recommendation => !acceptedSourceIds.has(recommendation.id)) : [];

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
      causalVersion: alert.causalVersion,
      alertOccurrenceKey: alertOccurrenceKey(alert),
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

  const externalProposals = businessOverviewAvailable
    ? listExternalAssistantActionProposals(agencyId).filter(externalProposalVisibleToActor(actor))
    : [];
  const generatedActions = actions
    .filter(action => !acceptedSourceIds.has(action.id))
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER));

  // What the "Needs you" badge owes: every open item in this queue that the
  // inbox's own alert count does NOT already cover. The `attention:` entries
  // are those same alerts re-entering as actions, so counting them here would
  // double-count each alert once per surface.
  const openActionCount =
    generatedActions.filter(action => !action.id.startsWith("attention:")).length
    + initialTasks.filter(task => task.status !== "done").length
    + commandRecommendations.length
    + externalProposals.length;

  const fulfilmentAccess = resolveActorWorkspaceElementAccess(actor, "fulfilment");
  const sops = workspaceElementAtLeast(workspaceElementLevel(fulfilmentAccess, "fulfilment.services"), "view")
    ? listSops(agencyId)
    : [];
  const taskCustomFields = getPortalFormFields(agencyId, "tasks");

  return {
    agencyId, session, clients, initialTasks, calendarIntegration, businessRadar,
    generatedActions, commandRecommendations, externalProposals,
    calendarEvents, team, openActionCount, actionsAvailable, actionsWritable,
    calendarAvailable, calendarWritable, sops, taskCustomFields,
  };
}

export async function AgencyActionsPage({
  initialView = "list",
  heading = "Actions",
  description,
  prepared,
}: {
  initialView?: ActionsView;
  heading?: string;
  description?: string;
  /**
   * Pass the result of `assembleAgencyActions()` to reuse one assembly for
   * both the slot and the badge. Standalone mounts (the Calendar page) omit it
   * and assemble here.
   */
  prepared?: Awaited<ReturnType<typeof assembleAgencyActions>>;
}) {
  const data = prepared ?? await assembleAgencyActions();
  const { session, clients } = data;
  if (initialView === "list" && !data.actionsAvailable) {
    return <UnavailableSlice title="Actions are hidden by your workspace role" detail="Request Actions access to see or work this queue." />;
  }
  if (initialView === "calendar" && !data.calendarAvailable) {
    return <UnavailableSlice title="Calendar is hidden by your workspace role" detail="Request Calendar access to see personal goals and dated work." />;
  }
  if (initialView === "list" && !data.actionsWritable) {
    return <ReadOnlyActions
      heading={heading}
      description={description}
      tasks={data.initialTasks}
      generated={data.generatedActions}
      calendarAvailable={data.calendarAvailable}
    />;
  }
  return <LazyActionsWorkspace
    initialTasks={data.initialTasks}
    initialExternalProposals={data.externalProposals}
    generatedActions={data.generatedActions}
    commandRecommendations={data.commandRecommendations}
    recommendationsGeneratedAt={data.businessRadar?.generatedAt ?? Date.now()}
    advisorConfigured={isAssistantConfigured(data.agencyId)}
    team={data.team}
    clients={clients.map(client => ({ id: client.id, name: client.name, status: client.status, stage: client.stage }))}
    sops={data.sops}
    calendarEvents={data.calendarEvents}
    initialCalendarEntries={data.calendarAvailable ? listCommandCalendarEntries(data.agencyId, session.userId) : []}
    currentUserId={session.userId}
    initialCalendarIntegration={data.calendarIntegration}
    actionsAvailable={data.actionsAvailable}
    actionsWritable={data.actionsWritable}
    calendarAvailable={data.calendarAvailable}
    calendarWritable={data.calendarWritable}
    taskCustomFields={data.taskCustomFields}
    initialView={initialView}
    heading={heading}
    description={description}
  />;
}

function UnavailableSlice({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="mx-auto w-full max-w-3xl rounded-xl border border-black/10 bg-white p-6 text-center shadow-sm">
      <LockKeyhole className="mx-auto text-black/30" size={24} aria-hidden="true" />
      <h1 className="mt-3 text-lg font-semibold text-black/80">{title}</h1>
      <p className="mt-1 text-sm text-black/50">{detail}</p>
      <Link href="/portal/account/permissions" className="mt-4 inline-flex min-h-10 items-center rounded-md bg-black px-4 text-xs font-semibold text-white">Request access</Link>
    </section>
  );
}

function ReadOnlyActions({
  heading,
  description,
  tasks,
  generated,
  calendarAvailable,
}: {
  heading: string;
  description?: string;
  tasks: Awaited<ReturnType<typeof assembleAgencyActions>>["initialTasks"];
  generated: GeneratedAction[];
  calendarAvailable: boolean;
}) {
  const rows = [
    ...tasks.filter(task => task.status !== "done").map(task => ({
      id: `task:${task.id}`,
      title: task.title,
      detail: task.dueAt ? `Due ${new Date(task.dueAt).toLocaleDateString("en-GB")}` : "Accepted action",
      href: task.sourceHref,
    })),
    ...generated.map(action => ({ id: `generated:${action.id}`, title: action.title, detail: action.detail, href: action.href })),
  ];
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Read only</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-black/90">{heading}</h1>
          <p className="mt-2 text-sm text-black/50">{description ?? "Everything that needs to happen, who owns it, and when it is due."}</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/50"><LockKeyhole size={13} aria-hidden="true" /> View access</span>
      </header>
      <section className="overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.07] px-4 py-3">
          <div><h2 className="text-sm font-semibold text-black/78">Visible actions</h2><p className="mt-0.5 text-xs text-black/45">Editing is hidden until your role has Use access.</p></div>
          <span className="flex gap-3 text-xs font-semibold text-black/45">
            <Link href="/portal/account/permissions" className="hover:text-black">Request use access</Link>
            {calendarAvailable ? <Link href="/portal/agency/calendar" className="hover:text-black">View calendar</Link> : null}
          </span>
        </header>
        {rows.length ? <ul className="divide-y divide-black/[0.07]">{rows.map(row => <li key={row.id} className="px-4 py-3"><strong className="block text-sm text-black/75">{row.title}</strong><span className="mt-1 block text-xs text-black/45">{row.detail}</span>{row.href ? <Link href={row.href} className="mt-1 inline-flex min-h-7 items-center text-xs font-semibold text-brand">Open source</Link> : null}</li>)}</ul> : <p className="px-5 py-10 text-center text-sm text-black/45">No open actions are visible.</p>}
      </section>
    </div>
  );
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
