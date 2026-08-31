import { redirect } from "next/navigation";

import { getActiveAgencyId, requireRole } from "@/lib/server/auth/auth";
import { ensureHydrated } from "@/server/storage";
import { buildGovernanceSnapshot } from "./_governanceData";
import { GovernanceWorkspace } from "./_GovernanceWorkspace";

export const dynamic = "force-dynamic";

/**
 * The Governance workspace — the dedicated HOME for compliance, legal and
 * security posture, KNOW-first. It surfaces where the agency stands from REAL
 * evidence and, just as loudly, where it cannot see. It never claims compliance
 * the app cannot prove.
 *
 * Owner/manager only. The destructive DPO action (right-to-erasure) is further
 * gated to owners inside the client, and enforced owner-only at the route.
 */
export default async function GovernancePage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole(["agency-owner", "agency-manager"]);
  } catch {
    redirect("/portal/agency");
  }
  const agencyId = getActiveAgencyId(session);
  const snapshot = await buildGovernanceSnapshot({ agencyId });
  // `?view=` so a posture control can link straight at the view that answers
  // it — a control whose "go and deal with it" link lands back on the control
  // is not a resolution path. An unknown value falls back to the posture
  // rather than rendering nothing.
  const query = searchParams ? await searchParams : {};
  const requestedView = typeof query.view === "string" ? query.view : undefined;
  return <GovernanceWorkspace initial={snapshot} isOwner={session.role === "agency-owner"} initialView={requestedView} />;
}
