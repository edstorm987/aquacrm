import "server-only";

import { ensureAgencyFinanceFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/agencyFinanceFoundation";
import { ensureLeadsPipelineFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/leadsPipelineFoundation";
import { containerFor as financeContainerFor } from "@/built-ins/modules/agency-finance/src/server/foundationAdapter";
import { containerFor as leadsContainerFor } from "@aqua/plugin-leads-pipeline/server";
import type { BrandPortfolioRow, BrandPortfolioSnapshot } from "@/lib/brands/brandPortfolio";
import { summarizeClientTelemetry, type ClientTelemetryEvent } from "@/lib/clients/clientTelemetry";
import { getCompanyProfile } from "@/server/company";
import { listClientMilestones } from "@/server/clientMilestones";
import { getInstall } from "@/server/pluginInstalls";
import { listAgencyProducts } from "@/server/agencyProducts";
import { listTradingCompanies } from "@/server/tradingCompanies";
import { listClients } from "@/server/tenants";
import { listUsersForAgency } from "@/server/users";
import { makePluginStorage } from "./pluginStorage";

type MutableRow = BrandPortfolioRow;

export async function buildBrandPortfolioSnapshot(agencyId: string, now = Date.now()): Promise<BrandPortfolioSnapshot> {
  const companies = listTradingCompanies(agencyId).filter(company => company.status !== "archived");
  const clients = listClients(agencyId, { includeArchived: true });
  const milestones = listClientMilestones(agencyId);
  const products = listAgencyProducts(agencyId);
  const users = listUsersForAgency(agencyId);
  const rows = new Map<string, MutableRow>();
  const unallocatedId = "unallocated";
  const createRow = (id: string, label: string, colour: string, status: BrandPortfolioRow["status"], unallocated = false): MutableRow => ({
    id,
    label,
    colour,
    status,
    unallocated,
    currency: "gbp",
    monthRevenueCents: 0,
    previousMonthRevenueCents: 0,
    monthlyRevenueGrowthPercent: null,
    monthlyRevenueTargetCents: unallocated ? 0 : getCompanyProfile(agencyId, id).monthlyRevenueTargetCents,
    revenueSharePercent: null,
    mrrCents: 0,
    revenueRecordCount: 0,
    activeClients: 0,
    clientsNeedingAttention: 0,
    totalClients: 0,
    churnedClients: 0,
    leadCount: 0,
    recentLeadCount: 0,
    convertedLeadCount: 0,
    meetingsThisMonth: 0,
    completedSalesCalls: 0,
    productCount: 0,
    staffCount: 0,
    evidence: [],
  });
  companies.forEach(company => rows.set(company.id, createRow(company.id, company.name, company.brand.primaryColor, company.status)));
  const unallocated = createRow(unallocatedId, "Shared / unallocated", "#7d8e96", "active", true);
  rows.set(unallocatedId, unallocated);
  const rowFor = (companyId?: string) => rows.get(companyId || unallocatedId) ?? unallocated;

  for (const client of clients) {
    const row = rowFor(client.companyId);
    row.totalClients += 1;
    const active = client.status === "active" && client.stage !== "churned";
    if (client.stage === "churned") row.churnedClients += 1;
    if (!active) continue;
    row.activeClients += 1;
    if (clientNeedsAttention(client, milestones, now)) row.clientsNeedingAttention += 1;
  }
  for (const product of products) {
    const companyIds = product.companyIds ?? [];
    if (!companyIds.length) unallocated.productCount += 1;
    else companyIds.forEach(companyId => { const row = rows.get(companyId); if (row) row.productCount += 1; });
  }
  for (const user of users) {
    const companyIds = user.companyIds ?? [];
    if (!companyIds.length) unallocated.staffCount += 1;
    else companyIds.forEach(companyId => { const row = rows.get(companyId); if (row) row.staffCount += 1; });
  }

  const month = monthBounds(now);
  const leadsInstall = getInstall({ agencyId }, "leads-pipeline");
  if (leadsInstall?.enabled) {
    try {
      ensureLeadsPipelineFoundationRegistered();
      const leads = await leadsContainerFor({ agencyId, storage: makePluginStorage(leadsInstall.id) as never }).leads.list();
      for (const lead of leads) {
        const companyIds = lead.companyIds?.length ? lead.companyIds : lead.companyId ? [lead.companyId] : [];
        const targetRows = companyIds.length ? companyIds.map(id => rows.get(id)).filter((row): row is MutableRow => Boolean(row)) : [unallocated];
        targetRows.forEach(row => {
          row.leadCount += 1;
          if (lead.capturedAt >= now - 30 * 86_400_000) row.recentLeadCount += 1;
          if (lead.convertedAt || lead.convertedClientId) row.convertedLeadCount += 1;
          if (lead.nextMeetingAt && lead.nextMeetingAt >= month.currentStart && lead.nextMeetingAt < month.currentEnd) row.meetingsThisMonth += 1;
          if (lead.meetingStatus === "completed" && (lead.nextMeetingAt ?? 0) >= month.currentStart && (lead.nextMeetingAt ?? 0) < month.currentEnd) row.completedSalesCalls += 1;
        });
      }
    } catch {
      // Brand rows remain visibly unpopulated until the leads store is available.
    }
  }

  let financeConnected = false;
  let currency = "gbp";
  const financeInstall = getInstall({ agencyId }, "agency-finance");
  if (financeInstall?.enabled) {
    try {
      ensureAgencyFinanceFoundationRegistered();
      const finance = financeContainerFor({ agencyId, storage: makePluginStorage(financeInstall.id) as never, install: financeInstall });
      const [invoices, payments, income, plans] = await Promise.all([
        finance.invoices.list(),
        finance.payments.list(),
        finance.income.list(),
        finance.plans.list(false),
      ]);
      financeConnected = true;
      currency = plans[0]?.currency ?? invoices[0]?.currency ?? income[0]?.currency ?? "gbp";
      rows.forEach(row => { row.currency = currency; });
      const clientCompany = new Map(clients.map(client => [client.id, client.companyId]));
      const invoiceById = new Map(invoices.map(invoice => [invoice.id, invoice]));
      const paidInvoiceIds = new Set(payments.map(payment => payment.invoiceId));
      const allocateRevenue = (companyId: string | undefined, amountCents: number, at: number) => {
        const row = rowFor(companyId);
        if (at >= month.currentStart && at < month.currentEnd) {
          row.monthRevenueCents += amountCents;
          row.revenueRecordCount += 1;
        } else if (at >= month.previousStart && at < month.currentStart) {
          row.previousMonthRevenueCents += amountCents;
        }
      };
      payments.forEach(payment => {
        const invoice = invoiceById.get(payment.invoiceId);
        allocateRevenue(invoice?.companyId ?? clientCompany.get(payment.clientId), payment.amountCents, payment.paidAt);
      });
      invoices.filter(invoice => invoice.status === "paid" && !paidInvoiceIds.has(invoice.id)).forEach(invoice => {
        allocateRevenue(invoice.companyId ?? clientCompany.get(invoice.clientId), invoice.totalCents, invoice.paidAt ?? invoice.issuedAt);
      });
      income.forEach(entry => allocateRevenue(clientCompany.get(entry.clientId ?? ""), entry.amountCents, entry.receivedAt));
      plans.filter(plan => plan.active).forEach(plan => plan.clientIds.forEach(clientId => {
        rowFor(clientCompany.get(clientId)).mrrCents += plan.monthlyAmountCents;
      }));
    } catch {
      financeConnected = false;
    }
  }

  const totalRevenueCents = [...rows.values()].reduce((sum, row) => sum + row.monthRevenueCents, 0);
  const totalRevenueRecords = [...rows.values()].reduce((sum, row) => sum + row.revenueRecordCount, 0);
  for (const row of rows.values()) {
    row.revenueSharePercent = totalRevenueCents > 0 ? round(row.monthRevenueCents / totalRevenueCents * 100, 1) : null;
    row.monthlyRevenueGrowthPercent = row.previousMonthRevenueCents > 0 ? round((row.monthRevenueCents - row.previousMonthRevenueCents) / row.previousMonthRevenueCents * 100, 1) : null;
    row.evidence = [
      `${row.revenueRecordCount} paid income ${row.revenueRecordCount === 1 ? "record" : "records"} this month`,
      `${row.activeClients}/${row.totalClients} active client relationships`,
      `${row.recentLeadCount} new leads in the trailing 30 days`,
      `${row.leadCount} allocated leads retained in CRM`,
      `${row.productCount} allocated offers`,
      ...(row.unallocated ? ["Records in this row have no trading-company allocation"] : []),
    ];
  }
  const visibleRows = [...rows.values()]
    .filter(row => !row.unallocated || row.monthRevenueCents || row.previousMonthRevenueCents || row.mrrCents || row.totalClients || row.leadCount || row.productCount || row.staffCount)
    .sort((left, right) => Number(left.unallocated) - Number(right.unallocated) || right.monthRevenueCents - left.monthRevenueCents || right.activeClients - left.activeClients || left.label.localeCompare(right.label));
  return { generatedAt: now, currency, financeConnected, totalRevenueCents, totalRevenueRecords, rows: visibleRows };
}

function clientNeedsAttention(client: ReturnType<typeof listClients>[number], milestones: ReturnType<typeof listClientMilestones>, now: number): boolean {
  const metadata = client.metadata ?? {};
  const lastContactedAt = Number(metadata.lastContactedAt ?? 0);
  const telemetryEvents = Array.isArray(metadata.telemetryEvents) ? metadata.telemetryEvents as ClientTelemetryEvent[] : [];
  const telemetry = summarizeClientTelemetry(telemetryEvents);
  const requests = Array.isArray(metadata.clientRequests) ? metadata.clientRequests as Array<{ status?: string }> : [];
  const clientMilestones = milestones.filter(item => item.clientId === client.id);
  return !client.ownerEmail
    || !lastContactedAt
    || now - lastContactedAt > 14 * 86_400_000
    || telemetry.errors24h > 0
    || requests.some(request => request.status === "open")
    || clientMilestones.some(item => item.status === "blocked" || Boolean(item.targetAt && item.targetAt < now && item.status !== "complete"));
}

function monthBounds(now: number) {
  const date = new Date(now);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return {
    previousStart: Date.UTC(year, month - 1, 1),
    currentStart: Date.UTC(year, month, 1),
    currentEnd: Date.UTC(year, month + 1, 1),
  };
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
