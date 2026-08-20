import { requireRole } from "@/lib/server/auth";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

import { CodeWorkspace } from "./_CodeWorkspace";

export default async function CodePage() {
  await ensureHydrated();
  await requireRole([...AGENCY_ROLES]);
  return <CodeWorkspace />;
}
