import { requireRole } from "@/lib/server/auth/auth";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { notFound } from "next/navigation";

import { CodeWorkspace } from "./_CodeWorkspace";

export default async function CodePage() {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  if (session.publicShowcase) notFound();
  return <CodeWorkspace />;
}
