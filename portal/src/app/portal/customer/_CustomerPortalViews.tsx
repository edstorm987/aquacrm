import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BookOpenText,
  CalendarDays,
  Check,
  CircleHelp,
  Clock3,
  CreditCard,
  ExternalLink,
  File,
  Files,
  FolderKanban,
  Mail,
  MessageCircle,
  MessageSquareText,
  MonitorCheck,
  MousePointerClick,
  NotebookText,
  Phone,
  PlayCircle,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  UsersRound,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { getClientForAgency } from "@/server/tenants";
import type { Client } from "@/server/types";
import {
  CustomerAgreements,
  CustomerApprovals,
  CustomerFileLinkForm,
  CustomerProjectBriefForm,
  CustomerStageWorkspace,
  CustomerSupportForm,
  type CustomerStageTask,
} from "./_CustomerPortalActions";
import {
  loadCustomerPortalData,
  type CustomerFile,
  type CustomerPortalData,
  type CustomerPortalMode,
} from "./_portalData";
import {
  portalHomeHeading,
  portalProductDefinition,
  portalProjectLabel,
  portalStageFocus,
} from "@/lib/portalProducts";
import { buildPerformanceAnalytics } from "@/lib/performanceAnalytics";
import type { PerformanceEvent } from "@/lib/performanceAnalytics";
import { cleanMonthlyPerformanceReports, type MonthlyPerformanceReport } from "@/lib/performanceReports";
import type { ClientTelemetryEvent } from "@/lib/clientTelemetry";
import { listClientMilestones } from "@/server/clientMilestones";
import { getAuthBrand } from "@/lib/authBrand";
import { formatPortalCopy } from "@/lib/clientPortalDesign";

export type CustomerPortalSection = "home" | "project" | "results" | "files" | "billing" | "support" | "resources" | "details";

function customerHref(section: CustomerPortalSection, previewHrefPrefix?: string): string {
  if (previewHrefPrefix) return `${previewHrefPrefix}${section}`;
  return section === "home" ? "/portal/customer" : `/portal/customer/${section}`;
}

function portalCopyTokens(data: CustomerPortalData, providerName: string): Record<string, string> {
  const base = {
    providerName,
    firstName: firstName(data.contactName),
    projectLabel: portalProjectLabel(data.products),
    serviceHeadline: portalHomeHeading(data.products, data.experienceHeadline),
  };
  const stage = data.presentation.stages[data.mode];
  return {
    ...base,
    stageHeading: formatPortalCopy(stage.heading, base),
    stageBody: formatPortalCopy(stage.body, base),
  };
}

function modeContent(data: CustomerPortalData, providerName: string) {
  const content = data.presentation.stages[data.mode];
  const tokens = portalCopyTokens(data, providerName);
  return {
    ...content,
    label: formatPortalCopy(content.label, tokens),
    eyebrow: formatPortalCopy(content.eyebrow, tokens),
    heading: formatPortalCopy(content.heading, tokens),
    body: formatPortalCopy(content.body, tokens),
    focus: formatPortalCopy(content.focus, tokens),
  };
}

function pageContent(data: CustomerPortalData, section: CustomerPortalSection, providerName: string) {
  const page = data.presentation.pages[section];
  const tokens = portalCopyTokens(data, providerName);
  return {
    eyebrow: formatPortalCopy(page.eyebrow, tokens),
    title: formatPortalCopy(page.title, tokens),
    body: formatPortalCopy(page.body, tokens),
  };
}

async function context() {
  await ensureHydrated();
  const session = await requireRole("end-customer");
  if (!session.clientId) notFound();
  const client = getClientForAgency(session.agencyId, session.clientId);
  if (!client) notFound();
  const fallbackName = (session.email.split("@")[0] || "there").replace(/[._-]+/g, " ");
  const cookieStore = await cookies();
  const providerName = getAuthBrand(cookieStore.get("aqua_public_brand")?.value).name;
  return {
    session,
    client,
    providerName,
    data: await loadCustomerPortalData(client, fallbackName, providerName),
  };
}

function PageIntro({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col justify-between gap-5 border-b border-black/10 pb-7 md:flex-row md:items-end">
      <div className="max-w-3xl">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--portal-accent)]">{eyebrow}</p>
        <h1 className="mt-3 font-serif text-4xl leading-[1.05] text-[#1b1a18] sm:text-5xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-black/52">{body}</p>
      </div>
      {action}
    </header>
  );
}

function Surface({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-md border border-black/10 bg-[var(--portal-surface)] ${className}`}>{children}</section>;
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function formatDate(timestamp?: number): string {
  if (!timestamp) return "Not set";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(timestamp);
}

function safeExternalUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function propertyDestination(property: CustomerPortalData["properties"][number]): {
  href?: string;
  label: string;
} {
  const handedOff = property.status === "redirected";
  const live = property.status === "live" || handedOff;
  const href = handedOff
    ? safeExternalUrl(property.redirectTarget) || safeExternalUrl(property.liveUrl)
    : live
      ? safeExternalUrl(property.liveUrl) || safeExternalUrl(property.previewUrl)
      : safeExternalUrl(property.previewUrl) || safeExternalUrl(property.liveUrl);
  return {
    href,
    label: handedOff ? "Open your portal" : live ? "Open live site" : "View preview",
  };
}

function customerPropertyStatus(status?: string): string {
  if (status === "planning") return "Being planned";
  if (status === "building") return "In progress";
  if (status === "review") return "Ready for your review";
  if (status === "live") return "Live";
  if (status === "redirected") return "Available in your finished portal";
  if (status === "archived") return "Archived";
  return "In progress";
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function FileIcon({ category }: { category: string }) {
  return category === "invoice" ? <ReceiptText size={17} aria-hidden="true" /> : <File size={17} aria-hidden="true" />;
}

function InvoiceStatus({ status }: { status: string }) {
  const style = status === "paid"
    ? "bg-[#e6efe8] text-[#315b3b]"
    : status === "overdue"
      ? "bg-[#f7e8e5] text-[#8a4036]"
      : "bg-[#eee9df] text-[#6d5a35]";
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] ${style}`}>{status}</span>;
}

export async function CustomerPortalView({ section }: { section: CustomerPortalSection }) {
  const { client, data, providerName } = await context();
  if (section === "home") {
    const handoff = data.properties.find(property => property.status === "redirected" && safeExternalUrl(property.redirectTarget));
    if (handoff?.redirectTarget) redirect(handoff.redirectTarget);
  }
  return <CustomerPortalContent section={section} client={client} data={data} providerName={providerName} />;
}

export function CustomerPortalContent({
  section,
  client,
  data,
  previewHrefPrefix,
  providerName = "Milesymedia",
}: {
  section: CustomerPortalSection;
  client: Client;
  data: CustomerPortalData;
  previewHrefPrefix?: string;
  providerName?: string;
}) {
  if (section === "project") return <ProjectView client={client} data={data} previewHrefPrefix={previewHrefPrefix} providerName={providerName} />;
  const readOnly = Boolean(previewHrefPrefix);
  if (section === "results") return <ResultsView client={client} data={data} providerName={providerName} />;
  if (section === "files") return <FilesView client={client} data={data} readOnly={readOnly} providerName={providerName} />;
  if (section === "billing") return <BillingView client={client} data={data} readOnly={readOnly} providerName={providerName} />;
  if (section === "support") return <SupportView client={client} data={data} readOnly={readOnly} providerName={providerName} />;
  if (section === "resources") return <ResourcesView data={data} previewHrefPrefix={previewHrefPrefix} providerName={providerName} />;
  if (section === "details") return <RecordView client={client} data={data} previewHrefPrefix={previewHrefPrefix} providerName={providerName} />;
  return <HomeView client={client} data={data} previewHrefPrefix={previewHrefPrefix} providerName={providerName} />;
}

function ResultsView({ client, data, providerName }: { client: Client; data: CustomerPortalData; providerName: string }) {
  const firstPartyEvents = Array.isArray(client.metadata?.telemetryEvents)
    ? client.metadata.telemetryEvents as ClientTelemetryEvent[]
    : [];
  const searchEvents = Array.isArray(client.metadata?.searchConsoleEvents)
    ? client.metadata.searchConsoleEvents as PerformanceEvent[]
    : [];
  const events: PerformanceEvent[] = [...firstPartyEvents, ...searchEvents];
  const analytics = buildPerformanceAnalytics(events, 28);
  const reports = cleanMonthlyPerformanceReports(client.metadata?.monthlyPerformanceReports).filter(report => report.status === "published");
  const milestones = listClientMilestones(client.agencyId, client.id);
  const maxViews = Math.max(1, ...analytics.series.map(item => item.views));
  return (
    <>
      <PageIntro {...pageContent(data, "results", providerName)} />
      <Surface className="overflow-hidden">
        <div className="grid grid-cols-2 border-b border-black/8 lg:grid-cols-4">
          <ResultMetric icon={<UsersRound size={16} />} label="Visitors" value={String(analytics.current.visitors)} />
          <ResultMetric icon={<Activity size={16} />} label="Page views" value={String(analytics.current.views)} />
          <ResultMetric icon={<MousePointerClick size={16} />} label="Enquiries" value={String(analytics.current.conversions)} />
          <ResultMetric icon={<Target size={16} />} label="Conversion rate" value={`${analytics.current.conversionRate.toFixed(1)}%`} />
        </div>
        <div className="p-6 sm:p-8">
          <div className="flex items-end justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[0.16em] text-black/40">Last 28 days</p><h2 className="mt-2 font-serif text-2xl">Activity over time</h2></div><p className="text-xs text-black/40">Updated from connected work</p></div>
          <div className="mt-7 flex h-32 items-end gap-1" aria-label="Daily website views">
            {analytics.series.map(item => <div key={item.date} className="flex h-full min-w-0 flex-1 items-end"><span className="w-full rounded-t-sm bg-[var(--portal-accent)] opacity-55" style={{ height: `${Math.max(item.views ? 8 : 2, (item.views / maxViews) * 100)}%` }} /></div>)}
          </div>
        </div>
      </Surface>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Surface className="p-6 sm:p-8">
          <h2 className="font-serif text-2xl">What people viewed</h2>
          {analytics.pages.length ? <div className="mt-5 divide-y divide-black/8 border-y border-black/10">{analytics.pages.slice(0, 6).map(page => <div key={page.path} className="flex items-center justify-between gap-4 py-3"><span className="truncate text-sm text-black/65">{page.path}</span><span className="text-xs tabular-nums text-black/45">{page.views} views · {page.conversions} enquiries</span></div>)}</div> : <p className="mt-5 text-sm leading-6 text-black/45">Results will appear here as your connected website or product receives activity.</p>}
        </Surface>
        <Surface className="p-6 sm:p-8">
          <h2 className="font-serif text-2xl">Milestones</h2>
          {milestones.length ? <div className="mt-5 divide-y divide-black/8 border-y border-black/10">{milestones.slice(0, 6).map(milestone => <div key={milestone.id} className="py-3"><div className="flex items-center justify-between gap-4"><span className="text-sm font-medium text-black/65">{milestone.title}</span><span className="text-xs font-semibold text-[var(--portal-accent)]">{milestone.progress}%</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-black/8"><div className="h-full bg-[var(--portal-accent)]" style={{ width: `${milestone.progress}%` }} /></div></div>)}</div> : <p className="mt-5 text-sm leading-6 text-black/45">Your shared outcome milestones will appear here as they are agreed.</p>}
        </Surface>
      </div>
      <MonthlyReportHistory reports={reports} />
    </>
  );
}

function MonthlyReportHistory({ reports }: { reports: MonthlyPerformanceReport[] }) {
  return <Surface className="mt-5 overflow-hidden"><div className="border-b border-black/8 p-6 sm:p-8"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full border border-black/10 text-[var(--portal-accent)]"><ReceiptText size={17} /></span><div><p className="text-[10px] uppercase tracking-[0.16em] text-black/40">Shared reports</p><h2 className="mt-1 font-serif text-2xl">Monthly performance</h2><p className="mt-2 text-sm leading-6 text-black/48">A lasting record of what happened, what worked, and what comes next.</p></div></div></div>{reports.length ? <div className="divide-y divide-black/8">{reports.map(report => <details key={report.id} className="group p-6 sm:p-8"><summary className="flex cursor-pointer list-none flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium text-black/75">{report.label}</p><p className="mt-1 text-xs text-black/40">Published {report.publishedAt ? new Date(report.publishedAt).toLocaleDateString("en-GB") : "for your portal"}</p></div><div className="grid grid-cols-3 gap-5 text-left sm:min-w-80 sm:text-right"><ClientReportMetric label="Views" value={report.analytics.current.views} /><ClientReportMetric label="Enquiries" value={report.analytics.current.conversions} /><ClientReportMetric label="Search clicks" value={report.analytics.current.searchClicks} /></div></summary><div className="mt-6 grid gap-6 border-t border-black/8 pt-6 md:grid-cols-2"><ClientReportList title="Highlights" rows={report.highlights} /><ClientReportList title="Next steps" rows={report.nextSteps} /></div><div className="mt-6 grid gap-5 md:grid-cols-2"><ClientReportTable title="Top pages" rows={report.analytics.pages.slice(0, 5).map(page => [page.path, `${page.views} views`])} /><ClientReportTable title="Search visibility" rows={report.analytics.queries.slice(0, 5).map(query => [query.query, `${query.clicks} clicks`])} /></div></details>)}</div> : <div className="p-8 text-center sm:p-10"><CalendarDays className="mx-auto text-black/20" /><p className="mt-3 font-medium text-black/65">Your first monthly report will appear here</p><p className="mt-1 text-sm text-black/42">Live results above continue updating in the meantime.</p></div>}</Surface>;
}

function ClientReportMetric({ label, value }: { label: string; value: number }) { return <div><p className="text-[9px] uppercase tracking-[0.12em] text-black/35">{label}</p><p className="mt-1 font-serif text-xl tabular-nums">{value.toLocaleString("en-GB")}</p></div>; }
function ClientReportList({ title, rows }: { title: string; rows: string[] }) { return <div><h3 className="text-[10px] uppercase tracking-[0.14em] text-black/38">{title}</h3><ul className="mt-3 space-y-2">{rows.map(row => <li key={row} className="text-sm leading-6 text-black/55">{row}</li>)}</ul></div>; }
function ClientReportTable({ title, rows }: { title: string; rows: string[][] }) { return <div><h3 className="text-[10px] uppercase tracking-[0.14em] text-black/38">{title}</h3>{rows.length ? <div className="mt-3 divide-y divide-black/8 border-y border-black/8">{rows.map(row => <div key={row[0]} className="flex items-center justify-between gap-4 py-2.5 text-sm"><span className="min-w-0 truncate text-black/58">{row[0]}</span><span className="shrink-0 text-xs tabular-nums text-black/42">{row[1]}</span></div>)}</div> : <p className="mt-3 text-sm text-black/40">No data in this report.</p>}</div>; }

function ResultMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="border-b border-r border-black/8 p-5 lg:border-b-0"><div className="flex items-center gap-2 text-[var(--portal-accent)]">{icon}<span className="text-[10px] uppercase tracking-[0.13em] text-black/38">{label}</span></div><p className="mt-3 font-serif text-3xl">{value}</p></div>;
}

function HomeView({
  client,
  data,
  previewHrefPrefix,
  providerName,
}: {
  client: Client;
  data: CustomerPortalData;
  previewHrefPrefix?: string;
  providerName: string;
}) {
  const active = modeContent(data, providerName);
  const homeCopy = pageContent(data, "home", providerName);
  const homePresentation = data.presentation.home;
  const copyTokens = portalCopyTokens(data, providerName);
  const projectLabel = portalProjectLabel(data.products);
  const outstanding = data.invoices.filter(invoice => invoice.status === "sent" || invoice.status === "overdue");
  const latestFile = data.files[0];
  const pendingApproval = data.approvals.find(approval => approval.status === "pending");
  const briefNeedsAttention = data.mode === "onboarding" && !data.brief.submittedAt;
  const configuredSupportCta = data.products.find(product => product.supportCta?.trim())?.supportCta?.trim();
  const nextAction = outstanding.length
    ? customerHref("billing", previewHrefPrefix)
    : data.mode === "maintenance"
      ? customerHref("support", previewHrefPrefix)
      : `${customerHref("project", previewHrefPrefix)}${pendingApproval ? "#approvals" : briefNeedsAttention ? "#project-brief" : "#stage-actions"}`;
  const nextActionLabel = outstanding.length
    ? "Review billing"
    : pendingApproval
      ? "Review approval"
      : briefNeedsAttention
        ? "Complete your brief"
        : data.mode === "maintenance"
          ? configuredSupportCta || "Ask for support"
          : "Continue your project";

  return (
    <>
      <PageIntro
        eyebrow={homeCopy.eyebrow}
        title={homeCopy.title}
        body={data.welcomeNote || formatPortalCopy(homePresentation.welcomeBody || homeCopy.body, copyTokens)}
        action={(
          <Link href={nextAction} className="inline-flex min-h-11 items-center gap-2 self-start rounded-md bg-[var(--portal-hero)] px-5 text-sm font-medium text-white transition hover:bg-black">
            {nextActionLabel}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        )}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.55fr)]">
        <Surface className="overflow-hidden">
          <div className="mm-customer-dark border-b border-black/8 bg-[var(--portal-hero)] px-6 py-7 text-white sm:px-8 sm:py-9">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">{active.eyebrow}</p>
              <span className="rounded-full border border-white/15 px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-white/70">
                {active.label}
              </span>
            </div>
            <h2 className="mt-7 max-w-2xl font-serif text-3xl leading-tight sm:text-4xl">{active.heading}</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/57">{active.body}</p>
            <div className="mt-9">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-white/45">
                <span>Project progress</span>
                <span>{active.progress}%</span>
              </div>
              <div className="mt-3 h-px bg-white/15">
                <div className="h-px bg-[var(--portal-accent)]" style={{ width: `${active.progress}%` }} />
              </div>
            </div>
          </div>
          <div className="grid divide-y divide-black/8 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <HomeMetric label={data.products.length > 1 ? "Your services" : "Your service"} value={data.products.length ? data.products.map(product => product.name).join(", ") : data.servicePlan} />
            <HomeMetric label="Files ready" value={`${data.files.length} available`} />
            <HomeMetric label="Support" value={`${data.requests.filter(item => item.status === "open").length} open requests`} />
          </div>
        </Surface>

        <Surface className="flex flex-col p-6 sm:p-7">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white text-[var(--portal-accent)]">
            <Sparkles size={17} strokeWidth={1.5} aria-hidden="true" />
          </div>
          <p className="mt-6 text-[10px] uppercase tracking-[0.18em] text-black/40">{formatPortalCopy(homePresentation.nextMoveEyebrow, copyTokens)}</p>
          <h2 className="mt-2 font-serif text-2xl">{nextActionLabel}</h2>
          <p className="mt-3 text-sm leading-6 text-black/52">{active.focus}</p>
          <Link href={nextAction} className="mt-auto inline-flex items-center gap-2 pt-8 text-sm font-medium text-[var(--portal-accent)]">
            Continue <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </Surface>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <QuickLink icon={<FolderKanban size={18} />} title={projectLabel} body="See progress and what happens next." href={customerHref("project", previewHrefPrefix)} />
        <QuickLink icon={<Files size={18} />} title="Files" body={latestFile ? `Latest: ${latestFile.name}` : "Your shared documents and inspiration."} href={customerHref("files", previewHrefPrefix)} />
        <QuickLink
          icon={<CreditCard size={18} />}
          title="Billing"
          body={outstanding.length ? `${outstanding.length} invoice${outstanding.length === 1 ? "" : "s"} need attention.` : "Your plan and invoices are up to date."}
          href={customerHref("billing", previewHrefPrefix)}
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Surface className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-black/40">{formatPortalCopy(homePresentation.recentUpdatesEyebrow, copyTokens)}</p>
              <h2 className="mt-2 font-serif text-2xl">{formatPortalCopy(homePresentation.projectLogTitle, copyTokens)}</h2>
            </div>
            <Clock3 size={18} className="text-black/30" aria-hidden="true" />
          </div>
          {data.activity.length === 0 ? (
            <p className="mt-8 border-t border-black/10 pt-5 text-sm leading-6 text-black/45">Your first update will appear here as the project moves forward.</p>
          ) : (
            <ul className="mt-6 divide-y divide-black/8 border-t border-black/10">
              {data.activity.slice(0, 4).map(item => (
                <li key={item.id} className="grid grid-cols-[8px_1fr_auto] items-start gap-3 py-4">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#a5813d]" />
                  <p className="text-sm leading-5 text-black/65">{item.message}</p>
                  <time className="text-[10px] uppercase tracking-wide text-black/35">{formatDate(item.ts)}</time>
                </li>
              ))}
            </ul>
          )}
        </Surface>

        <Surface className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-black/40">{formatPortalCopy(homePresentation.careEyebrow, copyTokens)}</p>
              <h2 className="mt-2 font-serif text-2xl">{formatPortalCopy(homePresentation.careTitle, copyTokens)}</h2>
            </div>
            <ShieldCheck size={19} className="text-[var(--portal-accent)]" aria-hidden="true" />
          </div>
          <p className="mt-5 max-w-xl text-sm leading-6 text-black/52">
            {formatPortalCopy(homePresentation.careBody, copyTokens)}
          </p>
          <Link href={customerHref("support", previewHrefPrefix)} className="mt-7 inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 bg-white px-4 text-sm font-medium">
            {formatPortalCopy(homePresentation.careButtonLabel, copyTokens)} <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </Surface>
      </div>
    </>
  );
}

function HomeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-6 py-5">
      <p className="text-[10px] uppercase tracking-[0.14em] text-black/35">{label}</p>
      <p className="mt-2 truncate text-sm font-medium">{value}</p>
    </div>
  );
}

function QuickLink({ icon, title, body, href }: { icon: React.ReactNode; title: string; body: string; href: string }) {
  return (
    <Link href={href} className="group rounded-md border border-black/10 bg-[var(--portal-surface)] p-5 transition hover:-translate-y-0.5 hover:border-[var(--portal-accent)] hover:shadow-[0_14px_35px_rgba(35,29,18,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <span className="text-[var(--portal-accent)]">{icon}</span>
        <ArrowUpRight size={15} className="text-black/25 transition group-hover:text-[var(--portal-accent)]" aria-hidden="true" />
      </div>
      <h3 className="mt-7 font-serif text-xl">{title}</h3>
      <p className="mt-2 text-sm leading-5 text-black/48">{body}</p>
    </Link>
  );
}

function ProjectView({
  client,
  data,
  previewHrefPrefix,
  providerName,
}: {
  client: Client;
  data: CustomerPortalData;
  previewHrefPrefix?: string;
  providerName: string;
}) {
  const active = modeContent(data, providerName);
  const projectLabel = portalProjectLabel(data.products);
  const configuredSupportCta = data.products.find(product => product.supportCta?.trim())?.supportCta?.trim();
  const stages: CustomerPortalMode[] = ["onboarding", "designing", "developed-launch", "maintenance"];
  const activeIndex = stages.indexOf(data.mode);
  const customerProperties = data.properties.filter(property =>
    property.kind === "website" || property.kind === "client-portal" || property.kind === "dev-portal",
  );
  const pendingDesignApproval = data.approvals.some(approval => approval.type === "design" && approval.status === "pending");
  const pendingLaunchApproval = data.approvals.some(approval => approval.type === "launch" && approval.status === "pending");
  const hasCustomerFiles = data.files.some(file => file.category === "inspiration" || file.category === "design-feedback" || file.category === "brief");
  const hasOpenStageRequest = data.requests.some(request => request.status !== "closed" && (
    data.mode === "designing" ? request.type === "design-feedback" : request.type === "suggestion" || request.type === "support-ticket"
  ));
  const hasPreview = customerProperties.some(property => Boolean(propertyDestination(property).href));
  const hasLiveProperty = customerProperties.some(property => property.status === "live" || property.status === "redirected");
  const stageTasks: Record<CustomerPortalMode, CustomerStageTask[]> = {
    onboarding: [
      {
        label: "Complete your project brief",
        detail: data.brief.submittedAt ? `Your latest answers are with ${providerName}.` : "Give the team the context needed to start well.",
        complete: Boolean(data.brief.submittedAt),
        href: "#project-brief",
      },
      {
        label: "Share inspiration or useful files",
        detail: hasCustomerFiles ? "Your shared references are attached to the project." : "Add examples, documents, or links that show your direction.",
        complete: hasCustomerFiles,
        href: customerHref("files", previewHrefPrefix),
      },
      {
        label: "Review your agreements and costs",
        detail: data.contracts.some(contract => contract.status === "sent")
          ? "An agreement is waiting for your response."
          : "There are no agreements waiting for you.",
        complete: !data.contracts.some(contract => contract.status === "sent"),
        href: customerHref("billing", previewHrefPrefix),
      },
    ],
    designing: [
      {
        label: "Review the latest direction",
        detail: hasPreview ? "Your connected preview is ready to open above." : `${providerName} will connect a preview here when it is ready.`,
        complete: hasPreview,
        href: hasPreview ? "#connected-work" : undefined,
      },
      {
        label: "Leave focused feedback",
        detail: hasOpenStageRequest ? "Your latest design feedback is with the team." : "Say what feels right, what should change, and why.",
        complete: hasOpenStageRequest,
        href: "#stage-actions",
      },
      {
        label: "Answer pending decisions",
        detail: pendingDesignApproval ? "A design decision is waiting below." : "No design approval needs your attention.",
        complete: !pendingDesignApproval,
        href: "#approvals",
      },
    ],
    "developed-launch": [
      {
        label: "Explore the latest build",
        detail: hasPreview ? "Your current build is available below." : "The preview link will appear when the build is ready.",
        complete: hasPreview,
        href: hasPreview ? "#connected-work" : undefined,
      },
      {
        label: "Send final checks",
        detail: hasOpenStageRequest ? `Your latest build note is with ${providerName}.` : "Flag anything to check before launch.",
        complete: hasOpenStageRequest,
        href: "#stage-actions",
      },
      {
        label: "Confirm launch",
        detail: pendingLaunchApproval ? "A launch decision is waiting below." : "No launch approval needs your attention.",
        complete: !pendingLaunchApproval,
        href: "#approvals",
      },
    ],
    maintenance: [
      {
        label: "Open your live experience",
        detail: hasLiveProperty ? "Your live destination is connected above." : `${providerName} is preparing the live connection.`,
        complete: hasLiveProperty,
        href: hasLiveProperty ? "#connected-work" : undefined,
      },
      {
        label: "Request support when needed",
        detail: hasOpenStageRequest ? `Your current request is visible to ${providerName}.` : "Changes and issues stay attached to the project.",
        complete: hasOpenStageRequest,
        href: "#stage-actions",
      },
      {
        label: "Keep project files together",
        detail: "Documents, references, and future updates remain available in Files.",
        complete: data.files.length > 0,
        href: customerHref("files", previewHrefPrefix),
      },
    ],
  };
  const adaptiveTasks: CustomerStageTask[] = data.products.length
    ? [
        ...data.products.map(product => ({
          label: product.name,
          detail: portalStageFocus(product, data.mode),
          complete: data.mode === "maintenance",
          href: data.mode === "onboarding" ? "#project-brief" : "#stage-actions",
        })),
        {
          label: data.mode === "onboarding" ? "Keep your details together" : "Review shared files and decisions",
          detail: data.mode === "onboarding"
            ? "Your brief, agreements, references, and costs stay together here."
            : "Files, feedback and approvals remain attached to this work.",
          complete: data.files.length > 0 || data.contracts.length > 0,
          href: customerHref("files", previewHrefPrefix),
        },
      ]
    : stageTasks[data.mode];

  return (
    <>
      <PageIntro {...pageContent(data, "project", providerName)} />
      {data.products.length > 0 ? (
        <Surface className="mb-5 overflow-hidden">
          <div className="border-b border-black/8 px-6 py-5">
            <p className="text-[10px] uppercase tracking-[0.16em] text-black/40">Your work with {providerName}</p>
            <h2 className="mt-2 font-serif text-2xl">{data.products.length === 1 ? data.products[0].name : `${data.products.length} parts of your project`}</h2>
          </div>
          <div className={`grid gap-px bg-black/8 ${data.products.length > 1 ? "md:grid-cols-2" : ""}`}>
            {data.products.map(product => {
              const definition = portalProductDefinition(product);
              const deliverables = product.deliverables.length ? product.deliverables : definition?.deliverables ?? [];
              return (
                <article key={product.id} className="bg-[var(--portal-surface)] p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-medium">{product.name}</h3>
                      <p className="mt-2 text-sm leading-6 text-black/50">{product.description}</p>
                    </div>
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--portal-accent)]" aria-hidden="true" />
                  </div>
                  {deliverables.length ? (
                    <ul className="mt-5 grid gap-2 border-t border-black/8 pt-4">
                      {deliverables.map(item => (
                        <li key={item} className="flex items-start gap-2 text-xs leading-5 text-black/55">
                          <Check size={13} className="mt-1 shrink-0 text-[var(--portal-accent)]" aria-hidden="true" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="mt-5 text-xs leading-5 text-[var(--portal-accent)]">{portalStageFocus(product, data.mode)}</p>
                </article>
              );
            })}
          </div>
        </Surface>
      ) : null}
      <Surface className="overflow-hidden">
        <div className="grid gap-8 p-6 lg:grid-cols-[1fr_360px] lg:p-8">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-black/40">Journey</p>
            <ol className="mt-6 grid gap-0">
              {stages.map((stage, index) => {
                const done = index < activeIndex || data.mode === "maintenance";
                const current = index === activeIndex;
                return (
                  <li key={stage} className="grid grid-cols-[32px_1fr] gap-4">
                    <div className="flex flex-col items-center">
                      <span className={[
                        "flex h-8 w-8 items-center justify-center rounded-full border text-xs",
                        done ? "border-[var(--portal-hero)] bg-[var(--portal-hero)] text-white" : current ? "border-[var(--portal-accent)] bg-[#f5eddd] text-[var(--portal-accent)]" : "border-black/12 bg-white text-black/30",
                      ].join(" ")}>
                        {done ? <Check size={14} aria-hidden="true" /> : index + 1}
                      </span>
                      {index < stages.length - 1 && <span className="min-h-12 w-px flex-1 bg-black/10" />}
                    </div>
                    <div className="pb-8">
                      <p className={`text-sm font-medium ${current ? "text-[var(--portal-accent)]" : "text-black/70"}`}>{formatPortalCopy(data.presentation.stages[stage].label, portalCopyTokens(data, providerName))}</p>
                      <p className="mt-1 text-xs leading-5 text-black/42">{formatPortalCopy(data.presentation.stages[stage].focus, portalCopyTokens(data, providerName))}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
          <aside className="rounded-md bg-[var(--portal-hero)] p-6 text-white">
            <p className="text-[10px] uppercase tracking-[0.17em] text-white/42">At a glance</p>
            <dl className="mt-6 divide-y divide-white/10">
              <ProjectDetail label="Client" value={client.name} />
              <ProjectDetail label="Current stage" value={active.label} />
              <ProjectDetail label="Service plan" value={data.servicePlan} />
              {data.products.length ? <ProjectDetail label="Included services" value={data.products.map(product => product.name).join(", ")} /> : null}
              <ProjectDetail label="Portal opened" value={formatDate(data.builtAt)} />
            </dl>
          </aside>
        </div>
      </Surface>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Surface className="p-6">
          <div id="connected-work" className="scroll-mt-24">
          <div className="flex items-center gap-3">
            <MonitorCheck size={19} className="text-[var(--portal-accent)]" aria-hidden="true" />
            <h2 className="font-serif text-2xl">Work underway</h2>
          </div>
          {customerProperties.length === 0 ? (
            <p className="mt-5 text-sm leading-6 text-black/45">Your previews and live links will appear here as they are connected.</p>
          ) : (
            <ul className="mt-5 divide-y divide-black/8 border-t border-black/10">
              {customerProperties.map(property => {
                const destination = propertyDestination(property);
                return (
                  <li key={property.id} className="flex items-center justify-between gap-4 py-4">
                    <div>
                      <p className="text-sm font-medium">{property.label || "Connected project"}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-black/38">{customerPropertyStatus(property.status)}</p>
                    </div>
                    {destination.href && (
                      <a href={destination.href} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-[var(--portal-accent)]">
                        {destination.label} <ExternalLink size={12} aria-hidden="true" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          </div>
        </Surface>
        <Surface className="p-6">
          <div className="flex items-center gap-3">
            <MessageSquareText size={19} className="text-[var(--portal-accent)]" aria-hidden="true" />
            <h2 className="font-serif text-2xl">Need to add something?</h2>
          </div>
          <p className="mt-5 text-sm leading-6 text-black/50">Ideas and feedback belong with the project, where nothing gets lost between messages.</p>
          <div className="mt-7 flex flex-wrap gap-2">
            <Link href={customerHref("files", previewHrefPrefix)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 bg-white px-4 text-sm font-medium">Share inspiration</Link>
            <Link href={customerHref("support", previewHrefPrefix)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--portal-hero)] px-4 text-sm font-medium text-white">{configuredSupportCta || "Leave feedback"}</Link>
          </div>
        </Surface>
      </div>
      <CustomerStageWorkspace
        clientId={client.id}
        mode={data.mode}
        tasks={adaptiveTasks}
        properties={customerProperties}
        readOnly={Boolean(previewHrefPrefix)}
        providerName={providerName}
      />
      <CustomerProjectBriefForm clientId={client.id} initialBrief={data.brief} readOnly={Boolean(previewHrefPrefix)} providerName={providerName} />
      <CustomerApprovals
        clientId={client.id}
        initialApprovals={data.approvals}
        readOnly={Boolean(previewHrefPrefix)}
        providerName={providerName}
      />
    </>
  );
}

function ProjectDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-4 first:pt-0">
      <dt className="text-[10px] uppercase tracking-[0.14em] text-white/38">{label}</dt>
      <dd className="mt-1 text-sm text-white/78">{value}</dd>
    </div>
  );
}

function FilesView({ client, data, readOnly, providerName }: { client: Client; data: CustomerPortalData; readOnly: boolean; providerName: string }) {
  return (
    <>
      <PageIntro {...pageContent(data, "files", providerName)} />
      <Surface className="p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-black/40">{data.files.length} items</p>
            <h2 className="mt-2 font-serif text-2xl">Shared with you</h2>
          </div>
          <Files size={19} className="text-[var(--portal-accent)]" aria-hidden="true" />
        </div>
        {data.files.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center border-b border-black/10 text-center">
            <File size={24} strokeWidth={1.3} className="text-black/25" aria-hidden="true" />
            <p className="mt-4 font-serif text-xl">Your file room is ready.</p>
            <p className="mt-2 max-w-sm text-sm leading-6 text-black/45">{providerName} documents will appear here. You can share inspiration, feedback, or useful links below.</p>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-black/8 border-y border-black/10">
            {data.files.map(file => <CustomerFileRow key={file.id} file={file} />)}
          </ul>
        )}
        <div className="mt-8">
          <p className="mb-4 text-[10px] uppercase tracking-[0.16em] text-black/40">Share with {providerName}</p>
          <CustomerFileLinkForm clientId={client.id} readOnly={readOnly} />
        </div>
      </Surface>
    </>
  );
}

function CustomerFileRow({ file }: { file: CustomerFile }) {
  return (
    <li className="grid grid-cols-[32px_1fr_auto] items-center gap-3 py-4">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/[0.035] text-[var(--portal-accent)]"><FileIcon category={file.category} /></span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{file.name}</p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-black/35">{file.category.replaceAll("-", " ")} · {formatDate(file.uploadedAt)}</p>
      </div>
      <a href={file.url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 rounded-md border border-black/10 bg-white px-3 text-xs font-medium">
        Open <ExternalLink size={12} aria-hidden="true" />
      </a>
    </li>
  );
}

function BillingView({ client, data, readOnly, providerName }: { client: Client; data: CustomerPortalData; readOnly: boolean; providerName: string }) {
  const paid = data.invoices.filter(invoice => invoice.status === "paid").reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const outstanding = data.invoices.filter(invoice => invoice.status === "sent" || invoice.status === "overdue").reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const currency = data.invoices[0]?.currency || "gbp";

  return (
    <>
      <PageIntro
        {...pageContent(data, "billing", providerName)}
        action={data.billingUrl ? (
          <a href={data.billingUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 self-start rounded-md bg-[var(--portal-hero)] px-5 text-sm font-medium text-white">
            Open secure billing <ExternalLink size={14} aria-hidden="true" />
          </a>
        ) : undefined}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Surface className="p-6 lg:col-span-2">
          <p className="text-[10px] uppercase tracking-[0.16em] text-black/40">Current service</p>
          <h2 className="mt-3 font-serif text-3xl">{data.servicePlan}</h2>
          {data.planSummary ? <p className="mt-3 max-w-2xl text-sm leading-6 text-black/52">{data.planSummary}</p> : null}
          {data.planIncludes.length > 0 ? (
            <ul className="mt-6 grid gap-2 border-t border-black/10 pt-5 sm:grid-cols-2">
              {data.planIncludes.map(item => (
                <li key={item} className="flex items-start gap-2 text-sm leading-6 text-black/62">
                  <Check size={14} className="mt-1 shrink-0 text-[var(--portal-accent)]" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-8 grid gap-4 border-t border-black/10 pt-5 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.13em] text-black/35">Account status</p>
              <p className="mt-2 text-sm font-medium">Active with {providerName}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.13em] text-black/35">Agreed investment</p>
              <p className="mt-2 text-sm font-medium">{data.agreedProjectValue || "As agreed"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.13em] text-black/35">Payment schedule</p>
              <p className="mt-2 text-sm font-medium">{data.billingCadence}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.13em] text-black/35">Project deposit</p>
              <p className="mt-2 text-sm font-medium">{data.lockInPaid ? "Received" : "Not yet recorded"}</p>
            </div>
          </div>
        </Surface>
        <Surface className="!bg-[var(--portal-hero)] p-6 text-white">
          <CreditCard size={19} className="text-[var(--portal-accent)]" aria-hidden="true" />
          <p className="mt-8 text-[10px] uppercase tracking-[0.16em] text-white/40">Outstanding</p>
          <p className="mt-2 font-serif text-3xl">{formatMoney(outstanding, currency)}</p>
          <p className="mt-2 text-xs text-white/45">{paid > 0 ? `${formatMoney(paid, currency)} paid to date` : "No paid invoices recorded yet"}</p>
        </Surface>
      </div>

      <Surface className="mt-5 overflow-hidden">
        <div className="flex items-center justify-between border-b border-black/10 px-6 py-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-black/40">Billing history</p>
            <h2 className="mt-2 font-serif text-2xl">Invoices</h2>
          </div>
          <ReceiptText size={19} className="text-[var(--portal-accent)]" aria-hidden="true" />
        </div>
        {data.invoices.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-serif text-xl">No invoices yet.</p>
            <p className="mt-2 text-sm text-black/45">When an invoice is issued, it will appear here automatically.</p>
          </div>
        ) : (
          <ul className="divide-y divide-black/8">
            {data.invoices.map(invoice => {
              const needsPayment = invoice.status === "sent" || invoice.status === "overdue";
              return (
              <li key={invoice.id} className="grid gap-3 px-6 py-5 sm:grid-cols-[1fr_130px_130px_auto] sm:items-center">
                <div>
                  <p className="text-sm font-medium">{invoice.number}</p>
                  {invoice.lineItems[0]?.description ? (
                    <p className="mt-1 text-xs text-black/48">{invoice.lineItems[0].description}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-black/38">Issued {formatDate(invoice.issuedAt)}</p>
                </div>
                <p className="text-xs text-black/48">Due {formatDate(invoice.dueAt)}</p>
                <p className="text-sm font-medium sm:text-right">{formatMoney(invoice.totalCents, invoice.currency)}</p>
                <div className="flex items-center gap-2 sm:justify-end">
                  <InvoiceStatus status={invoice.status} />
                  {needsPayment && data.billingUrl ? (
                    <a
                      href={data.billingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-9 items-center rounded-md bg-[var(--portal-hero)] px-3 text-xs font-medium text-white"
                    >
                      Pay
                    </a>
                  ) : null}
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </Surface>
      <CustomerAgreements clientId={client.id} initialContracts={data.contracts} readOnly={readOnly} providerName={providerName} />
    </>
  );
}

function SupportView({ client, data, readOnly, providerName }: { client: Client; data: CustomerPortalData; readOnly: boolean; providerName: string }) {
  const supportLinks = [
    {
      label: "Send a request",
      detail: "Best for support, feedback, and changes",
      href: "#support-request",
      icon: <MessageSquareText size={17} aria-hidden="true" />,
      external: false,
    },
    ...(data.support.email ? [{
      label: `Email ${providerName}`,
      detail: data.support.email,
      href: `mailto:${data.support.email}`,
      icon: <Mail size={17} aria-hidden="true" />,
      external: false,
    }] : []),
    ...(data.support.phone ? [{
      label: `Call ${providerName}`,
      detail: data.support.phone,
      href: `tel:${data.support.phone.replace(/[^\d+]/g, "")}`,
      icon: <Phone size={17} aria-hidden="true" />,
      external: false,
    }] : []),
    ...(data.support.whatsappUrl ? [{
      label: "Open WhatsApp",
      detail: "Continue the conversation",
      href: data.support.whatsappUrl,
      icon: <MessageCircle size={17} aria-hidden="true" />,
      external: true,
    }] : []),
  ];

  return (
    <>
      <PageIntro {...pageContent(data, "support", providerName)} />
      <nav
        aria-label="Support contact options"
        className="mb-5 grid gap-px overflow-hidden rounded-md border border-black/10 bg-black/10 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]"
      >
        {supportLinks.map(link => (
          <a
            key={link.label}
            href={link.href}
            target={link.external ? "_blank" : undefined}
            rel={link.external ? "noreferrer" : undefined}
            className="group flex min-h-24 items-center gap-4 bg-[var(--portal-surface)] px-5 py-4 transition hover:bg-white"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 text-[var(--portal-accent)]">
              {link.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-[#1b1a18]">{link.label}</span>
              <span className="mt-1 block truncate text-xs text-black/42">{link.detail}</span>
            </span>
            <ArrowUpRight size={13} className="ml-auto shrink-0 text-black/25 transition group-hover:text-[var(--portal-accent)]" aria-hidden="true" />
          </a>
        ))}
      </nav>
      <Surface className="p-6 sm:p-8">
        <div className="grid gap-6 sm:grid-cols-3">
          <SupportPromise icon={<CircleHelp size={18} />} title="One clear place" body="Every request stays attached to your account." />
          <SupportPromise icon={<MessageSquareText size={18} />} title="Human response" body={`The ${providerName} team reads and handles it.`} />
          <SupportPromise icon={<ShieldCheck size={18} />} title="Full context" body="We can see the project behind your request." />
        </div>
        <div className="mt-8">
          <CustomerSupportForm clientId={client.id} initialRequests={data.requests} readOnly={readOnly} providerName={providerName} />
        </div>
      </Surface>
    </>
  );
}

function SupportPromise({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="border-b border-black/10 pb-5 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-5 last:border-0">
      <span className="text-[var(--portal-accent)]">{icon}</span>
      <p className="mt-4 text-sm font-medium">{title}</p>
      <p className="mt-2 text-xs leading-5 text-black/45">{body}</p>
    </div>
  );
}

function ResourcesView({ data, previewHrefPrefix, providerName }: { data: CustomerPortalData; previewHrefPrefix?: string; providerName: string }) {
  const resources = [
    {
      title: "Your project guide",
      body: "See the current stage, the work underway, pending decisions, and exactly what happens next.",
      href: customerHref("project", previewHrefPrefix),
      icon: <FolderKanban size={20} aria-hidden="true" />,
      label: "Open project",
    },
    {
      title: "Files and handover",
      body: "Keep briefs, recordings, references, working files, and final handover material in one place.",
      href: customerHref("files", previewHrefPrefix),
      icon: <Files size={20} aria-hidden="true" />,
      label: "Open files",
    },
    {
      title: "Support and care",
      body: "Ask a question, request a change, or report an issue without losing the project context.",
      href: customerHref("support", previewHrefPrefix),
      icon: <CircleHelp size={20} aria-hidden="true" />,
      label: "Open support",
    },
  ];
  return (
    <>
      <PageIntro
        {...pageContent(data, "resources", providerName)}
      />
      <div className="grid gap-5 lg:grid-cols-3" aria-label="Resources">
        {resources.map(resource => (
          <Link key={resource.title} href={resource.href} className="group flex min-h-64 flex-col rounded-md border border-black/10 bg-[var(--portal-surface)] p-6 transition hover:-translate-y-0.5 hover:border-[var(--portal-accent)] hover:bg-white hover:shadow-[0_18px_45px_rgba(35,29,18,0.08)] sm:p-7">
            <span className="grid size-11 place-items-center rounded-md border border-black/10 bg-white text-[var(--portal-accent)] transition group-hover:border-[var(--portal-accent)]">
              {resource.icon}
            </span>
            <h2 className="mt-8 font-serif text-2xl text-[#1b1a18]">{resource.title}</h2>
            <p className="mt-3 text-sm leading-6 text-black/50">{resource.body}</p>
            <span className="mt-auto inline-flex items-center gap-2 pt-8 text-sm font-medium text-[var(--portal-accent)]">
              {resource.label} <ArrowRight size={14} aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>
      <Surface className="mt-5 overflow-hidden">
        <div className="grid gap-px bg-black/8 md:grid-cols-3">
          <ResourceStep number="01" title="Check what needs you" body="Your home and project pages surface approvals, billing, and the next useful action." />
          <ResourceStep number="02" title="Keep context together" body="Share files and feedback inside the portal so every decision remains attached to the work." />
          <ResourceStep number="03" title="Return whenever needed" body="Invoices, agreements, results, and support history remain available from the same account." />
        </div>
      </Surface>
    </>
  );
}

function ResourceStep({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div className="bg-[var(--portal-surface)] p-6 sm:p-7">
      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--portal-accent)]">{number}</p>
      <h3 className="mt-5 text-sm font-medium text-[#1b1a18]">{title}</h3>
      <p className="mt-2 text-xs leading-5 text-black/45">{body}</p>
    </div>
  );
}

function RecordField({ label, value }: { label: string; value?: string }) {
  return (
    <div className="border-b border-black/8 py-4 last:border-0">
      <dt className="text-[10px] uppercase tracking-[0.14em] text-black/35">{label}</dt>
      <dd className="mt-1.5 break-words text-sm leading-6 text-black/68">{value || "Not recorded"}</dd>
    </div>
  );
}

function RecordView({
  client,
  data,
  previewHrefPrefix,
  providerName,
}: {
  client: Client;
  data: CustomerPortalData;
  previewHrefPrefix?: string;
  providerName: string;
}) {
  const recordingFiles = data.files.filter(file => file.category === "recording");
  const recordingLinks = data.record.links.filter(link => link.kind === "recording");
  const meetingLinks = data.record.links.filter(link => link.kind === "meeting");
  const inspirationLinks = data.record.links.filter(link => link.kind === "inspiration");
  const nonDraftContracts = data.contracts.filter(contract => contract.status !== "draft");

  return (
    <>
      <PageIntro
        {...pageContent(data, "details", providerName)}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,.72fr)_minmax(0,1.28fr)]">
        <Surface className="p-6 sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-black/40">Personal information</p>
              <h2 className="mt-2 font-serif text-2xl">What we hold.</h2>
            </div>
            <UserRound size={19} className="text-[var(--portal-accent)]" aria-hidden="true" />
          </div>
          <dl className="mt-5 border-t border-black/10">
            <RecordField label="Business or account" value={client.name} />
            <RecordField label="Contact name" value={data.contactName} />
            <RecordField label="Email" value={data.record.email} />
            <RecordField label="Phone" value={data.record.phone} />
            {data.websiteUrl ? <RecordField label="Website" value={data.websiteUrl} /> : null}
            <RecordField label="Current plan" value={data.servicePlan} />
            <RecordField label="How we met" value={data.record.source} />
            <RecordField label="First recorded" value={data.record.capturedAt ? formatDate(data.record.capturedAt) : formatDate(client.createdAt)} />
            <RecordField label="Record updated" value={formatDate(client.updatedAt)} />
          </dl>
          {!previewHrefPrefix ? (
            <Link href="/portal/customer/account" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 bg-white px-4 text-sm font-medium">
              Manage your profile <ArrowRight size={14} aria-hidden="true" />
            </Link>
          ) : null}
        </Surface>

        <Surface className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-black/10 px-6 py-5 sm:px-7">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-black/40">Discovery & context</p>
              <h2 className="mt-2 font-serif text-2xl">Notes we hold about your project.</h2>
            </div>
            <NotebookText size={19} className="text-[var(--portal-accent)]" aria-hidden="true" />
          </div>
          {data.record.notes.length === 0 ? (
            <div className="px-6 py-12 text-center sm:px-7">
              <p className="font-serif text-xl">No additional notes are recorded.</p>
              <p className="mt-2 text-sm text-black/45">Your submitted project brief remains available on the Project page.</p>
            </div>
          ) : (
            <dl className="grid sm:grid-cols-2">
              {data.record.notes.map((note, index) => (
                <div
                  key={`${note.label}:${index}`}
                  className="border-b border-black/8 px-6 py-5 sm:px-7 sm:odd:border-r"
                >
                  <dt className="text-[10px] uppercase tracking-[0.14em] text-black/35">{note.label}</dt>
                  <dd className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black/65">{note.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </Surface>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Surface className="p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <PlayCircle size={19} className="text-[var(--portal-accent)]" aria-hidden="true" />
            <h2 className="font-serif text-2xl">Calls & meetings</h2>
          </div>
          {data.record.nextMeetingAt ? (
            <div className="mt-5 flex items-center gap-3 rounded-md border border-black/10 bg-white px-4 py-3">
              <CalendarDays size={16} className="text-[var(--portal-accent)]" aria-hidden="true" />
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-black/35">Next meeting</p>
                <p className="mt-1 text-sm font-medium">{formatDate(data.record.nextMeetingAt)}</p>
              </div>
            </div>
          ) : null}
          {recordingLinks.length + recordingFiles.length + meetingLinks.length === 0 ? (
            <p className="mt-5 text-sm leading-6 text-black/45">No call recordings or meeting links have been attached yet.</p>
          ) : (
            <ul className="mt-5 divide-y divide-black/8 border-y border-black/10">
              {recordingLinks.map(link => (
                <RecordLinkRow key={link.url} label={link.label} url={link.url} action="Rewatch" />
              ))}
              {recordingFiles.map(file => (
                <RecordLinkRow key={file.id} label={file.name} url={file.url} action="Rewatch" />
              ))}
              {meetingLinks.map(link => (
                <RecordLinkRow key={link.url} label={link.label} url={link.url} action="Open" />
              ))}
            </ul>
          )}
        </Surface>

        <Surface className="p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <BookOpenText size={19} className="text-[var(--portal-accent)]" aria-hidden="true" />
            <h2 className="font-serif text-2xl">References & inspiration</h2>
          </div>
          {inspirationLinks.length === 0 && !data.files.some(file => file.category === "inspiration") ? (
            <p className="mt-5 text-sm leading-6 text-black/45">No inspiration links are recorded yet.</p>
          ) : (
            <ul className="mt-5 divide-y divide-black/8 border-y border-black/10">
              {inspirationLinks.map(link => (
                <RecordLinkRow key={link.url} label={link.label} url={link.url} action="Open" />
              ))}
              {data.files.filter(file => file.category === "inspiration").map(file => (
                <RecordLinkRow key={file.id} label={file.name} url={file.url} action="Open" />
              ))}
            </ul>
          )}
          <Link href={customerHref("files", previewHrefPrefix)} className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[var(--portal-accent)]">
            View all project files <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </Surface>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Surface className="overflow-hidden">
          <div className="border-b border-black/10 px-6 py-5">
            <p className="text-[10px] uppercase tracking-[0.16em] text-black/40">Agreement record</p>
            <h2 className="mt-2 font-serif text-2xl">Agreements</h2>
          </div>
          {nonDraftContracts.length === 0 ? (
            <p className="px-6 py-10 text-sm text-black/45">No agreements have been issued yet.</p>
          ) : (
            <ul className="divide-y divide-black/8">
              {nonDraftContracts.map(contract => (
                <li key={contract.id} className="flex items-center justify-between gap-4 px-6 py-5">
                  <div>
                    <p className="text-sm font-medium">{contract.title}</p>
                    <p className="mt-1 text-xs capitalize text-black/40">{contract.status} · {formatDate(contract.issuedAt ?? contract.createdAt)}</p>
                  </div>
                  {contract.documentUrl ? (
                    <a href={contract.documentUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 rounded-md border border-black/10 bg-white px-3 text-xs font-medium">
                      Review <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Surface>

        <Surface className="overflow-hidden">
          <div className="border-b border-black/10 px-6 py-5">
            <p className="text-[10px] uppercase tracking-[0.16em] text-black/40">Payment record</p>
            <h2 className="mt-2 font-serif text-2xl">Invoices</h2>
          </div>
          {data.invoices.length === 0 ? (
            <p className="px-6 py-10 text-sm text-black/45">No invoices have been issued yet.</p>
          ) : (
            <ul className="divide-y divide-black/8">
              {data.invoices.map(invoice => (
                <li key={invoice.id} className="flex items-center justify-between gap-4 px-6 py-5">
                  <div>
                    <p className="text-sm font-medium">{invoice.number}</p>
                    <p className="mt-1 text-xs text-black/40">{formatDate(invoice.issuedAt)} · {invoice.status}</p>
                  </div>
                  <p className="text-sm font-medium">{formatMoney(invoice.totalCents, invoice.currency)}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-black/10 px-6 py-4">
            <Link href={customerHref("billing", previewHrefPrefix)} className="inline-flex items-center gap-2 text-sm font-medium text-[var(--portal-accent)]">
              Open billing <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </Surface>
      </div>

      <Surface className="mt-5 p-6 sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-black/40">Account history</p>
            <h2 className="mt-2 font-serif text-2xl">What has happened.</h2>
          </div>
          <Clock3 size={18} className="text-black/30" aria-hidden="true" />
        </div>
        {data.activity.length === 0 ? (
          <p className="mt-6 border-t border-black/10 pt-5 text-sm text-black/45">No customer-facing activity has been recorded yet.</p>
        ) : (
          <ol className="mt-6 divide-y divide-black/8 border-y border-black/10">
            {data.activity.map(item => (
              <li key={item.id} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <p className="text-sm leading-6 text-black/65">{item.message}</p>
                <time className="text-[10px] uppercase tracking-wide text-black/35">{formatDate(item.ts)}</time>
              </li>
            ))}
          </ol>
        )}
      </Surface>
    </>
  );
}

function RecordLinkRow({ label, url, action }: { label: string; url: string; action: string }) {
  return (
    <li className="flex items-center justify-between gap-4 py-4">
      <p className="min-w-0 truncate text-sm font-medium">{label}</p>
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-[var(--portal-accent)]">
        {action} <ExternalLink size={12} aria-hidden="true" />
      </a>
    </li>
  );
}
