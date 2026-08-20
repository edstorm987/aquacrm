import { redirect } from "next/navigation";
import { Briefcase } from "lucide-react";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";
import { getFreelancerAccessConfig, listFreelancerJobsForConfig } from "@/server/freelancerWorkspace";
import { FreelancerAccessConfigPanel } from "./_FreelancerAccessConfigPanel";

export const dynamic = "force-dynamic";

// /portal/agency/freelancer-access — the agency sets the freelancer-workspace
// access policy here. (A sidebar/settings entry point is a small follow-up.)
export default async function FreelancerAccessPage() {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  const config = getFreelancerAccessConfig(session.agencyId);
  const jobs = listFreelancerJobsForConfig(session.agencyId);

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6 flex items-start gap-4">
        <span aria-hidden className="mm-area-icon inline-flex h-14 w-14 items-center justify-center rounded-lg">
          <Briefcase size={28} strokeWidth={1.7} />
        </span>
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold text-[var(--mm-text)]">Freelancer access</h1>
          <p className="mt-1 text-sm text-[var(--mm-text-muted)]">
            Control what a freelancer sees and can do in their own workspace. Privacy-first by default — open up more as you need.
          </p>
        </div>
      </header>
      <FreelancerAccessConfigPanel initial={config} jobs={jobs} />
    </div>
  );
}
