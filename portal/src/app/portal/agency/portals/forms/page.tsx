import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";

import { PortalEditorPanel } from "@/app/portal/agency/settings/PortalEditorPanel";
import { requireRole } from "@/lib/server/auth/auth";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";

export default async function PortalDataFormsPage() {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  await requireCurrentWorkspaceElementAccess("fulfilment", "fulfilment.portals", "manage");

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <header className="flex flex-col gap-4 border-b border-black/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">Workspace configuration</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-black/90">Data forms</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/52">Control the custom information collected for contacts, expenses, clients, leads, actions, and products.</p>
        </div>
        <Link href="/portal/agency/portals" className="inline-flex min-h-10 items-center gap-2 self-start rounded-md border border-black/12 bg-white px-3 text-sm font-semibold text-black/65 hover:bg-black/[0.03]"><ArrowLeft size={15} /> Back to portals</Link>
      </header>
      <div id="forms" className="scroll-mt-6 pt-7">
        <PortalEditorPanel canManage />
      </div>
    </div>
  );
}
