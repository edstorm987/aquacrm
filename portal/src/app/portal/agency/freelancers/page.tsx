import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, SlidersHorizontal } from "lucide-react";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth/auth";
import { AGENCY_ROLES } from "@/server/types";
import { listAgencyFreelancers } from "@/server/freelancerAdmin";
import { FreelancerManager } from "./_FreelancerManager";

export const dynamic = "force-dynamic";

// /portal/agency/freelancers — create, manage, and preview freelancers. Their
// own limited workspace is /portal/freelancer; the access policy is in
// Settings → Freelancer access.
export default async function FreelancersPage() {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  const freelancers = listAgencyFreelancers(session.agencyId);

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 flex items-start gap-4">
        <span aria-hidden className="mm-area-icon inline-flex h-14 w-14 items-center justify-center rounded-lg">
          <Users size={28} strokeWidth={1.7} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold text-[var(--mm-text)]">Freelancers</h1>
          <p className="mt-1 text-sm text-[var(--mm-text-muted)]">
            Add contracted workers, preview exactly what they see, and control their access. They only ever see their own assigned jobs — never your client workspaces.
          </p>
        </div>
        <Link
          href="/portal/agency/freelancer-access"
          className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--mm-border)] px-3 py-1.5 text-xs font-medium text-[var(--mm-text)] transition hover:bg-[var(--mm-surface-muted)]"
        >
          <SlidersHorizontal size={14} /> Access policy
        </Link>
      </header>
      <FreelancerManager freelancers={freelancers} />
    </div>
  );
}
