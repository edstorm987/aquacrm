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
import { listWebsiteEnquiries, type WebsiteEnquiry } from "@/lib/server/websiteEnquiries";
import type { OperationalAlert, OperationalAlertSeverity } from "@/lib/operationalAttention";

export type { OperationalAlert, OperationalAlertSeverity } from "@/lib/operationalAttention";

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
      commercialPack?: { invoiceNumber?: string; invoiceStatus?: string; dueAt?: number; totalCents?: number; payments?: Array<{ amountCents: number }> };
      contracts?: ClientContract[];
      portalBuiltAt?: number;
      portalAccessPreparedAt?: number;
      portalAccessSentAt?: number;
    } | undefined;

    for (const request of notificationSettings.supportRequests ? metadata?.clientRequests ?? [] : []) {
      if (request.status !== "open") continue;
      const critical = request.priority === "urgent" || request.type === "cancel" || request.type === "move-provider";
      alerts.push({
        id: `request:${client.id}:${request.id}`,
        severity: critical ? "critical" : request.priority === "normal" ? "notice" : "warning",
        category: "support",
        title: `${requestLabel(request.type)} from ${client.name}`,
        detail: `${request.siteLabel ? `${request.siteLabel} · ` : ""}${request.topic ? `${request.topic} · ` : ""}${request.message}`,
        href: `/portal/agency/inbox?view=support&thread=${encodeURIComponent(request.id)}`,
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

    if (notificationSettings.clientAlerts && client.status === "active" && client.stage !== "churned" && (!metadata?.lastContactedAt || now - metadata.lastContactedAt > OPERATIONAL_ALERT_THRESHOLDS.clientContactDays * DAY)) {
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
    const [campaignRows, leadRows, websiteEnquiries] = await Promise.all([
      campaigns.list(),
      leads.list(),
      listWebsiteEnquiries().catch(() => []),
    ]);
    const websiteEnquiryById = new Map(websiteEnquiries.map(enquiry => [enquiry.id, enquiry]));
    const alertedEnquiryIds = new Set<string>();

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
            : "/portal/agency/pipelines/leads",
          occurredAt: lead.capturedAt,
        });
      }
    }

    if (notificationSettings.clientAlerts) {
      for (const enquiry of websiteEnquiries) {
        if (alertedEnquiryIds.has(enquiry.id)) continue;
        if (enquiry.status === "resolved") continue;
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

function enquiryView(enquiry: WebsiteEnquiry): "forms" | "chatbot" | "support" {
  return enquiry.channel === "form" ? "forms" : enquiry.channel;
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
