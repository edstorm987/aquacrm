import "server-only";

import { getInstall } from "@/server/pluginInstalls";
import { listClients } from "@/server/tenants";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { ensureLeadsPipelineFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/leadsPipelineFoundation";
import { containerFor } from "@aqua/plugin-leads-pipeline/server";
import type { ClientTelemetryEvent } from "@/lib/clientTelemetry";
import { listAgencyTasks } from "@/server/tasks";
import { getUserById } from "@/server/users";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";
import { listLegalDocuments } from "@/server/legalDocuments";
import { getState } from "@/server/storage";
import type { ClientContract } from "@/lib/clientContracts";

export type OperationalAlertSeverity = "critical" | "warning" | "notice";

export interface OperationalAlert {
  id: string;
  severity: OperationalAlertSeverity;
  category: "outage" | "support" | "money" | "meeting" | "client" | "marketing" | "task" | "compliance" | "contract" | "development";
  title: string;
  detail: string;
  href: string;
  clientName?: string;
  occurredAt: number;
}

const DAY = 24 * 60 * 60 * 1000;

export const OPERATIONAL_ALERT_THRESHOLDS = {
  clientContactDays: 14,
  contractAcceptanceDays: 7,
  portalAccessDays: 3,
  recurringExpenseLookaheadDays: 7,
  staleMonitoringDays: 2,
  telemetryErrorWindowHours: 24,
} as const;

export async function listOperationalAlerts(agencyId: string, now = Date.now()): Promise<OperationalAlert[]> {
  const clients = listClients(agencyId);
  const alerts: OperationalAlert[] = [];
  const notificationSettings = getAgencyWorkspaceSettings(agencyId).notifications;

  for (const document of notificationSettings.complianceAlerts ? listLegalDocuments(agencyId) : []) {
    if (document.status === "archived") continue;
    const href = "/portal/agency/company#legal";
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
        detail: document.expiresAt ? `Review before ${new Date(document.expiresAt).toLocaleDateString("en-GB")}.` : "This document needs review or action.",
        href,
        occurredAt: document.reminderAt,
      });
    } else if (document.expiresAt && document.expiresAt <= now + 30 * DAY) {
      alerts.push({
        id: `compliance-due:${document.id}`,
        severity: "notice",
        category: "compliance",
        title: `${document.title} is due soon`,
        detail: `Expires or becomes due on ${new Date(document.expiresAt).toLocaleDateString("en-GB")}.`,
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

  for (const task of notificationSettings.overdueTasks ? listAgencyTasks(agencyId) : []) {
    if (task.status === "done") continue;
    const owner = task.assigneeUserId ? getUserById(task.assigneeUserId)?.name : undefined;
    if (task.dueAt && task.dueAt < now) {
      alerts.push({
        id: `task:${task.id}`,
        severity: task.priority === "urgent" ? "critical" : "warning",
        category: "task",
        title: `Overdue task: ${task.title}`,
        detail: `${owner ? `${owner} owns this task. ` : "This task is unassigned. "}It was due ${formatRelativeDate(task.dueAt, now)}.`,
        href: "/portal/agency/actions",
        occurredAt: task.dueAt,
      });
    } else if (task.reminderAt && task.reminderAt <= now) {
      alerts.push({
        id: `task-reminder:${task.id}`,
        severity: task.priority === "urgent" ? "critical" : "notice",
        category: "task",
        title: `Task reminder: ${task.title}`,
        detail: owner ? `${owner} owns this task.` : "This task is unassigned.",
        href: "/portal/agency/actions",
        occurredAt: task.reminderAt,
      });
    }
  }

  for (const client of clients) {
    const metadata = client.metadata as {
      lastContactedAt?: number;
      clientRequests?: Array<{ id: string; type: string; message: string; status: string; submittedAt: number; replies?: unknown[] }>;
      telemetryEvents?: ClientTelemetryEvent[];
      commercialPack?: { invoiceNumber?: string; invoiceStatus?: string; dueAt?: number; totalCents?: number; payments?: Array<{ amountCents: number }> };
      contracts?: ClientContract[];
      portalBuiltAt?: number;
      portalAccessPreparedAt?: number;
      portalAccessSentAt?: number;
    } | undefined;

    for (const request of notificationSettings.supportRequests ? metadata?.clientRequests ?? [] : []) {
      if (request.status !== "open") continue;
      const critical = request.type === "support-ticket" || request.type === "cancel" || request.type === "move-provider";
      alerts.push({
        id: `request:${client.id}:${request.id}`,
        severity: critical ? "critical" : "warning",
        category: "support",
        title: `${requestLabel(request.type)} from ${client.name}`,
        detail: request.message,
        href: `/portal/clients/${client.id}?tab=overview`,
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
        title: `${client.name} reported ${recentErrors.length} production error${recentErrors.length === 1 ? "" : "s"}`,
        detail: latest.message || latest.path || "Open development monitoring to inspect the latest error.",
        href: `/portal/clients/${client.id}?tab=systems`,
        clientName: client.name,
        occurredAt: latest.occurredAt,
      });
    }

    const pack = metadata?.commercialPack;
    const paid = pack?.payments?.reduce((sum, payment) => sum + payment.amountCents, 0) ?? 0;
    if (notificationSettings.financeAlerts && pack?.dueAt && pack.dueAt < now && pack.invoiceStatus !== "paid" && paid < (pack.totalCents ?? 0)) {
      alerts.push({
        id: `invoice:${client.id}:${pack.invoiceNumber ?? "draft"}`,
        severity: "critical",
        category: "money",
        title: `${client.name} has an overdue invoice`,
        detail: `${pack.invoiceNumber ?? "Invoice"} was due ${formatRelativeDate(pack.dueAt, now)}.`,
        href: `/portal/clients/${client.id}?tab=finance`,
        clientName: client.name,
        occurredAt: pack.dueAt,
      });
    }

    for (const contract of notificationSettings.contractAlerts ? metadata?.contracts ?? [] : []) {
      const waitingSince = contract.issuedAt ?? contract.updatedAt ?? contract.createdAt;
      if (contract.status !== "sent" || now - waitingSince < OPERATIONAL_ALERT_THRESHOLDS.contractAcceptanceDays * DAY) continue;
      alerts.push({
        id: `contract-awaiting:${client.id}:${contract.id}`,
        severity: "warning",
        category: "contract",
        title: `${client.name} has a contract awaiting acceptance`,
        detail: `${contract.title} was sent ${formatRelativeDate(waitingSince, now)}. Follow up or record the signed agreement.`,
        href: `/portal/clients/${client.id}?tab=finance`,
        clientName: client.name,
        occurredAt: waitingSince,
      });
    }

    const portalReadyAt = metadata?.portalAccessPreparedAt ?? metadata?.portalBuiltAt;
    if (notificationSettings.clientAlerts && portalReadyAt && !metadata?.portalAccessSentAt && now - portalReadyAt >= OPERATIONAL_ALERT_THRESHOLDS.portalAccessDays * DAY) {
      alerts.push({
        id: `portal-access:${client.id}`,
        severity: "notice",
        category: "client",
        title: `${client.name}'s portal access is ready to review`,
        detail: `Access has been prepared for ${OPERATIONAL_ALERT_THRESHOLDS.portalAccessDays} days or more but has not been sent.`,
        href: `/portal/clients/${client.id}?tab=fulfilment`,
        clientName: client.name,
        occurredAt: portalReadyAt,
      });
    }

    if (notificationSettings.clientAlerts && client.status === "active" && (!metadata?.lastContactedAt || now - metadata.lastContactedAt > OPERATIONAL_ALERT_THRESHOLDS.clientContactDays * DAY)) {
      alerts.push({
        id: `contact:${client.id}`,
        severity: "warning",
        category: "client",
        title: `Check in with ${client.name}`,
        detail: metadata?.lastContactedAt ? `No contact has been recorded for more than ${OPERATIONAL_ALERT_THRESHOLDS.clientContactDays} days.` : "No client contact has been recorded yet.",
        href: `/portal/clients/${client.id}`,
        clientName: client.name,
        occurredAt: metadata?.lastContactedAt ?? client.createdAt,
      });
    }
  }

  if (notificationSettings.financeAlerts) addFinanceAlerts(alerts, agencyId, now);
  if (notificationSettings.developmentAlerts) addDevelopmentAlerts(alerts, agencyId, now);

  const leadsInstall = getInstall({ agencyId }, "leads-pipeline");
  if (leadsInstall?.enabled) {
    ensureLeadsPipelineFoundationRegistered();
    const { campaigns, leads } = containerFor({ agencyId, storage: makePluginStorage(leadsInstall.id) as never });
    const [campaignRows, leadRows] = await Promise.all([campaigns.list(), leads.list()]);

    for (const lead of leadRows) {
      const label = lead.name || lead.company || lead.email;
      if (notificationSettings.meetingReminders && lead.meetingReminderAt && !lead.meetingReminderSentAt && lead.meetingReminderAt <= now && !["completed", "cancelled"].includes(lead.meetingStatus ?? "")) {
        alerts.push({
          id: `meeting:${lead.id}`,
          severity: "warning",
          category: "meeting",
          title: `Meeting reminder due for ${label}`,
          detail: "Send the reminder using the agreed channel, then record the attempt.",
          href: "/portal/agency/pipelines/leads",
          occurredAt: lead.meetingReminderAt,
        });
      }
      if (notificationSettings.clientAlerts && ["public-contact", "website-contact", "milesymedia-website"].includes(lead.source) && !lead.lastContactedAt) {
        alerts.push({
          id: `enquiry:${lead.id}`,
          severity: now - lead.capturedAt > DAY ? "warning" : "notice",
          category: "client",
          title: `New website enquiry from ${label}`,
          detail: "Review the message and record the first response.",
          href: "/portal/agency/pipelines/leads",
          occurredAt: lead.capturedAt,
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
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.occurredAt - a.occurredAt);
}

function addFinanceAlerts(alerts: OperationalAlert[], agencyId: string, now: number): void {
  const state = getState();
  const installIds = Object.values(state.pluginInstalls)
    .filter(install => install.agencyId === agencyId && install.pluginId === "agency-finance" && install.enabled)
    .map(install => install.id);
  const expenses: Record<string, unknown>[] = [];
  const invoices: Record<string, unknown>[] = [];

  for (const installId of installIds) {
    for (const [key, value] of Object.entries(state.pluginData[installId] ?? {})) {
      if (!isRecord(value)) continue;
      if (key.startsWith("expenses/by-id/")) expenses.push(value);
      if (key.startsWith("invoices/by-id/")) invoices.push(value);
    }
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
      detail: latest.message || latest.path || "Open the development control centre to inspect the latest event.",
      href: "/portal/agency/development/website",
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
      href: "/portal/agency/development/website",
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

function formatRelativeDate(value: number, now: number): string {
  const days = Math.max(1, Math.ceil((now - value) / DAY));
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
