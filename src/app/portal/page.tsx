// /portal — role-aware redirect. Agency roles → /portal/agency.
// Client roles → /portal/clients/<theirClientId>. End-customer →
// /portal/customer.

import { redirect } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { getSession } from "@/lib/server/auth";
import { isAgencyRole, isClientRole } from "@/server/types";

export default async function PortalIndex() {
  await ensureHydrated();
  const session = await getSession();
  if (!session) redirect("/login?next=/portal");

  if (isAgencyRole(session.role)) redirect("/portal/agency");
  if (isClientRole(session.role) && session.clientId) redirect(`/portal/clients/${session.clientId}`);
  if (session.role === "end-customer") redirect("/portal/customer");
  redirect("/login");
}
