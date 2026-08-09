import Link from "next/link";
import { Activity, ArrowUpRight, Building2, Globe2, LockKeyhole, RadioTower } from "lucide-react";

import { CampaignsWorkspace } from "@/app/portal/agency/leads-pipeline/campaigns/_CampaignsWorkspace";
import { MarketingChannelsWorkspace, type MarketingAssetKind } from "./_MarketingChannelsWorkspace";
import type { MarketingAsset } from "@/built-ins/modules/agency-marketing/src/lib/domain";
import { installPlugin, setPluginEnabled } from "@/built-ins/runtime/_runtime";
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
import { containerFor } from "@aqua/plugin-leads-pipeline/server";
import { ensureAgencyWebsite, summarizeAgencyWebsite } from "@/server/agencyWebsite";

const LEADS_PLUGIN = "leads-pipeline";
const EMAIL_PLUGIN = "email-sender";
const MARKETING_PLUGIN = "agency-marketing";
const MARKETING_ASSETS_KEY = "milesymedia/channel-assets/v1";
type MarketingView = "campaigns" | "social" | "website" | "funnels" | "google-ads" | "reputation" | "sources";

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; brand?: string }>;
}) {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
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

  const { campaigns, leads } = containerFor({
    agencyId: session.agencyId,
    storage: makePluginStorage(install.id) as never,
  });
  const [campaignRows, leadRows] = await Promise.all([campaigns.list(), leads.list()]);
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
  const params = await searchParams;
  const requestedView = params.view;
  const view: MarketingView = isMarketingView(requestedView) ? requestedView : "campaigns";
  const companies = listTradingCompanies(session.agencyId, true).filter(company => company.status !== "archived");
  const selectedCompany = companies.find(company => company.slug === params.brand) ?? null;
  const brandScope = params.brand === "shared" ? "shared" : selectedCompany?.slug ?? "all";
  const selectedCompanyId = selectedCompany?.id ?? null;
  const marketingAssets = marketingInstall
    ? (await makePluginStorage(marketingInstall.id).get<MarketingAsset[]>(MARKETING_ASSETS_KEY)) ?? []
    : [];
  const scopedMarketingAssets = marketingAssets.filter(asset => recordMatchesBrand(asset.companyIds, brandScope, selectedCompanyId));
  const scopedCampaigns = attributedCampaigns.filter(campaign => recordMatchesBrand(campaign.companyIds, brandScope, selectedCompanyId));
  const scopedLeads = leadRows.filter(lead => recordMatchesBrand(lead.companyIds ?? (lead.companyId ? [lead.companyId] : []), brandScope, selectedCompanyId));
  const scopedTags = [...new Set(scopedLeads.flatMap(lead => lead.tags))].sort();
  const scopedSources = [...new Set(scopedLeads.map(lead => lead.source || "Unknown"))].sort();
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

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header className="grid gap-5 border-b border-black/10 pb-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand"><LockKeyhole size={13} aria-hidden /> Internal workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-black/90">Marketing across the business</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">Plan and measure AquaOasis-Web, AquaCRM, Milesymedia, Zimante Group and shared campaigns from one internal view. This is your operating workspace, not a client marketing page.</p>
        </div>
        <div className="flex items-center gap-3 rounded-md border border-black/10 bg-black/[0.025] px-4 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-white text-brand shadow-sm"><Building2 size={17} aria-hidden /></span>
          <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-black/40">Viewing</p><p className="truncate text-sm font-semibold text-black/75">{selectedScopeLabel}</p></div>
        </div>
      </header>

      <BrandScopeNavigation companies={companies} view={view} activeScope={brandScope} />

      <nav aria-label="Marketing view" className="flex gap-5 overflow-x-auto border-b border-black/10">
        <MarketingTab href={marketingHref("campaigns", brandScope)} active={view === "campaigns"}>Campaigns</MarketingTab>
        <MarketingTab href={marketingHref("social", brandScope)} active={view === "social"}>Social media</MarketingTab>
        <MarketingTab href={marketingHref("website", brandScope)} active={view === "website"}>Websites</MarketingTab>
        <MarketingTab href={marketingHref("funnels", brandScope)} active={view === "funnels"}>Funnels</MarketingTab>
        <MarketingTab href={marketingHref("google-ads", brandScope)} active={view === "google-ads"}>Google Ads</MarketingTab>
        <MarketingTab href={marketingHref("reputation", brandScope)} active={view === "reputation"}>Reputation</MarketingTab>
        <MarketingTab href={marketingHref("sources", brandScope)} active={view === "sources"}>Lead sources</MarketingTab>
      </nav>

      {view === "campaigns" ? (
        <CampaignsWorkspace
          campaigns={scopedCampaigns}
          availableTags={scopedTags}
          availableSources={scopedSources}
          pipelineColumns={columns}
          emailSenderReady={Boolean(emailInstall?.enabled)}
          companies={companyOptions}
          defaultCompanyIds={defaultCompanyIds}
          embedded
        />
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

function BrandScopeLink({ href, active, label, colour }: { href: string; active: boolean; label: string; colour: string }) {
  return <Link href={href} aria-current={active ? "true" : undefined} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition ${active ? "border-black bg-black text-white" : "border-black/10 bg-white text-black/60 hover:border-black/25 hover:text-black/80"}`}><span className="size-2 rounded-full ring-1 ring-white/30" style={{ backgroundColor: colour }} aria-hidden />{label}</Link>;
}

function WebsiteMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-3 border-b border-black/10 px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><span className="text-brand">{icon}</span><div><p className="text-[10px] font-semibold uppercase text-black/35">{label}</p><p className="mt-1 text-sm font-semibold text-black/70">{value}</p></div></div>;
}

function MarketingTab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`relative min-h-11 shrink-0 whitespace-nowrap py-3 text-sm font-medium ${active ? "text-black" : "text-black/45 hover:text-black/70"}`}>
      {children}
      {active ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-black" /> : null}
    </Link>
  );
}

function isMarketingView(value: string | undefined): value is MarketingView {
  return ["campaigns", "social", "website", "funnels", "google-ads", "reputation", "sources"].includes(value ?? "");
}

function viewToAssetKind(view: Exclude<MarketingView, "campaigns" | "sources">): MarketingAssetKind {
  return view === "funnels" ? "funnel" : view;
}

function marketingHref(view: MarketingView, brandScope: string): string {
  const params = new URLSearchParams();
  if (view !== "campaigns") params.set("view", view);
  if (brandScope !== "all") params.set("brand", brandScope);
  const query = params.toString();
  return `/portal/agency/marketing${query ? `?${query}` : ""}`;
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
