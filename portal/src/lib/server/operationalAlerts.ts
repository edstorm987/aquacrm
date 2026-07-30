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

export type OperationalAlertSeverity = "critical" | "warning" | "notice";

export interface OperationalAlert {
  id: string;
  severity: OperationalAlertSeverity;
  category: "outage" | "support" | "money" | "meeting" | "client" | "marketing" | "task" | "compliance";
  title: string;
  detail: string;
  href: string;
  clientName?: string;
  occurredAt: number;
}

const DAY = 24 * 60 * 60 * 1000;

export async function listOperationalAlerts(agencyId: string, now = Date.now()): Promise<OperationalAlert[]> {
  const clients = listClients(agencyId);
  const alerts: OperationalAlert[] = [];
  const notificationSettings = getAgencyWorkspaceSettings(agencyId).notifications;

  for (const document of listLegalDocuments(agencyId)) {
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

    if (client.status === "active" && (!metadata?.lastContactedAt || now - metadata.lastContactedAt > 14 * DAY)) {
      alerts.push({
        id: `contact:${client.id}`,
        severity: "warning",
        category: "client",
        title: `Check in with ${client.name}`,
        detail: metadata?.lastContactedAt ? "No contact has been recorded for more than 14 days." : "No client contact has been recorded yet.",
        href: `/portal/clients/${client.id}`,
        clientName: client.name,
        occurredAt: metadata?.lastContactedAt ?? client.createdAt,
      });
    }
  }

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
      if (["public-contact", "website-contact", "milesymedia-website"].includes(lead.source) && !lead.lastContactedAt) {
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
