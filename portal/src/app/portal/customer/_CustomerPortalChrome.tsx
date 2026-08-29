"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardCheck,
  CircleHelp,
  Code2,
  CreditCard,
  Files,
  FolderKanban,
  Home,
  Inbox,
  IdCard,
  Layers3,
  LoaderCircle,
  Menu,
  PackageCheck,
  Route,
  ScanSearch,
  Settings2,
  ShoppingBag,
  Sparkles,
  X,
} from "lucide-react";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ProfileMenu } from "@/components/chrome/ProfileMenu";
import { ColorModeToggle } from "@/components/chrome/ColorModeToggle";
import { PrivacyModeControl } from "@/components/chrome/PrivacyModeControl";
import { SafeSandboxEntry } from "@/components/chrome/SafeSandboxEntry";
import { PortalLoadingCoordinator } from "@/components/ui/PortalLoadingCoordinator";
import { contrastRatio } from "@/lib/a11y/contrastValidator";
import { formatPortalCopy, portalCustomCode } from "@/lib/portal/clientPortalDesign";
import { portalBuilder } from "@/lib/portal/clientPortalBuilder";
import {
  customerAccountActivityNavItems,
  type CustomerAccountActivityCapability,
} from "@/lib/portal/customerAccountActivity";
import { portalProductModule, type PortalModuleIcon } from "@/lib/portal/portalProductModules";
import type { PortalProductSelection } from "@/lib/portal/portalProducts";
import type { ClientPortalDesignDocument, Role } from "@/server/types";
import type { CustomerPortalAttention, CustomerPortalAttentionItem } from "@/lib/portal/customerPortalAttention";
import { PortalCustomExtension } from "./_PortalCustomExtension";

const NAV = [
  { href: "/portal/customer", section: "home", icon: Home },
  { href: "/portal/customer/project", section: "project", icon: FolderKanban },
  { href: "/portal/customer/results", section: "results", icon: ChartNoAxesCombined },
  { href: "/portal/customer/files", section: "files", icon: Files },
  { href: "/portal/customer/billing", section: "billing", icon: CreditCard },
  { href: "/portal/customer/support", section: "support", icon: CircleHelp },
  { href: "/portal/customer/resources", section: "resources", icon: BookOpen },
  { href: "/portal/customer/details", section: "details", icon: IdCard },
] as const;

const PRODUCT_ICONS: Record<PortalModuleIcon, typeof Home> = {
  activity: ChartNoAxesCombined,
  assets: Files,
  calendar: CalendarDays,
  checklist: ClipboardCheck,
  delivery: PackageCheck,
  insights: ChartNoAxesCombined,
  plan: Route,
  review: ScanSearch,
  settings: Settings2,
  support: CircleHelp,
};

const ACCOUNT_ACTIVITY_ICONS: Record<CustomerAccountActivityCapability, typeof Home> = {
  orders: ShoppingBag,
  bookings: CalendarDays,
};

export interface CustomerDevWorkspaceProject {
  id: string;
  name: string;
  editorVisible: boolean;
}

function NavItems({
  pathname,
  close,
  previewHrefPrefix,
  activePreviewSection,
  projectLabel,
  presentation,
  products,
  activePreviewProductId,
  activePreviewModuleId,
  activePreviewCustomPageSlug,
  attention,
  accountActivityCapabilities,
  devProjects,
}: {
  pathname: string;
  close?: () => void;
  previewHrefPrefix?: string;
  activePreviewSection?: string;
  projectLabel: string;
  presentation: ClientPortalDesignDocument;
  products: PortalProductSelection[];
  activePreviewProductId?: string;
  activePreviewModuleId?: string;
  activePreviewCustomPageSlug?: string;
  attention?: CustomerPortalAttention;
  accountActivityCapabilities: readonly CustomerAccountActivityCapability[];
  devProjects: readonly CustomerDevWorkspaceProject[];
}) {
  const coreNav = products.length
    ? NAV.filter(item => item.section === "home" || (products.length > 1 && item.section === "project"))
    : NAV;
  const sharedNav = products.length
    ? NAV.filter(item => item.section === "files" || item.section === "billing" || item.section === "support" || item.section === "details")
    : [];
  const customPages = portalBuilder(presentation).customPages.filter(page => page.visible);
  const accountActivityItems = customerAccountActivityNavItems(accountActivityCapabilities);

  function shellLinks(items: ReadonlyArray<typeof NAV[number]>) {
    return items.map(item => {
      const page = presentation.pages[item.section];
      if (!page.visible) return null;
      const active = previewHrefPrefix
        ? activePreviewSection === item.section
        : item.href === "/portal/customer"
          ? pathname === item.href
          : pathname.startsWith(item.href);
      const Icon = item.icon;
      const href = previewHrefPrefix ? `${previewHrefPrefix}${item.section}` : item.href;
      const attentionItem = attention?.sections[item.section];
      return (
        <Link
          key={href}
          href={href}
          onClick={close}
          aria-current={active ? "page" : undefined}
          className={[
            "group flex min-h-10 items-center gap-3 rounded-sm px-3 text-sm transition",
            active ? "bg-[#f4efe6] text-[#151310]" : "text-white/58 hover:bg-white/[0.07] hover:text-white",
          ].join(" ")}
        >
          <Icon size={16} strokeWidth={1.65} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{item.section === "project" && page.label === "Project"
            ? products.length > 1 ? "Programme" : projectLabel
            : formatPortalCopy(page.label, { projectLabel })}</span>
          <PortalAttentionBadge item={attentionItem} />
        </Link>
      );
    });
  }

  return (
    <nav aria-label="Client portal" className="grid gap-1">
      {shellLinks(coreNav)}
      {/* Enquiries — its own link rather than a NAV entry.
          `shellLinks` reads each item's label out of
          `presentation.pages[item.section]`, which is keyed by the STORED
          section ids. "enquiries" is a view section with no stored page design
          (see CustomerPortalSection), so joining that array would index a key
          that does not exist for any client already in the database. A link of
          its own costs eight lines and no migration.

          Shown in preview too. It was hidden at first because the preview route
          had no "enquiries" section; it does now, so hiding it would mean the
          people who SET THE INBOX UP are the only ones who cannot see it. */}
      {(() => {
        const enquiriesActive = previewHrefPrefix
          ? activePreviewSection === "enquiries"
          : pathname.startsWith("/portal/customer/enquiries");
        return (
          <Link
            href={previewHrefPrefix ? `${previewHrefPrefix}enquiries` : "/portal/customer/enquiries"}
            onClick={close}
            aria-current={enquiriesActive ? "page" : undefined}
            className={[
              "group flex min-h-10 items-center gap-3 rounded-sm px-3 text-sm transition",
              enquiriesActive
                ? "bg-[#f4efe6] text-[#151310]"
                : "text-white/58 hover:bg-white/[0.07] hover:text-white",
            ].join(" ")}
          >
            <Inbox size={16} strokeWidth={1.65} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">Enquiries</span>
          </Link>
        );
      })()}
      {products.map(product => {
        const module = portalProductModule(product);
        return (
          <div key={product.id} className="mt-4 border-t border-white/8 pt-4 first:mt-2">
            <div className="mb-2 flex items-center gap-2 px-3">
              <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: product.accentColor || "var(--portal-accent)" }} />
              <p className="truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-white/34">{module.label}</p>
            </div>
            <div className="grid gap-0.5">
              {module.pages.map(page => {
                const Icon = PRODUCT_ICONS[page.icon];
                const href = previewHrefPrefix
                  ? `${previewHrefPrefix}service&productId=${encodeURIComponent(product.id)}&module=${encodeURIComponent(page.id)}`
                  : `/portal/customer/service/${encodeURIComponent(product.id)}/${encodeURIComponent(page.id)}`;
                const active = previewHrefPrefix
                  ? activePreviewSection === "service" && activePreviewProductId === product.id && activePreviewModuleId === page.id
                  : pathname === href;
                return <Link key={page.id} href={href} onClick={close} aria-current={active ? "page" : undefined} className={`group flex min-h-9 items-center gap-3 rounded-sm px-3 text-[13px] transition ${active ? "bg-[#f4efe6] text-[#151310]" : "text-white/55 hover:bg-white/[0.07] hover:text-white"}`}><Icon size={15} strokeWidth={1.6} aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{page.navLabel}</span><PortalAttentionBadge item={attention?.modules[product.id]?.[page.id]} /></Link>;
              })}
            </div>
          </div>
        );
      })}
      {sharedNav.length ? <div className="mt-4 border-t border-white/8 pt-4"><p className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">Shared workspace</p><div className="grid gap-0.5">{shellLinks(sharedNav)}</div></div> : null}
      {customPages.length ? (
        <div className="mt-4 border-t border-white/8 pt-4">
          <p className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">More for you</p>
          <div className="grid gap-0.5">
            {customPages.map(page => {
              const href = previewHrefPrefix
                ? `${previewHrefPrefix}custom&customPage=${encodeURIComponent(page.slug)}`
                : `/portal/customer/page/${encodeURIComponent(page.slug)}`;
              const active = previewHrefPrefix
                ? activePreviewSection === "custom" && activePreviewCustomPageSlug === page.slug
                : pathname === href;
              return <Link key={page.id} href={href} onClick={close} aria-current={active ? "page" : undefined} className={`group flex min-h-10 items-center gap-3 rounded-sm px-3 text-sm transition ${active ? "bg-[#f4efe6] text-[#151310]" : "text-white/58 hover:bg-white/[0.07] hover:text-white"}`}><BookOpen size={16} strokeWidth={1.65} aria-hidden="true" /><span className="truncate">{page.label}</span></Link>;
            })}
          </div>
        </div>
      ) : null}
      {!previewHrefPrefix && accountActivityItems.length ? (
        <div className="mt-4 border-t border-white/8 pt-4">
          <p className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">Account activity</p>
          <div className="grid gap-0.5">
            {accountActivityItems.map(item => {
              const Icon = ACCOUNT_ACTIVITY_ICONS[item.id];
              const active = pathname.startsWith(item.href);
              return <Link key={item.href} href={item.href} onClick={close} aria-current={active ? "page" : undefined} className={`group flex min-h-10 items-center gap-3 rounded-sm px-3 text-sm transition ${active ? "bg-[#f4efe6] text-[#151310]" : "text-white/58 hover:bg-white/[0.07] hover:text-white"}`}><Icon size={16} strokeWidth={1.65} aria-hidden="true" /><span>{item.label}</span></Link>;
            })}
          </div>
        </div>
      ) : null}
      {!previewHrefPrefix && devProjects.length ? (
        <div className="mt-4 border-t border-white/8 pt-4">
          <p className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">Development</p>
          <div className="grid gap-0.5">
            {devProjects.map(project => {
              const href = `/portal/dev-workspace/${encodeURIComponent(project.id)}`;
              const active = pathname === href;
              return (
                <Link key={project.id} href={href} onClick={close} aria-current={active ? "page" : undefined} className={`group flex min-h-10 items-center gap-3 rounded-sm px-3 text-sm transition ${active ? "bg-[#f4efe6] text-[#151310]" : "text-white/58 hover:bg-white/[0.07] hover:text-white"}`}>
                  <Code2 size={16} strokeWidth={1.65} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  {!project.editorVisible ? <span className="text-[9px] font-semibold uppercase text-amber-200/70">Request</span> : null}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </nav>
  );
}

function PortalAttentionBadge({ item }: { item?: CustomerPortalAttentionItem }) {
  if (!item) return null;
  return (
    <span
      title={item.label}
      aria-label={item.label}
      className="grid min-h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[#b83f49] px-1.5 text-[9px] font-bold tabular-nums text-white shadow-[0_0_0_2px_rgba(255,255,255,0.08)]"
    >
      {item.count > 99 ? "99+" : item.count}
    </span>
  );
}

export function CustomerPortalChrome({
  children,
  clientName,
  email, viewerRole,
  name,
  avatarUrl,
  modeLabel,
  presentation,
  presentationProductId,
  productPresentations = {},
  previewBackHref,
  previewHrefPrefix,
  activePreviewSection,
  hideAccountMenu = false,
  logoUrl,
  accentColor = "#8b6c33",
  projectLabel = "Project",
  products = [],
  activePreviewProductId,
  activePreviewModuleId,
  activePreviewCustomPageSlug,
  providerName = "Milesymedia",
  providerMark = "M",
  attention,
  workspaces = [],
  accountActivityCapabilities = [],
  devProjects = [],
  safeSandboxEntry = false,
}: {
  children: ReactNode;
  clientName: string;
  email: string;
  /**
   * The viewer's REAL role. This was hardcoded to `"end-customer"`, which was
   * harmless while that was the only role the portal served — and became a lie
   * on 2026-08-27 when the client roles moved in, telling a `client-owner` they
   * were an "End customer". The two links this drives follow the AUDIENCE
   * (`inClientPortal`), so passing the true role changes the label and nothing
   * else.
   */
  viewerRole: Role;
  name?: string;
  avatarUrl?: string;
  modeLabel: string;
  presentation: ClientPortalDesignDocument;
  presentationProductId?: string;
  productPresentations?: Record<string, ClientPortalDesignDocument>;
  previewBackHref?: string;
  previewHrefPrefix?: string;
  activePreviewSection?: string;
  hideAccountMenu?: boolean;
  logoUrl?: string;
  accentColor?: string;
  projectLabel?: string;
  products?: PortalProductSelection[];
  activePreviewProductId?: string;
  activePreviewModuleId?: string;
  activePreviewCustomPageSlug?: string;
  providerName?: string;
  providerMark?: string;
  attention?: CustomerPortalAttention;
  workspaces?: CustomerPortalWorkspaceOption[];
  accountActivityCapabilities?: readonly CustomerAccountActivityCapability[];
  devProjects?: readonly CustomerDevWorkspaceProject[];
  safeSandboxEntry?: boolean;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const isPreview = Boolean(previewBackHref || hideAccountMenu);
  const showLogo = Boolean(logoUrl) && !logoFailed;
  const resolvedAccent = presentation.theme.accentColor || accentColor;
  const lightAccent = (contrastRatio(resolvedAccent, presentation.theme.backgroundColor) ?? 0) >= 4.5
    ? resolvedAccent
    : "#765a2c";
  const darkAccent = (contrastRatio(resolvedAccent, presentation.theme.darkColor) ?? 0) >= 4.5
    ? resolvedAccent
    : "#c9a76a";
  const serviceLabel = products.length > 1
    ? `${products.length} connected service systems`
    : products.length === 1
      ? portalProductModule(products[0]).label
      : presentation.chrome.serviceLabel;
  const routeProductId = useMemo(() => {
    const match = pathname.match(/\/portal\/customer\/service\/([^/]+)/);
    if (!match?.[1]) return undefined;
    try { return decodeURIComponent(match[1]); } catch { return match[1]; }
  }, [pathname]);
  const activeProductId = activePreviewProductId ?? routeProductId ?? (products.length === 1 ? products[0]?.id : undefined);
  const shellCode = portalCustomCode(presentation);
  const productPresentation = activeProductId && presentationProductId !== activeProductId
    ? productPresentations[activeProductId]
    : undefined;
  const productCode = productPresentation ? portalCustomCode(productPresentation) : undefined;
  const activeExtensions = [
    shellCode.enabled ? { id: "client-shell", code: shellCode } : null,
    productCode?.enabled ? { id: `product-${activeProductId}`, code: productCode } : null,
  ].filter((item): item is { id: string; code: ReturnType<typeof portalCustomCode> } => Boolean(item));
  const scopedCss = [shellCode.enabled ? shellCode.scopedCss : "", productCode?.enabled ? productCode.scopedCss : ""].filter(Boolean).join("\n");
  const extensionContext = useMemo(() => ({
    clientName,
    providerName,
    mode: modeLabel,
    productId: activeProductId ?? "",
  }), [activeProductId, clientName, modeLabel, providerName]);

  return (
    <div
      className="mm-customer-portal mm-portal-root h-[var(--aqua-shell-h,100dvh)] overflow-hidden bg-[var(--portal-bg)] text-[#171512]"
      style={{
        "--portal-accent": lightAccent,
        "--portal-accent-dark": darkAccent,
        "--portal-bg": presentation.theme.backgroundColor,
        "--portal-surface": presentation.theme.surfaceColor,
        "--portal-dark": presentation.theme.darkColor,
        "--portal-hero": presentation.theme.heroColor,
      } as CSSProperties}
    >
      {scopedCss ? <style>{`@scope (.mm-portal-root) {\n${scopedCss}\n}`}</style> : null}
      <aside className="mm-private-sidebar mm-customer-dark fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-white/8 bg-[var(--portal-dark)] px-5 py-6 text-white md:flex">
        <div className="flex min-h-14 items-center gap-3 border-b border-white/10 px-1 pb-6">
          <span className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/[0.04] text-[var(--portal-accent)]">
            {showLogo ? (
              <Sparkles size={16} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <span className="font-serif text-base" aria-hidden="true">{providerMark}</span>
            )}
            {showLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" onError={() => setLogoFailed(true)} className="absolute inset-0 h-full w-full bg-[var(--portal-dark)] object-contain p-1" />
            ) : null}
          </span>
          <div className="min-w-0">
            <p className="truncate font-serif text-xl leading-none text-[#f7f2e9]">{providerName}</p>
            <p className="mt-1.5 truncate text-[10px] uppercase tracking-[0.18em] text-white/38">{serviceLabel}</p>
          </div>
        </div>

        <div className="px-2 py-7">
          <p className="truncate text-[10px] uppercase tracking-[0.16em] text-white/35">{presentation.chrome.preparedForLabel}</p>
          <p className="mt-2 truncate font-serif text-lg text-[#f7f2e9]">{clientName}</p>
          {!isPreview && workspaces.length > 1 ? <CustomerWorkspaceSwitcher workspaces={workspaces} /> : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"><NavItems pathname={pathname} previewHrefPrefix={previewHrefPrefix} activePreviewSection={activePreviewSection} activePreviewProductId={activePreviewProductId} activePreviewModuleId={activePreviewModuleId} activePreviewCustomPageSlug={activePreviewCustomPageSlug} projectLabel={projectLabel} presentation={presentation} products={products} attention={attention} accountActivityCapabilities={accountActivityCapabilities} devProjects={devProjects} /></div>

        <div className="mt-auto border-t border-white/10 px-2 pt-5">
          <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">{presentation.chrome.currentStageLabel}</p>
          <div className="mt-2 flex items-center gap-2 text-xs font-medium text-white/78">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--portal-accent)]" />
            {modeLabel}
          </div>
          <p className={`mt-2 text-[10px] leading-4 ${attention?.total ? "text-[#f0a1a8]" : "text-white/35"}`}>
            {attention?.total ? `${attention.total} ${attention.total === 1 ? "item needs you" : "items need you"}` : "No decisions are waiting on you"}
          </p>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/35 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="mm-private-sidebar mm-customer-dark relative flex h-full w-[min(22rem,88vw)] flex-col overflow-hidden bg-[var(--portal-dark)] p-5 text-white shadow-2xl">
            <div className="mb-6 flex items-center justify-between border-b border-white/10 px-1 pb-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/[0.04] text-[var(--portal-accent)]">
                  {showLogo ? (
                    <Sparkles size={15} strokeWidth={1.5} aria-hidden="true" />
                  ) : (
                    <span className="font-serif text-sm" aria-hidden="true">{providerMark}</span>
                  )}
                  {showLogo ? (
                    <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoUrl} alt="" onError={() => setLogoFailed(true)} className="absolute inset-0 h-full w-full bg-[var(--portal-dark)] object-contain p-1" />
                    </>
                  ) : null}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-serif text-xl text-[#f7f2e9]">{providerName}</p>
                  <p className="truncate text-[10px] uppercase tracking-[0.16em] text-white/38">{clientName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-white"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {!isPreview && workspaces.length > 1 ? <div className="mb-5 border-b border-white/10 px-1 pb-5"><CustomerWorkspaceSwitcher workspaces={workspaces} /></div> : null}
              <NavItems pathname={pathname} close={() => setMobileOpen(false)} previewHrefPrefix={previewHrefPrefix} activePreviewSection={activePreviewSection} activePreviewProductId={activePreviewProductId} activePreviewModuleId={activePreviewModuleId} activePreviewCustomPageSlug={activePreviewCustomPageSlug} projectLabel={projectLabel} presentation={presentation} products={products} attention={attention} accountActivityCapabilities={accountActivityCapabilities} devProjects={devProjects} />
            </div>
            <div className="shrink-0 border-t border-white/10 px-3 pt-4">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">{presentation.chrome.currentStageLabel}</p>
              <div className="mt-2 flex items-center gap-2 text-xs font-medium text-white/78">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--portal-accent)]" />
                {modeLabel}
              </div>
              <p className={`mt-2 text-[10px] leading-4 ${attention?.total ? "text-[#f0a1a8]" : "text-white/35"}`}>
                {attention?.total ? `${attention.total} ${attention.total === 1 ? "item needs you" : "items need you"}` : "No decisions are waiting on you"}
              </p>
            </div>
          </aside>
        </div>
      )}

      <div className="flex h-[var(--aqua-shell-h,100dvh)] min-h-0 flex-col overflow-hidden md:pl-72">
        {previewBackHref && (
          <div className="flex min-h-10 items-center justify-between gap-3 border-b border-white/10 bg-[var(--portal-dark)] px-4 text-white sm:px-6 lg:px-10">
            <p className="min-w-0 truncate text-[10px] uppercase tracking-[0.12em] text-white/55 sm:tracking-[0.16em]">Agency preview · customers do not see this bar</p>
            {/* min-h-6 for WCAG 2.5.8: the text alone measured 16px tall, under
                the 24px minimum. Internal-only chrome is still chrome. */}
            <Link href={previewBackHref} className="inline-flex min-h-6 shrink-0 items-center gap-1.5 text-xs font-medium text-white/80 hover:text-white">
              <ArrowLeft size={13} aria-hidden="true" />
              Back to client work
            </Link>
          </div>
        )}
        <header className="z-20 flex min-h-[68px] shrink-0 items-center justify-between border-b border-black/8 bg-[var(--portal-bg)] px-4 sm:px-6 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white md:hidden"
            >
              <Menu size={18} aria-hidden="true" />
            </button>
            <div className="mm-private-chrome min-w-0">
              <p className="truncate text-[10px] uppercase tracking-[0.16em] text-black/38">{presentation.chrome.privateHomeLabel}</p>
              <p className="mt-0.5 truncate text-sm font-medium">{clientName}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            {safeSandboxEntry && !isPreview ? <SafeSandboxEntry /> : null}
            <div className="hidden sm:block"><ColorModeToggle /></div>
            <PrivacyModeControl canEnterShowcase={false} sensitiveTerms={[clientName, email, name ?? ""]} />
            {!isPreview && (
              <Link
                href={previewHrefPrefix ? `${previewHrefPrefix}support` : "/portal/customer/support"}
                className="mm-private-chrome hidden min-h-9 items-center gap-2 rounded-full border border-black/10 bg-white px-4 text-xs font-medium text-black/65 transition hover:border-black/20 hover:text-black sm:inline-flex"
              >
                <CircleHelp size={15} aria-hidden="true" />
                Get support
              </Link>
            )}
            {!hideAccountMenu && !previewBackHref && <div className="mm-private-chrome"><ProfileMenu email={email} role={viewerRole} name={name} avatarUrl={avatarUrl} accountLabel={`${providerName} account`} /></div>}
          </div>
        </header>
        <main id="main-content" className="mm-private-surface relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-[1360px] px-4 py-6 sm:px-7 sm:py-8 lg:px-12 lg:py-12">
            {activeExtensions.filter(item => item.code.placement === "before-content").map(item => <PortalCustomExtension key={item.id} id={item.id} code={item.code} context={extensionContext} />)}
            <PortalLoadingCoordinator>{children}</PortalLoadingCoordinator>
            {activeExtensions.filter(item => item.code.placement === "after-content").map(item => <PortalCustomExtension key={item.id} id={item.id} code={item.code} context={extensionContext} />)}
          </div>
        </main>
      </div>
    </div>
  );
}

export interface CustomerPortalWorkspaceOption {
  id: string;
  name: string;
  label?: string;
  providerName: string;
  current?: boolean;
}

function CustomerWorkspaceSwitcher({ workspaces }: { workspaces: CustomerPortalWorkspaceOption[] }) {
  const current = workspaces.find(item => item.current) ?? workspaces[0];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function switchWorkspace(clientId: string) {
    if (!clientId || clientId === current?.id) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/portal/customer/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await response.json() as { ok?: boolean; error?: string; redirect?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Portal could not be opened.");
      window.location.assign(data.redirect || "/portal/customer");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Portal could not be opened.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <label className="mb-1.5 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35"><Layers3 size={12} /> Workspace</label>
      <div className="relative">
        <select
          aria-label="Switch client workspace"
          value={current?.id || ""}
          disabled={busy}
          onChange={event => void switchWorkspace(event.target.value)}
          className="min-h-10 w-full appearance-none rounded-sm border border-white/12 bg-white/[0.055] px-3 pr-9 text-xs font-medium text-white outline-none transition focus:border-[var(--portal-accent)] disabled:opacity-60"
        >
          {workspaces.map(item => <option key={item.id} value={item.id} className="bg-[#12191f] text-white">{item.name}{item.label ? ` · ${item.label}` : ""} · {item.providerName}</option>)}
        </select>
        {busy ? <LoaderCircle size={14} className="absolute right-3 top-3 animate-spin text-[var(--portal-accent)]" /> : <Layers3 size={13} className="pointer-events-none absolute right-3 top-3 text-white/38" />}
      </div>
      {error ? <p role="alert" className="mt-2 text-[10px] leading-4 text-[#f0a1a8]">{error}</p> : null}
      <p className="mt-2 text-[9px] leading-4 text-white/28">Each workspace keeps separate projects, files, billing and service history.</p>
    </div>
  );
}
