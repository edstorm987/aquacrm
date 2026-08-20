import { redirect } from "next/navigation";

import { getActiveAgencyId, requireRole } from "@/lib/server/auth/auth";
import { peopleSnapshot } from "@/server/people";
import { staffCapacitySnapshot } from "@/server/staffCapacity";
import { ensureHydrated } from "@/server/storage";
import { PeopleCommand } from "./_PeopleCommand";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole(["agency-owner", "agency-manager"]);
  } catch {
    redirect("/portal/agency");
  }
  const agencyId = getActiveAgencyId(session);
  const capacity = await staffCapacitySnapshot(agencyId);
  return <PeopleCommand initial={peopleSnapshot(agencyId)} capacity={capacity} />;
}
