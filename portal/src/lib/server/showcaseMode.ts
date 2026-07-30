import "server-only";

import { containerFor as leadsContainerFor } from "@aqua/plugin-leads-pipeline/server";
import { installPlugin } from "@/built-ins/runtime/_runtime";
import { ensureDefaultAgencyProducts } from "@/server/agencyProducts";
import { bootstrapAgency } from "@/server/agencyBootstrap";
import { createClientMilestone } from "@/server/clientMilestones";
import { updateCompanyProfile } from "@/server/company";
import { createPerformanceExperiment } from "@/server/performanceExperiments";
import { getInstall } from "@/server/pluginInstalls";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { addCard, getPipelineBySlug } from "@/server/pipelines";
import { createWrittenSop } from "@/server/sops";
import { ensureHydrated, getState, mutate } from "@/server/storage";
import { createAgencyTask, updateAgencyTask } from "@/server/tasks";
import { createClient, getAgencyBySlug } from "@/server/tenants";
import { ensureAgencyWebsite, updateAgencyWebsite } from "@/server/agencyWebsite";
import type { ClientTelemetryEvent } from "@/lib/clientTelemetry";
import type { Agency } from "@/server/types";

export const SHOWCASE_AGENCY_SLUG = "milesymedia-showcase";
export const SHOWCASE_AGENCY_NAME = "Milesymedia Showcase";

const SYSTEM_ACTOR = "showcase-system";
const DAY = 86_400_000;

export async function resetAndSeedShowcaseWorkspace(): Promise<Agency> {
  await ensureHydrated();
  resetShowcaseWorkspace();

  const { agency } = await bootstrapAgency({
    name: SHOWCASE_AGENCY_NAME,
    slug: SHOWCASE_AGENCY_SLUG,
    ownerEmail: "hello@milesymedia.example",
    brand: {
      primaryColor: "#0F766E",
      secondaryColor: "#1F2937",
      accentColor: "#C79A52",
      fontHeading: "ui-sans-serif, system-ui",
      fontBody: "ui-sans-serif, system-ui",
      borderRadius: "8px",
    },
  }, SYSTEM_ACTOR);

  await installPlugin("agency-finance", {
    scope: { agencyId: agency.id },
    installedBy: SYSTEM_ACTOR,
  });
  await installPlugin("agency-marketing", {
    scope: { agencyId: agency.id },
    installedBy: SYSTEM_ACTOR,
  });

  const now = Date.now();
  const northstar = createClient(agency.id, {
    name: "Northstar Studio",
    slug: "northstar-studio",
    ownerEmail: "maya@northstar.example",
    websiteUrl: "https://northstar.example",
    stage: "development",
    metadata: {
      entityType: "company",
      businessName: "Northstar Studio",
      contactName: "Maya Reed",
      niche: "Interior design",
      leadSource: "Referral",
      lastContactedAt: now - 2 * DAY,
      lockInPaid: true,
      clientHealth: "excellent",
      portalEnabled: true,
      portalServicePlan: "Website build + care plan",
      properties: [showcaseProperty("northstar-site", "Northstar website", "website", "https://northstar.example")],
      telemetryEvents: showcaseTelemetry("northstar-site", "https://northstar.example", now, 46, 4),
      linkedContacts: [
        { id: "northstar-maya", name: "Maya Reed", role: "Founder", email: "maya@northstar.example", phone: "020 7946 0101" },
        { id: "northstar-sam", name: "Sam Cole", role: "Operations", email: "sam@northstar.example", phone: "020 7946 0102" },
      ],
    },
  });
  const harbour = createClient(agency.id, {
    name: "Harbour & Pine",
    slug: "harbour-and-pine",
    ownerEmail: "alex@harbourpine.example",
    websiteUrl: "https://harbourpine.example",
    stage: "design",
    metadata: {
      entityType: "company",
      businessName: "Harbour & Pine",
      contactName: "Alex Morgan",
      niche: "Independent hospitality",
      leadSource: "Google Business Profile",
      lastContactedAt: now - DAY,
      lockInPaid: true,
      clientHealth: "excellent",
      portalEnabled: true,
      portalServicePlan: "Brand identity + photography",
      linkedContacts: [
        { id: "harbour-alex", name: "Alex Morgan", role: "Owner", email: "alex@harbourpine.example", phone: "0161 496 0201" },
      ],
    },
  });
  const fieldnote = createClient(agency.id, {
    name: "Fieldnote Coffee",
    slug: "fieldnote-coffee",
    ownerEmail: "jordan@fieldnote.example",
    websiteUrl: "https://fieldnote.example",
    stage: "live",
    metadata: {
      entityType: "company",
      businessName: "Fieldnote Coffee",
      contactName: "Jordan Ellis",
      niche: "Food and drink",
      leadSource: "Instagram",
      lastContactedAt: now - 3 * DAY,
      lockInPaid: true,
      clientHealth: "excellent",
      portalEnabled: true,
      portalServicePlan: "Ecommerce + monthly growth",
      properties: [showcaseProperty("fieldnote-store", "Fieldnote online store", "ecommerce", "https://fieldnote.example")],
      telemetryEvents: showcaseTelemetry("fieldnote-store", "https://fieldnote.example", now, 82, 9),
      linkedContacts: [
        { id: "fieldnote-jordan", name: "Jordan Ellis", role: "Director", email: "jordan@fieldnote.example", phone: "0117 496 0301" },
      ],
    },
  });
  const clients = [
    northstar,
    harbour,
    fieldnote,
    createClient(agency.id, {
      name: "Atlas Fitness",
      slug: "atlas-fitness-client",
      ownerEmail: "sam@atlasfitness.example",
      websiteUrl: "https://atlasfitness.example",
      stage: "live",
      metadata: successfulClientMetadata({
        businessName: "Atlas Fitness",
        contactName: "Sam Walker",
        niche: "Health and fitness",
        leadSource: "Referral",
        plan: "Website + lead generation",
        now,
        property: showcaseProperty("atlas-site", "Atlas Fitness website", "website", "https://atlasfitness.example"),
        telemetry: showcaseTelemetry("atlas-site", "https://atlasfitness.example", now, 67, 7),
      }),
    }),
    createClient(agency.id, {
      name: "Willow Dental",
      slug: "willow-dental-client",
      ownerEmail: "ruth@willowdental.example",
      websiteUrl: "https://willowdental.example",
      stage: "live",
      metadata: successfulClientMetadata({
        businessName: "Willow Dental",
        contactName: "Ruth Bennett",
        niche: "Dental",
        leadSource: "Local scouting",
        plan: "Website + local search",
        now,
        property: showcaseProperty("willow-site", "Willow Dental website", "website", "https://willowdental.example"),
        telemetry: showcaseTelemetry("willow-site", "https://willowdental.example", now, 91, 12),
      }),
    }),
    createClient(agency.id, {
      name: "Common Ground Bakery",
      slug: "common-ground-bakery-client",
      ownerEmail: "mia@commonground.example",
      websiteUrl: "https://commonground.example",
      stage: "development",
      metadata: successfulClientMetadata({
        businessName: "Common Ground Bakery",
        contactName: "Mia Clarke",
        niche: "Food and drink",
        leadSource: "Website enquiry",
        plan: "Ecommerce launch",
        now,
        property: showcaseProperty("common-ground-site", "Common Ground preview", "ecommerce", "https://preview.commonground.example", "preview"),
        telemetry: showcaseTelemetry("common-ground-site", "https://preview.commonground.example", now, 24, 3),
      }),
    }),
    createClient(agency.id, {
      name: "Evergreen Legal",
      slug: "evergreen-legal",
      ownerEmail: "nina@evergreenlegal.example",
      websiteUrl: "https://evergreenlegal.example",
      stage: "live",
      metadata: successfulClientMetadata({
        businessName: "Evergreen Legal",
        contactName: "Nina Shah",
        niche: "Professional services",
        leadSource: "Google Ads",
        plan: "Website + care plan",
        now,
        property: showcaseProperty("evergreen-site", "Evergreen Legal website", "website", "https://evergreenlegal.example"),
        telemetry: showcaseTelemetry("evergreen-site", "https://evergreenlegal.example", now, 58, 8),
      }),
    }),
    createClient(agency.id, {
      name: "Lumen Architecture",
      slug: "lumen-architecture",
      ownerEmail: "leo@lumenarchitecture.example",
      websiteUrl: "https://lumenarchitecture.example",
      stage: "design",
      metadata: successfulClientMetadata({
        businessName: "Lumen Architecture",
        contactName: "Leo Grant",
        niche: "Architecture",
        leadSource: "Client referral",
        plan: "Brand + portfolio website",
        now,
      }),
    }),
  ];

  const products = ensureDefaultAgencyProducts(agency.id);
  const websiteProduct = products.find(product => product.name.toLowerCase().includes("website"));
  const photographyProduct = products.find(product => product.name.toLowerCase().includes("photography"));

  const launchSop = createWrittenSop({
    agencyId: agency.id,
    title: "Showcase website launch checklist",
    content: "Fictional showcase content. Confirm approvals, domain, analytics, backups, accessibility, and handover before launch.",
    category: "Delivery",
    tags: ["showcase", "website"],
    actorUserId: SYSTEM_ACTOR,
  });

  const completedTask = createAgencyTask({
    agencyId: agency.id,
    title: "Publish June client performance reports",
    notes: "Every care-plan client received a clear commercial performance summary.",
    priority: "normal",
    dueAt: now - DAY,
    assigneeUserId: undefined,
    sopIds: [launchSop.id],
    createdBy: SYSTEM_ACTOR,
  });
  updateAgencyTask(agency.id, completedTask.id, { status: "done" }, SYSTEM_ACTOR);
  createAgencyTask({
    agencyId: agency.id,
    title: "Approve Common Ground launch checklist",
    notes: "Final quality review before the production release.",
    priority: "normal",
    dueAt: now + 2 * DAY,
    sopIds: [launchSop.id],
    createdBy: SYSTEM_ACTOR,
  });
  createAgencyTask({
    agencyId: agency.id,
    title: "Monthly client health review",
    notes: "Review performance, support response and the next commercial opportunity.",
    priority: "normal",
    dueAt: now + 5 * DAY,
    recurrence: "monthly",
    createdBy: SYSTEM_ACTOR,
  });

  createClientMilestone(agency.id, northstar.id, {
    title: "Interactive prototype approved",
    description: "Desktop and mobile routes approved before development.",
    status: "complete",
    progress: 100,
    sortOrder: 0,
  }, SYSTEM_ACTOR);
  createClientMilestone(agency.id, northstar.id, {
    title: "Production build launched",
    description: "Core pages, CMS and analytics shipped successfully.",
    status: "complete",
    progress: 100,
    sortOrder: 1,
  }, SYSTEM_ACTOR);
  createClientMilestone(agency.id, harbour.id, {
    title: "Brand direction",
    description: "Select the preferred identity route.",
    status: "complete",
    progress: 100,
    sortOrder: 0,
  }, SYSTEM_ACTOR);
  createClientMilestone(agency.id, fieldnote.id, {
    title: "First 100 online orders",
    description: "Track the first post-launch commercial milestone.",
    status: "complete",
    progress: 100,
    sortOrder: 0,
  }, SYSTEM_ACTOR);

  updateCompanyProfile(agency.id, {
    mission: "Make ambitious small businesses feel brilliantly supported online.",
    vision: "A calm, transparent agency where every client can see progress and value.",
    values: ["Clarity", "Craft", "Momentum", "Care"],
    monthlyRevenueTargetCents: 1_500_000,
    averageDealValueCents: 420_000,
    salesCallCloseRatePercent: 48,
    annualRevenueTargetCents: 18_000_000,
    objectives: [
      { id: "showcase-revenue", title: "Monthly revenue target", metric: "Revenue", currentValue: 18600, targetValue: 15000, unit: "GBP", status: "complete" },
      { id: "showcase-retention", title: "Client retention", metric: "Retained clients", currentValue: 98, targetValue: 95, unit: "%", status: "complete" },
      { id: "showcase-delivery", title: "Projects delivered on time", metric: "On-time projects", currentValue: 100, targetValue: 95, unit: "%", status: "complete" },
      { id: "showcase-rating", title: "Client experience", metric: "Average rating", currentValue: 4.9, targetValue: 4.8, unit: "/ 5", status: "complete" },
    ],
    plans: [
      { id: "showcase-plan-1", title: "Protect delivery quality while scaling", horizon: "now", status: "active", owner: "Ed", notes: "Keep every active project on time and every client informed." },
      { id: "showcase-plan-2", title: "Grow recurring revenue to £25k", horizon: "next", status: "active", owner: "Ed", notes: "Expand care plans through measurable client outcomes." },
    ],
  }, SYSTEM_ACTOR);

  const leadPipeline = getPipelineBySlug(agency.id, "leads");
  const leadsInstall = getInstall({ agencyId: agency.id }, "leads-pipeline");
  if (leadPipeline && leadsInstall?.enabled) {
    const { leads: leadRecords, campaigns } = leadsContainerFor({
      agencyId: agency.id,
      storage: makePluginStorage(leadsInstall.id) as never,
    });
    const cedar = await leadRecords.upsert({
      name: "Cedar Dental",
      email: "hello@cedardental.example",
      phone: "0121 496 0401",
      source: "Local scouting",
      tags: ["dental", "scouting"],
      capturedAt: now - DAY,
    }, SYSTEM_ACTOR);
    const summit = await leadRecords.upsert({
      name: "Summit Physio",
      email: "team@summitphysio.example",
      phone: "020 7946 0402",
      company: "Summit Physio",
      source: "Referral",
      tags: ["fitness", "meeting-booked"],
      capturedAt: now - 5 * DAY,
    }, SYSTEM_ACTOR);
    await leadRecords.update(summit.lead.id, {
      nextMeetingAt: now + 2 * DAY,
      meetingMode: "google-meet",
      meetingLink: "https://meet.google.com/showcase-summit",
      meetingStatus: "confirmed",
      meetingConfirmedAt: now,
      meetingNotes: "Discovery and proposal walkthrough.",
      salesPresentations: [{
        id: "showcase-summit-proposal",
        title: "Website growth proposal",
        url: "https://example.com/summit-physio-proposal",
      }],
    }, SYSTEM_ACTOR);
    const meridian = await leadRecords.upsert({
      name: "Meridian Kitchens",
      email: "owner@meridiankitchens.example",
      phone: "0113 496 0403",
      company: "Meridian Kitchens",
      source: "Google Ads",
      tags: ["home-improvement", "proposal"],
      capturedAt: now - 9 * DAY,
    }, SYSTEM_ACTOR);
    addCard(agency.id, leadPipeline.id, {
      kind: "lead",
      columnId: "scouting",
      lead: { name: "Cedar Dental", email: "hello@cedardental.example", phone: "0121 496 0401", source: "Local scouting", capturedAt: now - DAY },
    });
    addCard(agency.id, leadPipeline.id, {
      kind: "lead",
      columnId: "meeting",
      lead: { name: "Summit Physio", email: "team@summitphysio.example", phone: "020 7946 0402", source: "Referral", capturedAt: now - 5 * DAY },
    });
    addCard(agency.id, leadPipeline.id, {
      kind: "lead",
      columnId: "proposal",
      lead: { name: "Meridian Kitchens", email: "owner@meridiankitchens.example", phone: "0113 496 0403", source: "Google Ads", capturedAt: now - 9 * DAY },
    });
    const campaign = await campaigns.create({
      name: "Local growth stories",
      channel: "google-ads",
      sourceKey: "Google Ads",
      budgetCents: 240000,
      spendCents: 198400,
      attributedRevenueCents: 1260000,
      startsAt: now - 42 * DAY,
      endsAt: now - 2 * DAY,
      externalUrl: "https://ads.google.com/",
      notes: "Fictional showcase campaign with profitable client acquisition.",
      audienceFilter: {},
    }, SYSTEM_ACTOR);
    await campaigns.update(campaign.id, { status: "completed" }, SYSTEM_ACTOR);
  }

  mutate(state => {
    state.clientDelight["showcase-care-1"] = {
      id: "showcase-care-1",
      agencyId: agency.id,
      clientId: fieldnote.id,
      recipientName: "Jordan Ellis",
      occasion: "milestone",
      title: "First 100 orders celebration",
      status: "delivered",
      dueAt: now - 6 * DAY,
      budgetCents: 7500,
      costCents: 6900,
      supplier: "The Good Gift Studio",
      notes: "Fictional showcase record.",
      createdAt: now,
      updatedAt: now,
    };
    if (websiteProduct) {
      state.clients[northstar.id]!.metadata = {
        ...state.clients[northstar.id]!.metadata,
        productIds: [websiteProduct.id],
      };
    }
    if (photographyProduct) {
      state.clients[harbour.id]!.metadata = {
        ...state.clients[harbour.id]!.metadata,
        productIds: [photographyProduct.id],
      };
    }
  });

  const marketingInstall = getInstall({ agencyId: agency.id }, "agency-marketing");
  if (marketingInstall) {
    await makePluginStorage(marketingInstall.id).set("milesymedia/channel-assets/v1", [
      showcaseMarketingAsset(agency.id, "google-ads", "High-intent local search", "Google Ads", 240000, 198400, 38, 9, now),
      showcaseMarketingAsset(agency.id, "social", "Founder-led growth stories", "Instagram", 50000, 31800, 64, 11, now),
      showcaseMarketingAsset(agency.id, "funnel", "Free digital health check", "Milesymedia", 80000, 54200, 91, 24, now),
      {
        ...showcaseMarketingAsset(agency.id, "reputation", "Client review programme", "Google Business Profile", 0, 0, 0, 18, now),
        rating: 4.9,
        reviewCount: 47,
        unansweredReviews: 0,
      },
    ]);
  }

  const experiment = createPerformanceExperiment(agency.id, {
    name: "Homepage consultation CTA",
    hypothesis: "A specific outcome-led CTA will create more qualified conversations.",
    primaryMetric: "Consultation requests",
    status: "complete",
    variants: [
      { id: "control", name: "Let's talk", visitors: 1280, conversions: 64 },
      { id: "winner", name: "Plan my next move", visitors: 1314, conversions: 103 },
    ],
  }, SYSTEM_ACTOR);

  const agencyWebsite = ensureAgencyWebsite(agency.id);
  updateAgencyWebsite(agency.id, {
    status: "live",
    productionUrl: "https://milesymedia.example",
    previewUrl: "https://preview.milesymedia.example",
    repositoryUrl: "https://github.com/milesymedia/showcase-website",
  }, SYSTEM_ACTOR);
  mutate(state => {
    const website = state.agencyWebsites[agency.id] ?? agencyWebsite;
    website.telemetryEvents = showcaseTelemetry(
      "milesymedia-website",
      "https://milesymedia.example",
      now,
      118,
      16,
      experiment.id,
    );
    website.telemetryLastSeenAt = now - 4 * 60_000;
    website.updatedAt = now;
    state.agencyWebsites[agency.id] = website;
  });

  seedShowcaseFinance(agency.id, clients, now);
  return agency;
}

export function resetShowcaseWorkspace(): void {
  const agency = getAgencyBySlug(SHOWCASE_AGENCY_SLUG);
  if (!agency) return;
  const agencyId = agency.id;
  mutate(state => {
    const clientIds = new Set(Object.values(state.clients)
      .filter(client => client.agencyId === agencyId)
      .map(client => client.id));
    const pipelineIds = new Set(Object.values(state.pipelines)
      .filter(pipeline => pipeline.agencyId === agencyId)
      .map(pipeline => pipeline.id));

    for (const [id, item] of Object.entries(state.clients)) if (item.agencyId === agencyId) delete state.clients[id];
    for (const [id, item] of Object.entries(state.endCustomers)) if (item.agencyId === agencyId) delete state.endCustomers[id];
    for (const [key, item] of Object.entries(state.users)) if (item.agencyId === agencyId) delete state.users[key];
    for (const [id, item] of Object.entries(state.pluginInstalls)) {
      if (item.agencyId !== agencyId) continue;
      delete state.pluginInstalls[id];
      delete state.pluginData[id];
    }
    for (const [id, item] of Object.entries(state.phases)) if (item.agencyId === agencyId) delete state.phases[id];
    for (const [id, item] of Object.entries(state.pipelines)) if (item.agencyId === agencyId) delete state.pipelines[id];
    for (const [id, item] of Object.entries(state.pipelineCards)) if (pipelineIds.has(item.pipelineId)) delete state.pipelineCards[id];
    for (const [id, item] of Object.entries(state.tasks)) if (item.agencyId === agencyId) delete state.tasks[id];
    for (const [id, item] of Object.entries(state.sops)) if (item.agencyId === agencyId) delete state.sops[id];
    for (const [id, item] of Object.entries(state.agencyProducts)) if (item.agencyId === agencyId) delete state.agencyProducts[id];
    for (const [id, item] of Object.entries(state.clientMilestones)) if (item.agencyId === agencyId || clientIds.has(item.clientId)) delete state.clientMilestones[id];
    for (const [id, item] of Object.entries(state.clientDelight)) if (item.agencyId === agencyId) delete state.clientDelight[id];
    for (const [id, item] of Object.entries(state.performanceExperiments)) if (item.agencyId === agencyId) delete state.performanceExperiments[id];
    for (const [id, item] of Object.entries(state.developmentResources)) if (item.agencyId === agencyId) delete state.developmentResources[id];
    for (const [id, item] of Object.entries(state.developmentWorkflows)) if (item.agencyId === agencyId) delete state.developmentWorkflows[id];
    delete state.agencyWebsites[agencyId];
    delete state.agencySettings[agencyId];
    delete state.portalEditor[agencyId];
    delete state.companyProfiles[agencyId];
    for (const [id, item] of Object.entries(state.legalDocuments)) if (item.agencyId === agencyId) delete state.legalDocuments[id];
    for (const key of Object.keys(state.assistant ?? {})) if (key.startsWith(`${agencyId}|`)) delete state.assistant![key];
    state.activity = state.activity.filter(item => item.agencyId !== agencyId);
    delete state.agencies[agencyId];
  });
}

function seedShowcaseFinance(agencyId: string, clients: Array<{ id: string; name: string }>, now: number): void {
  const install = getInstall({ agencyId }, "agency-finance");
  if (!install) return;
  mutate(state => {
    const data = state.pluginData[install.id] ?? {};
    const invoiceAmounts = [420000, 280000, 180000, 240000, 195000, 360000, 145000, 210000];
    const invoices = clients.map((client, index) => showcaseInvoice(
      agencyId,
      client.id,
      index + 1,
      invoiceAmounts[index] ?? 180000,
      now - (index + 2) * DAY,
    ));
    data["invoices/index"] = invoices.map(item => item.id);
    for (const invoice of invoices) {
      data[`invoices/by-id/${invoice.id}`] = invoice;
      data[`invoices/by-client/${invoice.clientId}`] = [
        ...new Set([...(data[`invoices/by-client/${invoice.clientId}`] as string[] ?? []), invoice.id]),
      ];
    }
    data["income/index"] = ["showcase-income-001", "showcase-income-002"];
    data["income/by-id/showcase-income-001"] = {
      id: "showcase-income-001",
      agencyId,
      clientId: clients[0]?.id,
      title: "Discovery workshop",
      category: "Consulting",
      amountCents: 35000,
      currency: "gbp",
      method: "bank-transfer",
      receivedAt: now - 28 * DAY,
      notes: "Fictional non-invoice income.",
      createdBy: SYSTEM_ACTOR,
      createdAt: now - 28 * DAY,
      updatedAt: now - 28 * DAY,
    };
    data["income/by-id/showcase-income-002"] = {
      id: "showcase-income-002",
      agencyId,
      title: "Paid strategy workshop",
      category: "Consulting",
      amountCents: 95000,
      currency: "gbp",
      method: "stripe",
      receivedAt: now - 8 * DAY,
      notes: "Fictional showcase income.",
      createdBy: SYSTEM_ACTOR,
      createdAt: now - 8 * DAY,
      updatedAt: now - 8 * DAY,
    };
    data["expenses/index"] = ["showcase-expense-001", "showcase-expense-002", "showcase-expense-003"];
    data["expenses/by-id/showcase-expense-001"] = {
      id: "showcase-expense-001",
      agencyId,
      clientId: clients[0]?.id,
      categoryId: "showcase-software",
      vendor: "Prototype Cloud",
      description: "Client prototyping workspace",
      reason: "Fictional delivery cost for Showcase Mode.",
      amountCents: 2900,
      netCents: 2417,
      taxCents: 483,
      taxDeductible: true,
      businessUsePercent: 100,
      billableToClient: true,
      currency: "gbp",
      incurredAt: now - 7 * DAY,
      status: "reimbursed",
      paymentMethod: "card",
      createdAt: now - 7 * DAY,
      updatedAt: now - 7 * DAY,
    };
    data["expenses/by-id/showcase-expense-002"] = showcaseExpense(agencyId, "showcase-expense-002", "Cloud hosting", "Infrastructure", 18400, now - 11 * DAY);
    data["expenses/by-id/showcase-expense-003"] = showcaseExpense(agencyId, "showcase-expense-003", "Photography studio", "Delivery", 32000, now - 16 * DAY, clients[1]?.id);
    data["categories/index"] = ["showcase-software", "showcase-infrastructure", "showcase-delivery"];
    data["categories/by-id/showcase-software"] = {
      id: "showcase-software",
      agencyId,
      name: "Software",
      isDefault: true,
      status: "active",
      description: "SaaS subscriptions and project tools",
      createdAt: now - 30 * DAY,
      updatedAt: now - 30 * DAY,
    };
    data["categories/by-id/showcase-infrastructure"] = {
      id: "showcase-infrastructure",
      agencyId,
      name: "Infrastructure",
      isDefault: false,
      status: "active",
      description: "Hosting, monitoring and production services",
      createdAt: now - 30 * DAY,
      updatedAt: now - 30 * DAY,
    };
    data["categories/by-id/showcase-delivery"] = {
      id: "showcase-delivery",
      agencyId,
      name: "Client delivery",
      isDefault: false,
      status: "active",
      description: "Direct costs required to deliver client work",
      createdAt: now - 30 * DAY,
      updatedAt: now - 30 * DAY,
    };
    state.pluginData[install.id] = data;
  });
}

interface SuccessfulClientMetadataInput {
  businessName: string;
  contactName: string;
  niche: string;
  leadSource: string;
  plan: string;
  now: number;
  property?: Record<string, unknown>;
  telemetry?: ClientTelemetryEvent[];
}

function successfulClientMetadata(input: SuccessfulClientMetadataInput): Record<string, unknown> {
  return {
    entityType: "company",
    businessName: input.businessName,
    contactName: input.contactName,
    niche: input.niche,
    leadSource: input.leadSource,
    lastContactedAt: input.now - 2 * DAY,
    lockInPaid: true,
    clientHealth: "excellent",
    portalEnabled: true,
    portalServicePlan: input.plan,
    properties: input.property ? [input.property] : [],
    telemetryEvents: input.telemetry ?? [],
    files: [
      { id: `${input.businessName}-brand`, name: "Approved brand kit", category: "brand" },
      { id: `${input.businessName}-handover`, name: "Project handover", category: "deliverable" },
    ],
    portalApprovals: [{ id: `${input.businessName}-approval`, status: "approved" }],
    clientRequests: [{ id: `${input.businessName}-request`, status: "closed", type: "suggestion" }],
    linkedContacts: [{
      id: `${input.businessName}-primary`,
      name: input.contactName,
      role: "Primary contact",
    }],
  };
}

function showcaseProperty(
  id: string,
  label: string,
  kind: string,
  url: string,
  status = "live",
): Record<string, unknown> {
  return {
    id,
    label,
    kind,
    status,
    repoUrl: `https://github.com/milesymedia/${id}`,
    liveUrl: status === "live" ? url : undefined,
    previewUrl: status !== "live" ? url : undefined,
    tagStatus: "installed",
    repositoryStatus: "connected",
    deploymentStatus: "ready",
    lastDeployedAt: Date.now() - 4 * DAY,
  };
}

function showcaseTelemetry(
  propertyId: string,
  baseUrl: string,
  now: number,
  views24h: number,
  conversions28d: number,
  experimentId?: string,
): ClientTelemetryEvent[] {
  const events: ClientTelemetryEvent[] = [];
  for (let index = 0; index < views24h; index += 1) {
    const occurredAt = now - (index + 1) * Math.floor(DAY / (views24h + 2));
    events.push({
      id: `${propertyId}-view-${index}`,
      type: "pageview",
      propertyId,
      url: `${baseUrl}${index % 3 === 0 ? "/services" : index % 3 === 1 ? "/work" : "/"}`,
      path: index % 3 === 0 ? "/services" : index % 3 === 1 ? "/work" : "/",
      referrer: index % 2 === 0 ? "https://www.google.com/" : "https://www.instagram.com/",
      sessionId: `${propertyId}-session-${Math.floor(index / 2)}`,
      occurredAt,
      receivedAt: occurredAt + 120,
    });
  }
  for (let index = 0; index < 28; index += 1) {
    const occurredAt = now - index * DAY - 3_600_000;
    events.push({
      id: `${propertyId}-search-${index}`,
      type: "search",
      propertyId,
      query: index % 2 === 0 ? "best local business website" : "trusted digital studio",
      impressions: 110 + index * 4,
      clicks: 14 + (index % 8),
      position: 2.8 + (index % 3) * 0.2,
      occurredAt,
      receivedAt: occurredAt + 100,
    });
  }
  for (let index = 0; index < conversions28d; index += 1) {
    const occurredAt = now - (index % 27) * DAY - 7_200_000;
    events.push({
      id: `${propertyId}-conversion-${index}`,
      type: "conversion",
      propertyId,
      path: "/contact",
      formName: "Consultation request",
      sessionId: `${propertyId}-conversion-session-${index}`,
      conversionValueCents: 85000,
      experimentId,
      variant: experimentId ? "winner" : undefined,
      occurredAt,
      receivedAt: occurredAt + 140,
    });
  }
  events.push(
    {
      id: `${propertyId}-performance`,
      type: "performance",
      propertyId,
      metric: "load",
      value: 724,
      occurredAt: now - 12 * 60_000,
      receivedAt: now - 11 * 60_000,
    },
    {
      id: `${propertyId}-heartbeat`,
      type: "heartbeat",
      propertyId,
      occurredAt: now - 4 * 60_000,
      receivedAt: now - 4 * 60_000,
    },
    {
      id: `${propertyId}-deployment`,
      type: "deployment",
      propertyId,
      release: "2026.07-success",
      environment: "production",
      occurredAt: now - 4 * DAY,
      receivedAt: now - 4 * DAY,
    },
  );
  return events.sort((left, right) => right.occurredAt - left.occurredAt);
}

function showcaseMarketingAsset(
  agencyId: string,
  kind: "social" | "website" | "funnel" | "google-ads" | "reputation",
  name: string,
  platform: string,
  budgetCents: number,
  spendCents: number,
  leads: number,
  conversions: number,
  now: number,
): Record<string, unknown> {
  return {
    id: `showcase-${kind}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    agencyId,
    kind,
    name,
    platform,
    objective: "Create qualified conversations and profitable client relationships.",
    owner: "Ed",
    status: "active",
    budgetCents,
    spendCents,
    leads,
    conversions,
    notes: "Fictional success data for Showcase Mode.",
    createdAt: now - 60 * DAY,
    updatedAt: now - DAY,
  };
}

function showcaseInvoice(
  agencyId: string,
  clientId: string,
  index: number,
  subtotalCents: number,
  issuedAt: number,
): Record<string, unknown> {
  const taxCents = Math.round(subtotalCents * 0.2);
  return {
    id: `showcase-invoice-${String(index).padStart(3, "0")}`,
    agencyId,
    clientId,
    number: `SHOW-2026-${String(index).padStart(3, "0")}`,
    issuedAt,
    dueAt: issuedAt + 14 * DAY,
    lineItems: [{ description: index % 2 ? "Digital product delivery" : "Monthly growth and care plan", quantity: 1, unitCents: subtotalCents, totalCents: subtotalCents }],
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
    currency: "gbp",
    status: "paid",
    paidAt: issuedAt + 2 * DAY,
    paidVia: index % 2 ? "stripe" : "bank-transfer",
    notes: "Fictional paid invoice for Showcase Mode.",
    createdAt: issuedAt,
    updatedAt: issuedAt + 2 * DAY,
  };
}

function showcaseExpense(
  agencyId: string,
  id: string,
  description: string,
  categoryId: string,
  amountCents: number,
  incurredAt: number,
  clientId?: string,
): Record<string, unknown> {
  return {
    id,
    agencyId,
    clientId,
    categoryId: `showcase-${categoryId.toLowerCase()}`,
    vendor: description,
    description,
    reason: "Fictional operating cost for Showcase Mode.",
    amountCents,
    netCents: Math.round(amountCents / 1.2),
    taxCents: amountCents - Math.round(amountCents / 1.2),
    taxDeductible: true,
    businessUsePercent: 100,
    billableToClient: Boolean(clientId),
    currency: "gbp",
    incurredAt,
    status: "reimbursed",
    paymentMethod: "card",
    createdAt: incurredAt,
    updatedAt: incurredAt,
  };
}
