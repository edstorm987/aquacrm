import "server-only";
import { cache } from "react";

import { getInstall } from "@/server/pluginInstalls";
import { getRequestNow } from "@/lib/server/requestNow";
import { listClients } from "@/server/tenants";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { ensureLeadsPipelineFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/leadsPipelineFoundation";
import { containerFor } from "@aqua/plugin-leads-pipeline/server";
import type { ClientTelemetryEvent } from "@/lib/clients/clientTelemetry";
import { clientTelemetryRiskSignals } from "@/lib/clients/clientAquaHealth";
import { listAgencyTasks } from "@/server/tasks";
import { requireCurrentAccessActor, type CurrentAccessActor } from "@/server/accessControl";
import { canReadClientAssociation } from "@/lib/server/access/clientAssociationElement";
import { ownerChatAttention } from "@/server/people";
import { getUserById } from "@/server/users";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";
import { listLegalDocuments } from "@/server/legalDocuments";
import { getState } from "@/server/storage";
import type { ClientContract } from "@/lib/clients/clientContracts";
import { getRequestWebsiteEnquiries, type WebsiteEnquiry } from "@/lib/server/websiteEnquiries";
import { isLeadJourneyEligible } from "@/lib/enquiries/enquiryClassification";
import { personDisplayName, upsertPerson } from "@/server/persons";
import { batchOrganisationSuggestions } from "@/server/organisations";
import { withResolutionContext } from "@/lib/inbox/resolutionContext";
import { withResolutionContexts } from "@/lib/inbox/resolutionFocus";
import { listExternalAssistantActionProposals } from "@/lib/server/assistants/externalAssistantProposals";
import { listAgencyCommandCalendarEntries } from "@/server/commandCalendar";
import type { OperationalAlert, OperationalAlertSeverity } from "@/lib/intelligence/operationalAttention";
import { cleanClientMarketingService } from "@/lib/clients/clientMarketingService";
import { formatUkDate } from "@/lib/shared/formatDateTime";
import { cleanClientPaymentPlans } from "@/lib/clients/clientPaymentPlans";
import { clientWorkspaceDisplayName } from "@/lib/clients/clientWorkspace";
import { readOrUnavailable, type ReadResult } from "@/lib/readAvailability";
import { observeOperationalAlertSourceAvailability } from "@/lib/server/inbox/operationalAlertSourceEpisodes";

export type { OperationalAlert, OperationalAlertSeverity } from "@/lib/intelligence/operationalAttention";

const DAY = 24 * 60 * 60 * 1000;

export const OPERATIONAL_ALERT_THRESHOLDS = {
  clientContactDays: 14,
  contractAcceptanceDays: 7,
  recurringExpenseLookaheadDays: 7,
  staleMonitoringDays: 2,
  telemetryErrorWindowHours: 24,
} as const;

// Request-deduped operational alerts. The agency layout (sidebar attention) and
// the agency page both compute this same heavy per-render list; wrapping in
// React cache() (keyed on agencyId, using the shared request `now`) collapses
// them to ONE computation — and one run of its idempotent read-path side
// effects (person upserts) — per render. The raw function below is unchanged,
// so API routes, tests and any non-render caller keep the exact same behaviour.
export const getRequestOperationalAlerts = cache(
  (agencyId: string): Promise<OperationalAlert[]> => listOperationalAlerts(agencyId, getRequestNow()),
);

export interface OperationalAlertReadOptions {
  /** A caller may supply one already-confirmed source read to avoid re-reading it. */
  websiteEnquiries?: ReadResult<WebsiteEnquiry[]>;
}

interface OperationalAlertsCacheEntry { alerts: OperationalAlert[]; at: number }
const operationalAlertsCache = new Map<string, OperationalAlertsCacheEntry>();
// 60s: the sweep itself takes several seconds, so a short TTL never survives the
// gap between two navigations and the cache never hits. 60s keeps a navigation
// instant while operational alerts (informational, not real-time) stay fresh
// enough; `invalidateOperationalAlertsCache` forces an immediate refresh when a
// mutation must reflect at once.
const OPERATIONAL_ALERTS_TTL_MS = 60_000;

/** Warm the cache in the background (fire-and-forget) so the next page that
 *  needs the sweep hits a ready snapshot instead of computing it inline. Safe to
 *  call on a fast page's render; it no-ops fast when the cache is already warm. */
export function prewarmOperationalAlerts(agencyId: string): void {
  if (process.env.NODE_ENV !== "production") return;
  const hit = operationalAlertsCache.get(agencyId);
  if (hit && Date.now() - hit.at < OPERATIONAL_ALERTS_TTL_MS) return;
  void listOperationalAlerts(agencyId).catch(() => undefined);
}

/** Drop the cached operational-alert snapshot for an agency (call after a
 *  mutation that should reflect immediately, e.g. resolving/parking an alert). */
export function invalidateOperationalAlertsCache(agencyId: string): void {
  operationalAlertsCache.delete(agencyId);
}

export async function listOperationalAlerts(
  agencyId: string,
  now = Date.now(),
  readOptions: OperationalAlertReadOptions = {},
): Promise<OperationalAlert[]> {
  // Module-level TTL cache. This sweep — a portfolio scan plus live Supabase
  // reads and per-source availability observations — is reached UNGATED from
  // many pages (clients, client detail, inbox, actions), and re-running it on
  // every navigation made those pages take ~7s. On the single persistent
  // instance we serve a snapshot at most OPERATIONAL_ALERTS_TTL_MS old, so a
  // navigation is instant; the uncached run (once per window) still records the
  // source observations. Bypassed when a caller injects a source read, since the
  // result then depends on inputs this key does not capture.
  // Production only — dev/test always compute a fresh sweep so tests can't flake
  // on a stale cached snapshot and local iteration always sees live data.
  const canCache = readOptions.websiteEnquiries === undefined && process.env.NODE_ENV === "production";
  if (canCache) {
    const hit = operationalAlertsCache.get(agencyId);
    if (hit && now - hit.at < OPERATIONAL_ALERTS_TTL_MS) return hit.alerts;
  }
  // Phase timing — this sweep dominates the first sweep-needing render per cache
  // window (~5s uncached on the live blob), and the cost is a moving target as
  // the portfolio and its Supabase reads grow. Record the awaited phases and log
  // a breakdown only when the whole sweep runs slow (production), so a regression
  // is visible in the logs instead of felt as a slow page. Cheap: three
  // performance.now() reads and one conditional log.
  const _sweepStart = performance.now();
  const _phase: Record<string, number> = {};
  const _time = async <T>(label: string, work: () => Promise<T>): Promise<T> => {
    const at = performance.now();
    try { return await work(); } finally { _phase[label] = Math.round(performance.now() - at); }
  };
  const clients = listClients(agencyId);
  const alerts: OperationalAlert[] = [];
  const workspaceSettings = getAgencyWorkspaceSettings(agencyId);
  const notificationSettings = workspaceSettings.notifications;
  const state = getState();
  const peopleApplications = Object.values(state.peopleApplications).filter(application => application.agencyId === agencyId);
  const peopleEmployees = Object.values(state.peopleEmployees).filter(employee => employee.agencyId === agencyId && employee.status !== "alumni");
  const peopleLeave = Object.values(state.peopleLeaveRequests).filter(request => request.agencyId === agencyId);
  const peopleTraining = Object.values(state.peopleTrainingAssignments).filter(training => training.agencyId === agencyId);
  const staleApplications = peopleApplications.filter(application => !["declined", "withdrawn", "onboarding"].includes(application.stage) && now - application.updatedAt > 7 * DAY);
  if (staleApplications.length) alerts.push({ id: "people:application-backlog", severity: staleApplications.length >= 4 ? "critical" : "warning", category: "task", title: `${staleApplications.length} candidate application${staleApplications.length === 1 ? " needs" : "s need"} review`, detail: "These applications have no retained update for more than seven days.", href: "/portal/agency/people?view=candidates", occurredAt: Math.min(...staleApplications.map(application => application.updatedAt)) });
  const pendingLeave = peopleLeave.filter(request => request.status === "pending" && now - request.createdAt > 2 * DAY);
  if (pendingLeave.length) alerts.push({ id: "people:leave-decisions", severity: "warning", category: "task", title: `${pendingLeave.length} leave request${pendingLeave.length === 1 ? " is" : "s are"} waiting`, detail: "A retained approve or reject decision is due.", href: "/portal/agency/people?view=time", occurredAt: Math.min(...pendingLeave.map(request => request.createdAt)) });
  const overdueTraining = peopleTraining.filter(training => training.status !== "completed" && Boolean(training.dueAt && training.dueAt < now));
  if (overdueTraining.length) alerts.push({ id: "people:training-overdue", severity: overdueTraining.length >= 4 ? "critical" : "warning", category: "task", title: `${overdueTraining.length} training assignment${overdueTraining.length === 1 ? " is" : "s are"} overdue`, detail: "Review the assigned employee, due date and completion evidence.", href: "/portal/agency/people?view=development", occurredAt: Math.min(...overdueTraining.map(training => training.dueAt ?? now)) });
  const incompleteTerms = peopleEmployees.filter(employee => !employee.title || !employee.startDate || employee.weeklyHours === undefined || !employee.payBasis || !employee.currency);
  if (incompleteTerms.length) alerts.push({ id: "people:employment-terms", severity: "notice", category: "task", title: `${incompleteTerms.length} People record${incompleteTerms.length === 1 ? " needs" : "s need"} complete terms`, detail: "Retain title, start date, hours, pay basis and currency before relying on capacity or payroll calculations.", href: "/portal/agency/people?view=team", occurredAt: Math.min(...incompleteTerms.map(employee => employee.updatedAt)) });
  const chat = ownerChatAttention(agencyId);
  if (chat) {
    const parts = [
      chat.directCount ? `${chat.directCount} direct message${chat.directCount === 1 ? "" : "s"}` : "",
      chat.mentionCount ? `${chat.mentionCount} mention${chat.mentionCount === 1 ? "" : "s"}` : "",
    ].filter(Boolean).join(" and ");
    alerts.push({ id: "people:chat-attention", kind: "in-app", clearsWhen: "You open Team chat and read the messages waiting for you.", severity: "notice", category: "task", title: `${chat.total} team chat message${chat.total === 1 ? "" : "s"} waiting for you`, detail: `${parts} in Team chat you haven't opened yet.`, href: "/portal/agency/people?view=chat", occurredAt: chat.latestAt });
  }

  for (const document of notificationSettings.complianceAlerts ? listLegalDocuments(agencyId) : []) {
    if (document.status === "archived") continue;
    const href = "/portal/agency/company?view=legal";
    if (document.expiresAt && document.expiresAt < now) {
      alerts.push({
        id: `compliance-expired:${document.id}`,
        severity: "critical",
        category: "compliance",
        title: `${document.title} has expired`,
        detail: `${document.category === "insurance" ? "Insurance cover" : "This legal record"} expired ${formatRelativeDate(document.expiresAt, now)}.`,
        href,
        occurredAt: document.expiresAt,
      });
    } else if (document.reminderAt && document.reminderAt <= now) {
      alerts.push({
        id: `compliance-reminder:${document.id}`,
        severity: document.status === "action-required" ? "critical" : "warning",
        category: "compliance",
        title: `Compliance reminder: ${document.title}`,
        detail: document.expiresAt ? `Review before ${formatUkDate(document.expiresAt, { day: "numeric", month: "short", year: "numeric" })}.` : "This document needs review or action.",
        href,
        occurredAt: document.reminderAt,
      });
    } else if (document.expiresAt && document.expiresAt <= now + 30 * DAY) {
      alerts.push({
        id: `compliance-due:${document.id}`,
        severity: "notice",
        category: "compliance",
        title: `${document.title} is due soon`,
        detail: `Expires or becomes due on ${formatUkDate(document.expiresAt, { day: "numeric", month: "short", year: "numeric" })}.`,
        href,
        occurredAt: document.expiresAt,
      });
    } else if (document.status === "action-required") {
      alerts.push({
        id: `compliance-action:${document.id}`,
        severity: "warning",
        category: "compliance",
        title: `Action required: ${document.title}`,
        detail: document.notes || "Open the legal register to review this record.",
        href,
        occurredAt: document.updatedAt,
      });
    }
  }

  // An Action that NAMES a client is only readable by someone who may see that
  // client — the rule `GET /portal/tasks` and `intelligence/my-radar` already
  // apply. This feed did not, and it puts the task's TITLE in the alert
  // ("Overdue task: <title>"), so every agency role saw the titles of every
  // client's actions regardless of their client access. Filtering here rather
  // than at each caller means the notifications, search, client-layout and
  // clients-page readers all inherit it.
  //
  // The actor is resolved ONCE, outside the loop: `canReadClientAssociation` is
  // pure over a resolved actor. When no actor can be resolved (a background or
  // system caller with no session) the client-named tasks are DROPPED rather
  // than included — an alert feed that cannot check permission must not guess
  // in the permissive direction.
  //
  // Resolved LAZILY, and only when a client-named action actually exists.
  // `requireCurrentAccessActor()` forces `ensureHydrated({ fresh: true })`, and
  // six render paths reach this function — including two layouts — so calling
  // it unconditionally put a forced fresh backend read into every one of the
  // 301 pages the production build prerenders. That is a build-time cost with
  // no runtime benefit whenever nothing needs filtering, which is the common
  // case.
  const openTasks = notificationSettings.overdueTasks
    ? listAgencyTasks(agencyId).filter(task => task.status !== "done")
    : [];
  let taskActor: CurrentAccessActor | null = null;
  if (openTasks.some(task => task.clientId)) {
    taskActor = await _time("actor", () => requireCurrentAccessActor().catch(() => null));
  }
  for (const task of openTasks) {
    if (task.clientId && !(taskActor && canReadClientAssociation(taskActor, "agency-task", task.clientId))) continue;
    const owner = task.assigneeUserId ? getUserById(task.assigneeUserId)?.name : undefined;
    const baseAlert = {
      id: `task:${task.id}`,
      category: "task" as const,
      href: `/portal/agency/actions#task-${encodeURIComponent(task.id)}`,
      persistentUntilResolved: true,
    };
    if (task.dueAt && task.dueAt < now) {
      alerts.push({
        ...baseAlert,
        severity: task.priority === "urgent" ? "critical" : "warning",
        title: `Overdue task: ${task.title}`,
        detail: `${owner ? `${owner} owns this task. ` : "This task is unassigned. "}It was due ${formatRelativeDate(task.dueAt, now)}.`,
        occurredAt: task.dueAt,
      });
    } else if (task.reminderAt && task.reminderAt <= now) {
      alerts.push({
        ...baseAlert,
        severity: task.priority === "urgent" ? "critical" : "notice",
        title: `Task reminder: ${task.title}`,
        detail: owner ? `${owner} owns this task.` : "This task is unassigned.",
        occurredAt: task.reminderAt,
      });
    } else {
      alerts.push({
        ...baseAlert,
        severity: task.priority === "urgent" ? "warning" : "notice",
        title: `Open action: ${task.title}`,
        detail: `${owner ? `${owner} owns this action.` : "This action is unassigned. "}${task.dueAt ? `Due ${formatUkDate(task.dueAt, { day: "numeric", month: "short", year: "numeric" })}.` : "No deadline is recorded."}`,
        occurredAt: task.updatedAt,
      });
    }
  }

  for (const entry of notificationSettings.overdueTasks ? listAgencyCommandCalendarEntries(agencyId) : []) {
    if (entry.status !== "planned") continue;
    const alertAt = entry.reminderAt ?? (["reminder", "goal", "target"].includes(entry.type) ? entry.startsAt : undefined);
    if (!alertAt || alertAt > now) continue;
    const targetMissed = (entry.type === "goal" || entry.type === "target")
      && entry.targetValue !== undefined
      && (entry.currentValue ?? 0) < entry.targetValue
      && entry.startsAt <= now;
    alerts.push({
      id: `calendar-reminder:${entry.id}`,
      severity: targetMissed ? "warning" : "notice",
      category: "task",
      title: `${targetMissed ? "Target review" : "Calendar reminder"}: ${entry.title}`,
      detail: entry.notes || calendarAlertDetail(entry.type, entry.startsAt, entry.endsAt),
      href: "/portal/agency?station=calendar",
      occurredAt: alertAt,
    });
  }

  for (const client of clients) {
    const clientLabel = clientWorkspaceDisplayName(client);
    const metadata = client.metadata as {
      lastContactedAt?: number;
      clientRequests?: Array<{
        id: string;
        type: string;
        message: string;
        status: string;
        submittedAt: number;
        replies?: unknown[];
        siteLabel?: string;
        priority?: "urgent" | "high" | "normal";
        topic?: string;
      }>;
      telemetryEvents?: ClientTelemetryEvent[];
      telemetryLastSeenAt?: number;
      commercialPack?: { invoiceNumber?: string; invoiceStatus?: string; dueAt?: number; totalCents?: number; payments?: Array<{ amountCents: number }> };
      contracts?: ClientContract[];
      portalBuiltAt?: number;
      portalAccessPreparedAt?: number;
      portalAccessSentAt?: number;
      clientMarketingService?: unknown;
      clientPaymentPlans?: unknown;
    } | undefined;

    if (notificationSettings.marketingAlerts && metadata?.clientMarketingService) {
      const marketing = cleanClientMarketingService(metadata.clientMarketingService);
      if (marketing.enabled) {
        const marketingHref = `/portal/clients/${encodeURIComponent(client.id)}?tab=marketing`;
        const pending = marketing.content.filter(item => item.approval === "pending").length
          + marketing.campaigns.filter(item => item.approval === "pending").length;
        if (pending > 0) alerts.push({
          id: `client-marketing-approvals:${client.id}`,
          severity: "notice",
          category: "marketing",
          title: `${clientLabel} has ${pending} marketing approval${pending === 1 ? "" : "s"} waiting`,
          detail: "Open the exact content and campaign records awaiting a client decision.",
          href: marketingHref,
          clientId: client.id,
          clientName: client.name,
          occurredAt: marketing.updatedAt ?? client.updatedAt,
        });
        const attentionProfiles = marketing.profiles.filter(profile => profile.status === "attention");
        if (attentionProfiles.length) alerts.push({
          id: `client-marketing-access:${client.id}`,
          severity: "warning",
          category: "marketing",
          title: `${clientLabel} has ${attentionProfiles.length} social account access issue${attentionProfiles.length === 1 ? "" : "s"}`,
          detail: attentionProfiles.map(profile => `${profile.platform}: ${profile.handle}`).join(" · "),
          href: marketingHref,
          clientId: client.id,
          clientName: client.name,
          occurredAt: marketing.updatedAt ?? client.updatedAt,
        });
        for (const campaign of marketing.campaigns.filter(item => item.status === "active" || item.status === "scheduled")) {
          if (campaign.budgetCents > 0 && campaign.spendCents > campaign.budgetCents) alerts.push({
            id: `client-marketing-budget:${client.id}:${campaign.id}`,
            severity: "critical",
            category: "marketing",
            title: `${clientLabel}: ${campaign.name} is over budget`,
            detail: `${money(campaign.spendCents)} spent against ${money(campaign.budgetCents)} allocated.`,
            href: marketingHref,
            clientId: client.id,
            clientName: client.name,
            occurredAt: campaign.updatedAt,
          });
          else if (campaign.budgetCents > 0 && campaign.spendCents >= campaign.budgetCents * 0.5 && campaign.leads === 0) alerts.push({
            id: `client-marketing-no-leads:${client.id}:${campaign.id}`,
            severity: "warning",
            category: "marketing",
            title: `${clientLabel}: ${campaign.name} needs a performance review`,
            detail: `${money(campaign.spendCents)} spent with zero attributed leads.`,
            href: marketingHref,
            clientId: client.id,
            clientName: client.name,
            occurredAt: campaign.updatedAt,
          });
        }
      }
    }

    for (const request of notificationSettings.supportRequests ? metadata?.clientRequests ?? [] : []) {
      if (request.status !== "open") continue;
      const critical = request.priority === "urgent" || request.type === "cancel" || request.type === "move-provider";
      alerts.push({
        id: `request:${client.id}:${request.id}`,
        severity: critical ? "critical" : request.priority === "normal" ? "notice" : "warning",
        category: "support",
        title: `${requestLabel(request.type)} from ${clientLabel}`,
        detail: `${request.siteLabel ? `${request.siteLabel} · ` : ""}${request.topic ? `${request.topic} · ` : ""}${request.message}`,
        href: `/portal/agency/inbox?view=support&thread=${encodeURIComponent(request.id)}`,
        clientId: client.id,
        clientName: client.name,
        occurredAt: request.submittedAt,
      });
    }

    const recentErrors = (notificationSettings.outages ? metadata?.telemetryEvents ?? [] : []).filter(event =>
      event.type === "error" && event.occurredAt >= now - DAY
    );
    if (recentErrors.length) {
      const latest = recentErrors.sort((a, b) => b.occurredAt - a.occurredAt)[0];
      alerts.push({
        id: `outage:${client.id}:${latest.id}`,
        severity: "critical",
        category: "outage",
        title: `${clientLabel} reported ${recentErrors.length} production error${recentErrors.length === 1 ? "" : "s"}`,
        detail: latest.message || latest.path || "Open technical delivery monitoring to inspect the latest error.",
        href: `/portal/clients/${client.id}?tab=systems`,
        clientId: client.id,
        clientName: client.name,
        occurredAt: latest.occurredAt,
      });
    }

    // ── Client Health: enquiry & traffic (client-health plan, Phase 2) ──────
    // A firing enquiry/traffic factor becomes a specific, client-scoped alert
    // with a Fulfilment resolution path — never a bare count. `off-system`: you
    // act away from the screen (investigate the site, its Aqua tag, marketing)
    // and it clears when the metric returns to its own evolving baseline — no
    // in-app Resolve control is offered. Localised block — if you-deserve-it
    // later shares this file, keep it together and flag the commander.
    if (notificationSettings.clientAlerts) {
      for (const signal of clientTelemetryRiskSignals(metadata?.telemetryEvents, now)) {
        alerts.push({
          id: `client-health-${signal.id}:${client.id}`,
          severity: signal.kind === "traffic-silent" ? "critical" : "warning",
          category: "client",
          kind: "off-system",
          clearsWhen: signal.id === "enquiry"
            ? "Enquiries return to the client's evolving baseline."
            : "Traffic returns to the client's evolving baseline.",
          title: `${clientLabel}: ${signal.headline}`,
          detail: `${signal.detail} Open the client's delivery view to investigate the site and its Aqua tag.`,
          href: `/portal/clients/${client.id}?tab=systems`,
          clientId: client.id,
          clientName: client.name,
          occurredAt: typeof metadata?.telemetryLastSeenAt === "number" ? metadata.telemetryLastSeenAt : client.updatedAt,
        });
      }
    }

    const pack = metadata?.commercialPack;
    const paid = pack?.payments?.reduce((sum, payment) => sum + payment.amountCents, 0) ?? 0;
    if (notificationSettings.financeAlerts && pack?.dueAt && pack.dueAt < now && pack.invoiceStatus !== "paid" && paid < (pack.totalCents ?? 0)) {
      alerts.push({
        id: `invoice:${client.id}:${pack.invoiceNumber ?? "draft"}`,
        severity: "critical",
        category: "money",
        title: `${clientLabel} has an overdue invoice`,
        detail: `${pack.invoiceNumber ?? "Invoice"} was due ${formatRelativeDate(pack.dueAt, now)}.`,
        href: `/portal/clients/${client.id}?tab=finance`,
        clientId: client.id,
        clientName: client.name,
        occurredAt: pack.dueAt,
      });
    }

    if (notificationSettings.financeAlerts) {
      for (const plan of cleanClientPaymentPlans(metadata?.clientPaymentPlans).filter(item => item.status === "active")) {
        for (const milestone of plan.milestones.filter(item => item.status === "planned" && !item.invoiceId)) {
          const daysUntilDue = (milestone.dueAt - now) / DAY;
          if (daysUntilDue > 3) continue;
          const overdue = daysUntilDue < 0;
          alerts.push({
            id: `payment-plan:${client.id}:${plan.id}:${milestone.id}`,
            severity: overdue ? "critical" : "notice",
            category: "money",
            title: overdue
              ? `${clientLabel}: payment milestone was not invoiced`
              : `${clientLabel}: payment milestone is ready to issue`,
            detail: `${milestone.title}${milestone.productName ? ` · ${milestone.productName}` : ""} is due ${formatUkDate(milestone.dueAt, { day: "numeric", month: "short", year: "numeric" })}. Open the exact schedule to create its Finance invoice.`,
            href: `/portal/clients/${client.id}?tab=finance`,
            clientId: client.id,
            clientName: client.name,
            occurredAt: milestone.dueAt,
          });
        }
      }
    }

    for (const contract of notificationSettings.contractAlerts ? metadata?.contracts ?? [] : []) {
      const waitingSince = contract.issuedAt ?? contract.updatedAt ?? contract.createdAt;
      if (contract.status !== "sent" || now - waitingSince < OPERATIONAL_ALERT_THRESHOLDS.contractAcceptanceDays * DAY) continue;
      alerts.push({
        id: `contract-awaiting:${client.id}:${contract.id}`,
        severity: "warning",
        category: "contract",
        title: `${clientLabel} has a contract awaiting acceptance`,
        detail: `${contract.title} was sent ${formatRelativeDate(waitingSince, now)}. Follow up or record the signed agreement.`,
        href: `/portal/clients/${client.id}?tab=finance`,
        clientId: client.id,
        clientName: client.name,
        occurredAt: waitingSince,
      });
    }

    const portalReadyAt = metadata?.portalAccessPreparedAt ?? metadata?.portalBuiltAt;
    if (notificationSettings.clientAlerts && portalReadyAt && !metadata?.portalAccessSentAt && now - portalReadyAt >= workspaceSettings.portalAccessDays * DAY) {
      alerts.push({
        id: `portal-access:${client.id}`,
        severity: "notice",
        category: "client",
        title: `${clientLabel}'s portal access is ready to review`,
        detail: `Access has been prepared for ${workspaceSettings.portalAccessDays} days or more but has not been sent.`,
        href: `/portal/clients/${client.id}?tab=portal`,
        clientId: client.id,
        clientName: client.name,
        occurredAt: portalReadyAt,
      });
    }

    if (notificationSettings.clientAlerts && client.status === "active" && client.stage !== "churned" && (!metadata?.lastContactedAt || now - metadata.lastContactedAt > OPERATIONAL_ALERT_THRESHOLDS.clientContactDays * DAY)) {
      alerts.push({
        id: `contact:${client.id}`,
        severity: "warning",
        category: "client",
        title: `Check in with ${clientLabel}`,
        detail: metadata?.lastContactedAt ? `No contact has been recorded for more than ${OPERATIONAL_ALERT_THRESHOLDS.clientContactDays} days.` : "No client contact has been recorded yet.",
        href: `/portal/clients/${client.id}?tab=relationship`,
        clientId: client.id,
        clientName: client.name,
        occurredAt: metadata?.lastContactedAt ?? client.createdAt,
      });
    }
  }

  if (notificationSettings.financeAlerts) addFinanceAlerts(alerts, agencyId, now);
  if (notificationSettings.developmentAlerts) addDevelopmentAlerts(alerts, agencyId, now);

  for (const proposal of listExternalAssistantActionProposals(agencyId, ["pending"])) {
    alerts.push({
      id: `external-proposal:${proposal.id}`,
      severity: proposal.priority === "urgent" ? "critical" : proposal.priority === "high" ? "warning" : "notice",
      category: "task",
      title: `AI proposal: ${proposal.title}`,
      detail: `${proposal.assistantName} is waiting for approval. ${proposal.detail}`.slice(0, 420),
      href: `/portal/agency/actions#external-proposal-${encodeURIComponent(proposal.id)}`,
      occurredAt: proposal.submittedAt,
    });
  }

  const leadsInstall = getInstall({ agencyId }, "leads-pipeline");
  if (leadsInstall?.enabled) {
    ensureLeadsPipelineFoundationRegistered();
    const { campaigns, leads, prospects } = containerFor({ agencyId, storage: makePluginStorage(leadsInstall.id) as never });
    const [campaignRows, leadRows, prospectRows, websiteEnquiryRead] = await _time("leadsReads", () => Promise.all([
      campaigns.list(),
      leads.list(),
      prospects.list(),
      readOptions.websiteEnquiries
        ? Promise.resolve(readOptions.websiteEnquiries)
        : readOrUnavailable(
            () => _time("websiteEnquiries", () => getRequestWebsiteEnquiries(agencyId)),
            [],
            "Website enquiries could not be checked. Retry before treating the enquiry queue as clear.",
          ),
    ]));
    const websiteEnquiries = websiteEnquiryRead.data;
    const websiteEnquiryOutage = await _time("observe", () => observeOperationalAlertSourceAvailability({
      agencyId,
      sourceId: "website-enquiries",
      available: websiteEnquiryRead.available,
      observedAt: now,
    }));
    if (!websiteEnquiryRead.available && websiteEnquiryOutage.active) {
      // Keep the rest of the operational feed usable, but put the missing
      // measurement in the feed itself. An omitted source is not a zero-count
      // source and must never look like an all-clear.
      alerts.push({
        id: "source-unavailable:website-enquiries",
        severity: "warning",
        category: "client",
        title: "Website enquiries could not be checked",
        detail: websiteEnquiryRead.reason ?? "The enquiry source is temporarily unavailable. Retry before treating the queue as clear.",
        href: "/portal/agency/inbox?view=forms",
        occurredAt: websiteEnquiryOutage.startedAt ?? now,
      });
    }
    const websiteEnquiryById = new Map(websiteEnquiries.map(enquiry => [enquiry.id, enquiry]));
    const alertedEnquiryIds = new Set<string>();

    if (notificationSettings.clientAlerts) {
      for (const prospect of prospectRows.filter(item => item.status === "scouting" && !item.doNotContact && item.nextContactAt !== undefined && item.nextContactAt <= now)) {
        const label = prospect.company || prospect.name || prospect.website || "Scouting prospect";
        const overdueMs = now - (prospect.nextContactAt ?? now);
        const lastAttempt = prospect.outreachAttempts.at(-1);
        alerts.push({
          id: `prospect-follow-up:${prospect.id}`,
          severity: overdueMs >= 7 * DAY ? "critical" : overdueMs >= DAY ? "warning" : "notice",
          category: "client",
          title: `Scouting follow-up due: ${label}`,
          detail: [
            prospect.nextContactReason || "A retained recontact commitment is due.",
            prospect.preferredChannel ? `Preferred route: ${prospect.preferredChannel}.` : "",
            lastAttempt ? `Last outcome: ${lastAttempt.outcome}.` : "No previous outreach attempt is recorded.",
          ].filter(Boolean).join(" "),
          href: "/portal/agency/pipelines/leads#scouting",
          persistentUntilResolved: true,
          occurredAt: prospect.nextContactAt ?? now,
        });
      }
    }

    for (const lead of leadRows) {
      if (!isLeadJourneyEligible(lead)) continue;
      const label = lead.name || lead.company || lead.email;
      if (notificationSettings.meetingReminders && lead.meetingReminderAt && !lead.meetingReminderSentAt && lead.meetingReminderAt <= now && !["completed", "cancelled"].includes(lead.meetingStatus ?? "")) {
        alerts.push({
          id: `meeting:${lead.id}`,
          severity: "warning",
          category: "meeting",
          title: `Meeting reminder due for ${label}`,
          detail: "Send the reminder using the agreed channel, then record the attempt.",
          href: `/portal/agency/pipelines/leads?lead=${encodeURIComponent(lead.id)}`,
          occurredAt: lead.meetingReminderAt,
        });
      }
      const isWebsiteEnquiry = lead.tags.includes("website-enquiry")
        || lead.source.startsWith("website:")
        || ["public-contact", "website-contact", "milesymedia-website"].includes(lead.source);
      const awaitingLatestEnquiry = lead.lastEnquiryAt
        ? !lead.lastEnquiryRespondedAt
        : !lead.firstContactedAt && !lead.lastContactedAt;
      if (notificationSettings.clientAlerts && isWebsiteEnquiry && awaitingLatestEnquiry) {
        const enquiryId = typeof lead.customFields?.enquiryId === "string" ? lead.customFields.enquiryId : undefined;
        const enquiry = enquiryId ? websiteEnquiryById.get(enquiryId) : undefined;
        if (enquiry?.status === "resolved") continue;
        if (enquiryId) alertedEnquiryIds.add(enquiryId);
        alerts.push({
          id: `enquiry:${lead.id}`,
          severity: enquirySeverity(enquiry, lead.capturedAt, now),
          category: enquiry?.channel === "support" ? "support" : "client",
          title: enquiryTitle(enquiry, label),
          detail: enquiryDetail(enquiry, lead.source),
          href: enquiry
            ? `/portal/agency/inbox?view=${enquiryView(enquiry)}&form=${encodeURIComponent(enquiry.id)}`
            : `/portal/agency/pipelines/leads?lead=${encodeURIComponent(lead.id)}`,
          occurredAt: lead.capturedAt,
        });
      }
    }

    if (notificationSettings.clientAlerts) {
      for (const enquiry of websiteEnquiries) {
        if (alertedEnquiryIds.has(enquiry.id)) continue;
        if (enquiry.status === "resolved") continue;
        if (enquiry.classification === "unclassified") {
          alerts.push({
            id: `enquiry-classification:${enquiry.id}`,
            severity: now - enquiry.submittedAt > DAY ? "warning" : "notice",
            category: "client",
            title: `Classify enquiry from ${enquiry.name}`,
            detail: `${enquiry.siteName} · Decide whether this is sales, an existing client, supplier, partnership, marketer, recruitment, spam, or another relationship. It will stay out of Journey until classified.`,
            // Resolve to the person's card, where classification actually
            // happens. Opening the inbox thread sent the operator to a
            // conversation instead of somewhere they could act, and left them
            // no route back if the classification later needed changing.
            //
            // The person is resolved HERE rather than read off `enquiry`.
            // `listWebsiteEnquiries()` does not populate `personId` — only
            // `synchroniseWebsiteEnquiryIdentities` does, and that runs on the
            // inbox and clients pages, not on this path. Relying on the field
            // meant the card link was never reached and every alert quietly
            // fell back to the inbox.
            href: withResolutionContext(
              enquiryPersonHref(agencyId, enquiry)
                ?? `/portal/agency/inbox?view=${enquiryView(enquiry)}&form=${encodeURIComponent(enquiry.id)}`,
              { alertId: `enquiry-classification:${enquiry.id}`, focus: "classification" },
            ),
            occurredAt: enquiry.submittedAt,
          });
          continue;
        }
        const matchingLead = leadRows.find(lead =>
          lead.id === enquiry.leadId
          || (Boolean(enquiry.email) && lead.email.toLowerCase() === enquiry.email?.toLowerCase()),
        );
        if (matchingLead && (matchingLead.lastEnquiryAt ? matchingLead.lastEnquiryRespondedAt : matchingLead.firstContactedAt ?? matchingLead.lastContactedAt)) continue;

        alerts.push({
          id: `website-message:${enquiry.id}`,
          severity: enquirySeverity(enquiry, enquiry.submittedAt, now),
          category: enquiry.channel === "support" ? "support" : "client",
          title: enquiryTitle(enquiry, enquiry.name),
          detail: enquiryDetail(enquiry),
          href: `/portal/agency/inbox?view=${enquiryView(enquiry)}&form=${encodeURIComponent(enquiry.id)}`,
          occurredAt: enquiry.submittedAt,
        });
      }
    }

    // ── Company membership questions ──────────────────────────────────
    //
    // The system proposes which company somebody belongs to; a human decides.
    // Grouped by company so a bulk import asks "are these 6 people at Cedar
    // Dental?" once, rather than firing six near-identical alerts.
    if (notificationSettings.clientAlerts) {
      for (const batch of batchOrganisationSuggestions(agencyId)) {
        const count = batch.people.length;
        const single = count === 1 ? batch.people[0] : undefined;
        alerts.push({
          id: `person-organisation:${batch.organisationId}`,
          severity: "notice",
          category: "client",
          title: single
            ? `Is ${personDisplayName(single)} part of ${batch.organisationName}?`
            : `Are ${count} people part of ${batch.organisationName}?`,
          detail: `${batch.reason}. Confirming groups them under one company so the relationship stays in one place. Saying no is remembered and will not be asked again.`,
          // A single question resolves on that person's card, where the
          // evidence for them is visible. A grouped question opens the company
          // card, which lists everyone proposed.
          href: withResolutionContext(
            single
              ? `/portal/agency/contacts/${encodeURIComponent(single.id)}`
              : `/portal/agency/contacts/companies/${encodeURIComponent(batch.organisationId)}`,
            { alertId: `person-organisation:${batch.organisationId}`, focus: "company" },
          ),
          occurredAt: Math.min(...batch.people.map(person => person.updatedAt)),
        });
      }
    }

    for (const campaign of notificationSettings.marketingAlerts ? campaignRows : []) {
      if (!["active", "scheduled"].includes(campaign.status)) continue;
      const spend = campaign.spendCents ?? 0;
      const budget = campaign.budgetCents ?? 0;
      const linkedLeads = campaign.sourceKey ? leadRows.filter(lead => lead.source === campaign.sourceKey).length : 0;
      if (budget > 0 && spend > budget) {
        alerts.push({
          id: `campaign-budget:${campaign.id}`,
          severity: "critical",
          category: "marketing",
          title: `${campaign.name} is over budget`,
          detail: `${money(spend)} spent against a ${money(budget)} budget.`,
          href: "/portal/agency/marketing",
          occurredAt: campaign.updatedAt,
        });
      } else if (budget > 0 && spend >= budget * 0.5 && linkedLeads === 0) {
        alerts.push({
          id: `campaign-target:${campaign.id}`,
          severity: "warning",
          category: "marketing",
          title: `${campaign.name} needs a performance check`,
          detail: `${money(spend)} spent with no attributed leads yet.`,
          href: "/portal/agency/marketing",
          occurredAt: campaign.updatedAt,
        });
      }
    }
  }

  const severityOrder = { critical: 0, warning: 1, notice: 2 };
  // Stamp resolution context on EVERY alert in one place. Doing it at each of
  // the 44 push sites would drift the moment somebody adds the 45th.
  const resolved = withResolutionContexts(alerts)
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.occurredAt - a.occurredAt);
  if (canCache) operationalAlertsCache.set(agencyId, { alerts: resolved, at: now });
  const _sweepMs = Math.round(performance.now() - _sweepStart);
  if (process.env.NODE_ENV === "production" && _sweepMs > 1500) {
    const awaited = Object.values(_phase).reduce((sum, ms) => sum + ms, 0);
    // `sync` is everything not inside a timed await — the portfolio/client/finance
    // iteration. If it dominates, the fix is the iteration; if an await dominates,
    // the fix is that read/write.
    console.warn(
      `[perf] operationalAlerts sweep ${_sweepMs}ms agency=${agencyId} `
      + `phases=${JSON.stringify({ ..._phase, sync: Math.max(0, _sweepMs - awaited) })}`,
    );
  }
  return resolved;
}

/**
 * The contact-card href for an enquirer, resolving (and creating if needed)
 * the canonical Person.
 *
 * Creating during alert generation is deliberate. The alternative — link only
 * when a Person already exists — means the very alert telling you to classify
 * somebody is the one that cannot open their card, because nothing has
 * created them yet. `upsertPerson` is idempotent (identity first, then facet),
 * so repeated alert builds converge on one record.
 *
 * Returns null when there is nothing to identify the person by AND no enquiry
 * id to anchor them to, so the caller can fall back to the inbox.
 */
function enquiryPersonHref(agencyId: string, enquiry: WebsiteEnquiry): string | null {
  if (!enquiry.email && !enquiry.phone && !enquiry.id) return null;
  try {
    const { person } = upsertPerson(agencyId, {
      emails: [enquiry.email],
      phones: [enquiry.phone],
      name: enquiry.name,
      source: `website:${enquiry.siteName}`,
      facets: { enquiryIds: [enquiry.id] },
    });
    return `/portal/agency/contacts/${encodeURIComponent(person.id)}`;
  } catch {
    // Never let attention routing fail because a person could not be built.
    return null;
  }
}

function enquiryView(enquiry: WebsiteEnquiry): "forms" | "chatbot" | "support" {
  return enquiry.channel === "form" ? "forms" : enquiry.channel;
}

function calendarAlertDetail(type: string, startsAt: number, endsAt?: number): string {
  const format = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });
  const timing = endsAt ? `${format.format(startsAt)} to ${format.format(endsAt)}` : format.format(startsAt);
  return `${type.replaceAll("-", " ")} scheduled for ${timing}.`;
}

function enquirySeverity(enquiry: WebsiteEnquiry | undefined, submittedAt: number, now: number): OperationalAlertSeverity {
  if (enquiry?.priority === "urgent") return "critical";
  if (enquiry?.priority === "high" || now - submittedAt > DAY) return "warning";
  return "notice";
}

function enquiryTitle(enquiry: WebsiteEnquiry | undefined, sender: string): string {
  if (!enquiry) return `New website enquiry from ${sender}`;
  if (enquiry.channel === "chatbot") return `New chat message from ${sender}`;
  if (enquiry.channel === "support") return `New support request from ${sender}`;
  return `New ${enquiry.siteName} enquiry from ${sender}`;
}

function enquiryDetail(enquiry: WebsiteEnquiry | undefined, fallbackSource = "Website"): string {
  if (!enquiry) return `${fallbackSource.replace(/^website:/, "").replaceAll("-", " ")} · Review the message and record the first response.`;
  const location = `${enquiry.siteName}${enquiry.pagePath === "/" ? "" : ` · ${enquiry.pagePath}`}`;
  return `${location} · ${enquiry.topic} · ${enquiry.suggestedAction}`;
}

function addFinanceAlerts(alerts: OperationalAlert[], agencyId: string, now: number): void {
  const state = getState();
  const installIds = Object.values(state.pluginInstalls)
    .filter(install => install.agencyId === agencyId && install.pluginId === "agency-finance" && install.enabled)
    .map(install => install.id);
  const expenses: Record<string, unknown>[] = [];
  const invoices: Record<string, unknown>[] = [];
  const budgetPots: Record<string, unknown>[] = [];
  const obligations: Record<string, unknown>[] = [];
  const compensationPayments: Record<string, unknown>[] = [];

  for (const installId of installIds) {
    for (const [key, value] of Object.entries(state.pluginData[installId] ?? {})) {
      if (!isRecord(value)) continue;
      if (key.startsWith("expenses/by-id/")) expenses.push(value);
      if (key.startsWith("invoices/by-id/")) invoices.push(value);
      if (key.startsWith("budget-pots/by-id/")) budgetPots.push(value);
      if (key.startsWith("operations/obligations/by-id/")) obligations.push(value);
      if (key.startsWith("operations/payments/by-id/")) compensationPayments.push(value);
    }
  }

  const campaignInstallIds = Object.values(state.pluginInstalls)
    .filter(install => install.agencyId === agencyId && install.pluginId === "leads-pipeline" && install.enabled)
    .map(install => install.id);
  const campaigns: Record<string, unknown>[] = [];
  for (const installId of campaignInstallIds) {
    for (const [key, value] of Object.entries(state.pluginData[installId] ?? {})) {
      if (key.startsWith("campaign:") && isRecord(value)) campaigns.push(value);
    }
  }

  for (const pot of budgetPots) {
    if (cleanText(pot.status) !== "active") continue;
    const potId = cleanText(pot.id);
    if (!potId) continue;
    const linkedCampaigns = campaigns.filter(campaign => cleanText(campaign.budgetPotId) === potId && cleanText(campaign.status) !== "cancelled");
    const linkedExpenses = expenses.filter(expense => cleanText(expense.budgetPotId) === potId && cleanText(expense.status) !== "rejected");
    const linkedWorkforce = compensationPayments.filter(payment => cleanText(payment.budgetPotId) === potId && cleanText(payment.status) !== "cancelled");
    const campaignCommitted = linkedCampaigns.reduce((sum, campaign) => sum + Math.max(numeric(campaign.budgetCents), numeric(campaign.spendCents)), 0);
    const expenseCommitted = linkedExpenses.reduce((sum, expense) => sum + numeric(expense.amountCents), 0);
    const campaignSpent = linkedCampaigns.reduce((sum, campaign) => sum + numeric(campaign.spendCents), 0);
    const expenseSpent = linkedExpenses
      .filter(expense => cleanText(expense.status) === "reimbursed")
      .reduce((sum, expense) => sum + numeric(expense.amountCents), 0);
    const workforceCommitted = linkedWorkforce.reduce((sum, payment) => sum + numeric(payment.grossCents) + numeric(payment.employerCostCents), 0);
    const workforceSpent = linkedWorkforce.filter(payment => cleanText(payment.status) === "paid").reduce((sum, payment) => sum + numeric(payment.grossCents) + numeric(payment.employerCostCents), 0);
    const committed = campaignCommitted + expenseCommitted + workforceCommitted;
    const spent = campaignSpent + expenseSpent + workforceSpent;
    const allocated = numeric(pot.allocatedCents);
    const funded = numeric(pot.fundedCents);
    const potName = cleanText(pot.name) || "Budget pot";
    const potMoney = (cents: number) => moneyInCurrency(cents, cleanText(pot.currency) || "GBP");

    if (committed > allocated || spent > funded) {
      const over = Math.max(committed - allocated, spent - funded);
      alerts.push({
        id: `finance:budget-over:${potId}`,
        severity: "critical",
        category: "money",
        title: `${potName} is over its limit`,
        detail: `${potMoney(committed)} committed and ${potMoney(spent)} spent. The pot is over by ${potMoney(over)} and needs funding or a reduced commitment.`,
        href: "/portal/agency/agency-finance/budgets",
        occurredAt: Math.max(numeric(pot.updatedAt), newestTimestamp([...linkedCampaigns, ...linkedExpenses, ...linkedWorkforce], now)),
      });
    } else if (committed > funded) {
      alerts.push({
        id: `finance:budget-unfunded:${potId}`,
        severity: "warning",
        category: "money",
        title: `${potName} has unfunded commitments`,
        detail: `${potMoney(committed)} is committed against ${potMoney(funded)} currently funded. Add ${potMoney(committed - funded)} or reduce planned work.`,
        href: "/portal/agency/agency-finance/budgets",
        occurredAt: Math.max(numeric(pot.updatedAt), newestTimestamp([...linkedCampaigns, ...linkedExpenses, ...linkedWorkforce], now)),
      });
    } else if (committed > 0 && allocated > 0 && committed >= allocated * 0.85) {
      alerts.push({
        id: `finance:budget-near-limit:${potId}`,
        severity: "notice",
        category: "money",
        title: `${potName} is nearly allocated`,
        detail: `${potMoney(committed)} of ${potMoney(allocated)} is committed. ${potMoney(Math.max(0, allocated - committed))} remains available.`,
        href: "/portal/agency/agency-finance/budgets",
        occurredAt: Math.max(numeric(pot.updatedAt), newestTimestamp([...linkedCampaigns, ...linkedExpenses, ...linkedWorkforce], now)),
      });
    }
  }

  const liveObligations = obligations.filter(obligation => !["completed", "waived", "archived"].includes(cleanText(obligation.status)) && numeric(obligation.nextDueAt) > 0);
  const overdueObligations = liveObligations.filter(obligation => numeric(obligation.nextDueAt) < now);
  const upcomingObligations = liveObligations.filter(obligation => numeric(obligation.nextDueAt) >= now && numeric(obligation.nextDueAt) <= now + 60 * DAY);
  if (overdueObligations.length) {
    alerts.push({
      id: "finance:obligations-overdue",
      severity: "critical",
      category: "compliance",
      title: `${overdueObligations.length} finance obligation${overdueObligations.length === 1 ? " is" : "s are"} overdue`,
      detail: "Review accounts, tax, payroll, audit, insurance and renewal records, then record the next deadline.",
      href: "/portal/agency/agency-finance/operations",
      occurredAt: oldestPositiveTimestamp(overdueObligations.map(obligation => numeric(obligation.nextDueAt)), newestTimestamp(overdueObligations, now)),
    });
  } else if (upcomingObligations.length) {
    alerts.push({
      id: "finance:obligations-upcoming",
      severity: "notice",
      category: "compliance",
      title: `${upcomingObligations.length} finance obligation${upcomingObligations.length === 1 ? " is" : "s are"} due within 60 days`,
      detail: "Prepare the filing, renewal, evidence, professional review and expected cost before the deadline.",
      href: "/portal/agency/agency-finance/operations",
      occurredAt: oldestPositiveTimestamp(upcomingObligations.map(obligation => numeric(obligation.nextDueAt)), newestTimestamp(upcomingObligations, now)),
    });
  }

  const duePeoplePayments = compensationPayments.filter(payment => ["planned", "approved"].includes(cleanText(payment.status)) && numeric(payment.dueAt) > 0 && numeric(payment.dueAt) <= now + 7 * DAY);
  if (duePeoplePayments.length) {
    const late = duePeoplePayments.filter(payment => numeric(payment.dueAt) < now).length;
    alerts.push({
      id: "finance:people-payments-due",
      severity: late ? "critical" : "warning",
      category: "money",
      title: `${duePeoplePayments.length} people payment${duePeoplePayments.length === 1 ? "" : "s"} ${late ? "need action" : "are due soon"}`,
      detail: late ? `${late} payment${late === 1 ? " is" : "s are"} overdue. Review approval, funding and payment evidence.` : "Salary, bonus or external talent payments are due within seven days.",
      href: "/portal/agency/agency-finance/operations",
      occurredAt: oldestPositiveTimestamp(duePeoplePayments.map(payment => numeric(payment.dueAt)), newestTimestamp(duePeoplePayments, now)),
    });
  }

  const missingEvidence = expenses.filter(expense => {
    const paid = expense.status === "reimbursed" || Boolean(expense.paymentMethod);
    const hasEvidence = Boolean(cleanText(expense.receiptUrl)) || (Array.isArray(expense.attachments) && expense.attachments.length > 0);
    return paid && !hasEvidence;
  });
  if (missingEvidence.length) {
    alerts.push({
      id: "finance:expense-evidence",
      severity: "warning",
      category: "money",
      title: `${missingEvidence.length} paid expense${missingEvidence.length === 1 ? "" : "s"} need receipt evidence`,
      detail: "Attach a receipt, invoice, photo or supporting document so the finance record has a complete audit trail.",
      href: "/portal/agency/agency-finance/expenses?evidence=missing",
      occurredAt: newestTimestamp(missingEvidence, now),
    });
  }

  const pending = expenses.filter(expense => expense.status === "pending");
  if (pending.length) {
    alerts.push({
      id: "finance:expense-review",
      severity: "notice",
      category: "money",
      title: `${pending.length} expense${pending.length === 1 ? "" : "s"} await review`,
      detail: "Approve, amend or reject each pending expense so the books stay current.",
      href: "/portal/agency/agency-finance/expenses?status=pending",
      occurredAt: newestTimestamp(pending, now),
    });
  }

  const recurringDue = expenses.filter(expense =>
    Boolean(expense.recurrence) && expense.recurringActive !== false && numeric(expense.nextDueAt) > 0
      && numeric(expense.nextDueAt) <= now + OPERATIONAL_ALERT_THRESHOLDS.recurringExpenseLookaheadDays * DAY
  );
  if (recurringDue.length) {
    const overdue = recurringDue.filter(expense => numeric(expense.nextDueAt) < now).length;
    alerts.push({
      id: "finance:recurring-expenses",
      severity: overdue ? "warning" : "notice",
      category: "money",
      title: `${recurringDue.length} recurring cost${recurringDue.length === 1 ? "" : "s"} ${overdue ? "need posting" : "are due soon"}`,
      detail: overdue
        ? `${overdue} scheduled cost${overdue === 1 ? " is" : "s are"} overdue. Post the next occurrence or update the schedule.`
        : `Due within the next ${OPERATIONAL_ALERT_THRESHOLDS.recurringExpenseLookaheadDays} days.`,
      href: "/portal/agency/agency-finance/expenses?recurring=recurring",
      occurredAt: oldestPositiveTimestamp(
        recurringDue.map(expense => numeric(expense.nextDueAt)),
        newestTimestamp(recurringDue, now),
      ),
    });
  }

  const overdueInvoices = invoices.filter(invoice => {
    const status = cleanText(invoice.status);
    return status === "overdue" || (status === "sent" && numeric(invoice.dueAt) > 0 && numeric(invoice.dueAt) < now);
  });
  if (overdueInvoices.length) {
    alerts.push({
      id: "finance:overdue-invoices",
      severity: "critical",
      category: "money",
      title: `${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? " is" : "s are"} overdue`,
      detail: "Review payment status, record any offline payment and create the next human follow-up action.",
      href: "/portal/agency/agency-finance/invoices?status=overdue",
      occurredAt: oldestPositiveTimestamp(
        overdueInvoices.map(invoice => numeric(invoice.dueAt)),
        newestTimestamp(overdueInvoices, now),
      ),
    });
  }
}

function addDevelopmentAlerts(alerts: OperationalAlert[], agencyId: string, now: number): void {
  const website = getState().agencyWebsites[agencyId];
  if (!website) return;
  const errorWindow = OPERATIONAL_ALERT_THRESHOLDS.telemetryErrorWindowHours * 60 * 60 * 1000;
  const recentErrors = website.telemetryEvents.filter(event => event.type === "error" && event.occurredAt >= now - errorWindow);
  if (recentErrors.length) {
    const latest = recentErrors.reduce((current, event) => event.occurredAt > current.occurredAt ? event : current);
    alerts.push({
      id: `development:errors:${latest.id}`,
      severity: "critical",
      category: "development",
      title: `${website.name} recorded ${recentErrors.length} production error${recentErrors.length === 1 ? "" : "s"}`,
      detail: latest.message || latest.path || "Open Fulfilment technical delivery to inspect the latest event.",
      href: "/portal/agency/fulfilment/technical/website",
      occurredAt: latest.occurredAt,
    });
  }
  if (website.telemetryLastSeenAt && now - website.telemetryLastSeenAt > OPERATIONAL_ALERT_THRESHOLDS.staleMonitoringDays * DAY) {
    alerts.push({
      id: "development:monitoring-stale",
      severity: "warning",
      category: "development",
      title: `${website.name} monitoring has gone quiet`,
      detail: `No telemetry has arrived for more than ${OPERATIONAL_ALERT_THRESHOLDS.staleMonitoringDays} days. Check the Aqua tag and production deployment.`,
      href: "/portal/agency/fulfilment/technical/website",
      occurredAt: website.telemetryLastSeenAt,
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function oldestPositiveTimestamp(values: number[], fallback: number): number {
  const valid = values.filter(value => value > 0 && Number.isFinite(value));
  return valid.length ? Math.min(...valid) : fallback;
}

function newestTimestamp(records: Record<string, unknown>[], fallback: number): number {
  return records.reduce((latest, record) => Math.max(latest, numeric(record.updatedAt), numeric(record.createdAt), numeric(record.incurredAt)), 0) || fallback;
}

function requestLabel(type: string): string {
  return ({ "support-ticket": "Support request", "design-feedback": "Design feedback", suggestion: "Suggestion", cancel: "Cancellation request", "move-provider": "Provider handover request" } as Record<string, string>)[type] ?? "Client message";
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(cents / 100);
}

function moneyInCurrency(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(cents / 100);
  } catch {
    return `${currency.toUpperCase()} ${(cents / 100).toFixed(0)}`;
  }
}

function formatRelativeDate(value: number, now: number): string {
  const days = Math.max(1, Math.ceil((now - value) / DAY));
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
