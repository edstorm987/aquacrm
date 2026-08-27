import { redirect } from "next/navigation";
import { requireSession } from "@/lib/server/auth/auth";

// Compatibility route only. Agency preferences live in the Settings hub;
// customer identities have no agency settings and return to their account.
export default async function PreferencesPage() {
  const session = await requireSession().catch(() => null);
  if (!session) redirect("/login?next=/portal/account/preferences");
  if (session.publicShowcase) redirect("/portal/account/permissions");
  if (session.role.startsWith("agency-")) redirect("/portal/agency/settings#notifications");
  redirect("/portal/account");
}
