import { requireRole } from "@/lib/server/auth/auth";
import { listSopCategories, listSops } from "@/engines/sop/server/sops";
import { listSopGuides } from "@/engines/sop/server/sopGuides";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

import { SopLibrary } from "./_SopLibrary";

export default async function SopLibraryPage() {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const canManageGuides = session.role === "agency-owner" || session.role === "agency-manager";
  return (
    <SopLibrary
      initialSops={listSops(session.agencyId)}
      initialCategories={listSopCategories(session.agencyId)}
      initialGuides={listSopGuides(session.agencyId)}
      canManageGuides={canManageGuides}
    />
  );
}
