import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole, getSessionAgencyIds, getActiveAgencyId } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";
import { getAgency, listClients } from "@/server/tenants";
import type { Client } from "@/server/types";
import { phaseLabel } from "@/server/phases";
import { NewClientButton } from "@/app/portal/agency/_NewClientButton";
import { getUserById } from "@/server/users";
import { listInstalledFor } from "@/server/pluginInstalls";
import { buildSidebar } from "@/lib/chrome/sidebarLayout";
import { effectiveRole } from "@/lib/server/effectiveRole";
import { ThemeInjector } from "@/components/chrome/ThemeInjector";
import { Sidebar } from "@/components/chrome/Sidebar";
import { Topbar } from "@/components/chrome/Topbar";
import { NotificationBell } from "@/components/chrome/NotificationBell";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

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
  const agency = getAgency(session.agencyId);
  if (!agency) redirect("/login");

  const clients = listClients(session.agencyId);
  const installs = listInstalledFor({ agencyId: agency.id });
  const eff = effectiveRole(session);
  const panels = buildSidebar({
    role: session.role,
    scope: "agency",
    installedPlugins: installs,
    permissions: eff.permissions,
    isFounder: eff.isFounder,
  });
  const currentPath = "/portal/clients";

  return (
    <>
      <ThemeInjector brand={agency.brand} scope="agency" />
      <div className="flex min-h-screen">
        <Sidebar
          panels={panels}
          tenantLabel={agency.name}
          currentPath={currentPath}
          agencies={getSessionAgencyIds(session).flatMap(id => {
            const a = getAgency(id);
            return a ? [{ id: a.id, name: a.name, swatch: a.brand?.primaryColor }] : [];
          })}
          activeAgencyId={getActiveAgencyId(session)}
          extra={<NotificationBell agencyId={agency.id} actor={session.userId} />}
        />
        <div className="flex flex-1 flex-col">
          <Topbar
            title={agency.name}
            subtitle="Clients"
            role={session.role}
            email={session.email}
            name={getUserById(session.userId)?.name}
            avatarUrl={getUserById(session.userId)?.avatarUrl}
            panels={panels}
            tenantLabel={agency.name}
            currentPath={currentPath}
            isDemo={session.isDemo}
          />
          <main id="main-content" className="flex-1 px-8 py-6">
            <ErrorBoundary label="clients index">
              <div className="flex flex-col gap-6">
                <header className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand">Client control room</p>
                    <h1 className="mt-1 text-2xl font-semibold tracking-tight text-black/90">Clients</h1>
                    <p className="mt-1 max-w-2xl text-sm text-black/60">
                      Add clients, track their current phase, keep their portal work together, and jump straight into the next thing they need.
                    </p>
                  </div>
                  <NewClientButton />
                </header>

                {clients.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-black/15 bg-white/70 px-6 py-12 text-center shadow-sm">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-xl text-brand" aria-hidden>
                      +
                    </div>
                    <h2 className="mt-4 text-lg font-semibold text-black/85">No clients yet</h2>
                    <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-black/60">
                      Start with one client. Give them a phase, owner email, brand colour and plan notes, then their workspace becomes the place you run onboarding from.
                    </p>
                    <p className="mt-5 text-xs font-medium text-black/45">
                      Use the New client button above to add the first one.
                    </p>
                  </div>
                ) : (
                  <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {clients.map(c => (
                      <li key={c.id} className="min-w-0">
                        <ClientCard client={c} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </>
  );
}

function ClientCard({ client }: { client: Client }) {
  const meta = client.metadata ?? {};
  const planTier = stringMeta(meta.planTier);
  const whatsappLink = stringMeta(meta.whatsappLink);
  const stripeLink = stringMeta(meta.stripeLink);
  const lockInPaid = Boolean(meta.lockInPaid);
  const initials = client.name
    .split(/\s+/)
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase())
    .join("") || "C";

  return (
    <article className="flex h-full flex-col rounded-xl border border-black/10 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link href={`/portal/clients/${client.id}`} className="group flex min-w-0 items-start gap-3">
        {client.brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={client.brand.logoUrl} alt="" className="h-12 w-12 rounded-lg object-cover ring-1 ring-black/10" />
        ) : (
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: client.brand.primaryColor }}
            aria-hidden
          >
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-black/90 group-hover:text-brand">{client.name}</h2>
          <p className="mt-1 truncate text-xs text-black/50">{client.ownerEmail ?? "No portal login email yet"}</p>
        </div>
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white"
          style={{ backgroundColor: client.brand.primaryColor }}
        >
          {phaseLabel(client.stage)}
        </span>
        {planTier && (
          <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] font-medium capitalize text-black/65">
            {planTier.replace(/-/g, " ")}
          </span>
        )}
        {lockInPaid && (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
            Lock-in paid
          </span>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <InfoTile label="Website" value={client.websiteUrl ? "Connected" : "Not added"} />
        <InfoTile label="Portal" value={client.endCustomers?.signupsEnabled === false ? "Private" : "Ready"} />
      </dl>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-black/10 pt-4">
        <Link href={`/portal/clients/${client.id}`} className="rounded-md bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-black/85">
          Manage
        </Link>
        <Link href={`/portal/clients/${client.id}?tab=portal`} className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/75 hover:bg-black/[0.03]">
          Portal
        </Link>
        <Link href={`/portal/clients/${client.id}?tab=finance`} className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/75 hover:bg-black/[0.03]">
          Finance
        </Link>
        {whatsappLink && (
          <a href={whatsappLink} target="_blank" rel="noreferrer" className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/75 hover:bg-black/[0.03]">
            WhatsApp
          </a>
        )}
        {stripeLink && (
          <a href={stripeLink} target="_blank" rel="noreferrer" className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/75 hover:bg-black/[0.03]">
            Payment
          </a>
        )}
      </div>
    </article>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-black/40">{label}</dt>
      <dd className="mt-1 truncate font-medium text-black/75">{value}</dd>
    </div>
  );
}

function stringMeta(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
