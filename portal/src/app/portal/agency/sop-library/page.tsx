import { requireRole } from "@/lib/server/auth";
import { listSops } from "@/server/sops";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

import { SopLibrary } from "./_SopLibrary";

export default async function SopLibraryPage() {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  return <SopLibrary initialSops={listSops(session.agencyId)} />;
}
