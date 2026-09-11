import { ShieldAlert } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { SecurityCentrePanel } from "@/components/security/SecurityCentrePanel";
import { requireRole } from "@/lib/server/auth/auth";
import { devTeamAccessible } from "@/lib/server/dev/devTeamAccess";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

import { PageHeader } from "../_ui";

// Dev Team -> Security. This is the founder's shell over the same tenant-safe
// Threat Centre used by agency owners. The page gate protects the internal
// workspace; the overview and action APIs remain the authoritative security
// boundaries and independently enforce owner, tenant, operator and AAL2 rules.
export const dynamic = "force-dynamic";

export default async function DevTeamSecurityPage() {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  if (!devTeamAccessible(session)) notFound();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        icon={<ShieldAlert size={20} />}
        accent="auditor"
        title="Security"
        subtitle="Threat posture, emergency containment controls, and the permanent action record."
      />
      <SecurityCentrePanel />
    </div>
  );
}
