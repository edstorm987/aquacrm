import Link from "next/link";
import { Activity, ArrowUpRight, RadioTower, Target, Workflow } from "lucide-react";

import type {
  MarketingCampaignAttributionResult,
  MarketingDataSpine,
  MarketingFunnelStage,
  MarketingMeasure,
  MarketingPulseMetric,
  MarketingSourceConnection,
} from "@/lib/server/marketingIntelligence";

/**
 * The marketing command surfaces — pulse, radar and funnel.
 *
 * Every number rendered here was computed elsewhere: the KPI registry (pulse),
 * the Radar `marketing` domain (radar) and `commercialIntelligence.lineage`
 * (funnel). These components only *display* — they never derive a metric, so
 * marketing can never disagree with the Command Centre about the same number.
 *
 * Server components: no client state, no interactivity beyond links.
 */

const DASH = "—";

const STATUS_STYLES: Record<string, string> = {
  critical: "border-red-300 bg-red-50 text-red-800",
  warning: "border-amber-300 bg-amber-50 text-amber-800",
  watch: "border-amber-200 bg-amber-50/70 text-amber-700",
  healthy: "border-emerald-300 bg-emerald-50 text-emerald-800",
  pass: "border-emerald-300 bg-emerald-50 text-emerald-800",
  learning: "border-sky-200 bg-sky-50 text-sky-800",
  blind: "border-black/12 bg-black/[0.04] text-black/55",
  inactive: "border-black/12 bg-black/[0.04] text-black/45",
  unmeasured: "border-black/12 bg-black/[0.03] text-black/45",
};

const STATUS_LABELS: Record<string, string> = {
  critical: "Critical", warning: "Warning", watch: "Watch", healthy: "Healthy", pass: "Passing",
  learning: "Learning", blind: "No data", inactive: "Inactive", unmeasured: "Not measured",
};

function statusChip(status: string) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[status] ?? STATUS_STYLES.unmeasured}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function formatMeasured(value: number | null): string {
  return value === null ? DASH : value.toLocaleString();
}

/** A 24-point history drawn as one polyline. No history → nothing drawn, no fake line. */
function Sparkline({ series }: { series: Array<{ at: number; value: number }> }) {
  if (series.length < 2) {
    return <div className="flex h-10 items-center text-[11px] text-black/35">Not enough history to plot</div>;
  }
  const values = series.map(point => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = 100 / (series.length - 1);
  const points = values.map((value, index) => `${(index * step).toFixed(2)},${(28 - (value - min) / span * 26).toFixed(2)}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-10 w-full" role="img" aria-label={`${series.length} retained readings`}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.4" vectorEffect="non-scaling-stroke" className="text-brand" />
    </svg>
  );
}

/**
 * Marketing pulse — the marketing-scoped KPIs with target, deviation and the
 * retained series, straight from the KPI registry.
 */
export function MarketingPulseWorkspace({ pulse, spine }: { pulse: MarketingPulseMetric[]; spine: MarketingDataSpine }) {
  const offTrack = pulse.filter(metric => metric.measured && metric.onTrack === false).length;
  const untargeted = pulse.filter(metric => metric.measured && metric.target === null).length;
  const unmeasured = pulse.filter(metric => !metric.measured).length;
  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-black/10 bg-black/[0.02] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-black/80">{pulse.length} marketing KPIs, measured against plan</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-black/50">
            The same metrics the Command Centre reports — consumed from the KPI registry, never recomputed here. Traffic, forms and conversion come from the Aqua Tag; spend, ROAS and attribution from campaign and lead records.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-md border border-black/10 bg-white px-2.5 py-1.5 text-black/60">{offTrack} behind target</span>
          <span className="rounded-md border border-black/10 bg-white px-2.5 py-1.5 text-black/60">{untargeted} without a target</span>
          <span className="rounded-md border border-black/10 bg-white px-2.5 py-1.5 text-black/60">{unmeasured} not measurable yet</span>
          <span className="rounded-md border border-black/10 bg-white px-2.5 py-1.5 text-black/60">Tag {spine.tag.connected ? "reporting" : "silent"}</span>
        </div>
      </section>

      {!pulse.length ? (
        <p className="border-y border-black/10 py-16 text-center text-sm text-black/45">Marketing KPIs will appear once the Command Centre intelligence can build.</p>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pulse.map(metric => (
            <article key={metric.id} className="flex flex-col rounded-md border border-black/10 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-black/80">{metric.label}</h3>
                  <p className="mt-0.5 text-[11px] text-black/42">{metric.window}</p>
                </div>
                {statusChip(metric.status)}
              </div>
              <p className={`mt-3 text-2xl font-semibold tabular-nums ${metric.measured ? "text-black/88" : "text-black/35"}`}>{metric.measured ? metric.display : DASH}</p>
              <p className="mt-1 text-xs text-black/50">
                {!metric.measured
                  ? metric.status === "blind" ? "Nothing is connected to measure this yet" : "Not enough evidence to report a number yet"
                  : metric.target === null
                    ? "No target set yet"
                    : `Target ${metric.target.toLocaleString()} · ${metric.deviationPercent === null ? "not comparable" : `${metric.deviationPercent > 0 ? "+" : ""}${metric.deviationPercent}% vs target`}`}
              </p>
              <div className={metric.onTrack === false ? "text-red-500" : "text-brand"}>
                <Sparkline series={metric.series} />
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-black/45">{metric.detail}</p>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-black/[0.07] pt-3">
                <span className="truncate text-[11px] text-black/38" title={metric.formulaText}>{metric.formulaText}</span>
                <Link href={metric.href} className="shrink-0 text-xs font-semibold text-brand hover:underline">Open <ArrowUpRight className="inline" size={12} /></Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function MeasureRow({ measure }: { measure: MarketingMeasure }) {
  return (
    <article className="grid gap-2 py-4 md:grid-cols-[minmax(0,1fr)_160px_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-black/78">{measure.label}</h3>
          {statusChip(measure.status)}
        </div>
        <p className="mt-1 text-xs leading-5 text-black/48">{measure.measured || measure.status !== "unmeasured" ? measure.detail : "No Aqua Tag signal has reached this check yet."}</p>
        {measure.evidence.length ? <p className="mt-1 truncate text-[11px] text-black/38">{measure.evidence.join(" · ")}</p> : null}
      </div>
      <div className="text-sm md:text-right">
        <p className="font-semibold tabular-nums text-black/80">{formatMeasured(measure.value)}</p>
        {measure.previousValue !== null ? <p className="mt-0.5 text-[11px] text-black/40">was {measure.previousValue.toLocaleString()}</p> : null}
      </div>
      <Link href={measure.href} className="min-h-9 rounded-md border border-black/10 bg-white px-3 py-2 text-center text-xs font-semibold text-black/62 hover:bg-black/[0.03]">Inspect</Link>
    </article>
  );
}

/**
 * Marketing radar — the Radar `marketing` domain surfaced where marketing works.
 * Firing signals first (what to act on), then every family (what is watched).
 */
export function MarketingRadarWorkspace({ spine }: { spine: MarketingDataSpine }) {
  const { attention, measures, health, tag } = spine;
  return (
    <div className="space-y-7">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-black/10 bg-white p-4">
          <p className="text-xs font-medium text-black/45">Signals firing</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-black/85">{attention.length}</p>
          <p className="mt-1 text-xs text-black/42">of {measures.length} marketing families</p>
        </div>
        <div className="rounded-md border border-black/10 bg-white p-4">
          <p className="text-xs font-medium text-black/45">Coverage</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-black/85">{health ? `${health.coveragePercent}%` : DASH}</p>
          <p className="mt-1 text-xs text-black/42">{health ? `${health.passedChecks}/${health.totalChecks} checks passing` : "Radar unavailable"}</p>
        </div>
        <div className="rounded-md border border-black/10 bg-white p-4">
          <p className="text-xs font-medium text-black/45">Confidence</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-black/85">{health ? `${health.confidencePercent}%` : DASH}</p>
          <p className="mt-1 text-xs text-black/42">{health ? `${health.blindChecks} blind spots` : "No domain summary"}</p>
        </div>
        <div className="rounded-md border border-black/10 bg-white p-4">
          <p className="text-xs font-medium text-black/45">Tag</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-black/85">{tag.connectedSources}/{tag.totalSources}</p>
          <p className="mt-1 text-xs text-black/42">{tag.monitoredProperties} monitored propert{tag.monitoredProperties === 1 ? "y" : "ies"}</p>
        </div>
      </section>

      <section aria-labelledby="marketing-radar-attention">
        <div className="flex items-end justify-between gap-3 border-b border-black/10 pb-3">
          <div>
            <h2 id="marketing-radar-attention" className="text-lg font-semibold text-black/85">Needs action</h2>
            <p className="mt-1 text-sm text-black/50">Marketing signals currently firing, most severe first.</p>
          </div>
          <Link href="/portal/agency/actions" className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/65">All actions</Link>
        </div>
        {attention.length ? (
          <div className="divide-y divide-black/[0.07]">
            {attention.map(measure => <MeasureRow key={measure.id} measure={measure} />)}
          </div>
        ) : (
          <p className="py-12 text-center text-sm text-black/40">
            {spine.available ? "Nothing is firing in the marketing domain." : "The radar could not build — no marketing signals to show."}
          </p>
        )}
      </section>

      <MarketingSourceRoster sources={spine.sources} />

      <section aria-labelledby="marketing-radar-families">
        <div className="flex items-end justify-between gap-3 border-b border-black/10 pb-3">
          <div>
            <h2 id="marketing-radar-families" className="text-lg font-semibold text-black/85">Everything watched</h2>
            <p className="mt-1 text-sm text-black/50">All 12 marketing families. A family with no reading says so rather than showing a zero.</p>
          </div>
        </div>
        <div className="divide-y divide-black/[0.07]">
          {measures.map(measure => <MeasureRow key={measure.id} measure={measure} />)}
        </div>
      </section>
    </div>
  );
}

/**
 * The live demand funnel — pageviews → forms → leads → contacted → meetings →
 * proposals → won, from the lineage the commercial engine already computes.
 */
export function MarketingFunnelBoard({ funnel, spine }: { funnel: MarketingFunnelStage[]; spine: MarketingDataSpine }) {
  const top = funnel.find(stage => stage.value !== null && stage.value > 0)?.value ?? 0;
  return (
    <section aria-labelledby="marketing-live-funnel" className="rounded-md border border-black/10 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-4 py-3">
        <div>
          <h2 id="marketing-live-funnel" className="text-base font-semibold text-black/82">Live demand funnel</h2>
          <p className="mt-1 text-xs text-black/45">Real records end to end — Aqua Tag traffic and forms, then lead, meeting, proposal and conversion records. Rolling seven days for telemetry, retained lifecycle for the rest.</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold ${spine.tag.connected ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-black/10 bg-black/[0.03] text-black/55"}`}>
          <Workflow size={13} aria-hidden /> {spine.tag.connected ? "Fed by the tag" : "Top of funnel unmeasured"}
        </span>
      </div>
      {!funnel.length ? (
        <p className="py-12 text-center text-sm text-black/40">The funnel needs the commercial intelligence snapshot, which could not build.</p>
      ) : (
        <div className="divide-y divide-black/[0.07]">
          {funnel.map((stage, index) => {
            const width = stage.value !== null && top > 0 ? Math.max(2, Math.round(stage.value / top * 100)) : 0;
            return (
              <article key={stage.id} className="grid gap-2 px-4 py-3 md:grid-cols-[150px_minmax(0,1fr)_190px] md:items-center">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-black/78">{stage.label}</p>
                  <p className="mt-0.5 text-[11px] text-black/40">{stage.evidence}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
                    <div className={`h-full rounded-full ${stage.measured ? "bg-brand" : "bg-black/15"}`} style={{ width: `${width}%` }} />
                  </div>
                  <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums text-black/80">{formatMeasured(stage.value)}</span>
                </div>
                <div className="text-xs text-black/50 md:text-right">
                  {index === 0 ? (
                    stage.measured ? <span className="text-black/40">Top of funnel</span> : <span className="text-black/40">Not measured — no tag signal</span>
                  ) : stage.conversionPercent === null ? (
                    <span className="text-black/35">Conversion not measurable</span>
                  ) : (
                    <span><strong className="font-semibold text-black/72">{stage.conversionPercent}%</strong> from {funnel[index - 1].label.toLowerCase()}{stage.dropFromPrevious ? ` · ${stage.dropFromPrevious.toLocaleString()} lost` : ""}</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-black/10 px-4 py-3 text-xs text-black/45">
        <span className="inline-flex items-center gap-1.5"><Activity size={13} aria-hidden /> Traffic and forms come from the Aqua Tag</span>
        <span className="inline-flex items-center gap-1.5"><Target size={13} aria-hidden /> Leads onward come from retained CRM records</span>
        <span className="inline-flex items-center gap-1.5"><RadioTower size={13} aria-hidden /> A stage with no reading shows {DASH}, never zero</span>
      </div>
    </section>
  );
}

/**
 * Real campaign attribution — the demand that actually arrived carrying a
 * campaign's name, beside the lead counts the campaign row already showed.
 *
 * A key match is stated as fact; a name match is labelled a suggestion, because
 * matching is a guess and Ed confirms guesses (nothing is written either way —
 * this panel only reports). Campaign names seen on real enquiries with no
 * campaign record behind them are listed as gaps worth closing.
 */
export function MarketingCampaignAttributionPanel({ attribution }: { attribution: MarketingCampaignAttributionResult | null }) {
  if (!attribution) return null;
  if (!attribution.available) {
    return (
      <section className="rounded-md border border-black/10 bg-black/[0.02] px-4 py-3">
        <h2 className="text-sm font-semibold text-black/78">Real campaign attribution</h2>
        <p className="mt-1 text-xs text-black/48">Website enquiries were not read in this session, so no live attribution can be shown. That is a demo session or a failed read — not zero enquiries.</p>
      </section>
    );
  }
  const matched = attribution.campaigns.filter(row => row.enquiries > 0);
  return (
    <section aria-labelledby="marketing-real-attribution" className="rounded-md border border-black/10 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-4 py-3">
        <div>
          <h2 id="marketing-real-attribution" className="text-base font-semibold text-black/82">Real campaign attribution</h2>
          <p className="mt-1 text-xs text-black/45">Enquiries that arrived carrying a campaign, matched to your campaign records. Lead and client counts below come from the CRM; these come from the tag.</p>
        </div>
        <span className="rounded-md border border-black/10 bg-black/[0.025] px-2.5 py-1.5 text-xs font-semibold text-black/60">{attribution.unattributed.toLocaleString()} enquiries unattributed</span>
      </div>
      {matched.length ? (
        <div className="divide-y divide-black/[0.07]">
          {matched.map(row => (
            <article key={row.campaignId} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-black/78">{row.campaignName}</p>
                  {row.confident ? (
                    <span className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Matched on source key</span>
                  ) : (
                    <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Suggested match — confirm</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-black/45">
                  Matched enquiry group &ldquo;{row.matchedKey}&rdquo;{row.confident ? "" : " by name — set a source key on the campaign to make this exact"}
                </p>
              </div>
              <div className="flex gap-4 text-xs text-black/52 md:justify-end">
                <span><strong className="font-semibold text-black/78">{row.last7d}</strong> in 7d</span>
                <span><strong className="font-semibold text-black/78">{row.last30d}</strong> in 30d</span>
                <span><strong className="font-semibold text-black/78">{row.enquiries}</strong> total</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-black/40">No enquiry has arrived carrying one of these campaigns yet.</p>
      )}
      {attribution.gaps.length ? (
        <div className="border-t border-black/10 px-4 py-3">
          <p className="text-xs font-semibold text-black/60">Arriving on enquiries with no campaign record</p>
          <p className="mt-1 text-xs text-black/45">Real demand is being tagged with these, but nothing in the workspace owns them — create the campaign so its spend and return can be measured.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {attribution.gaps.slice(0, 8).map(gap => (
              <span key={gap.key} className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs text-amber-900">
                {gap.label} <strong className="font-semibold">{gap.enquiries}</strong>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/**
 * What real demand looks like — the evidence an audience profile can be
 * validated against, instead of being written from assumption. Read-only: it
 * describes the enquiries that arrived, it never edits a profile.
 */
export function MarketingAudienceEvidencePanel({ spine }: { spine: MarketingDataSpine | null }) {
  if (!spine) return null;
  const { enquiries } = spine;
  if (!enquiries.available) {
    return (
      <section className="rounded-md border border-black/10 bg-black/[0.02] px-4 py-3">
        <h2 className="text-sm font-semibold text-black/78">Real demand evidence</h2>
        <p className="mt-1 text-xs text-black/48">Website enquiries were not read in this session, so there is nothing to check a profile against yet. That is a demo session or a failed read — not zero enquiries.</p>
      </section>
    );
  }
  return (
    <section aria-labelledby="marketing-audience-evidence" className="rounded-md border border-black/10 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-4 py-3">
        <div>
          <h2 id="marketing-audience-evidence" className="text-base font-semibold text-black/82">Real demand evidence</h2>
          <p className="mt-1 text-xs text-black/45">Who actually got in touch, over the last 30 days. Compare a profile against this before marking it validated.{enquiries.scopedToCompanyId ? " Narrowed to the selected brand, by which sites route to it." : ""}{enquiries.unroutedEnquiries ? ` ${enquiries.unroutedEnquiries} enquiry${enquiries.unroutedEnquiries === 1 ? "" : "s"} came from a site that isn't registered, so ${enquiries.unroutedEnquiries === 1 ? "it is" : "they are"} not counted here.` : ""}</p>
        </div>
        <span className="rounded-md border border-black/10 bg-black/[0.025] px-2.5 py-1.5 text-xs font-semibold text-black/60">{enquiries.last30d.toLocaleString()} enquiries · 30 days</span>
      </div>
      <div className="grid gap-px bg-black/[0.07] md:grid-cols-2">
        <div className="bg-white px-4 py-3">
          <p className="text-xs font-semibold text-black/55">By brand</p>
          {enquiries.byBrand.length ? (
            <ul className="mt-2 space-y-1.5">
              {enquiries.byBrand.slice(0, 6).map(row => (
                <li key={row.key} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-black/62">{row.label}</span>
                  <span className="shrink-0 tabular-nums text-black/45">{row.last30d} of {row.total}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-xs text-black/40">No enquiries recorded yet.</p>}
        </div>
        <div className="bg-white px-4 py-3">
          <p className="text-xs font-semibold text-black/55">By source</p>
          {enquiries.bySource.length ? (
            <ul className="mt-2 space-y-1.5">
              {enquiries.bySource.slice(0, 6).map(row => (
                <li key={row.key} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-black/62">{row.label}</span>
                  <span className="shrink-0 tabular-nums text-black/45">{row.last30d} of {row.total}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-xs text-black/40">No sources recorded yet.</p>}
        </div>
      </div>
    </section>
  );
}

/**
 * What marketing is plugged into — and what it still can't see.
 *
 * Injecting a tool through the tag only sends data *out*. Reading it back needs
 * a server-side integration, and today only Search Console has one. Showing the
 * two halves separately is the point: a green "PostHog on 3 sites" would
 * otherwise imply AquaCRM can see PostHog's geography, which it can't yet.
 */
export function MarketingSourceRoster({ sources }: { sources: MarketingSourceConnection[] }) {
  if (!sources.length) return null;
  const reading = sources.filter(source => source.state === "reading");
  return (
    <section aria-labelledby="marketing-source-roster" className="rounded-md border border-black/10 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-4 py-3">
        <div>
          <h2 id="marketing-source-roster" className="text-base font-semibold text-black/82">Where marketing&rsquo;s data comes from</h2>
          <p className="mt-1 text-xs text-black/45">
            Injecting a tool through the Aqua Tag sends data <em>out</em> to it. Only a tool with a server-side sync sends data <em>back</em> — that is what AquaCRM can actually report on.
          </p>
        </div>
        <span className="rounded-md border border-black/10 bg-black/[0.025] px-2.5 py-1.5 text-xs font-semibold text-black/60">{reading.length} reading back</span>
      </div>
      <div className="divide-y divide-black/[0.07]">
        {sources.map(source => (
          <article key={source.kind} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold text-black/78">{source.label}</p>
                {source.state === "reading" ? (
                  <span className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Reading back</span>
                ) : source.state === "connected-outbound" ? (
                  <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800">Sending only</span>
                ) : (
                  <span className="rounded-md border border-black/12 bg-black/[0.03] px-2 py-0.5 text-[11px] font-semibold text-black/50">Not on any site</span>
                )}
              </div>
              <p className="mt-1 text-xs text-black/45">
                {source.state === "reading"
                  ? `Feeds ${source.feeds}${source.lastSyncAt ? ` · last synced ${new Date(source.lastSyncAt).toLocaleDateString("en-GB")}` : ""}`
                  : source.state === "connected-outbound"
                    ? source.readsBack
                      ? "On your sites, but its sync has never run — nothing has come back yet"
                      : "On your sites, but AquaCRM has no way to read its data back yet"
                    : "Add it to a site through the Aqua Tag to start collecting"}
              </p>
            </div>
            <span className="shrink-0 text-xs tabular-nums text-black/50 md:text-right">{source.injectedSites} of {source.totalSites} sites</span>
          </article>
        ))}
      </div>
    </section>
  );
}
