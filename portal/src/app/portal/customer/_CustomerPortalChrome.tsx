"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  CircleHelp,
  CreditCard,
  Files,
  FolderKanban,
  Home,
  Library,
  Menu,
  Sparkles,
  X,
} from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";
import { ProfileMenu } from "@/components/chrome/ProfileMenu";

const NAV = [
  { label: "Home", href: "/portal/customer", section: "home", icon: Home },
  { label: "Project", href: "/portal/customer/project", section: "project", icon: FolderKanban },
  { label: "Files", href: "/portal/customer/files", section: "files", icon: Files },
  { label: "Billing", href: "/portal/customer/billing", section: "billing", icon: CreditCard },
  { label: "Support", href: "/portal/customer/support", section: "support", icon: CircleHelp },
  { label: "Resources", href: "/portal/customer/resources", section: "resources", icon: Library },
];

function NavItems({
  pathname,
  close,
  previewHrefPrefix,
  activePreviewSection,
}: {
  pathname: string;
  close?: () => void;
  previewHrefPrefix?: string;
  activePreviewSection?: string;
}) {
  return (
    <nav aria-label="Client portal" className="grid gap-1">
      {NAV.map(item => {
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
              "group flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition",
              active
                ? "bg-[#1b1a18] text-white shadow-sm"
                : "text-[#625e58] hover:bg-black/[0.045] hover:text-[#1b1a18]",
            ].join(" ")}
          >
            <Icon size={17} strokeWidth={1.65} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
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
  previewBackHref,
  previewHrefPrefix,
  activePreviewSection,
  hideAccountMenu = false,
  logoUrl,
  accentColor = "#8b6c33",
}: {
  children: ReactNode;
  clientName: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  modeLabel: string;
  previewBackHref?: string;
  previewHrefPrefix?: string;
  activePreviewSection?: string;
  hideAccountMenu?: boolean;
  logoUrl?: string;
  accentColor?: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isPreview = Boolean(previewBackHref || hideAccountMenu);

  return (
    <div
      className="min-h-screen bg-[#f5f3ef] text-[#1b1a18]"
      style={{ "--portal-accent": accentColor } as CSSProperties}
    >
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-black/10 bg-[#fbfaf8] px-4 py-5 md:flex">
        <div className="flex min-h-14 items-center gap-3 border-b border-black/8 px-2 pb-5">
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-black/10 bg-white text-[var(--portal-accent)]">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={`${clientName} logo`} className="h-full w-full object-contain p-1" />
            ) : (
              <Sparkles size={16} strokeWidth={1.5} aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate font-serif text-lg leading-none">Milesymedia</p>
            <p className="mt-1 truncate text-[10px] uppercase tracking-[0.18em] text-black/40">Client concierge</p>
          </div>
        </div>

        <div className="px-2 py-6">
          <p className="truncate text-[11px] uppercase tracking-[0.16em] text-black/38">Your workspace</p>
          <p className="mt-1 truncate text-sm font-medium">{clientName}</p>
        </div>

        <NavItems pathname={pathname} previewHrefPrefix={previewHrefPrefix} activePreviewSection={activePreviewSection} />

        <div className="mt-auto rounded-md border border-black/8 bg-white px-3 py-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-black/40">Project status</p>
          <div className="mt-2 flex items-center gap-2 text-xs font-medium">
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
          <aside className="relative flex h-full w-[82vw] max-w-xs flex-col bg-[#fbfaf8] p-4 shadow-2xl">
            <div className="mb-6 flex items-center justify-between border-b border-black/8 px-2 pb-4">
              <div className="flex min-w-0 items-center gap-3">
                {logoUrl ? (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-black/10 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoUrl} alt={`${clientName} logo`} className="h-full w-full object-contain p-1" />
                  </span>
                ) : null}
                <div className="min-w-0">
                  <p className="font-serif text-xl">Milesymedia</p>
                  <p className="truncate text-[10px] uppercase tracking-[0.16em] text-black/40">{clientName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <NavItems pathname={pathname} close={() => setMobileOpen(false)} previewHrefPrefix={previewHrefPrefix} activePreviewSection={activePreviewSection} />
          </aside>
        </div>
      )}

      <div className="md:pl-64">
        {previewBackHref && (
          <div className="flex min-h-10 items-center justify-between bg-[#1b1a18] px-4 text-white sm:px-6 lg:px-10">
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/55">Agency preview · customers do not see this bar</p>
            <Link href={previewBackHref} className="inline-flex items-center gap-1.5 text-xs font-medium text-white/80 hover:text-white">
              <ArrowLeft size={13} aria-hidden="true" />
              Back to fulfilment
            </Link>
          </div>
        )}
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-black/8 bg-[#f5f3ef]/90 px-4 backdrop-blur-xl sm:px-6 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white md:hidden"
            >
              <Menu size={18} aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-[10px] uppercase tracking-[0.16em] text-black/40">Milesymedia for</p>
              <p className="truncate text-sm font-medium">{clientName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!isPreview && (
              <Link
                href={previewHrefPrefix ? `${previewHrefPrefix}support` : "/portal/customer/support"}
                className="hidden min-h-9 items-center gap-2 rounded-full border border-black/10 bg-white px-4 text-xs font-medium text-black/65 transition hover:border-black/20 hover:text-black sm:inline-flex"
              >
                <CircleHelp size={15} aria-hidden="true" />
                Get support
              </Link>
            )}
            {!hideAccountMenu && !previewBackHref && <ProfileMenu email={email} role="end-customer" name={name} avatarUrl={avatarUrl} />}
          </div>
        </header>
        <main id="main-content" className="mx-auto w-full max-w-[1440px] px-4 py-7 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
