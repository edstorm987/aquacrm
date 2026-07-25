import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
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
  Phone,
  ReceiptText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { getClientForAgency } from "@/server/tenants";
import type { Client } from "@/server/types";
import { CustomerAgreements, CustomerApprovals, CustomerFileLinkForm, CustomerProjectBriefForm, CustomerSupportForm } from "./_CustomerPortalActions";
import {
  loadCustomerPortalData,
  type CustomerFile,
  type CustomerPortalData,
  type CustomerPortalMode,
} from "./_portalData";

export type CustomerPortalSection = "home" | "project" | "files" | "billing" | "support" | "resources";

function customerHref(section: CustomerPortalSection, previewHrefPrefix?: string): string {
  if (previewHrefPrefix) return `${previewHrefPrefix}${section}`;
  return section === "home" ? "/portal/customer" : `/portal/customer/${section}`;
}

const MODE: Record<CustomerPortalMode, {
  label: string;
  eyebrow: string;
  heading: string;
  body: string;
  progress: number;
  focus: string;
}> = {
  onboarding: {
    label: "Onboarding",
    eyebrow: "A thoughtful beginning",
    heading: "We are laying the foundations.",
    body: "Your brief, priorities, ideas, and commercial details are being brought together before the creative work begins.",
    progress: 18,
    focus: "Share the details and inspiration that will help us understand your world.",
  },
  designing: {
    label: "Designing",
    eyebrow: "In the studio",
    heading: "Your direction is taking shape.",
    body: "We are turning strategy into a clear visual and digital experience. Your feedback keeps every decision purposeful.",
    progress: 48,
    focus: "Review the direction, leave focused feedback, and approve what comes next.",
  },
  "developed-launch": {
    label: "Build & launch",
    eyebrow: "Bringing it to life",
    heading: "The build is becoming real.",
    body: "Design, content, and technology are coming together. We are testing the details and preparing a confident launch.",
    progress: 82,
    focus: "Preview the latest build and confirm the final launch details.",
  },
  maintenance: {
    label: "Live care",
    eyebrow: "Always looked after",
    heading: "Your digital home is live.",
    body: "Milesymedia is keeping an eye on the important things while you use support and ongoing improvements as needed.",
    progress: 100,
    focus: "Use support for changes, questions, or anything that does not feel quite right.",
  },
};

async function context() {
  await ensureHydrated();
  const session = await requireRole("end-customer");
  if (!session.clientId) notFound();
  const client = getClientForAgency(session.agencyId, session.clientId);
  if (!client) notFound();
  const fallbackName = (session.email.split("@")[0] || "there").replace(/[._-]+/g, " ");
  return {
    session,
    client,
    data: await loadCustomerPortalData(client, fallbackName),
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
  return <section className={`rounded-md border border-black/10 bg-[#fbfaf8] ${className}`}>{children}</section>;
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
  const { client, data } = await context();
  if (section === "home") {
    const handoff = data.properties.find(property => property.status === "redirected" && safeExternalUrl(property.redirectTarget));
    if (handoff?.redirectTarget) redirect(handoff.redirectTarget);
  }
  return <CustomerPortalContent section={section} client={client} data={data} />;
}

export function CustomerPortalContent({
  section,
  client,
  data,
  previewHrefPrefix,
}: {
  section: CustomerPortalSection;
  client: Client;
  data: CustomerPortalData;
  previewHrefPrefix?: string;
}) {
  if (section === "project") return <ProjectView client={client} data={data} previewHrefPrefix={previewHrefPrefix} />;
  const readOnly = Boolean(previewHrefPrefix);
  if (section === "files") return <FilesView client={client} data={data} readOnly={readOnly} />;
  if (section === "billing") return <BillingView client={client} data={data} readOnly={readOnly} />;
  if (section === "support") return <SupportView client={client} data={data} readOnly={readOnly} />;
  if (section === "resources") return <ResourcesView />;
  return <HomeView client={client} data={data} previewHrefPrefix={previewHrefPrefix} />;
}

function HomeView({
  client,
  data,
  previewHrefPrefix,
}: {
  client: Client;
  data: CustomerPortalData;
  previewHrefPrefix?: string;
}) {
  const active = MODE[data.mode];
  const outstanding = data.invoices.filter(invoice => invoice.status === "sent" || invoice.status === "overdue");
  const latestFile = data.files[0];
  const nextAction = customerHref(data.mode === "maintenance" ? "support" : "project", previewHrefPrefix);

  return (
    <>
      <PageIntro
        eyebrow={`Welcome, ${firstName(data.contactName)}`}
        title="Everything, beautifully in one place."
        body={data.welcomeNote || "Your project, conversations, files, billing, and support live here throughout our work together."}
        action={(
          <Link href={nextAction} className="inline-flex min-h-11 items-center gap-2 self-start rounded-md bg-[#1b1a18] px-5 text-sm font-medium text-white transition hover:bg-black">
            {data.mode === "maintenance" ? "Ask for support" : "View your project"}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        )}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.55fr)]">
        <Surface className="overflow-hidden">
          <div className="border-b border-black/8 bg-[#1b1a18] px-6 py-7 text-white sm:px-8 sm:py-9">
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
            <HomeMetric label="Your plan" value={data.servicePlan} />
            <HomeMetric label="Files ready" value={`${data.files.length} available`} />
            <HomeMetric label="Support" value={`${data.requests.filter(item => item.status === "open").length} open requests`} />
          </div>
        </Surface>

        <Surface className="flex flex-col p-6 sm:p-7">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white text-[var(--portal-accent)]">
            <Sparkles size={17} strokeWidth={1.5} aria-hidden="true" />
          </div>
          <p className="mt-6 text-[10px] uppercase tracking-[0.18em] text-black/40">Your next move</p>
          <h2 className="mt-2 font-serif text-2xl">Keep the project moving.</h2>
          <p className="mt-3 text-sm leading-6 text-black/52">{active.focus}</p>
          <Link href={nextAction} className="mt-auto inline-flex items-center gap-2 pt-8 text-sm font-medium text-[var(--portal-accent)]">
            Continue <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </Surface>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <QuickLink icon={<FolderKanban size={18} />} title="Project" body="See progress and what happens next." href={customerHref("project", previewHrefPrefix)} />
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
              <p className="text-[10px] uppercase tracking-[0.16em] text-black/40">Recent updates</p>
              <h2 className="mt-2 font-serif text-2xl">Your project log</h2>
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
              <p className="text-[10px] uppercase tracking-[0.16em] text-black/40">Milesymedia care</p>
              <h2 className="mt-2 font-serif text-2xl">We are within reach.</h2>
            </div>
            <ShieldCheck size={19} className="text-[var(--portal-accent)]" aria-hidden="true" />
          </div>
          <p className="mt-5 max-w-xl text-sm leading-6 text-black/52">
            Questions, feedback, changes, or something urgent: send it through your support space and it stays attached to your project.
          </p>
          <Link href={customerHref("support", previewHrefPrefix)} className="mt-7 inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 bg-white px-4 text-sm font-medium">
            Open support <ArrowRight size={14} aria-hidden="true" />
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
    <Link href={href} className="group rounded-md border border-black/10 bg-[#fbfaf8] p-5 transition hover:-translate-y-0.5 hover:border-[var(--portal-accent)] hover:shadow-[0_14px_35px_rgba(35,29,18,0.08)]">
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
}: {
  client: Client;
  data: CustomerPortalData;
  previewHrefPrefix?: string;
}) {
  const active = MODE[data.mode];
  const stages: CustomerPortalMode[] = ["onboarding", "designing", "developed-launch", "maintenance"];
  const activeIndex = stages.indexOf(data.mode);
  const customerProperties = data.properties.filter(property =>
    property.kind === "website" || property.kind === "client-portal" || property.kind === "dev-portal",
  );

  return (
    <>
      <PageIntro eyebrow="Your project" title={active.heading} body={active.body} />
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
                        done ? "border-[#1b1a18] bg-[#1b1a18] text-white" : current ? "border-[var(--portal-accent)] bg-[#f5eddd] text-[var(--portal-accent)]" : "border-black/12 bg-white text-black/30",
                      ].join(" ")}>
                        {done ? <Check size={14} aria-hidden="true" /> : index + 1}
                      </span>
                      {index < stages.length - 1 && <span className="min-h-12 w-px flex-1 bg-black/10" />}
                    </div>
                    <div className="pb-8">
                      <p className={`text-sm font-medium ${current ? "text-[var(--portal-accent)]" : "text-black/70"}`}>{MODE[stage].label}</p>
                      <p className="mt-1 text-xs leading-5 text-black/42">{MODE[stage].focus}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
          <aside className="rounded-md bg-[#1b1a18] p-6 text-white">
            <p className="text-[10px] uppercase tracking-[0.17em] text-white/42">At a glance</p>
            <dl className="mt-6 divide-y divide-white/10">
              <ProjectDetail label="Client" value={client.name} />
              <ProjectDetail label="Current stage" value={active.label} />
              <ProjectDetail label="Service plan" value={data.servicePlan} />
              <ProjectDetail label="Portal opened" value={formatDate(data.builtAt)} />
            </dl>
          </aside>
        </div>
      </Surface>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Surface className="p-6">
          <div className="flex items-center gap-3">
            <MonitorCheck size={19} className="text-[var(--portal-accent)]" aria-hidden="true" />
            <h2 className="font-serif text-2xl">Connected work</h2>
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
                      <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-black/38">{property.status || "In progress"}</p>
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
        </Surface>
        <Surface className="p-6">
          <div className="flex items-center gap-3">
            <MessageSquareText size={19} className="text-[var(--portal-accent)]" aria-hidden="true" />
            <h2 className="font-serif text-2xl">Need to add something?</h2>
          </div>
          <p className="mt-5 text-sm leading-6 text-black/50">Ideas and feedback belong with the project, where nothing gets lost between messages.</p>
          <div className="mt-7 flex flex-wrap gap-2">
            <Link href={customerHref("files", previewHrefPrefix)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 bg-white px-4 text-sm font-medium">Share inspiration</Link>
            <Link href={customerHref("support", previewHrefPrefix)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#1b1a18] px-4 text-sm font-medium text-white">Leave feedback</Link>
          </div>
        </Surface>
      </div>
      <CustomerProjectBriefForm clientId={client.id} initialBrief={data.brief} readOnly={Boolean(previewHrefPrefix)} />
      <CustomerApprovals
        clientId={client.id}
        initialApprovals={data.approvals}
        readOnly={Boolean(previewHrefPrefix)}
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

function FilesView({ client, data, readOnly }: { client: Client; data: CustomerPortalData; readOnly: boolean }) {
  return (
    <>
      <PageIntro eyebrow="Files & inspiration" title="One home for every detail." body="Briefs, recordings, designs, invoices, previews, and the links you share with us stay connected to the project." />
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
            <p className="mt-2 max-w-sm text-sm leading-6 text-black/45">Milesymedia documents will appear here. You can share inspiration, feedback, or useful links below.</p>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-black/8 border-y border-black/10">
            {data.files.map(file => <CustomerFileRow key={file.id} file={file} />)}
          </ul>
        )}
        <div className="mt-8">
          <p className="mb-4 text-[10px] uppercase tracking-[0.16em] text-black/40">Share with Milesymedia</p>
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

function BillingView({ client, data, readOnly }: { client: Client; data: CustomerPortalData; readOnly: boolean }) {
  const paid = data.invoices.filter(invoice => invoice.status === "paid").reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const outstanding = data.invoices.filter(invoice => invoice.status === "sent" || invoice.status === "overdue").reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const currency = data.invoices[0]?.currency || "gbp";

  return (
    <>
      <PageIntro
        eyebrow="Plan & billing"
        title="Clear, calm, accounted for."
        body="Your service plan, invoices, payment status, and billing links live here. No hunting through emails."
        action={data.billingUrl ? (
          <a href={data.billingUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 self-start rounded-md bg-[#1b1a18] px-5 text-sm font-medium text-white">
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
          <div className="mt-8 grid gap-4 border-t border-black/10 pt-5 sm:grid-cols-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.13em] text-black/35">Account status</p>
              <p className="mt-2 text-sm font-medium">Active with Milesymedia</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.13em] text-black/35">Billing rhythm</p>
              <p className="mt-2 text-sm font-medium">{data.billingCadence}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.13em] text-black/35">Project deposit</p>
              <p className="mt-2 text-sm font-medium">{data.lockInPaid ? "Received" : "Not yet recorded"}</p>
            </div>
          </div>
        </Surface>
        <Surface className="!bg-[#1b1a18] p-6 text-white">
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
                      className="inline-flex min-h-9 items-center rounded-md bg-[#1b1a18] px-3 text-xs font-medium text-white"
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
      <CustomerAgreements clientId={client.id} initialContracts={data.contracts} readOnly={readOnly} />
    </>
  );
}

function SupportView({ client, data, readOnly }: { client: Client; data: CustomerPortalData; readOnly: boolean }) {
  const supportLinks = [
    {
      label: "Send a request",
      detail: "Best for support, feedback, and changes",
      href: "#support-request",
      icon: <MessageSquareText size={17} aria-hidden="true" />,
      external: false,
    },
    ...(data.support.email ? [{
      label: "Email Milesymedia",
      detail: data.support.email,
      href: `mailto:${data.support.email}`,
      icon: <Mail size={17} aria-hidden="true" />,
      external: false,
    }] : []),
    ...(data.support.phone ? [{
      label: "Call Milesymedia",
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
      <PageIntro eyebrow="Client care" title="Tell us. We will take it from here." body="Use this space for support, design feedback, new ideas, or anything you want kept with your project." />
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
            className="group flex min-h-24 items-center gap-4 bg-[#fbfaf8] px-5 py-4 transition hover:bg-white"
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
          <SupportPromise icon={<MessageSquareText size={18} />} title="Human response" body="The Milesymedia team reads and handles it." />
          <SupportPromise icon={<ShieldCheck size={18} />} title="Full context" body="We can see the project behind your request." />
        </div>
        <div className="mt-8">
          <CustomerSupportForm clientId={client.id} initialRequests={data.requests} readOnly={readOnly} />
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

function ResourcesView() {
  return (
    <>
      <PageIntro eyebrow="Resources" title="Resources." body="Nothing has been shared here yet." />
      <div aria-label="No resources available" className="min-h-[430px]" />
    </>
  );
}
