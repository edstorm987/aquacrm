// End-to-end agency buying journey smoke.
//
// Proves the repeatable Milesymedia process:
// lead -> meeting/context -> client portal -> paid invoice -> build files
// -> client feedback/support/offboarding requests -> live handover.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import type { ClientRequest } from "../src/app/api/tenants/client-requests/route";
import type { ClientApproval } from "../src/app/api/tenants/client-approvals/route";
import type { ActivityEntry, PluginInstallScope } from "../src/server/types";
import type { PluginStorage } from "../src/built-ins/modules/leads-pipeline/src/lib/aquaPluginTypes";
import type {
  ActivityLogPort as LeadsActivityLogPort,
  EventBusPort as LeadsEventBusPort,
} from "../src/built-ins/modules/leads-pipeline/src/server/ports";
import type {
  ActivityLogPort as FinanceActivityLogPort,
  EventBusPort as FinanceEventBusPort,
  PluginInstallStorePort,
  TenantPort,
  UserPort,
} from "../src/built-ins/modules/agency-finance/src/server/ports";

process.env.PORTAL_BACKEND = "memory";
process.env.NODE_ENV = "test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ACTOR_EMAIL = "ed@journey-smoke.test";
const ACTOR_ID = "user_journey_smoke";
const require = createRequire(import.meta.url);

function allowServerModulesInNodeSmoke(): void {
  const serverOnlyPath = require.resolve("server-only");
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
    children: [],
    paths: [],
  } as NodeJS.Module;
}

function buildJourneyMetadata(source: {
  id: string;
  email: string;
  source: string;
  capturedAt?: number;
  phone?: string;
  notes?: string;
  nextMeetingAt?: number;
  meetingLink?: string;
  meetingNotes?: string;
  callRecordingUrl?: string;
  sessionNotes?: string;
  inspirationLinks?: string[];
  potentialProblems?: string;
  potentialSolutions?: string;
  pricePoints?: string;
  budgetRange?: string;
  designFeedback?: string;
  supportNotes?: string;
  tags: string[];
}, planTier = "foundational") {
  return {
    leadId: source.id,
    leadSource: source.source,
    leadCapturedAt: source.capturedAt,
    phone: source.phone,
    notes: source.notes,
    nextMeetingAt: source.nextMeetingAt,
    meetingLink: source.meetingLink,
    meetingNotes: source.meetingNotes,
    callRecordingUrl: source.callRecordingUrl,
    sessionNotes: source.sessionNotes,
    inspirationLinks: source.inspirationLinks,
    potentialProblems: source.potentialProblems,
    potentialSolutions: source.potentialSolutions,
    pricePoints: source.pricePoints,
    budgetRange: source.budgetRange,
    designFeedback: source.designFeedback,
    supportNotes: source.supportNotes,
    tags: source.tags,
    planTier,
    portalLoginEmail: source.email,
    buyingJourney: {
      source: source.source,
      capturedAt: source.capturedAt,
      meetingAt: source.nextMeetingAt,
      meetingLink: source.meetingLink,
      callRecordingUrl: source.callRecordingUrl,
      sessionNotes: source.sessionNotes,
      inspirationLinks: source.inspirationLinks ?? [],
      potentialProblems: source.potentialProblems,
      potentialSolutions: source.potentialSolutions,
      pricePoints: source.pricePoints,
      budgetRange: source.budgetRange,
      notes: source.notes,
    },
  };
}

function makeActivity(): LeadsActivityLogPort & FinanceActivityLogPort & { entries: ActivityEntry[] } {
  const entries: ActivityEntry[] = [];
  let seq = 1;
  return {
    entries,
    logActivity(input) {
      const entry: ActivityEntry = {
        id: `act_${seq++}`,
        ts: Date.now(),
        agencyId: input.agencyId,
        clientId: input.clientId,
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail,
        category: input.category,
        action: input.action,
        message: input.message,
        metadata: input.metadata,
      };
      entries.push(entry);
      return entry;
    },
    listActivity(filter) {
      return entries.filter(e => e.agencyId === filter.agencyId && (!filter.clientId || e.clientId === filter.clientId));
    },
  };
}

function makeEvents(): LeadsEventBusPort & FinanceEventBusPort {
  return { emit() {} };
}

describe("Milesymedia client journey", () => {
  it("carries a buyer from lead to live client with portal, payment, files, feedback, and support state", async () => {
    allowServerModulesInNodeSmoke();
    assert.equal(process.env.PORTAL_BACKEND, "memory", "journey smoke must not write to the local portal data file");
    const { ensureHydrated } = await import("../src/server/storage");
    const { createAgency, getClientForAgency, updateClient, createClient } = await import("../src/server/tenants");
    const { createUser, getUser } = await import("../src/server/users");
    const { upsertInstall, getInstall } = await import("../src/server/pluginInstalls");
    const { makePluginStorage } = await import("../src/lib/server/pluginStorage");
    const { setupClientStarterPortal } = await import("../src/server/clientPortalSetup");
    const { customerVisibleInvoices } = await import("../src/app/portal/customer/_portalData");
    const { buildLeadsPipelineContainer } = await import("../src/built-ins/modules/leads-pipeline/src/server/index");
    const { buildAgencyFinanceContainer } = await import("../src/built-ins/modules/agency-finance/src/server/index");

    await ensureHydrated();
    const agency = createAgency({
      name: "Milesymedia Journey Smoke",
      slug: `journey-smoke-${Date.now()}`,
      ownerEmail: ACTOR_EMAIL,
    });
    createUser({
      email: ACTOR_EMAIL,
      name: "Ed Hallam",
      password: "Smoke-pass-123!",
      role: "agency-owner",
      agencyId: agency.id,
    });

    const activity = makeActivity();
    const events = makeEvents();
    const leadsInstall = upsertInstall({
      pluginId: "leads-pipeline",
      scope: { agencyId: agency.id },
      enabled: true,
      config: {},
      features: {},
      installedBy: ACTOR_ID,
    });
    const leads = buildLeadsPipelineContainer({
      agencyId: agency.id,
      storage: makePluginStorage(leadsInstall.id) as PluginStorage,
      activity,
      events,
      tenant: { getAgency: id => id === agency.id ? agency : null },
      pluginInstalls: { getInstall: () => null },
    });

    const created = await leads.leads.upsert({
      email: "buyer@example.com",
      name: "Jane Buyer",
      phone: "+447700900123",
      company: "Buyer Studio",
      tags: ["warm", "website", "google-profile"],
      source: "manual-smoke",
      notes: "Wants a clean website, Google profile photography, and a client portal.",
    }, ACTOR_ID);
    assert.equal(created.created, true);

    const meetingAt = Date.now() + 86_400_000;
    const lead = await leads.leads.update(created.lead.id, {
      nextMeetingAt: meetingAt,
      meetingLink: "https://meet.example.com/buyer-studio",
      meetingNotes: "Discovery call booked. Wants to see first-page website examples.",
      callRecordingUrl: "https://drive.example.com/call-recording.mp4",
      sessionNotes: "They sell premium local services. Main blocker is time and old website trust.",
      inspirationLinks: [
        "https://example.com/inspiration/homepage",
        "https://example.com/inspiration/booking-flow",
      ],
      potentialProblems: "No clear offer, weak Google profile, no support process, slow lead response.",
      potentialSolutions: "Landing page, Google profile refresh, booking CTA, outage/support tag, client portal.",
      pricePoints: "Setup fee plus performance upside.",
      budgetRange: "GBP 1,500-3,000 setup, then monthly support.",
      designFeedback: "Likes white space, muted browns, simple Apple-style UI.",
      supportNotes: "Needs support once live, especially uptime and change requests.",
    }, ACTOR_ID);
    assert.ok(lead);

    await leads.contacts.promoteLead(lead!, ACTOR_ID);
    const client = createClient(agency.id, {
      name: lead!.company || lead!.name || lead!.email,
      ownerEmail: lead!.email,
      stage: "aqua-epic-intro",
      metadata: buildJourneyMetadata(lead!),
    });
    const clientUser = createUser({
      email: lead!.email,
      name: lead!.name ?? lead!.email,
      password: "Temp-client-pass-123!",
      role: "end-customer",
      agencyId: agency.id,
      clientId: client.id,
      mustChangePassword: true,
    });
    assert.equal(clientUser.role, "end-customer");

    const portalSetup = await setupClientStarterPortal({
      agencyId: agency.id,
      clientId: client.id,
      actor: ACTOR_ID,
      metadata: {
        phase: "Epic Intro",
        planTier: "Foundational Flow",
        therapistName: lead!.name,
        practiceName: lead!.company,
      },
    });
    assert.equal(portalSetup.ok, true);

    const clientAfterPortal = getClientForAgency(agency.id, client.id);
    assert.ok(clientAfterPortal);
    assert.equal(clientAfterPortal.metadata?.callRecordingUrl, "https://drive.example.com/call-recording.mp4");
    assert.equal(clientAfterPortal.metadata?.portalProvisioningSource, "built-in");
    assert.equal(clientAfterPortal.metadata?.portalShellVersion, "milesymedia-customer-home-v2");
    assert.equal(getUser("buyer@example.com", { clientId: client.id, role: "end-customer" })?.clientId, client.id);
    assert.equal(getInstall({ agencyId: agency.id, clientId: client.id }, "website-editor"), null);

    const financeInstall = upsertInstall({
      pluginId: "agency-finance",
      scope: { agencyId: agency.id },
      enabled: true,
      config: {},
      features: {},
      installedBy: ACTOR_ID,
    });
    const tenant: TenantPort = {
      getAgency: id => id === agency.id ? agency : null,
      getClientForAgency: (agencyId, clientId) => getClientForAgency(agencyId, clientId),
    };
    const pluginInstalls: PluginInstallStorePort = {
      getInstall: (scope: PluginInstallScope, pluginId: string) => getInstall(scope, pluginId),
    };
    const user: UserPort = { getUser: idOrEmail => getUser(idOrEmail) };
    const finance = buildAgencyFinanceContainer({
      agencyId: agency.id,
      storage: makePluginStorage(financeInstall.id) as never,
      activity,
      events,
      tenant,
      user,
      pluginInstalls,
    });
    const invoice = await finance.invoices.create({
      clientId: client.id,
      dueAt: Date.now() + 7 * 86_400_000,
      currency: "gbp",
      lineItems: [
        { description: "Website build and client portal setup", quantity: 1, unitCents: 250_000 },
        { description: "Google profile photography", quantity: 1, unitCents: 50_000 },
      ],
      notes: "Attached to the converted buyer journey.",
    }, ACTOR_ID, "gbp");
    assert.equal(customerVisibleInvoices([invoice]).length, 0, "draft invoices must remain private");

    const sent = await finance.invoices.update(invoice.id, { status: "sent" }, ACTOR_ID);
    assert.equal(sent?.status, "sent");
    assert.ok(sent);
    assert.equal(customerVisibleInvoices([sent]).length, 1, "issued invoice must appear in customer billing");
    assert.equal(customerVisibleInvoices([sent])[0]?.id, invoice.id);

    const payment = await finance.payments.record(ACTOR_ID, {
      invoiceId: invoice.id,
      amountCents: invoice.totalCents,
      currency: "gbp",
      method: "bank-transfer",
      notes: "Paid in full during smoke journey.",
    });
    assert.equal(payment.settled, true);
    assert.equal(payment.invoice.status, "paid");
    assert.equal(customerVisibleInvoices([payment.invoice])[0]?.status, "paid", "payment state must reach customer billing");

    const files = [
      { id: "file_call", name: "Discovery call recording", url: "https://drive.example.com/call-recording.mp4", category: "recording", uploadedBy: ACTOR_EMAIL, uploadedAt: Date.now() },
      { id: "file_pdf", name: "Discovery PDF", url: "https://drive.example.com/discovery.pdf", category: "brief", uploadedBy: ACTOR_EMAIL, uploadedAt: Date.now() },
      { id: "file_inspo", name: "Homepage inspiration", url: "https://example.com/inspiration/homepage", category: "inspiration", uploadedBy: "buyer@example.com", uploadedAt: Date.now() },
      { id: "file_preview", name: "Website preview screenshot", url: "https://drive.example.com/preview.png", category: "preview", uploadedBy: ACTOR_EMAIL, uploadedAt: Date.now() },
      { id: "file_invoice", name: payment.invoice.number, url: `https://billing.example.com/${invoice.id}`, category: "invoice", uploadedBy: ACTOR_EMAIL, uploadedAt: Date.now() },
    ];
    const requests: ClientRequest[] = [
      { id: "req_design", type: "design-feedback", message: "Can the hero use more white space?", link: "https://figma.example.com/mock", status: "open", submittedBy: "buyer@example.com", submittedAt: Date.now() },
      { id: "req_support", type: "support-ticket", message: "Please watch launch analytics and outage alerts.", status: "open", submittedBy: "buyer@example.com", submittedAt: Date.now() },
      { id: "req_move", type: "move-provider", message: "If we move provider later, please package handover files.", status: "open", submittedBy: "buyer@example.com", submittedAt: Date.now() },
      { id: "req_cancel", type: "cancel", message: "Cancellation request flow test.", status: "open", submittedBy: "buyer@example.com", submittedAt: Date.now() },
    ];

    updateClient(agency.id, client.id, {
      stage: "development",
      metadata: {
        files,
        clientRequests: requests,
        portalBrief: {
          businessOverview: "A premium local service business.",
          primaryGoal: "Generate qualified enquiries.",
          idealCustomer: "Quality-led local buyers.",
          mustHaves: "Portfolio, bookings and service packages.",
          launchTiming: "October",
          submittedAt: Date.now(),
          submittedBy: "buyer@example.com",
        },
        portalApprovals: [
          {
            id: "approval_design",
            type: "design",
            title: "Design approval",
            detail: "Approve the design before build.",
            status: "approved",
            requestedAt: Date.now() - 1_000,
            requestedBy: ACTOR_EMAIL,
            respondedAt: Date.now(),
            respondedBy: "buyer@example.com",
            responseNote: "Approved to build.",
          } satisfies ClientApproval,
        ],
        latestPreviewUrl: "https://preview.example.com/buyer-studio",
        liveAnalyticsUrl: "https://analytics.example.com/buyer-studio",
        milesyTagInstalled: true,
        milesyTagSnippet: '<script src="https://portal.aquacrm.com/aqua-tag.js" data-client="buyer-studio"></script>',
        supportRoles: ["owner", "developer", "support"],
      },
    });
    const inBuild = getClientForAgency(agency.id, client.id);
    assert.equal(inBuild?.stage, "development");
    assert.equal(inBuild?.metadata?.milesyTagInstalled, true);
    assert.equal((inBuild?.metadata?.files as unknown[]).length, 5);
    assert.equal((inBuild?.metadata?.clientRequests as ClientRequest[]).some(r => r.type === "cancel"), true);
    assert.equal((inBuild?.metadata?.clientRequests as ClientRequest[]).some(r => r.type === "move-provider"), true);
    assert.equal(
      (inBuild?.metadata?.portalBrief as { primaryGoal?: string }).primaryGoal,
      "Generate qualified enquiries.",
    );
    assert.equal(
      (inBuild?.metadata?.portalApprovals as ClientApproval[])[0]?.status,
      "approved",
    );

    updateClient(agency.id, client.id, {
      stage: "live",
      websiteUrl: "https://buyer-studio.example.com",
      endCustomers: { postLoginReturnUrl: "https://buyer-studio.example.com/client-area" },
      metadata: {
        productionHandoverUrl: "https://github.com/example/buyer-studio",
        separateFromMilesymediaFiles: true,
      },
    });
    const live = getClientForAgency(agency.id, client.id);
    assert.equal(live?.stage, "live");
    assert.equal(live?.websiteUrl, "https://buyer-studio.example.com");
    assert.equal(live?.endCustomers?.postLoginReturnUrl, "https://buyer-studio.example.com/client-area");
    assert.equal(live?.metadata?.separateFromMilesymediaFiles, true);

    const filesRoute = readFileSync(join(ROOT, "src", "app", "api", "tenants", "client-files", "route.ts"), "utf8");
    assert.ok(filesRoute.includes("CLIENT_ROLES"), "client users must be allowed to add ideas/inspiration/design feedback");
    assert.ok(filesRoute.includes('"recording"'));
    assert.ok(filesRoute.includes('"design-feedback"'));

    const requestsRoute = readFileSync(join(ROOT, "src", "app", "api", "tenants", "client-requests", "route.ts"), "utf8");
    assert.ok(requestsRoute.includes('"cancel"'));
    assert.ok(requestsRoute.includes('"move-provider"'));
    assert.ok(requestsRoute.includes("CLIENT_ROLES"));

    const briefRoute = readFileSync(join(ROOT, "src", "app", "api", "tenants", "customer-project-brief", "route.ts"), "utf8");
    assert.ok(briefRoute.includes("portalBrief"));
    assert.ok(briefRoute.includes('"end-customer"'));

    const approvalsRoute = readFileSync(join(ROOT, "src", "app", "api", "tenants", "client-approvals", "route.ts"), "utf8");
    assert.ok(approvalsRoute.includes('"design"'));
    assert.ok(approvalsRoute.includes('"launch"'));
    assert.ok(approvalsRoute.includes('"request-changes"'));
  });
});
