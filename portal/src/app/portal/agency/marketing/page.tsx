import Link from "next/link";
import { Activity, ArrowLeft, ArrowUpRight, BarChart3, Building2, Gauge, Globe2, LayoutDashboard, LockKeyhole, MapPin, Megaphone, RadioTower, Star, Target, UserRoundSearch, Users, Workflow } from "lucide-react";

import { CampaignsWorkspace } from "@/app/portal/agency/leads-pipeline/campaigns/_CampaignsWorkspace";
import { AutomationsWorkspace } from "@/app/portal/agency/automations/_AutomationsWorkspace";
import { automationWorkspaceData } from "@/app/portal/agency/automations/_automationWorkspaceData";
import { MarketingChannelsWorkspace, type MarketingAssetKind } from "./_MarketingChannelsWorkspace";
import { CustomerProfilesWorkspace } from "./_CustomerProfilesWorkspace";
import { FunnelsWorkspace } from "./_FunnelsWorkspace";
import {
  MARKETING_CUSTOMER_PROFILES_KEY,
  type MarketingAsset,
  type MarketingCustomerProfile,
} from "@/built-ins/modules/agency-marketing/src/lib/domain";
import { installPlugin, setPluginEnabled } from "@/built-ins/runtime/_runtime";
import { buildBudgetPotSnapshots } from "@/built-ins/modules/agency-finance/src/lib/budgetHealth";
import { ensureAgencyFinanceFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/agencyFinanceFoundation";
import { ensureLeadsPipelineFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/leadsPipelineFoundation";
import { requireRole } from "@/lib/server/auth";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";
import { getPipelineBySlug } from "@/server/pipelines";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { listClients } from "@/server/tenants";
import { listTradingCompanies } from "@/server/tradingCompanies";
import type { TradingCompany } from "@/server/types";
import { containerFor as financeContainerFor } from "@aqua/plugin-agency-finance/server";
import { containerFor as leadsContainerFor } from "@aqua/plugin-leads-pipeline/server";
import { ensureAgencyWebsite, summarizeAgencyWebsite } from "@/server/agencyWebsite";
import { FIRST_PARTY_DEVELOPMENT_PROJECTS } from "@/lib/firstPartyDevelopmentProjects";
import { listInboxConnections } from "@/lib/server/inboxStore";
import { metaInboxReadiness } from "@/lib/server/metaMessaging";
import { listAutomationWorkflows } from "@/server/automations";

const LEADS_PLUGIN = "leads-pipeline";
const FINANCE_PLUGIN = "agency-finance";
const EMAIL_PLUGIN = "email-sender";
const MARKETING_PLUGIN = "agency-marketing";
const MARKETING_ASSETS_KEY = "milesymedia/channel-assets/v1";
type MarketingView = "overview" | "campaigns" | "customer-profiles" | "social" | "website" | "funnels" | "google-ads" | "google-business" | "reputation" | "sources" | "automations";

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; brand?: string; compose?: string }>;
}) {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const params = await searchParams;
  const requestedView = params.view;
  const view: MarketingView = isMarketingView(requestedView) ? requestedView : "overview";

  if (view === "automations") {
    const automationData = await automationWorkspaceData(session.agencyId, session.role);
    return (
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-black/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand"><LockKeyhole size={13} aria-hidden /> Internal only</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-black/90">Marketing workspace</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">Automate internal demand, follow-up, publishing, handovers, reminders and reporting across the CRM. These controls are never exposed to clients.</p>
            <Link href="/portal/agency/marketing" className="mt-3 inline-flex min-h-9 items-center gap-2 text-xs font-semibold text-brand hover:underline"><ArrowLeft size={14} /> Back to marketing dashboard</Link>
          </div>
          <div className="flex items-center gap-3 rounded-md border border-black/10 bg-black/[0.025] px-4 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-white text-brand shadow-sm"><Workflow size={17} aria-hidden /></span>
            <div><p className="text-[10px] font-semibold uppercase tracking-wide text-black/40">Scope</p><p className="text-sm font-semibold text-black/75">Internal · All brands</p></div>
          </div>
        </header>
        <MarketingWorkspaceNavigation view={view} brandScope="all" />
        <AutomationsWorkspace {...automationData} embedded />
      </div>
    );
  }

  ensureLeadsPipelineFoundationRegistered();

  let install = getInstall({ agencyId: session.agencyId }, LEADS_PLUGIN);
  if (!install) {
    const result = await installPlugin(LEADS_PLUGIN, {
      scope: { agencyId: session.agencyId },
      installedBy: session.userId,
    });
    if (result.ok) install = result.install;
  } else if (!install.enabled) {
    await setPluginEnabled({ agencyId: session.agencyId }, LEADS_PLUGIN, true);
    install = getInstall({ agencyId: session.agencyId }, LEADS_PLUGIN);
  }
  if (!install) return <p className="text-sm text-red-700">Marketing records could not be opened.</p>;

  let emailInstall = getInstall({ agencyId: session.agencyId }, EMAIL_PLUGIN);
  if (!emailInstall) {
    const result = await installPlugin(EMAIL_PLUGIN, {
      scope: { agencyId: session.agencyId },
      installedBy: session.userId,
    });
    if (result.ok) emailInstall = result.install;
  } else if (!emailInstall.enabled) {
    await setPluginEnabled({ agencyId: session.agencyId }, EMAIL_PLUGIN, true);
    emailInstall = getInstall({ agencyId: session.agencyId }, EMAIL_PLUGIN);
  }

  let marketingInstall = getInstall({ agencyId: session.agencyId }, MARKETING_PLUGIN);
  if (!marketingInstall) {
    const result = await installPlugin(MARKETING_PLUGIN, {
      scope: { agencyId: session.agencyId },
      installedBy: session.userId,
    });
    if (result.ok) marketingInstall = result.install;
  } else if (!marketingInstall.enabled) {
    await setPluginEnabled({ agencyId: session.agencyId }, MARKETING_PLUGIN, true);
    marketingInstall = getInstall({ agencyId: session.agencyId }, MARKETING_PLUGIN);
  }

  const { campaigns, leads } = leadsContainerFor({
    agencyId: session.agencyId,
    storage: makePluginStorage(install.id) as never,
  });
  const [campaignRows, leadRows] = await Promise.all([campaigns.list(), leads.list()]);
  const financeInstall = getInstall({ agencyId: session.agencyId }, FINANCE_PLUGIN);
  let budgetPotSnapshots = [] as ReturnType<typeof buildBudgetPotSnapshots>;
  if (financeInstall?.enabled) {
    ensureAgencyFinanceFoundationRegistered();
    const finance = financeContainerFor({
      agencyId: session.agencyId,
      storage: makePluginStorage(financeInstall.id) as never,
      install: financeInstall,
    });
    const [budgetPots, expenses, workforcePayments] = await Promise.all([finance.budgets.list(), finance.expenses.list(), finance.operations.listCompensationPayments()]);
    budgetPotSnapshots = buildBudgetPotSnapshots(budgetPots, campaignRows, expenses, workforcePayments);
  }
  const clients = listClients(session.agencyId);
  const attributedCampaigns = campaignRows.map(campaign => ({
    ...campaign,
    attributedLeads: campaign.sourceKey ? leadRows.filter(lead =>
      lead.source === campaign.sourceKey
      && recordBelongsToCampaign(lead.companyIds ?? (lead.companyId ? [lead.companyId] : []), campaign.companyIds)
    ).length : 0,
    attributedClients: campaign.sourceKey ? clients.filter(client => {
      const metadata = client.metadata as { leadSource?: string } | undefined;
      return metadata?.leadSource === campaign.sourceKey
        && recordBelongsToCampaign(client.companyId ? [client.companyId] : [], campaign.companyIds);
    }).length : 0,
  }));
  const pipeline = getPipelineBySlug(session.agencyId, "leads");
  const columns = pipeline?.columns.map(column => column.label) ?? ["New", "Contacted", "Qualified", "Won", "Lost"];
  const companies = listTradingCompanies(session.agencyId, true).filter(company => company.status !== "archived");
  const selectedCompany = companies.find(company => company.slug === params.brand) ?? null;
  const brandScope = params.brand === "shared" ? "shared" : selectedCompany?.slug ?? "all";
  const selectedCompanyId = selectedCompany?.id ?? null;
  const marketingStorage = marketingInstall ? makePluginStorage(marketingInstall.id) : null;
  const [marketingAssets, customerProfiles] = marketingStorage
    ? await Promise.all([
        marketingStorage.get<MarketingAsset[]>(MARKETING_ASSETS_KEY).then(rows => rows ?? []),
        marketingStorage.get<MarketingCustomerProfile[]>(MARKETING_CUSTOMER_PROFILES_KEY).then(rows => rows ?? []),
      ])
    : [[], []] as [MarketingAsset[], MarketingCustomerProfile[]];
  const scopedMarketingAssets = marketingAssets.filter(asset => recordMatchesBrand(asset.companyIds, brandScope, selectedCompanyId));
  const metaConnections = await listInboxConnections(session.agencyId).catch(() => []);
  const metaReadiness = metaInboxReadiness();
  const scopedCustomerProfiles = customerProfiles.filter(profile => recordMatchesBrand(profile.companyIds, brandScope, selectedCompanyId));
  const scopedCampaigns = attributedCampaigns.filter(campaign => recordMatchesBrand(campaign.companyIds, brandScope, selectedCompanyId));
  const scopedBudgetPots = budgetPotSnapshots.filter(pot =>
    pot.status === "active"
    && pot.currency === "gbp"
    && recordMatchesBrand(pot.companyIds, brandScope, selectedCompanyId),
  );
  const scopedLeads = leadRows.filter(lead => recordMatchesBrand(lead.companyIds ?? (lead.companyId ? [lead.companyId] : []), brandScope, selectedCompanyId));
  const scopedTags = [...new Set(scopedLeads.flatMap(lead => lead.tags))].sort();
  const scopedSources = [...new Set(scopedLeads.map(lead => lead.source || "Unknown"))].sort();
  const composeChannel = composeToChannel(params.compose);
  const sourceRows = scopedSources.map(source => {
    const rows = scopedLeads.filter(lead => (lead.source || "Unknown") === source);
    return {
      source,
      leads: rows.length,
      contacted: rows.filter(lead => lead.lastContactedAt || (lead.sentCount ?? 0) > 0).length,
      meetings: rows.filter(lead => lead.nextMeetingAt).length,
      converted: rows.filter(lead => lead.tags.includes("converted")).length,
    };
  }).sort((a, b) => b.leads - a.leads);
  const ownWebsite = ensureAgencyWebsite(session.agencyId);
  const ownWebsiteSummary = summarizeAgencyWebsite(ownWebsite);
  const companyOptions = companies.map(company => ({ id: company.id, name: company.name, slug: company.slug, colour: company.brand.primaryColor }));
  const defaultCompanyIds = selectedCompanyId ? [selectedCompanyId] : [];
  const selectedScopeLabel = selectedCompany?.name ?? (brandScope === "shared" ? "Group / shared" : "All brands");
  const overview = buildMarketingOverview({
    campaigns: scopedCampaigns,
    assets: scopedMarketingAssets,
    leads: scopedLeads,
    sourceRows,
    ownWebsiteSummary,
  });
  const automationWorkflows = listAutomationWorkflows(session.agencyId);

  if (view === "overview") {
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-7xl flex-col gap-6 pb-10">
        <header className="grid gap-5 border-b border-black/10 pb-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand"><LayoutDashboard size={13} aria-hidden /> Marketing dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-black/90">Marketing across the business</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">See demand, audiences, channels, campaigns and conversion movement before opening the tools used to change them.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <div className="flex min-w-[210px] items-center gap-3 rounded-md border border-black/10 bg-black/[0.025] px-4 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-white text-brand shadow-sm"><Building2 size={17} aria-hidden /></span>
              <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-black/40">Viewing</p><p className="truncate text-sm font-semibold text-black/75">{selectedScopeLabel}</p></div>
            </div>
            <Link href={marketingHref("campaigns", brandScope)} className="inline-flex min-h-12 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white hover:bg-black/85">
              Open marketing workspace <ArrowUpRight size={16} />
            </Link>
          </div>
        </header>

        <BrandScopeNavigation companies={companies} view="overview" activeScope={brandScope} />
        <MarketingOverviewDashboard
          overview={overview}
          brandScope={brandScope}
          sourceRows={sourceRows}
          campaigns={scopedCampaigns.slice(0, 5)}
          assets={scopedMarketingAssets}
          customerProfiles={scopedCustomerProfiles}
          emailSenderReady={Boolean(emailInstall?.enabled)}
          automationStats={{ total: automationWorkflows.length, active: automationWorkflows.filter(workflow => workflow.status === "active").length }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header className="grid gap-5 border-b border-black/10 pb-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand"><LockKeyhole size={13} aria-hidden /> Internal workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-black/90">Marketing workspace</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">Configure campaigns, audiences, channels, websites, funnels, advertising and reputation for the selected business.</p>
          <Link href={marketingHref("overview", brandScope)} className="mt-3 inline-flex min-h-9 items-center gap-2 text-xs font-semibold text-brand hover:underline"><ArrowLeft size={14} /> Back to dashboard</Link>
        </div>
        <div className="flex items-center gap-3 rounded-md border border-black/10 bg-black/[0.025] px-4 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-white text-brand shadow-sm"><Building2 size={17} aria-hidden /></span>
          <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-black/40">Viewing</p><p className="truncate text-sm font-semibold text-black/75">{selectedScopeLabel}</p></div>
        </div>
      </header>

      <BrandScopeNavigation companies={companies} view={view} activeScope={brandScope} />

      <MarketingWorkspaceNavigation view={view} brandScope={brandScope} />

      {view === "campaigns" ? (
        <div className="space-y-5">
          <CampaignQuickStarts brandScope={brandScope} />
          <CampaignsWorkspace
            campaigns={scopedCampaigns}
            availableTags={scopedTags}
            availableSources={scopedSources}
            pipelineColumns={columns}
            emailSenderReady={Boolean(emailInstall?.enabled)}
            companies={companyOptions}
            defaultCompanyIds={defaultCompanyIds}
            defaultChannel={composeChannel}
            budgetPots={scopedBudgetPots}
            customerProfiles={scopedCustomerProfiles}
            embedded
          />
        </div>
      ) : view === "customer-profiles" ? (
        <CustomerProfilesWorkspace profiles={scopedCustomerProfiles} companies={companyOptions} defaultCompanyIds={defaultCompanyIds} />
      ) : view === "sources" ? (
        <section aria-labelledby="lead-sources-heading">
          <div className="flex items-end justify-between border-b border-black/10 pb-3">
            <div>
              <h2 id="lead-sources-heading" className="text-lg font-semibold text-black/85">Lead sources</h2>
              <p className="mt-1 text-sm text-black/50">Where leads came from and what happened next.</p>
            </div>
            <Link href="/portal/agency/pipelines/leads" className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/65">Open leads</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b border-black/10 text-xs text-black/40">
                <tr>
                  <th className="py-3 pr-4 font-medium">Source</th>
                  <th className="px-3 py-3 text-right font-medium">Leads</th>
                  <th className="px-3 py-3 text-right font-medium">Contacted</th>
                  <th className="px-3 py-3 text-right font-medium">Meetings</th>
                  <th className="py-3 pl-3 text-right font-medium">Converted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.07]">
                {sourceRows.map(row => (
                  <tr key={row.source}>
                    <td className="py-4 pr-4 font-medium text-black/75">{sourceLabel(row.source)}</td>
                    <td className="px-3 py-4 text-right tabular-nums text-black/60">{row.leads}</td>
                    <td className="px-3 py-4 text-right tabular-nums text-black/60">{row.contacted}</td>
                    <td className="px-3 py-4 text-right tabular-nums text-black/60">{row.meetings}</td>
                    <td className="py-4 pl-3 text-right font-semibold tabular-nums text-black/75">{row.converted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sourceRows.length === 0 ? <p className="py-12 text-center text-sm text-black/40">Lead sources will appear when leads are added.</p> : null}
          </div>
        </section>
      ) : view === "funnels" ? (
        <FunnelsWorkspace
          assets={scopedMarketingAssets.filter(asset => asset.kind === "funnel")}
          companies={companyOptions}
          defaultCompanyIds={defaultCompanyIds}
          projects={FIRST_PARTY_DEVELOPMENT_PROJECTS.map(project => ({
            id: project.id,
            name: project.name,
            brand: project.brand,
            previewUrl: project.previewUrl,
            publicUrl: project.publicUrl,
            repositoryUrl: project.repositoryUrl,
            sourcePath: project.sourcePath,
          }))}
        />
      ) : view === "social" ? (
        <div className="space-y-7">
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-brand/20 bg-brand/[0.045] p-4">
            <div>
              <h2 className="text-sm font-semibold text-black/80">Plan the content before it goes live.</h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-black/50">Build the post once, inspect feed and story variants at their real proportions, and check crop and safe areas before approving it.</p>
            </div>
            <Link href={campaignComposerHref(brandScope, "social")} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white hover:bg-black/85">
              Create social content <ArrowUpRight size={15} />
            </Link>
          </section>
          <SocialBrandPlanner
            assets={scopedMarketingAssets.filter(asset => asset.kind === "social")}
            companies={companyOptions}
            activeScope={brandScope}
          />
          <MarketingChannelsWorkspace
            kind="social"
            assets={scopedMarketingAssets.filter(asset => asset.kind === "social")}
            companies={companyOptions}
            defaultCompanyIds={defaultCompanyIds}
            inboxConnections={metaConnections}
            metaConfigured={metaReadiness.configured}
            inboxReturnUrl={marketingHref("social", brandScope)}
          />
        </div>
      ) : view === "google-business" ? (
        <GoogleBusinessProfileWorkspace
          assets={scopedMarketingAssets.filter(asset => asset.kind === "reputation" && asset.platform === "Google Business Profile")}
          allReputationAssets={scopedMarketingAssets.filter(asset => asset.kind === "reputation")}
          companies={companyOptions}
          defaultCompanyIds={defaultCompanyIds}
          brandScope={brandScope}
        />
      ) : view === "website" ? (
        <div className="space-y-7">
          {brandScope === "all" || selectedCompany?.slug === "aquaoasis-web" ? <section className="border-y border-black/10">
            <div className="flex flex-wrap items-start justify-between gap-4 py-5">
              <div className="flex items-start gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-md bg-brand text-white"><Globe2 size={20} /></span>
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-black/85">AquaOasis-Web website</h2><span className="rounded-full bg-black/[0.045] px-2 py-1 text-[10px] font-semibold uppercase text-black/45">Owned channel</span></div>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-black/50">The same first-party website Development controls, viewed here as a marketing asset: traffic, conversion routes, public availability and the pages carrying the offer.</p>
                </div>
              </div>
              <Link href="/portal/agency/development/website" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white">Open website control <ArrowUpRight size={15} /></Link>
            </div>
            <div className="grid border-t border-black/10 sm:grid-cols-4">
              <WebsiteMetric icon={<RadioTower size={15} />} label="Public mode" value={ownWebsite.status === "live" ? "Live" : ownWebsite.status === "maintenance" ? "Maintenance" : "Redesign gate"} />
              <WebsiteMetric icon={<Activity size={15} />} label="Views today" value={String(ownWebsiteSummary.pageviews24h)} />
              <WebsiteMetric icon={<Activity size={15} />} label="Load time" value={ownWebsiteSummary.averageLoadMs ? `${ownWebsiteSummary.averageLoadMs} ms` : "Waiting"} />
              <WebsiteMetric icon={<RadioTower size={15} />} label="Tag" value={ownWebsite.telemetryLastSeenAt ? "Connected" : "Waiting"} />
            </div>
          </section> : null}
          <MarketingChannelsWorkspace
            kind="website"
            assets={scopedMarketingAssets.filter(asset => asset.kind === "website")}
            companies={companyOptions}
            defaultCompanyIds={defaultCompanyIds}
          />
        </div>
      ) : (
        <MarketingChannelsWorkspace
          kind={viewToAssetKind(view)}
          assets={scopedMarketingAssets.filter(asset => asset.kind === viewToAssetKind(view))}
          companies={companyOptions}
          defaultCompanyIds={defaultCompanyIds}
        />
      )}
    </div>
  );
}

function BrandScopeNavigation({ companies, view, activeScope }: { companies: TradingCompany[]; view: MarketingView; activeScope: string }) {
  return (
    <section aria-labelledby="brand-scope-heading">
      <div className="flex items-center justify-between gap-4">
        <div><h2 id="brand-scope-heading" className="text-sm font-semibold text-black/75">Brand scope</h2><p className="mt-0.5 text-xs text-black/45">Switch the whole workspace without splitting the CRM.</p></div>
        <Link href="/portal/agency/company" className="shrink-0 text-xs font-medium text-brand hover:underline">Manage brands</Link>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        <BrandScopeLink href={marketingHref(view, "all")} active={activeScope === "all"} label="All brands" colour="#111111" />
        <BrandScopeLink href={marketingHref(view, "shared")} active={activeScope === "shared"} label="Group / shared" colour="#8E7340" />
        {companies.map(company => <BrandScopeLink key={company.id} href={marketingHref(view, company.slug)} active={activeScope === company.slug} label={company.name} colour={company.brand.primaryColor} />)}
      </div>
    </section>
  );
}

interface MarketingOverview {
  campaigns: number;
  activeCampaigns: number;
  draftCampaigns: number;
  trackedAssets: number;
  activeAssets: number;
  leads: number;
  contacted: number;
  meetings: number;
  converted: number;
  spendCents: number;
  conversions: number;
  websiteViews: number;
}

function MarketingOverviewDashboard({
  overview,
  brandScope,
  sourceRows,
  campaigns,
  assets,
  customerProfiles,
  emailSenderReady,
  automationStats,
}: {
  overview: MarketingOverview;
  brandScope: string;
  sourceRows: Array<{ source: string; leads: number; contacted: number; meetings: number; converted: number }>;
  campaigns: Array<{ id: string; name: string; status: string; channel?: string; kind?: string; attributedLeads?: number; attributedClients?: number; spendCents?: number }>;
  assets: MarketingAsset[];
  customerProfiles: MarketingCustomerProfile[];
  emailSenderReady: boolean;
  automationStats: { total: number; active: number };
}) {
  const channelRows = ([
    ["social", "Social media", (asset: MarketingAsset) => asset.kind === "social"],
    ["website", "Websites", (asset: MarketingAsset) => asset.kind === "website"],
    ["funnels", "Funnels", (asset: MarketingAsset) => asset.kind === "funnel"],
    ["google-ads", "Google Ads", (asset: MarketingAsset) => asset.kind === "google-ads"],
    ["google-business", "Google Business Profile", (asset: MarketingAsset) => asset.kind === "reputation" && asset.platform === "Google Business Profile"],
    ["reputation", "Reputation", (asset: MarketingAsset) => asset.kind === "reputation"],
  ] as const).map(([view, label, matches]) => {
    const rows = assets.filter(matches);
    return {
      view,
      label,
      tracked: rows.length,
      active: rows.filter(asset => asset.status === "active").length,
      leads: rows.reduce((sum, asset) => sum + asset.leads, 0),
      conversions: rows.reduce((sum, asset) => sum + asset.conversions, 0),
    };
  });
  const activeProfiles = customerProfiles.filter(profile => profile.status === "active").length;
  const validatedProfiles = customerProfiles.filter(profile => profile.evidenceConfidence === "validated").length;
  const leadToMeetingRate = overview.leads > 0 ? Math.round(overview.meetings / overview.leads * 100) : 0;
  const leadToWinRate = overview.leads > 0 ? Math.round(overview.converted / overview.leads * 100) : 0;

  return (
    <div className="space-y-7">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <OverviewMetric label="Campaigns" value={String(overview.campaigns)} detail={`${overview.activeCampaigns} active · ${overview.draftCampaigns} drafts`} icon={<Megaphone size={16} />} />
        <OverviewMetric label="Customer profiles" value={String(customerProfiles.length)} detail={`${activeProfiles} active · ${validatedProfiles} validated`} icon={<UserRoundSearch size={16} />} />
        <OverviewMetric label="Lead activity" value={String(overview.leads)} detail={`${overview.contacted} contacted · ${overview.meetings} meetings`} icon={<Users size={16} />} />
        <OverviewMetric label="Conversions" value={String(overview.converted + overview.conversions)} detail={`${overview.converted} lead wins · ${overview.conversions} asset conversions`} icon={<Target size={16} />} />
        <OverviewMetric label="Tracked channels" value={String(overview.trackedAssets)} detail={`${overview.activeAssets} active assets`} icon={<Gauge size={16} />} />
        <OverviewMetric label="Spend tracked" value={formatMoney(overview.spendCents)} detail={`${overview.websiteViews} website views today`} icon={<BarChart3 size={16} />} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <div className="rounded-md border border-black/10 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-4 py-3">
            <div><h2 className="text-base font-semibold text-black/82">Marketing command centre</h2><p className="mt-1 text-xs text-black/45">Use the switchers below when you need the dedicated workspace.</p></div>
            <Link href={marketingHref("campaigns", brandScope)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-black px-3 text-xs font-semibold text-white">Open campaigns <ArrowUpRight size={13} /></Link>
          </div>
          <div className="divide-y divide-black/[0.07]">
            <article className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-center">
              <div className="min-w-0"><h3 className="text-sm font-semibold text-black/78">Customer profiles</h3><p className="mt-1 text-xs text-black/45">{customerProfiles.length ? `${activeProfiles} active audiences across this scope` : "No customer profiles defined yet"}</p></div>
              <div className="flex gap-4 text-xs text-black/52 md:justify-end"><span><strong className="font-semibold text-black/75">{validatedProfiles}</strong> validated</span><span><strong className="font-semibold text-black/75">{customerProfiles.filter(profile => profile.priority === "primary").length}</strong> primary</span></div>
              <Link href={marketingHref("customer-profiles", brandScope)} className="min-h-9 rounded-md border border-black/10 bg-white px-3 py-2 text-center text-xs font-semibold text-black/62 hover:bg-black/[0.03]">Open</Link>
            </article>
            <article className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-center">
              <div className="min-w-0"><h3 className="text-sm font-semibold text-black/78">Internal automations</h3><p className="mt-1 text-xs text-black/45">CRM workflows for follow-up, publishing, reminders and handovers</p></div>
              <div className="flex gap-4 text-xs text-black/52 md:justify-end"><span><strong className="font-semibold text-black/75">{automationStats.total}</strong> flows</span><span><strong className="font-semibold text-black/75">{automationStats.active}</strong> active</span></div>
              <Link href={marketingHref("automations", "all")} className="min-h-9 rounded-md border border-black/10 bg-white px-3 py-2 text-center text-xs font-semibold text-black/62 hover:bg-black/[0.03]">Open</Link>
            </article>
            {channelRows.map(row => (
              <article key={row.view} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-center">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-black/78">{row.label}</h3>
                  <p className="mt-1 text-xs text-black/45">{row.tracked ? `${row.tracked} tracked · ${row.active} active` : "No tracked items yet"}</p>
                </div>
                <div className="flex gap-4 text-xs text-black/52 md:justify-end">
                  <span><strong className="font-semibold text-black/75">{row.leads}</strong> leads</span>
                  <span><strong className="font-semibold text-black/75">{row.conversions}</strong> conversions</span>
                </div>
                <Link href={marketingHref(row.view, brandScope)} className="min-h-9 rounded-md border border-black/10 bg-white px-3 py-2 text-center text-xs font-semibold text-black/62 hover:bg-black/[0.03]">Open</Link>
              </article>
            ))}
          </div>
        </div>

        <aside className="rounded-md border border-black/10 bg-black/[0.018] p-4">
          <h2 className="text-base font-semibold text-black/82">Readiness</h2>
          <dl className="mt-3 divide-y divide-black/10 text-sm">
            <OverviewRow label="Email sender" value={emailSenderReady ? "Ready" : "Needs setup"} />
            <OverviewRow label="Campaign drafts" value={String(overview.draftCampaigns)} />
            <OverviewRow label="Active audiences" value={String(activeProfiles)} />
            <OverviewRow label="Active channels" value={String(channelRows.filter(row => row.active > 0).length)} />
            <OverviewRow label="Active automations" value={String(automationStats.active)} />
            <OverviewRow label="Lead sources" value={String(sourceRows.length)} />
            <OverviewRow label="Lead to meeting" value={`${leadToMeetingRate}%`} />
            <OverviewRow label="Lead to win" value={`${leadToWinRate}%`} />
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={campaignComposerHref(brandScope, "social")} className="min-h-9 rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/62">Social</Link>
            <Link href={campaignComposerHref(brandScope, "newsletter")} className="min-h-9 rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/62">Newsletter</Link>
            <Link href={campaignComposerHref(brandScope, "cold")} className="min-h-9 rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/62">Cold</Link>
          </div>
        </aside>
      </section>

      <section className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <div>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div><h2 className="text-base font-semibold text-black/82">Recent campaigns</h2><p className="mt-1 text-xs text-black/45">Latest activity in the selected brand scope.</p></div>
            <Link href={marketingHref("campaigns", brandScope)} className="text-xs font-semibold text-brand hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-black/10 border-y border-black/10">
            {campaigns.map(campaign => (
              <div key={campaign.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-black/75">{campaign.name}</p><p className="mt-1 text-xs text-black/45">{campaign.channel ?? campaign.kind ?? "campaign"} · {campaign.status}</p></div>
                <div className="flex gap-3 text-xs text-black/52 sm:justify-end"><span>{campaign.attributedLeads ?? 0} leads</span><span>{campaign.attributedClients ?? 0} clients</span></div>
              </div>
            ))}
            {!campaigns.length ? <p className="py-8 text-center text-sm text-black/40">Campaigns will appear here once you save drafts or launch activity.</p> : null}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div><h2 className="text-base font-semibold text-black/82">Top lead sources</h2><p className="mt-1 text-xs text-black/45">Where attention is turning into pipeline.</p></div>
            <Link href={marketingHref("sources", brandScope)} className="text-xs font-semibold text-brand hover:underline">Open sources</Link>
          </div>
          <div className="divide-y divide-black/10 border-y border-black/10">
            {sourceRows.slice(0, 5).map(source => (
              <div key={source.source} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-black/75">{sourceLabel(source.source)}</p><p className="mt-1 text-xs text-black/45">{source.contacted} contacted · {source.meetings} meetings</p></div>
                <div className="text-right text-sm font-semibold tabular-nums text-black/72">{source.leads}</div>
              </div>
            ))}
            {!sourceRows.length ? <p className="py-8 text-center text-sm text-black/40">Lead sources will appear when leads are added.</p> : null}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div><h2 className="text-base font-semibold text-black/82">Audience snapshot</h2><p className="mt-1 text-xs text-black/45">Who current activity is meant to move.</p></div>
            <Link href={marketingHref("customer-profiles", brandScope)} className="text-xs font-semibold text-brand hover:underline">Open profiles</Link>
          </div>
          <div className="divide-y divide-black/10 border-y border-black/10">
            {customerProfiles.slice(0, 5).map(profile => (
              <div key={profile.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-black/75">{profile.name}</p><p className="mt-1 truncate text-xs text-black/45">{profile.segment || profile.audienceType} · {profile.evidenceConfidence}</p></div>
                <div className="text-right text-xs font-semibold capitalize text-black/60">{profile.priority}</div>
              </div>
            ))}
            {!customerProfiles.length ? <div className="py-8 text-center"><p className="text-sm text-black/40">No audiences defined for this scope.</p><Link href={marketingHref("customer-profiles", brandScope)} className="mt-2 inline-flex text-xs font-semibold text-brand hover:underline">Create the first profile</Link></div> : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function CampaignQuickStarts({ brandScope }: { brandScope: string }) {
  const starts: Array<{ label: string; compose: string }> = [
    { label: "Social media", compose: "social" },
    { label: "Newsletter", compose: "newsletter" },
    { label: "Physical", compose: "physical" },
    { label: "DM", compose: "dm" },
    { label: "Cold", compose: "cold" },
    { label: "Charity", compose: "charity" },
  ];

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-black/10 bg-black/[0.018] p-3">
      <div>
        <h2 className="text-sm font-semibold text-black/78">Campaign lanes</h2>
        <p className="mt-0.5 text-xs text-black/45">Jump straight into the kind of marketing activity you are planning.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {starts.map(start => (
          <Link key={start.compose} href={campaignComposerHref(brandScope, start.compose)} className="min-h-9 rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/62 hover:bg-black/[0.03]">
            {start.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

function SocialBrandPlanner({
  assets,
  companies,
  activeScope,
}: {
  assets: MarketingAsset[];
  companies: Array<{ id: string; name: string; slug: string; colour: string }>;
  activeScope: string;
}) {
  const rows = [
    {
      id: "shared",
      name: "Group / shared",
      slug: "shared",
      colour: "#8E7340",
      profiles: assets.filter(asset => !asset.companyIds?.length),
    },
    ...companies.map(company => ({
      ...company,
      profiles: assets.filter(asset => asset.companyIds?.includes(company.id)),
    })),
  ].filter(row => activeScope === "all" || activeScope === row.slug);

  return (
    <section className="border-y border-black/10">
      <div className="flex flex-wrap items-end justify-between gap-3 py-4">
        <div>
          <h2 className="text-sm font-semibold text-black/78">Social media by brand</h2>
          <p className="mt-1 text-xs text-black/45">Each brand keeps its own profiles, owners, objectives and social campaign lane.</p>
        </div>
        <Link href={campaignComposerHref(activeScope === "all" ? "all" : activeScope, "social")} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65 hover:bg-black/[0.03]">
          Social campaign <ArrowUpRight size={13} />
        </Link>
      </div>
      <div className="divide-y divide-black/[0.07]">
        {rows.map(row => {
          const activeProfiles = row.profiles.filter(profile => profile.status === "active").length;
          const platforms = Array.from(new Set(row.profiles.map(profile => profile.platform).filter(Boolean))).slice(0, 4);
          return (
            <article key={row.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: row.colour }} aria-hidden />
                  <h3 className="truncate text-sm font-semibold text-black/80">{row.name}</h3>
                </div>
                <p className="mt-1 truncate text-xs text-black/45">{platforms.length ? platforms.join(" · ") : "No social profiles saved yet."}</p>
              </div>
              <div className="flex gap-4 text-xs text-black/52 md:justify-end">
                <span><strong className="font-semibold text-black/75">{row.profiles.length}</strong> profiles</span>
                <span><strong className="font-semibold text-black/75">{activeProfiles}</strong> active</span>
              </div>
              <div className="flex flex-wrap gap-2 md:justify-end">
                <Link href={marketingHref("social", row.slug)} className="min-h-9 rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/62 hover:bg-black/[0.03]">Profiles</Link>
                <Link href={campaignComposerHref(row.slug, "social")} className="min-h-9 rounded-md bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-black/85">Campaign</Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function GoogleBusinessProfileWorkspace({
  assets,
  allReputationAssets,
  companies,
  defaultCompanyIds,
  brandScope,
}: {
  assets: MarketingAsset[];
  allReputationAssets: MarketingAsset[];
  companies: Array<{ id: string; name: string; slug: string; colour: string }>;
  defaultCompanyIds: string[];
  brandScope: string;
}) {
  const reviews = assets.reduce((sum, asset) => sum + (asset.reviewCount ?? 0), 0);
  const unanswered = assets.reduce((sum, asset) => sum + (asset.unansweredReviews ?? 0), 0);
  const nonGbpProfiles = allReputationAssets.filter(asset => asset.platform !== "Google Business Profile").length;

  return (
    <div className="space-y-7">
      <section className="rounded-md border border-brand/20 bg-brand/[0.045]">
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-md bg-white text-brand shadow-sm"><MapPin size={20} /></span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">Local trust</p>
              <h2 className="mt-1 text-lg font-semibold text-black/85">Google Business Profile</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-black/52">Track the local profile for each brand: public link, owner, rating, review count, unanswered replies and what the profile is meant to generate.</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <OverviewMetric label="Profiles" value={String(assets.length)} detail={`${nonGbpProfiles} other reputation`} icon={<Star size={15} />} />
            <OverviewMetric label="Reviews" value={String(reviews)} detail="GBP total" icon={<Users size={15} />} />
            <OverviewMetric label="Replies due" value={String(unanswered)} detail="Needs response" icon={<Gauge size={15} />} />
          </div>
        </div>
      </section>

      <MarketingChannelsWorkspace
        kind="reputation"
        assets={assets}
        companies={companies}
        defaultCompanyIds={defaultCompanyIds}
        defaultPlatform="Google Business Profile"
      />

      <section className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4">
        <p className="text-sm text-black/50">Need Trustpilot, Facebook, Yell or other review profiles too?</p>
        <Link href={marketingHref("reputation", brandScope)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/62 hover:bg-black/[0.03]">Open all reputation <ArrowUpRight size={13} /></Link>
      </section>
    </div>
  );
}

function BrandScopeLink({ href, active, label, colour }: { href: string; active: boolean; label: string; colour: string }) {
  return <Link href={href} aria-current={active ? "true" : undefined} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition ${active ? "border-black bg-black text-white" : "border-black/10 bg-white text-black/60 hover:border-black/25 hover:text-black/80"}`}><span className="size-2 rounded-full ring-1 ring-white/30" style={{ backgroundColor: colour }} aria-hidden />{label}</Link>;
}

function WebsiteMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-3 border-b border-black/10 px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><span className="text-brand">{icon}</span><div><p className="text-[10px] font-semibold uppercase text-black/35">{label}</p><p className="mt-1 text-sm font-semibold text-black/70">{value}</p></div></div>;
}

function OverviewMetric({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) {
  return <div className="rounded-md border border-black/10 bg-white p-4"><div className="flex items-start justify-between gap-3"><dt className="text-xs font-medium text-black/45">{label}</dt><span className="text-brand">{icon}</span></div><dd className="mt-2 text-2xl font-semibold text-black/85">{value}</dd><p className="mt-1 text-xs text-black/42">{detail}</p></div>;
}

function OverviewRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 py-2.5"><dt className="text-black/50">{label}</dt><dd className="font-semibold text-black/75">{value}</dd></div>;
}

function MarketingTab({ href, active, icon: Icon, children }: { href: string; active: boolean; icon: typeof Activity; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`relative inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap py-3 text-sm font-medium ${active ? "text-black" : "text-black/45 hover:text-black/70"}`}>
      <Icon size={15} aria-hidden="true" />{children}
      {active ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-black" /> : null}
    </Link>
  );
}

function MarketingWorkspaceNavigation({ view, brandScope }: { view: MarketingView; brandScope: string }) {
  const automationTab = <MarketingTab href={marketingHref("automations", "all")} active={view === "automations"} icon={LockKeyhole}>Automations</MarketingTab>;
  return (
    <nav aria-label="Marketing view" className="flex gap-5 overflow-x-auto border-b border-black/10">
      {view === "automations" ? automationTab : null}
      <MarketingTab href={marketingHref("campaigns", brandScope)} active={view === "campaigns"} icon={Megaphone}>Campaigns</MarketingTab>
      <MarketingTab href={marketingHref("customer-profiles", brandScope)} active={view === "customer-profiles"} icon={UserRoundSearch}>Customer profiles</MarketingTab>
      <MarketingTab href={marketingHref("social", brandScope)} active={view === "social"} icon={RadioTower}>Social media</MarketingTab>
      <MarketingTab href={marketingHref("website", brandScope)} active={view === "website"} icon={Globe2}>Websites</MarketingTab>
      <MarketingTab href={marketingHref("funnels", brandScope)} active={view === "funnels"} icon={Workflow}>Funnels</MarketingTab>
      <MarketingTab href={marketingHref("google-ads", brandScope)} active={view === "google-ads"} icon={Target}>Google Ads</MarketingTab>
      <MarketingTab href={marketingHref("google-business", brandScope)} active={view === "google-business"} icon={MapPin}>Google Business Profile</MarketingTab>
      <MarketingTab href={marketingHref("reputation", brandScope)} active={view === "reputation"} icon={Star}>Reputation</MarketingTab>
      <MarketingTab href={marketingHref("sources", brandScope)} active={view === "sources"} icon={Activity}>Lead sources</MarketingTab>
      {view !== "automations" ? automationTab : null}
    </nav>
  );
}

function isMarketingView(value: string | undefined): value is MarketingView {
  return ["overview", "campaigns", "customer-profiles", "social", "website", "funnels", "google-ads", "google-business", "reputation", "sources", "automations"].includes(value ?? "");
}

function viewToAssetKind(view: Exclude<MarketingView, "overview" | "campaigns" | "customer-profiles" | "sources" | "google-business" | "automations">): MarketingAssetKind {
  return view === "funnels" ? "funnel" : view;
}

function marketingHref(view: MarketingView, brandScope: string): string {
  const params = new URLSearchParams();
  if (view !== "overview") params.set("view", view);
  if (brandScope !== "all") params.set("brand", brandScope);
  const query = params.toString();
  return `/portal/agency/marketing${query ? `?${query}` : ""}`;
}

function campaignComposerHref(brandScope: string, compose: string): string {
  const params = new URLSearchParams({ view: "campaigns", compose });
  if (brandScope !== "all") params.set("brand", brandScope);
  return `/portal/agency/marketing?${params.toString()}`;
}

function buildMarketingOverview({
  campaigns,
  assets,
  leads,
  sourceRows,
  ownWebsiteSummary,
}: {
  campaigns: Array<{ status: string; spendCents?: number }>;
  assets: MarketingAsset[];
  leads: Array<{ lastContactedAt?: number; sentCount?: number; nextMeetingAt?: number; tags: string[] }>;
  sourceRows: Array<{ converted: number }>;
  ownWebsiteSummary: { pageviews24h: number };
}): MarketingOverview {
  return {
    campaigns: campaigns.length,
    activeCampaigns: campaigns.filter(campaign => campaign.status === "active" || campaign.status === "scheduled" || campaign.status === "sending").length,
    draftCampaigns: campaigns.filter(campaign => campaign.status === "draft").length,
    trackedAssets: assets.length,
    activeAssets: assets.filter(asset => asset.status === "active").length,
    leads: leads.length,
    contacted: leads.filter(lead => lead.lastContactedAt || (lead.sentCount ?? 0) > 0).length,
    meetings: leads.filter(lead => lead.nextMeetingAt).length,
    converted: sourceRows.reduce((sum, source) => sum + source.converted, 0),
    spendCents: campaigns.reduce((sum, campaign) => sum + (campaign.spendCents ?? 0), 0) + assets.reduce((sum, asset) => sum + asset.spendCents, 0),
    conversions: assets.reduce((sum, asset) => sum + asset.conversions, 0),
    websiteViews: ownWebsiteSummary.pageviews24h,
  };
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(cents / 100);
}

function composeToChannel(compose: string | undefined): "email" | "newsletter" | "cold-outreach" | "dm" | "direct-mail" | "google-ads" | "meta-ads" | "organic" | "social" | "charity" | undefined {
  if (compose === "social" || compose === "organic") return "social";
  if (compose === "newsletter") return "newsletter";
  if (compose === "physical" || compose === "print" || compose === "direct-mail") return "direct-mail";
  if (compose === "dm") return "dm";
  if (compose === "cold") return "cold-outreach";
  if (compose === "charity") return "charity";
  if (compose === "google-ads") return "google-ads";
  if (compose === "meta-ads" || compose === "paid") return "meta-ads";
  return undefined;
}

function recordMatchesBrand(companyIds: string[] | undefined, brandScope: string, selectedCompanyId: string | null): boolean {
  if (brandScope === "all") return true;
  if (brandScope === "shared") return !companyIds?.length;
  return Boolean(selectedCompanyId && companyIds?.includes(selectedCompanyId));
}

function recordBelongsToCampaign(recordCompanyIds: string[], campaignCompanyIds: string[] | undefined): boolean {
  if (!campaignCompanyIds?.length) return true;
  return recordCompanyIds.some(companyId => campaignCompanyIds.includes(companyId));
}

function sourceLabel(source: string): string {
  return source
    .replace(/^csv:/, "CSV · ")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}
