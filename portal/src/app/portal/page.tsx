// /portal — role-aware redirect.
//
//   agency-staff              → /portal/team
//   other agency roles        → /portal/agency
//   freelancer                → /portal/freelancer   (their own limited workspace)
//   client-owner/client-staff → /portal/customer     ← changed 2026-08-27
//   end-customer              → /portal/customer

import { redirect } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { getSession } from "@/lib/server/auth/auth";
import { isAgencyRole, isClientRole } from "@/server/types";

export default async function PortalIndex() {
  await ensureHydrated();
  const session = await getSession();
  if (!session) redirect("/login?next=/portal");

  if (session.role === "agency-staff") redirect("/portal/team");
  if (isAgencyRole(session.role)) redirect("/portal/agency");
  // A freelancer sees their OWN limited workspace, never the agency-side client
  // workspace — so branch before the client-role fall-through below.
  if (session.role === "freelancer") redirect("/portal/freelancer");
  // A CLIENT belongs in their own portal, not in the agency-side workspace.
  //
  // Ed settled this on 2026-08-27: *"inside the client internal workspace is for
  // internal employees … for clients anything they touch is inside their
  // portal"*, and *"existing customer portal actually meant to be"*. This line
  // used to send `client-owner` / `client-staff` to `/portal/clients/<id>` —
  // the INTERNAL workspace — which was a placement mistake rather than an
  // exposure (its mutation surface is already agency-role-only), but it put the
  // client in Ed's workspace instead of their own.
  //
  // `/portal/customer` is that portal, and its host gate now admits these roles
  // (`CUSTOMER_PORTAL_ROLES`). The plugin pages on that surface are unchanged:
  // they stay `end-customer`-only, because they are shopper surfaces belonging
  // to the client's OWN customers.
  if (session.role === "client-owner" || session.role === "client-staff") redirect("/portal/customer");
  if (session.role === "end-customer") redirect("/portal/customer");
  // Any other client-family role that reaches here without a home.
  if (isClientRole(session.role) && session.clientId) redirect(`/portal/clients/${session.clientId}`);
  redirect("/login");
}
