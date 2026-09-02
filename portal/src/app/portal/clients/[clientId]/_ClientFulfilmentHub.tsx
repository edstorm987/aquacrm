import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  Boxes,
  FileArchive,
  FolderKanban,
  Landmark,
  MessageSquareText,
  PanelTop,
  Settings2,
  SlidersHorizontal,
  UserRoundSearch,
} from "lucide-react";

import { clientWorkspaceHref } from "@/lib/clients/clientWorkspace";

export function ClientFulfilmentHub({
  clientId,
  selectedProductId,
  advanced,
  serviceCount,
  portalBuilt,
  contractCount,
  invoiceCount,
  invoiceAvailability,
  fileCount,
  propertyCount,
  canManage = true,
}: {
  clientId: string;
  selectedProductId?: string;
  advanced: boolean;
  serviceCount: number;
  portalBuilt: boolean;
  contractCount: number;
  invoiceCount: number;
  invoiceAvailability: "ready" | "unavailable";
  fileCount: number;
  propertyCount: number;
  canManage?: boolean;
}) {
  const simpleHref = clientWorkspaceHref(clientId, "delivery", { product: selectedProductId });
  const advancedHref = clientWorkspaceHref(clientId, "delivery", { product: selectedProductId, mode: "advanced" });
  const portalHref = clientWorkspaceHref(clientId, "portal");
  const portalStudioHref = `/portal/agency/portals/editor?scope=client&clientId=${encodeURIComponent(clientId)}&mode=onboarding&section=home&context=client-workspace`;

  return (
    <section className="overflow-hidden border border-black/10 bg-white" aria-labelledby="client-fulfilment-heading">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-black/10 px-4 py-4 sm:px-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">One client · complete fulfilment</p>
          <h2 id="client-fulfilment-heading" className="mt-1 text-lg font-semibold text-black/82">Client fulfilment room</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-black/45">Run this client here. The main Fulfilment workspace remains the outer view across every client.</p>
        </div>
        <span className="text-xs font-semibold text-black/45">{serviceCount ? `${serviceCount} service${serviceCount === 1 ? "" : "s"} assigned` : "Service setup required"}</span>
      </header>

      <nav className="grid gap-px bg-black/[0.08] sm:grid-cols-2 xl:grid-cols-4" aria-label="Client fulfilment stations">
        <HubLink href={simpleHref} active={!advanced} icon={<BookOpenCheck size={16} />} label="Service command" detail="Stage and next move" />
        <HubLink href={advancedHref} active={advanced} icon={<FolderKanban size={16} />} label="Board & SOPs" detail="Tasks and procedures" />
        <HubLink href={clientWorkspaceHref(clientId, "finance")} icon={<Landmark size={16} />} label="Contracts & finance" detail={invoiceAvailability === "unavailable" ? `${contractCount} contracts · invoices unavailable` : `${contractCount} contracts · ${invoiceCount} invoices`} />
        <HubLink href={canManage && portalBuilt ? portalStudioHref : portalHref} icon={<PanelTop size={16} />} label={portalBuilt ? (canManage ? "Edit client portal" : "View client portal") : (canManage ? "Prepare client portal" : "Portal status")} detail={portalBuilt ? (canManage ? "Pages, brand, code and versions" : "Read-only client experience") : (canManage ? "Create and configure access" : "No portal created") } />
      </nav>

      <details className="group border-t border-black/[0.08] bg-black/[0.018]">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-xs font-semibold text-black/58 sm:px-5">
          <span className="inline-flex items-center gap-2"><SlidersHorizontal size={14} /> More client controls</span>
          <span><span className="group-open:hidden">Show</span><span className="hidden group-open:inline">Hide</span></span>
        </summary>
        <div className="grid gap-px border-t border-black/[0.08] bg-black/[0.08] sm:grid-cols-2 xl:grid-cols-3">
          <HubLink href={`${simpleHref}#service-assignment`} icon={<Settings2 size={15} />} label="Company & services" detail={canManage ? "Assign products, packages and provider" : "Read assigned services and provider"} compact />
          <HubLink href={clientWorkspaceHref(clientId, "files")} icon={<FileArchive size={15} />} label="Files & evidence" detail={`${fileCount} retained files`} compact />
          <HubLink href={clientWorkspaceHref(clientId, "systems")} icon={<Boxes size={15} />} label="Systems & properties" detail={`${propertyCount} connected properties`} compact />
          <HubLink href={clientWorkspaceHref(clientId, "communications")} icon={<MessageSquareText size={15} />} label="Messages & support" detail="Requests and unified contact" compact />
          <HubLink href={clientWorkspaceHref(clientId, "notes")} icon={<UserRoundSearch size={15} />} label="Complete client record" detail="Calls, notes, decisions and history" compact />
        </div>
      </details>
    </section>
  );
}

function HubLink({ href, icon, label, detail, active = false, compact = false }: {
  href: string;
  icon: ReactNode;
  label: string;
  detail: string;
  active?: boolean;
  compact?: boolean;
}) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`group flex min-w-0 items-center gap-3 bg-white px-4 transition hover:bg-brand/[0.045] ${compact ? "min-h-16 py-3" : "min-h-20 py-4"} ${active ? "text-brand shadow-[inset_0_-2px_0_var(--brand-primary)]" : "text-black/62"}`}>
      <span className={`grid size-9 shrink-0 place-items-center rounded-md ${active ? "bg-brand text-white" : "bg-black/[0.045] text-black/48 group-hover:bg-brand/10 group-hover:text-brand"}`}>{icon}</span>
      <span className="min-w-0 flex-1"><strong className="block truncate text-sm font-semibold">{label}</strong><span className="mt-0.5 block truncate text-[11px] text-black/40">{detail}</span></span>
      <ArrowRight size={13} className="shrink-0 text-black/25" />
    </Link>
  );
}
