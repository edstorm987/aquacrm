import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";
import { listClients } from "@/server/tenants";
import { EmptyState } from "@/components/ui/EmptyState";

// /portal/clients — agency-side client list. Client-* roles redirect
// straight to their own client portal (a list of "all clients" makes no
// sense for them).

export default async function ClientsList() {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  const clients = listClients(session.agencyId);
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-black/90">Clients</h1>
      <p className="mt-1 text-sm text-black/60">{clients.length} client{clients.length === 1 ? "" : "s"} in this agency.</p>
      {clients.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon="👥"
            heading="No clients yet"
            body="Create your first client to start onboarding. The fulfillment plugin contributes the new-client form on the agency home."
            cta={{ label: "Go to agency home", href: "/portal/agency" }}
          />
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {clients.map(c => (
            <li key={c.id}>
              <Link href={`/portal/clients/${c.id}`} className="block rounded-lg border border-black/10 bg-white p-4 hover:shadow">
                <div className="text-base font-medium text-black/90">{c.name}</div>
                <div className="mt-1 text-xs text-black/50">{c.stage} · {c.websiteUrl ?? "no website"}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
