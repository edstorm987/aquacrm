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
  CreditCard,
  Files,
  FolderKanban,
  Home,
  IdCard,
  Menu,
  PackageCheck,
  Route,
  ScanSearch,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";
import { ProfileMenu } from "@/components/chrome/ProfileMenu";
import { ColorModeToggle } from "@/components/chrome/ColorModeToggle";
import { PrivacyModeControl } from "@/components/chrome/PrivacyModeControl";
import { contrastRatio } from "@/lib/a11y/contrastValidator";
import { formatPortalCopy } from "@/lib/clientPortalDesign";
import { portalProductModule, type PortalModuleIcon } from "@/lib/portalProductModules";
import type { PortalProductSelection } from "@/lib/portalProducts";
import type { ClientPortalDesignDocument } from "@/server/types";

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
}) {
  const coreNav = products.length
    ? NAV.filter(item => item.section === "home" || (products.length > 1 && item.section === "project"))
    : NAV;
  const sharedNav = products.length
    ? NAV.filter(item => item.section === "files" || item.section === "billing" || item.section === "support" || item.section === "details")
    : [];

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
          <span>{item.section === "project" && page.label === "Project"
            ? products.length > 1 ? "Programme" : projectLabel
            : formatPortalCopy(page.label, { projectLabel })}</span>
        </Link>
      );
    });
  }

  return (
    <nav aria-label="Client portal" className="grid gap-1">
      {shellLinks(coreNav)}
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
                return <Link key={page.id} href={href} onClick={close} aria-current={active ? "page" : undefined} className={`group flex min-h-9 items-center gap-3 rounded-sm px-3 text-[13px] transition ${active ? "bg-[#f4efe6] text-[#151310]" : "text-white/55 hover:bg-white/[0.07] hover:text-white"}`}><Icon size={15} strokeWidth={1.6} aria-hidden="true" /><span className="truncate">{page.navLabel}</span></Link>;
              })}
            </div>
          </div>
        );
      })}
      {sharedNav.length ? <div className="mt-4 border-t border-white/8 pt-4"><p className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">Shared workspace</p><div className="grid gap-0.5">{shellLinks(sharedNav)}</div></div> : null}
    </nav>
  );
}

export function CustomerPortalChrome({
  children,
  clientName,
  email,
  name,
  avatarUrl,
  modeLabel,
  presentation,
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
  providerName = "Milesymedia",
  providerMark = "M",
}: {
  children: ReactNode;
  clientName: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  modeLabel: string;
  presentation: ClientPortalDesignDocument;
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
  providerName?: string;
  providerMark?: string;
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

  return (
    <div
      className="mm-customer-portal mm-portal-root h-dvh overflow-hidden bg-[var(--portal-bg)] text-[#171512]"
      style={{
        "--portal-accent": lightAccent,
        "--portal-accent-dark": darkAccent,
        "--portal-bg": presentation.theme.backgroundColor,
        "--portal-surface": presentation.theme.surfaceColor,
        "--portal-dark": presentation.theme.darkColor,
        "--portal-hero": presentation.theme.heroColor,
      } as CSSProperties}
    >
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
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"><NavItems pathname={pathname} previewHrefPrefix={previewHrefPrefix} activePreviewSection={activePreviewSection} activePreviewProductId={activePreviewProductId} activePreviewModuleId={activePreviewModuleId} projectLabel={projectLabel} presentation={presentation} products={products} /></div>

        <div className="mt-auto border-t border-white/10 px-2 pt-5">
          <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">{presentation.chrome.currentStageLabel}</p>
          <div className="mt-2 flex items-center gap-2 text-xs font-medium text-white/78">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--portal-accent)]" />
            {modeLabel}
          </div>
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
              <NavItems pathname={pathname} close={() => setMobileOpen(false)} previewHrefPrefix={previewHrefPrefix} activePreviewSection={activePreviewSection} activePreviewProductId={activePreviewProductId} activePreviewModuleId={activePreviewModuleId} projectLabel={projectLabel} presentation={presentation} products={products} />
            </div>
            <div className="shrink-0 border-t border-white/10 px-3 pt-4">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">{presentation.chrome.currentStageLabel}</p>
              <div className="mt-2 flex items-center gap-2 text-xs font-medium text-white/78">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--portal-accent)]" />
                {modeLabel}
              </div>
            </div>
          </aside>
        </div>
      )}

      <div className="flex h-dvh min-h-0 flex-col overflow-hidden md:pl-72">
        {previewBackHref && (
          <div className="flex min-h-10 items-center justify-between gap-3 border-b border-white/10 bg-[var(--portal-dark)] px-4 text-white sm:px-6 lg:px-10">
            <p className="min-w-0 truncate text-[10px] uppercase tracking-[0.12em] text-white/55 sm:tracking-[0.16em]">Agency preview · customers do not see this bar</p>
            <Link href={previewBackHref} className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-white/80 hover:text-white">
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
            {!hideAccountMenu && !previewBackHref && <div className="mm-private-chrome"><ProfileMenu email={email} role="end-customer" name={name} avatarUrl={avatarUrl} accountLabel={`${providerName} account`} /></div>}
          </div>
        </header>
        <main id="main-content" className="mm-private-surface min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-[1360px] px-4 py-6 sm:px-7 sm:py-8 lg:px-12 lg:py-12">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
