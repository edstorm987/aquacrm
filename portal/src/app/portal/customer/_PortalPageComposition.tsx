import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  Clock3,
  FileText,
  Link2,
  PackageCheck,
} from "lucide-react";
import type { ReactNode } from "react";

import { READ_UNAVAILABLE_LABEL } from "@/lib/readAvailability";
import { customerPortalReadPhase } from "@/lib/portal/customerPortalReadState";
import { formatPortalCopy } from "@/lib/portal/clientPortalDesign";
import { portalBlockMatchesProducts, portalCustomPage, portalPageBlocks } from "@/lib/portal/clientPortalBuilder";
import { portalProductModule } from "@/lib/portal/portalProductModules";
import type { ClientPortalMediaAspect, ClientPortalPageBlock, ClientPortalSectionId } from "@/server/types";
import type { CustomerPortalData } from "./_portalData";
import { PortalBuilderSelectionBridge } from "./_PortalBuilderSelectionBridge";
import { PortalCustomExtension } from "./_PortalCustomExtension";
import { PortalApprovalBlock, PortalFileUploadBlock, PortalRequestBlock } from "./_PortalInteractionBlocks";
import { summariseInvoicesByCurrency, type InvoiceCurrencyPosition } from "@/lib/clients/clientPaymentPlans";

export function PortalPageComposition({
  section,
  customPageSlug,
  data,
  providerName,
  previewHrefPrefix,
  children,
}: {
  section?: ClientPortalSectionId;
  customPageSlug?: string;
  data: CustomerPortalData;
  providerName: string;
  previewHrefPrefix?: string;
  children?: ReactNode;
}) {
  const customPage = customPageSlug ? portalCustomPage(data.presentation, customPageSlug) : undefined;
  const blocks = customPage?.blocks ?? (section ? portalPageBlocks(data.presentation, section) : []);
  const tokens = {
    firstName: data.contactName.trim().split(/\s+/)[0] || data.contactName,
    clientName: data.contactName,
    providerName,
    serviceHeadline: data.experienceHeadline || data.servicePlan,
    projectLabel: data.products.length > 1 ? "programme" : data.products[0]?.name || "project",
  };
  let renderedSystem = false;
  const rendered = blocks.flatMap(block => {
    if (block.type === "system-content") {
      if (renderedSystem) return [];
      renderedSystem = true;
      return [<PortalBuilderSelectionBridge key={block.id} blockId={block.id} blockType={block.type} className="col-span-full">{children}</PortalBuilderSelectionBridge>];
    }
    if (!block.visible || !portalBlockMatchesProducts(block, data.products.map(product => product.id))) return [];
    return [
      <PortalBuilderSelectionBridge key={block.id} blockId={block.id} blockType={block.type} className={`${block.width === "half" ? "min-w-0" : "col-span-full"} ${responsiveBlockClass(block)}`}>
        <PortalBlock block={block} data={data} tokens={tokens} previewHrefPrefix={previewHrefPrefix} providerName={providerName} />
      </PortalBuilderSelectionBridge>,
    ];
  });

  if (children && !renderedSystem) rendered.push(<div key="system-fallback" className="col-span-full">{children}</div>);
  if (!rendered.length) return null;
  return <div className="grid grid-cols-1 gap-5 lg:grid-cols-2" data-portal-page-builder={customPage?.id ?? section}>{rendered}</div>;
}

function PortalBlock({
  block,
  data,
  tokens,
  previewHrefPrefix,
  providerName,
}: {
  block: ClientPortalPageBlock;
  data: CustomerPortalData;
  tokens: Record<string, string>;
  previewHrefPrefix?: string;
  providerName: string;
}) {
  const title = formatPortalCopy(block.title, tokens);
  const eyebrow = formatPortalCopy(block.eyebrow, tokens);
  const body = formatPortalCopy(block.body, tokens);
  const tone = blockTone(block.tone);
  const centered = block.responsive.alignment === "center";

  if (block.type === "divider") return <div className="my-2 h-px bg-black/10" aria-hidden="true" />;
  const dark = block.tone === "dark";
  if (block.type === "image" || block.type === "video") return <MediaBlock block={block} title={title} dark={dark} />;
  if (block.type === "metrics") return <MetricBlock block={block} data={data} title={title} eyebrow={eyebrow} tone={tone} dark={dark} />;
  if (block.type === "service-grid") return <ServiceGrid data={data} title={title} eyebrow={eyebrow} tone={tone} dark={dark} previewHrefPrefix={previewHrefPrefix} />;
  if (block.type === "product-hub") return <ProductHub data={data} title={title} eyebrow={eyebrow} tone={tone} dark={dark} previewHrefPrefix={previewHrefPrefix} />;
  if (block.type === "file-list") return <FileList data={data} title={title} eyebrow={eyebrow} tone={tone} dark={dark} />;
  if (block.type === "activity") return <ActivityList data={data} title={title} eyebrow={eyebrow} tone={tone} dark={dark} />;
  if (block.type === "request-form") return <PortalRequestBlock clientId={data.clientId} title={title} eyebrow={eyebrow} body={body} providerName={providerName} readOnly={Boolean(previewHrefPrefix)} dark={dark} centered={centered} surfaceClass={tone} requestType={block.requestType} actionLabel={block.actionLabel} initialRequests={data.requests} />;
  if (block.type === "approval-panel") return <PortalApprovalBlock clientId={data.clientId} title={title} eyebrow={eyebrow} body={body} providerName={providerName} readOnly={Boolean(previewHrefPrefix)} dark={dark} centered={centered} surfaceClass={tone} approvalType={block.approvalType} initialApprovals={data.approvals} />;
  if (block.type === "file-upload") return <PortalFileUploadBlock clientId={data.clientId} title={title} eyebrow={eyebrow} body={body} readOnly={Boolean(previewHrefPrefix)} dark={dark} centered={centered} surfaceClass={tone} uploadCategory={block.uploadCategory} actionLabel={block.actionLabel} />;
  if (block.type === "link-list") return <LinkList block={block} title={title} eyebrow={eyebrow} tone={tone} dark={dark} />;
  if (block.type === "custom-extension" && block.extension) {
    return <PortalCustomExtension id={`builder-${block.id}`} code={{ ...block.extension, title: block.extension.title || title }} context={{ clientName: data.contactName, providerName, mode: data.mode, productId: data.presentationProductId ?? "", productIds: data.products.map(product => product.id).join(",") }} />;
  }

  const hero = block.type === "hero";
  const callout = block.type === "callout";
  return (
    <section className={`${tone} ${centered ? "text-center" : ""} ${hero ? "min-h-72 p-7 sm:p-10" : "p-6 sm:p-8"}`}>
      {eyebrow ? <p className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${block.tone === "dark" ? "text-[var(--portal-accent-dark)]" : "text-[var(--portal-accent)]"}`}>{eyebrow}</p> : null}
      <h2 className={`${hero ? "mt-5 max-w-3xl font-serif text-4xl leading-tight sm:text-5xl" : "mt-2 font-serif text-2xl"}`}>{title}</h2>
      {body ? <p className={`${hero ? "mt-5 max-w-2xl text-base leading-7" : "mt-3 text-sm leading-6"} ${block.tone === "dark" ? "text-white/58" : "text-black/52"}`}>{body}</p> : null}
      {block.actionLabel && safeHref(block.actionHref) ? <PortalAction href={block.actionHref} label={block.actionLabel} dark={block.tone === "dark"} centered={centered} /> : null}
      {callout ? <span className={`mt-6 block h-px w-16 bg-[var(--portal-accent)] ${centered ? "mx-auto" : ""}`} aria-hidden="true" /> : null}
    </section>
  );
}

function MediaBlock({ block, title, dark }: { block: ClientPortalPageBlock; title: string; dark: boolean }) {
  const media = block.media;
  const valid = safeMediaUrl(media?.url);
  const frame = mediaAspectClass(media?.aspect);
  const surface = dark ? "border-white/10 bg-[var(--portal-hero)] text-white" : "border-black/10 bg-[var(--portal-surface)] text-black/70";
  const embedUrl = block.type === "video" && valid ? videoEmbedUrl(media?.url ?? "") : undefined;
  return <figure className={`overflow-hidden rounded-md border ${surface}`}>
    <div className={`${frame} grid place-items-center overflow-hidden ${dark ? "bg-black/25" : "bg-black/[0.035]"}`}>
      {!valid ? <div className={`px-6 text-center text-xs ${dark ? "text-white/35" : "text-black/35"}`}>Add a secure media URL in Dev Editor Engine.</div> : block.type === "image" ? <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={media?.url} alt={media?.alt || title} className={`h-full w-full ${media?.fit === "contain" ? "object-contain" : "object-cover"}`} />
      </> : embedUrl ? <iframe src={embedUrl} title={media?.alt || title} loading="lazy" sandbox="allow-scripts allow-same-origin allow-presentation" referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="h-full w-full border-0" /> : <video src={media?.url} controls preload="metadata" aria-label={media?.alt || title} className={`h-full w-full ${media?.fit === "contain" ? "object-contain" : "object-cover"}`} />}
    </div>
    {media?.caption ? <figcaption className={`px-4 py-3 text-xs leading-5 ${dark ? "text-white/45" : "text-black/45"} ${block.responsive.alignment === "center" ? "text-center" : ""}`}>{media.caption}</figcaption> : null}
  </figure>;
}

function MetricBlock({ block, data, title, eyebrow, tone, dark }: { block: ClientPortalPageBlock; data: CustomerPortalData; title: string; eyebrow: string; tone: string; dark: boolean }) {
  const rows = metricRows(block, data);
  return <section className={`${tone} overflow-hidden`}><BlockHeader eyebrow={eyebrow} title={title} dark={dark} /><div className={`grid grid-cols-2 border-t sm:grid-cols-4 ${dark ? "border-white/10" : "border-black/8"}`}>{rows.map(row => <div key={row.label} className={`border-b border-r p-5 last:border-r-0 ${dark ? "border-white/10" : "border-black/8"}`}><p className={`text-[9px] font-semibold uppercase tracking-[0.12em] ${dark ? "text-white/38" : "text-black/38"}`}>{row.label}</p><p className="mt-2 font-serif text-2xl tabular-nums">{row.value}</p><p className={`mt-1 text-[10px] ${dark ? "text-white/35" : "text-black/35"}`}>{row.detail}</p></div>)}</div></section>;
}

function ServiceGrid({ data, title, eyebrow, tone, dark, previewHrefPrefix }: { data: CustomerPortalData; title: string; eyebrow: string; tone: string; dark: boolean; previewHrefPrefix?: string }) {
  return <section className={`${tone} overflow-hidden`}><BlockHeader eyebrow={eyebrow} title={title} dark={dark} /><div className="grid gap-px bg-black/8 sm:grid-cols-2">{data.products.length ? data.products.slice(0, 8).map(product => <Link key={product.id} href={previewHrefPrefix ? `${previewHrefPrefix}service&productId=${encodeURIComponent(product.id)}` : `/portal/customer/service/${encodeURIComponent(product.id)}`} className="group bg-[var(--portal-surface)] p-5 hover:bg-white"><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full border border-black/10 text-[var(--portal-accent)]"><PackageCheck size={16} /></span><span className="min-w-0"><strong className="block truncate text-sm text-black/72">{product.name}</strong><span className="mt-1 line-clamp-2 text-xs leading-5 text-black/42">{product.description}</span></span><ArrowRight size={14} className="ml-auto shrink-0 text-black/25 transition group-hover:translate-x-0.5 group-hover:text-[var(--portal-accent)]" /></div></Link>) : <EmptyBlock icon={<BriefcaseBusiness size={20} />} label="Services appear here once they are assigned." />}</div></section>;
}

function ProductHub({ data, title, eyebrow, tone, dark, previewHrefPrefix }: { data: CustomerPortalData; title: string; eyebrow: string; tone: string; dark: boolean; previewHrefPrefix?: string }) {
  return <section className={`${tone} overflow-hidden`}><BlockHeader eyebrow={eyebrow} title={title} dark={dark} /><div className={`grid gap-px border-t ${dark ? "border-white/10 bg-white/10" : "border-black/8 bg-black/8"} ${data.products.length > 1 ? "md:grid-cols-2" : "grid-cols-1"}`}>{data.products.length ? data.products.map(product => {
    const module = portalProductModule(product);
    return <article key={product.id} className={dark ? "bg-[var(--portal-hero)] p-5 sm:p-6" : "bg-[var(--portal-surface)] p-5 sm:p-6"}>
      <div className="flex items-start gap-3"><span className="mt-1 size-2 shrink-0 rounded-full" style={{ backgroundColor: product.accentColor || "var(--portal-accent)" }} /><div className="min-w-0"><p className={`text-[9px] font-semibold uppercase tracking-[0.14em] ${dark ? "text-white/35" : "text-black/35"}`}>{module.label}</p><h3 className={`mt-1 font-serif text-2xl ${dark ? "text-white" : "text-black/78"}`}>{product.name}</h3><p className={`mt-3 text-sm leading-6 ${dark ? "text-white/50" : "text-black/48"}`}>{module.promise}</p></div></div>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">{module.pages.map(page => <Link key={page.id} href={productHubHref(product.id, page.id, previewHrefPrefix)} className={`group flex min-h-14 items-center gap-3 rounded-md border px-3 py-2 text-xs font-semibold transition ${dark ? "border-white/10 text-white/65 hover:border-white/25 hover:bg-white/[0.04]" : "border-black/10 text-black/62 hover:border-[var(--portal-accent)] hover:bg-white"}`}><span className="min-w-0 flex-1 truncate">{page.navLabel}</span><ArrowRight size={13} className="shrink-0 transition group-hover:translate-x-0.5" /></Link>)}</div>
    </article>;
  }) : <EmptyBlock icon={<BriefcaseBusiness size={20} />} label="Assign a product to activate its bespoke client workspace." />}</div></section>;
}

function FileList({ data, title, eyebrow, tone, dark }: { data: CustomerPortalData; title: string; eyebrow: string; tone: string; dark: boolean }) {
  return <section className={`${tone} overflow-hidden`}><BlockHeader eyebrow={eyebrow} title={title} dark={dark} /><div className={`divide-y border-t ${dark ? "divide-white/10 border-white/10" : "divide-black/8 border-black/8"}`}>{data.files.length ? data.files.slice(0, 6).map(file => <a key={file.id} href={file.url} target="_blank" rel="noreferrer" className={`flex min-h-14 items-center gap-3 px-5 py-3 ${dark ? "hover:bg-white/[0.04]" : "hover:bg-black/[0.02]"}`}><FileText size={16} className="shrink-0 text-[var(--portal-accent-dark)]" /><span className={`min-w-0 flex-1 truncate text-sm ${dark ? "text-white/68" : "text-black/68"}`}>{file.name}</span><span className={`text-[10px] uppercase ${dark ? "text-white/32" : "text-black/32"}`}>{file.category}</span></a>) : <EmptyBlock icon={<FileText size={20} />} label="Shared files will appear here." />}</div></section>;
}

function ActivityList({ data, title, eyebrow, tone, dark }: { data: CustomerPortalData; title: string; eyebrow: string; tone: string; dark: boolean }) {
  return <section className={`${tone} overflow-hidden`}><BlockHeader eyebrow={eyebrow} title={title} dark={dark} /><div className={`divide-y border-t ${dark ? "divide-white/10 border-white/10" : "divide-black/8 border-black/8"}`}>{data.activity.length ? data.activity.slice(0, 6).map(item => <div key={item.id} className="grid grid-cols-[20px_minmax(0,1fr)] gap-3 px-5 py-3"><Clock3 size={15} className={`mt-0.5 ${dark ? "text-[var(--portal-accent-dark)]" : "text-[var(--portal-accent)]"}`} /><div><p className={`text-sm leading-5 ${dark ? "text-white/65" : "text-black/65"}`}>{item.message}</p><p className={`mt-1 text-[10px] uppercase ${dark ? "text-white/32" : "text-black/32"}`}>{item.category} · {formatDate(item.ts)}</p></div></div>) : <EmptyBlock icon={<Clock3 size={20} />} label="Client-visible activity will appear here." />}</div></section>;
}

function LinkList({ block, title, eyebrow, tone, dark }: { block: ClientPortalPageBlock; title: string; eyebrow: string; tone: string; dark: boolean }) {
  return <section className={`${tone} overflow-hidden`}><BlockHeader eyebrow={eyebrow} title={title} dark={dark} /><div className={`divide-y border-t ${dark ? "divide-white/10 border-white/10" : "divide-black/8 border-black/8"}`}>{block.items.map(item => safeHref(item.href) ? <a key={item.id} href={item.href} target={item.href?.startsWith("http") ? "_blank" : undefined} rel={item.href?.startsWith("http") ? "noreferrer" : undefined} className={`group flex min-h-16 items-center gap-3 px-5 py-3 ${dark ? "hover:bg-white/[0.04]" : "hover:bg-black/[0.02]"}`}><Link2 size={16} className={`shrink-0 ${dark ? "text-[var(--portal-accent-dark)]" : "text-[var(--portal-accent)]"}`} /><span className="min-w-0 flex-1"><strong className={`block truncate text-sm ${dark ? "text-white/68" : "text-black/68"}`}>{item.label}</strong>{item.detail ? <span className={`mt-1 block truncate text-xs ${dark ? "text-white/38" : "text-black/38"}`}>{item.detail}</span> : null}</span><ArrowRight size={14} className={dark ? "text-white/25 group-hover:text-[var(--portal-accent-dark)]" : "text-black/25 group-hover:text-[var(--portal-accent)]"} /></a> : null)}</div></section>;
}

function BlockHeader({ eyebrow, title, dark }: { eyebrow: string; title: string; dark: boolean }) {
  return <header className="p-5 sm:px-6"><p className={`text-[9px] font-semibold uppercase tracking-[0.14em] ${dark ? "text-[var(--portal-accent-dark)]" : "text-[var(--portal-accent)]"}`}>{eyebrow}</p><h2 className="mt-1 font-serif text-2xl">{title}</h2></header>;
}

function PortalAction({ href, label, dark, centered }: { href: string; label: string; dark: boolean; centered: boolean }) {
  const className = `mt-7 min-h-11 items-center gap-2 rounded-md px-5 text-sm font-medium ${centered ? "mx-auto flex w-fit" : "inline-flex"} ${dark ? "bg-white text-black hover:bg-[#f4efe6]" : "bg-[var(--portal-hero)] text-white hover:bg-black"}`;
  return href.startsWith("/") ? <Link href={href} className={className}>{label}<ArrowRight size={15} /></Link> : <a href={href} target="_blank" rel="noreferrer" className={className}>{label}<ArrowRight size={15} /></a>;
}

function EmptyBlock({ icon, label }: { icon: ReactNode; label: string }) {
  return <div className="col-span-full grid min-h-28 place-items-center bg-[var(--portal-surface)] p-6 text-center text-black/35"><div>{icon}<p className="mt-2 text-xs">{label}</p></div></div>;
}

function metricRows(block: ClientPortalPageBlock, data: CustomerPortalData): Array<{ label: string; value: string; detail: string }> {
  if (block.dataSource === "billing") {
    const positions = summariseInvoicesByCurrency(data.invoices);
    // A failed invoice read must not render as "0 invoices / No payment due"
    // (issues #57): those are measurements, and nothing was measured.
    if (customerPortalReadPhase(data, "invoices") !== "ready") {
      return [
        { label: "Plan", value: data.servicePlan || "Active", detail: data.billingCadence || "Billing plan" },
        { label: "Invoices", value: READ_UNAVAILABLE_LABEL, detail: "Billing could not be read" },
        { label: "Recorded", value: READ_UNAVAILABLE_LABEL, detail: "Billing could not be read" },
        { label: "Outstanding", value: READ_UNAVAILABLE_LABEL, detail: "Reload to try again" },
      ];
    }
    return [
      { label: "Plan", value: data.servicePlan || "Active", detail: data.billingCadence || "Billing plan" },
      { label: "Invoices", value: String(data.invoices.length), detail: `${data.invoices.filter(invoice => invoice.status === "paid").length} paid` },
      { label: "Recorded", value: invoiceTotals(positions, "recordedCents") ?? "—", detail: "All shared invoices" },
      { label: "Outstanding", value: invoiceTotals(positions, "outstandingCents") ?? "No payment due", detail: "Issued and still due" },
    ];
  }
  if (block.dataSource === "delivery") {
    const decisions = data.workspaces.flatMap(workspace => workspace.decisions);
    return [
      { label: "Services", value: String(data.products.length), detail: "Connected systems" },
      { label: "Workspaces", value: String(data.workspaces.length), detail: "Live delivery areas" },
      { label: "Decisions", value: String(decisions.length), detail: `${decisions.filter(item => item.status === "pending").length} pending` },
      { label: "Requests", value: String(data.requests.length), detail: `${data.requests.filter(item => item.status !== "closed").length} open` },
    ];
  }
  if (block.dataSource === "results") {
    return [
      { label: "Properties", value: String(data.properties.length), detail: `${data.properties.filter(item => item.status === "live").length} live` },
      { label: "Updates", value: String(data.activity.length), detail: "Portal history" },
      { label: "Approvals", value: String(data.approvals.length), detail: `${data.approvals.filter(item => item.status === "pending").length} pending` },
      { label: "Files", value: String(data.files.length), detail: "Shared evidence" },
    ];
  }
  return [
    { label: "Services", value: String(data.products.length), detail: "Assigned to you" },
    { label: "Files", value: String(data.files.length), detail: "Available now" },
    { label: "Open requests", value: String(data.requests.filter(item => item.status !== "closed").length), detail: "With the team" },
    { label: "Pending approvals", value: String(data.approvals.filter(item => item.status === "pending").length), detail: "Need your decision" },
  ];
}

function blockTone(tone: ClientPortalPageBlock["tone"]): string {
  if (tone === "dark") return "rounded-md border border-white/8 bg-[var(--portal-hero)] text-white";
  if (tone === "accent") return "rounded-md border border-[var(--portal-accent)] bg-white text-[#1b1a18] shadow-[inset_4px_0_0_var(--portal-accent)]";
  if (tone === "quiet") return "border-y border-black/10 text-[#1b1a18]";
  return "rounded-md border border-black/10 bg-[var(--portal-surface)] text-[#1b1a18]";
}

function safeHref(value?: string): boolean {
  if (!value) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function productHubHref(productId: string, moduleId: string, previewHrefPrefix?: string): string {
  if (previewHrefPrefix) return `${previewHrefPrefix}service&productId=${encodeURIComponent(productId)}&module=${encodeURIComponent(moduleId)}`;
  return `/portal/customer/service/${encodeURIComponent(productId)}/${encodeURIComponent(moduleId)}`;
}

function responsiveBlockClass(block: ClientPortalPageBlock): string {
  const visibility = block.responsive.hideOnMobile ? "hidden md:block" : block.responsive.hideOnDesktop ? "md:hidden" : "";
  const spacing = block.responsive.spacing === "none" ? "" : block.responsive.spacing === "compact" ? "py-1" : block.responsive.spacing === "spacious" ? "py-6" : "py-2";
  return `${visibility} ${spacing}`;
}

function mediaAspectClass(aspect?: ClientPortalMediaAspect): string {
  if (aspect === "square") return "aspect-square";
  if (aspect === "portrait") return "aspect-[4/5]";
  return "aspect-video";
}

function safeMediaUrl(value?: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function videoEmbedUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.hostname === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : undefined;
    }
    if (url.hostname.endsWith("youtube.com")) {
      const id = url.searchParams.get("v") || (url.pathname.startsWith("/embed/") ? url.pathname.split("/")[2] : "");
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : undefined;
    }
    if (url.hostname.endsWith("vimeo.com")) {
      const id = url.pathname.split("/").filter(Boolean).find(segment => /^\d+$/.test(segment));
      return id ? `https://player.vimeo.com/video/${id}` : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function money(cents: number, currency: string): string {
  try { return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(cents / 100); }
  catch { return `${currency.toUpperCase()} ${(cents / 100).toFixed(0)}`; }
}

function invoiceTotals(
  positions: readonly InvoiceCurrencyPosition[],
  field: "recordedCents" | "outstandingCents",
): string | null {
  const retained = positions.filter(position => field === "recordedCents" ? position.invoiceCount > 0 : position.outstandingCents > 0);
  return retained.length ? retained.map(position => money(position[field], position.currency)).join(" · ") : null;
}

function formatDate(timestamp: number): string {
  try { return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(timestamp); }
  catch { return "Recent"; }
}
