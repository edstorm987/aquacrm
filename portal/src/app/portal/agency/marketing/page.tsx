import Link from "next/link";
import { Activity, ArrowUpRight, Globe2, RadioTower } from "lucide-react";

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
import { containerFor } from "@aqua/plugin-leads-pipeline/server";
import { getActiveTradingCompanyId } from "@/lib/server/tradingCompanyContext";
import { recordBelongsToCompany } from "@/server/tradingCompanies";
import { ensureAgencyWebsite, summarizeAgencyWebsite } from "@/server/agencyWebsite";

const LEADS_PLUGIN = "leads-pipeline";
const EMAIL_PLUGIN = "email-sender";
const MARKETING_PLUGIN = "agency-marketing";
const MARKETING_ASSETS_KEY = "milesymedia/channel-assets/v1";
type MarketingView = "campaigns" | "social" | "website" | "funnels" | "google-ads" | "reputation" | "sources";

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const activeCompanyId = await getActiveTradingCompanyId(session.agencyId);
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
    attributedLeads: campaign.sourceKey ? leadRows.filter(lead => lead.source === campaign.sourceKey).length : 0,
    attributedClients: campaign.sourceKey ? clients.filter(client => {
      const metadata = client.metadata as { leadSource?: string } | undefined;
      return metadata?.leadSource === campaign.sourceKey;
    }).length : 0,
  }));
  const tags = [...new Set(leadRows.flatMap(lead => lead.tags))].sort();
  const sources = [...new Set(leadRows.map(lead => lead.source || "Unknown"))].sort();
  const pipeline = getPipelineBySlug(session.agencyId, "leads");
  const columns = pipeline?.columns.map(column => column.label) ?? ["New", "Contacted", "Qualified", "Won", "Lost"];
  const requestedView = (await searchParams).view;
  const view: MarketingView = isMarketingView(requestedView) ? requestedView : "campaigns";
  const marketingAssets = marketingInstall
    ? (await makePluginStorage(marketingInstall.id).get<MarketingAsset[]>(MARKETING_ASSETS_KEY)) ?? []
    : [];
  const sourceRows = sources.map(source => {
    const rows = leadRows.filter(lead => (lead.source || "Unknown") === source);
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

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">Growth</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-black/90">Marketing</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">Run Milesymedia&apos;s campaigns, social channels, website, funnels and Google Ads, then see what produces conversations and clients.</p>
      </header>

      <nav aria-label="Marketing view" className="flex gap-5 overflow-x-auto border-b border-black/10">
        <MarketingTab href="/portal/agency/marketing" active={view === "campaigns"}>Campaigns</MarketingTab>
        <MarketingTab href="/portal/agency/marketing?view=social" active={view === "social"}>Social media</MarketingTab>
        <MarketingTab href="/portal/agency/marketing?view=website" active={view === "website"}>Website</MarketingTab>
        <MarketingTab href="/portal/agency/marketing?view=funnels" active={view === "funnels"}>Funnels</MarketingTab>
        <MarketingTab href="/portal/agency/marketing?view=google-ads" active={view === "google-ads"}>Google Ads</MarketingTab>
        <MarketingTab href="/portal/agency/marketing?view=reputation" active={view === "reputation"}>Reputation</MarketingTab>
        <MarketingTab href="/portal/agency/marketing?view=sources" active={view === "sources"}>Lead sources</MarketingTab>
      </nav>

      {view === "campaigns" ? (
        <CampaignsWorkspace
          campaigns={attributedCampaigns}
          availableTags={tags}
          availableSources={sources}
          pipelineColumns={columns}
          emailSenderReady={Boolean(emailInstall?.enabled)}
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
          <section className="border-y border-black/10">
            <div className="flex flex-wrap items-start justify-between gap-4 py-5">
              <div className="flex items-start gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-md bg-brand text-white"><Globe2 size={20} /></span>
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-black/85">Milesymedia website</h2><span className="rounded-full bg-black/[0.045] px-2 py-1 text-[10px] font-semibold uppercase text-black/45">Owned channel</span></div>
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
          </section>
          <MarketingChannelsWorkspace
            kind="website"
            assets={marketingAssets.filter(asset => asset.kind === "website" && recordBelongsToCompany(asset.companyIds, activeCompanyId))}
            activeCompanyId={activeCompanyId}
          />
        </div>
      ) : (
        <MarketingChannelsWorkspace
          kind={viewToAssetKind(view)}
          assets={marketingAssets.filter(asset => asset.kind === viewToAssetKind(view) && recordBelongsToCompany(asset.companyIds, activeCompanyId))}
          activeCompanyId={activeCompanyId}
        />
      )}
    </div>
  );
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

function sourceLabel(source: string): string {
  return source
    .replace(/^csv:/, "CSV · ")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}
