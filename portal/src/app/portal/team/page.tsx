import { redirect } from "next/navigation";

import { requireRole } from "@/lib/server/auth";
import { ensureHydrated } from "@/server/storage";
import { TeamWorkspace } from "./_TeamWorkspace";
import { teamWorkspaceData } from "./_data";

export const dynamic = "force-dynamic";

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await ensureHydrated();
  const session = await requireRole(["agency-staff"]);
  const query = await searchParams;
  const data = teamWorkspaceData(session.agencyId, session.userId, query.date);
  if (!data) redirect("/portal/account?notice=employee-workspace-pending");
  return <TeamWorkspace section="my-day" initial={data} />;
}
