import { redirect } from "next/navigation";

import { requireRole } from "@/lib/server/auth/auth";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LegacyPortalTemplatePreviewPage({ searchParams }: { searchParams: SearchParams }) {
  await ensureHydrated();
  try {
    await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }

  const query = await searchParams;
  const mode = singleValue(query.mode);
  const target = new URLSearchParams({ scope: "template" });
  if (mode === "designing" || mode === "developed-launch" || mode === "maintenance") target.set("mode", mode);
  redirect(`/portal/agency/portals/editor?${target.toString()}`);
}

function singleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
