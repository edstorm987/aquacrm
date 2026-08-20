import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, test } from "node:test";
import { readFileSync } from "node:fs";
import { operationalAlertBelongsToClient, operationalAlertMatchesHref, operationalAlertMatchesHrefPrefix } from "../src/lib/operationalAttention";

/**
 * The destination without the resolution context appended centrally.
 *
 * Alerts now carry `?resolve=&focus=` so the destination can explain why you
 * were sent there. These assertions are about WHERE an alert points, so strip
 * the context rather than pinning the literal string — otherwise every future
 * change to the resolution layer breaks tests that do not care about it.
 */
function destination(href: string | undefined): string {
  if (!href) return "";
  // Split the fragment off FIRST. A URL is path?query#hash, so splitting on
  // "?" first swallows the hash into the query — and the proposal alerts
  // deep-link with #external-proposal-<id>.
  const hashIndex = href.indexOf("#");
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;

  const [path, query] = withoutHash.split("?");
  if (!query) return `${path}${hash}`;
  const params = new URLSearchParams(query);
  params.delete("resolve");
  params.delete("focus");
  params.delete("record");
  const rest = params.toString();
  return `${path}${rest ? `?${decodeURIComponent(rest)}` : ""}${hash}`;
}


const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Installs = typeof import("../src/server/pluginInstalls");
type Alerts = typeof import("../src/lib/server/operationalAlerts");
type SidebarAttention = typeof import("../src/lib/server/sidebarAttention");
type AlertPreferences = typeof import("../src/lib/server/operationalAlertPreferences");
type Proposals = typeof import("../src/lib/server/externalAssistantProposals");
type Tasks = typeof import("../src/server/tasks");
type Resolution = typeof import("../src/lib/server/resolutionPlans");

let storage: Storage;
let tenants: Tenants;
let installs: Installs;
let alerts: Alerts;
let sidebarAttention: SidebarAttention;
let alertPreferences: AlertPreferences;
let proposals: Proposals;
let tasks: Tasks;
let resolution: Resolution;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  installs = await import("../src/server/pluginInstalls");
  alerts = await import("../src/lib/server/operationalAlerts");
  sidebarAttention = await import("../src/lib/server/sidebarAttention");
  alertPreferences = await import("../src/lib/server/operationalAlertPreferences");
  proposals = await import("../src/lib/server/externalAssistantProposals");
  tasks = await import("../src/server/tasks");
  resolution = await import("../src/lib/server/resolutionPlans");
  await storage.ensureHydrated();
  await storage.reset();
});

test("finance rules feed the shared notification collector", async () => {
  const now = Date.parse("2026-08-08T12:00:00Z");
  const agency = tenants.createAgency({ name: "AquaOasis-Web", slug: "aqua-notifications" });
  const install = installs.upsertInstall({
    pluginId: "agency-finance",
    scope: { agencyId: agency.id },
    enabled: true,
    config: {},
    features: {},
  });
  storage.mutate(state => {
    state.pluginData[install.id] = {
      "expenses/by-id/missing": {
        id: "missing",
        status: "reimbursed",
        paymentMethod: "card",
        amountCents: 1200,
        incurredAt: now - 2_000,
        updatedAt: now - 1_000,
      },
      "expenses/by-id/attached": {
        id: "attached",
        status: "reimbursed",
        paymentMethod: "card",
        amountCents: 800,
        attachments: [{ id: "receipt" }],
        incurredAt: now - 2_000,
        updatedAt: now - 1_000,
      },
      "expenses/by-id/pending": {
        id: "pending",
        status: "pending",
        amountCents: 500,
        incurredAt: now - 2_000,
        updatedAt: now - 1_000,
      },
      "invoices/by-id/late": {
        id: "late",
        status: "sent",
        dueAt: now - 86_400_000,
        totalCents: 50_000,
      },
    };
  });

  const result = await alerts.listOperationalAlerts(agency.id, now);
  assert.match(result.find(alert => alert.id === "finance:expense-evidence")?.title ?? "", /1 paid expense need receipt evidence/);
  assert.equal(destination(result.find(alert => alert.id === "finance:expense-evidence")?.href), "/portal/agency/agency-finance/expenses?evidence=missing");
  assert.match(result.find(alert => alert.id === "finance:expense-review")?.title ?? "", /1 expense await review/);
  assert.match(result.find(alert => alert.id === "finance:overdue-invoices")?.title ?? "", /1 invoice is overdue/);
});

test("budget pots raise cross-module funding and overspend alerts", async () => {
  const now = Date.parse("2026-08-08T12:00:00Z");
  const agency = tenants.createAgency({ name: "Budget Alerts", slug: "budget-alerts" });
  const finance = installs.upsertInstall({
    pluginId: "agency-finance",
    scope: { agencyId: agency.id },
    enabled: true,
    config: {},
    features: {},
  });
  const leads = installs.upsertInstall({
    pluginId: "leads-pipeline",
    scope: { agencyId: agency.id },
    enabled: true,
    config: {},
    features: {},
  });
  storage.mutate(state => {
    state.pluginData[finance.id] = {
      "budget-pots/by-id/growth": {
        id: "growth",
        name: "Growth campaigns",
        status: "active",
        allocatedCents: 10_000,
        fundedCents: 5_000,
        updatedAt: now - 2_000,
      },
      "budget-pots/by-id/gear": {
        id: "gear",
        name: "Studio equipment",
        status: "active",
        allocatedCents: 4_000,
        fundedCents: 4_000,
        updatedAt: now - 2_000,
      },
    };
    state.pluginData[leads.id] = {
      "campaign:growth": {
        id: "campaign-growth",
        name: "Growth launch",
        budgetPotId: "growth",
        budgetCents: 8_000,
        spendCents: 1_000,
        status: "active",
        updatedAt: now - 1_000,
      },
      "campaign:gear": {
        id: "campaign-gear",
        name: "Equipment launch",
        budgetPotId: "gear",
        budgetCents: 5_000,
        spendCents: 500,
        status: "active",
        updatedAt: now - 1_000,
      },
    };
  });

  const result = await alerts.listOperationalAlerts(agency.id, now);
  assert.equal(result.find(alert => alert.id === "finance:budget-unfunded:growth")?.severity, "warning");
  assert.match(result.find(alert => alert.id === "finance:budget-unfunded:growth")?.detail ?? "", /£30/);
  assert.equal(result.find(alert => alert.id === "finance:budget-over:gear")?.severity, "critical");
  assert.equal(destination(result.find(alert => alert.id === "finance:budget-over:gear")?.href), "/portal/agency/agency-finance/budgets");
});

test("client social and paid-media delivery raises exact operational alerts", async () => {
  const now = Date.parse("2026-08-14T12:00:00Z");
  const agency = tenants.createAgency({ name: "Managed Growth", slug: "managed-growth-alerts" });
  const client = tenants.createClient(agency.id, {
    name: "Example Client",
    workspaceLabel: "Retained growth",
    metadata: {
      clientMarketingService: {
        enabled: true,
        status: "active",
        profiles: [{ id: "profile-1", platform: "Instagram", handle: "@example", status: "attention" }],
        content: [{ id: "content-1", title: "Launch reel", platform: "Instagram", format: "Reel", status: "review", approval: "pending", updatedAt: now - 2_000 }],
        campaigns: [{ id: "campaign-1", name: "Lead campaign", platform: "Meta Ads", objective: "Leads", status: "active", approval: "approved", budgetCents: 10_000, spendCents: 12_000, impressions: 10_000, clicks: 200, leads: 2, conversions: 1, revenueCents: 20_000, updatedAt: now - 1_000 }],
      },
    },
  });
  const result = await alerts.listOperationalAlerts(agency.id, now);
  const budgetAlert = result.find(alert => alert.id === `client-marketing-budget:${client.id}:campaign-1`);
  assert.equal(budgetAlert?.severity, "critical");
  assert.match(budgetAlert?.title ?? "", /Example Client · Retained growth/);
  assert.equal(result.find(alert => alert.id === `client-marketing-access:${client.id}`)?.severity, "warning");
  assert.equal(destination(result.find(alert => alert.id === `client-marketing-approvals:${client.id}`)?.href), `/portal/clients/${client.id}?tab=marketing`);
});

test("client health raises specific enquiry and traffic attention alerts", async () => {
  const now = Date.parse("2026-08-14T12:00:00Z");
  const DAY = 86_400_000;
  const agency = tenants.createAgency({ name: "Client Health Alerts", slug: "client-health-alerts" });
  let seq = 0;
  const ev = (type: string, occurredAt: number) => ({ id: `evt_${(seq += 1)}`, type, occurredAt, receivedAt: occurredAt });
  const client = tenants.createClient(agency.id, {
    name: "Quiet Client",
    workspaceLabel: "Website care",
    metadata: {
      telemetryLastSeenAt: now - DAY,
      telemetryEvents: [
        ...Array.from({ length: 5 }, () => ev("form", now - 45 * DAY)),
        ...Array.from({ length: 4 }, () => ev("form", now - 75 * DAY)),
        // no enquiries in the trailing 30 days → "no enquiries this month"
        ...Array.from({ length: 40 }, () => ev("pageview", now - 45 * DAY)),
        ...Array.from({ length: 40 }, () => ev("pageview", now - 75 * DAY)),
        ...Array.from({ length: 8 }, () => ev("pageview", now - 10 * DAY)), // ~80% traffic drop
      ],
    },
  });

  const result = await alerts.listOperationalAlerts(agency.id, now);
  const enquiryAlert = result.find(alert => alert.id === `client-health-enquiry:${client.id}`);
  const trafficAlert = result.find(alert => alert.id === `client-health-traffic:${client.id}`);

  assert.equal(enquiryAlert?.severity, "warning");
  assert.equal(enquiryAlert?.kind, "off-system");
  assert.match(enquiryAlert?.title ?? "", /Quiet Client.*no enquiries this month/);
  assert.match(enquiryAlert?.detail ?? "", /baseline of 4\.5 per month/);
  // The central stamper appends a `resolve=` context param, so match the base.
  assert.ok(enquiryAlert?.href.startsWith(`/portal/clients/${client.id}?tab=systems`), enquiryAlert?.href);
  assert.match(enquiryAlert?.clearsWhen ?? "", /Enquiries return to/);
  assert.equal(enquiryAlert?.clientId, client.id);

  assert.equal(trafficAlert?.severity, "warning");
  assert.match(trafficAlert?.title ?? "", /traffic down \d+%/);
});

test("finance operations warns about compliance and people payments", async () => {
  const now = Date.parse("2026-08-08T12:00:00Z");
  const agency = tenants.createAgency({ name: "Finance Operations Alerts", slug: "finance-operations-alerts" });
  const finance = installs.upsertInstall({ pluginId: "agency-finance", scope: { agencyId: agency.id }, enabled: true, config: {}, features: {} });
  storage.mutate(state => {
    state.pluginData[finance.id] = {
      "operations/obligations/by-id/audit": {
        id: "audit",
        name: "Annual financial audit",
        type: "audit",
        status: "upcoming",
        nextDueAt: now - 86_400_000,
        updatedAt: now - 10_000,
      },
      "operations/payments/by-id/payroll": {
        id: "payroll",
        profileId: "founder",
        kind: "salary",
        status: "approved",
        grossCents: 200_000,
        employerCostCents: 20_000,
        dueAt: now - 1_000,
        updatedAt: now - 5_000,
      },
    };
  });

  const result = await alerts.listOperationalAlerts(agency.id, now);
  assert.equal(result.find(alert => alert.id === "finance:obligations-overdue")?.severity, "critical");
  assert.match(result.find(alert => alert.id === "finance:obligations-overdue")?.title ?? "", /1 finance obligation is overdue/);
  assert.equal(result.find(alert => alert.id === "finance:people-payments-due")?.severity, "critical");
  assert.equal(destination(result.find(alert => alert.id === "finance:people-payments-due")?.href), "/portal/agency/agency-finance/operations");
});

test("a missed instalment resolves to a multi-step collect plan via the canonical payment-plan key", async () => {
  // Regression: resolutionPlans read `client.metadata.paymentPlans`, but plans
  // are persisted under `client.metadata.clientPaymentPlans` (client-payment-
  // plans route + every other reader). The mismatched key meant the resolver
  // never found the plan and silently returned null — the "Collect …" steps and
  // the instalment evidence never appeared on a payment-plan alert.
  await storage.reset();
  const now = Date.parse("2026-08-14T12:00:00Z");
  const DAY = 86_400_000;
  const agency = tenants.createAgency({ name: "Instalments", slug: "instalment-resolution" });
  const client = tenants.createClient(agency.id, {
    name: "Retainer Client",
    metadata: {
      clientPaymentPlans: [{
        id: "plan-1",
        title: "Website build",
        currency: "gbp",
        status: "active",
        customerVisible: true,
        createdAt: now - 30 * DAY,
        updatedAt: now - 30 * DAY,
        milestones: [
          { id: "m-deposit", title: "Deposit", amountCents: 40_000, dueAt: now - 5 * DAY, status: "invoiced" },
          { id: "m-launch", title: "Launch", amountCents: 60_000, dueAt: now + 20 * DAY, status: "planned" },
        ],
      }],
    },
  });

  const alertId = `payment-plan:${client.id}:plan-1:m-deposit`;

  const plan = await resolution.resolutionPlanFor(agency.id, alertId);
  assert.ok(plan, "resolver must find the plan under the canonical clientPaymentPlans key");
  assert.match(plan!.title, /Collect .*Deposit/);
  assert.equal(plan!.steps.length, 2);
  assert.ok(plan!.steps.some(step => step.focus === "payment"), "a step must record the payment");

  const evidence = await resolution.resolutionEvidenceFor(agency.id, alertId, now);
  assert.ok(evidence, "instalment evidence must resolve from the canonical key too");
  assert.match(evidence!.summary, /instalment on Retainer Client/);

  // Proof we read the RIGHT key, not just any key: nothing persists under the
  // legacy `paymentPlans`, so a resolver still reading it would return non-null
  // here. Post-fix it reads `clientPaymentPlans` (absent) → null.
  const legacyOnly = tenants.createClient(agency.id, {
    name: "Legacy Key",
    metadata: {
      paymentPlans: [{
        id: "plan-x", title: "X", currency: "gbp", status: "active", customerVisible: true,
        createdAt: now, updatedAt: now,
        milestones: [{ id: "m-x", title: "X", amountCents: 1, dueAt: now, status: "planned" }],
      }],
    },
  });
  assert.equal(await resolution.resolutionPlanFor(agency.id, `payment-plan:${legacyOnly.id}:plan-x:m-x`), null);
});

test("live notifications are exposed to global workspace search", () => {
  const search = readFileSync("src/app/api/portal/search/route.ts", "utf8");
  const searchUi = readFileSync("src/components/chrome/PortalSearch.tsx", "utf8");
  assert.match(search, /listOperationalAlerts\(agencyId\)/);
  assert.match(search, /category: "Notification"/);
  assert.match(searchUi, /category === "Notification"/);
});

test("live alerts mark the relevant sidebar destination without making every area noisy", () => {
  const panels = [{
    id: "main",
    label: "",
    order: 0,
    items: [
      { id: "actions", label: "Actions", href: "/portal/agency/actions" },
      { id: "inbox", label: "Master inbox", href: "/portal/agency/inbox" },
      { id: "marketing", label: "Marketing", href: "/portal/agency/marketing" },
      { id: "finance", label: "Finance", href: "/portal/agency/agency-finance" },
      { id: "sop-library", label: "SOP library", href: "/portal/agency/sop-library" },
    ],
  }];
  const now = Date.parse("2026-08-11T12:00:00Z");
  const marked = sidebarAttention.addSidebarAttention(panels, [
    { id: "task:one", severity: "warning", category: "task", title: "Task", detail: "Overdue", href: "/portal/agency/actions", occurredAt: now },
    { id: "task:two", severity: "critical", category: "task", title: "Task", detail: "Overdue", href: "/portal/agency/actions", occurredAt: now },
    { id: "message:one", severity: "notice", category: "support", title: "Support", detail: "Reply", href: "/portal/agency/inbox?view=support", occurredAt: now },
    { id: "budget:one", severity: "warning", category: "money", title: "Budget", detail: "Review", href: "/portal/agency/agency-finance/budgets", occurredAt: now },
  ]);

  const items = marked[0].items;
  assert.equal(items.find(item => item.id === "actions")?.attentionCount, 2);
  assert.equal(items.find(item => item.id === "inbox")?.attentionCount, 1);
  assert.equal(items.find(item => item.id === "finance")?.attentionCount, 1);
  assert.equal(items.find(item => item.id === "marketing")?.attentionCount, undefined);
  assert.equal(items.find(item => item.id === "sop-library")?.attentionCount, undefined);
});

test("pending external AI proposals feed Actions attention and parked proposals stay quiet", async () => {
  await storage.reset();
  const agency = tenants.createAgency({ name: "Proposal notifications", slug: "proposal-notifications" });
  const proposal = proposals.submitExternalAssistantActionProposal({
    agencyId: agency.id,
    assistantFingerprint: "assistant-fingerprint",
    assistantName: "External strategist",
    title: "Review the oldest enquiry",
    detail: "A website enquiry is outside the response target.",
    priority: "urgent",
    sourceHref: "/portal/agency/inbox?view=forms",
  });

  const pendingAlerts = await alerts.listOperationalAlerts(agency.id);
  const proposalAlert = pendingAlerts.find(alert => alert.id === `external-proposal:${proposal.id}`);
  assert.equal(proposalAlert?.severity, "critical");
  assert.equal(proposalAlert?.category, "task");
  assert.equal(destination(proposalAlert?.href), `/portal/agency/actions#external-proposal-${proposal.id}`);

  const marked = sidebarAttention.addSidebarAttention([{
    id: "main",
    label: "",
    order: 0,
    items: [{ id: "actions", label: "Actions", href: "/portal/agency/actions" }],
  }], pendingAlerts);
  assert.equal(marked[0].items[0].attentionCount, 1);

  proposals.decideExternalAssistantActionProposal({
    agencyId: agency.id,
    proposalId: proposal.id,
    decision: "park",
    actorUserId: "owner-user",
    parkedUntil: Date.now() + 86_400_000,
  });
  const parkedAlerts = await alerts.listOperationalAlerts(agency.id);
  assert.equal(parkedAlerts.some(alert => alert.id === `external-proposal:${proposal.id}`), false);
});

test("sidebar attention remains visible when collapsed and announces its count", () => {
  const nav = readFileSync("src/components/chrome/SidebarNavLink.tsx", "utf8");
  const provider = readFileSync("src/components/chrome/NotificationAttentionProvider.tsx", "utf8");
  assert.match(nav, /mm-sidebar-attention-dot/);
  assert.match(nav, /notification\$\{resolvedAttentionCount === 1/);
  assert.match(nav, /resolvedAttentionCount > 99 \? "99\+" : resolvedAttentionCount/);
  assert.match(nav, /attentionTitle\(visibleAttention\)/);
  assert.match(provider, /useUnresolvedAttentionMatches/);
});

test("open Actions keep a sidebar count until the underlying task is resolved", async () => {
  await storage.reset();
  const agency = tenants.createAgency({ name: "Persistent Actions", slug: "persistent-actions" });
  const task = tasks.createAgencyTask({
    agencyId: agency.id,
    title: "Send the proposal",
    priority: "high",
    createdBy: "owner-user",
  });
  const now = Date.now() + 1_000;
  const live = await alerts.listOperationalAlerts(agency.id, now);
  const taskAlert = live.find(alert => alert.id === `task:${task.id}`);
  assert.equal(taskAlert?.persistentUntilResolved, true);
  assert.match(taskAlert?.title ?? "", /Open action: Send the proposal/);

  alertPreferences.setOperationalAlertPreference({ agencyId: agency.id, userId: "owner-user", alert: taskAlert!, action: "read", now });
  const readViews = alertPreferences.listOperationalAlertViews(agency.id, "owner-user", live, now);
  const readTask = readViews.find(alert => alert.id === taskAlert?.id);
  assert.equal(readTask?.attention, false);
  assert.equal(readTask?.persistentUntilResolved, true);

  const marked = sidebarAttention.addSidebarAttention([{
    id: "main",
    label: "",
    order: 0,
    items: [{ id: "actions", label: "Actions", href: "/portal/agency/actions" }],
  }], readViews.filter(alert => alert.attention || (alert.persistentUntilResolved && alert.state !== "parked")));
  assert.equal(marked[0].items[0].attentionCount, 1);

  tasks.updateAgencyTask(agency.id, task.id, { status: "done" }, "owner-user");
  const resolved = await alerts.listOperationalAlerts(agency.id, now + 1_000);
  assert.equal(resolved.some(alert => alert.id === taskAlert?.id), false);
});

test("read, parked, dismissed, and changed alerts have durable attention semantics", async () => {
  await storage.reset();
  const now = Date.parse("2026-08-12T08:00:00Z");
  const agency = tenants.createAgency({ name: "Attention State", slug: "attention-state" });
  const userId = "founder_attention";
  const alert = {
    id: "task:attention",
    severity: "warning" as const,
    category: "task" as const,
    title: "Reply to Ed",
    detail: "The response is overdue.",
    href: "/portal/agency/actions",
    occurredAt: now - 1_000,
  };

  assert.equal(alertPreferences.listOperationalAlertViews(agency.id, userId, [alert], now)[0].attention, true);

  alertPreferences.setOperationalAlertPreference({ agencyId: agency.id, userId, alert, action: "read", now });
  const read = alertPreferences.listOperationalAlertViews(agency.id, userId, [alert], now);
  assert.equal(read[0].state, "read");
  assert.equal(read[0].attention, false);

  alertPreferences.setOperationalAlertPreference({ agencyId: agency.id, userId, alert, action: "park", parkedUntil: now + 60_000, now });
  assert.equal(alertPreferences.listOperationalAlertViews(agency.id, userId, [alert], now)[0].state, "parked");
  assert.equal(alertPreferences.listOperationalAlertViews(agency.id, userId, [alert], now + 61_000)[0].attention, true);

  alertPreferences.setOperationalAlertPreference({ agencyId: agency.id, userId, alert, action: "dismiss", now });
  assert.equal(alertPreferences.listOperationalAlertViews(agency.id, userId, [alert], now).length, 0);
  assert.equal(alertPreferences.listOperationalAlertViews(agency.id, userId, [{ ...alert, occurredAt: now + 1 }], now + 1)[0].attention, true);
});

test("workspace tab destinations expose shared attention points", () => {
  const provider = readFileSync("src/components/chrome/NotificationAttentionProvider.tsx", "utf8");
  const inbox = readFileSync("src/app/portal/agency/inbox/_MasterInbox.tsx", "utf8");
  const finance = readFileSync("src/built-ins/modules/agency-finance/src/components/FinanceNav.tsx", "utf8");
  const development = readFileSync("src/app/portal/agency/development/_DevelopmentNav.tsx", "utf8");
  const clientTabs = readFileSync("src/app/portal/clients/[clientId]/_OverviewTabs.tsx", "utf8");
  const sidebarNav = readFileSync("src/components/chrome/SidebarNavLink.tsx", "utf8");
  assert.match(provider, /export function AttentionDot/);
  assert.match(provider, /title=\{title\}/);
  assert.match(inbox, /attentionHref="\/portal\/agency\/inbox\?view=forms"/);
  assert.match(inbox, /<span>Resolve<\/span>/);
  assert.match(inbox, /Remind later/);
  assert.match(inbox, /Dismiss/);
  assert.match(finance, /<AttentionDot href=\{href\}/);
  assert.match(development, /<AttentionDot href=\{item.href\}/);
  assert.match(clientTabs, /<AttentionDot href=\{href\}/);
  assert.match(sidebarNav, /clientAttentionSpec/);
  assert.match(sidebarNav, /allForClient/);
  assert.match(sidebarNav, /clientId: clientAttention\?\.clientId/);
  assert.match(provider, /navId\.startsWith\("client-"\) \? belongsToClient : true/);
  assert.match(provider, /!clientId \|\| operationalAlertBelongsToClient\(alert, clientId\)/);
  assert.match(sidebarNav, /categories: \["support", "meeting"\]/);
});

test("attention links resolve to the narrowest matching workspace tab", () => {
  const financeAlert = { id: "finance", severity: "warning" as const, category: "money" as const, title: "Receipt needed", detail: "Attach evidence", href: "/portal/agency/agency-finance/expenses?evidence=missing", occurredAt: 1 };
  const clientAlert = { id: "client", severity: "notice" as const, category: "client" as const, title: "Portal ready", detail: "Review access", href: "/portal/clients/one?tab=fulfilment", occurredAt: 1 };
  assert.equal(operationalAlertMatchesHref(financeAlert, "/portal/agency/agency-finance/expenses"), true);
  assert.equal(operationalAlertMatchesHref(financeAlert, "/portal/agency/agency-finance"), false);
  assert.equal(operationalAlertMatchesHrefPrefix(clientAlert, "/portal/clients?tab=fulfilment"), true);
  assert.equal(operationalAlertMatchesHrefPrefix(clientAlert, "/portal/clients?tab=finance"), false);
  assert.equal(operationalAlertBelongsToClient({ ...clientAlert, clientId: "one" }, "one"), true);
  assert.equal(operationalAlertBelongsToClient({ ...clientAlert, clientId: "two" }, "one"), false);
  assert.equal(operationalAlertBelongsToClient({ ...clientAlert, clientId: undefined }, "one"), true);
});

test("unread owner direct messages + @mentions surface as a Needs-attention alert", async () => {
  const now = Date.parse("2026-08-10T09:00:00Z");
  const agency = tenants.createAgency({ name: "Chat Attention", slug: "chat-attention-alerts" });
  const { createUser } = await import("../src/server/users");
  const people = await import("../src/server/people");
  const owner = createUser({ email: "owner@chat-alert.test", password: "Smoke-pass-123!", name: "Ed Founder", role: "agency-owner", agencyId: agency.id });
  const sam = createUser({ email: "sam@chat-alert.test", password: "Smoke-pass-123!", name: "Sam Taylor", role: "agency-staff", agencyId: agency.id });

  // Sam sends Ed a direct message → an unread direct for the owner.
  const direct = people.ensureDirectChannel(agency.id, owner.id, sam.id);
  people.postPeopleMessage({ agencyId: agency.id, channelId: direct.id, authorUserId: sam.id, body: "Hi Ed, can you review the quote?" });

  const result = await alerts.listOperationalAlerts(agency.id, now);
  const chatAlert = result.find(alert => alert.id === "people:chat-attention");
  assert.ok(chatAlert, "chat-attention alert is present in the operational alert list");
  assert.equal(chatAlert.kind, "in-app");
  assert.equal(destination(chatAlert.href), "/portal/agency/people?view=chat");
  assert.match(chatAlert.title, /team chat message/);

  // Reading the channel clears the alert (its own resolution path).
  people.markChannelRead(agency.id, direct.id, owner.id);
  const cleared = await alerts.listOperationalAlerts(agency.id, now);
  assert.equal(cleared.find(alert => alert.id === "people:chat-attention"), undefined);
});
