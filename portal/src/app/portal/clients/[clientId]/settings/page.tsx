import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRoleForClient } from "@/lib/server/auth";
import { ensureHydrated } from "@/server/storage";
import { getClientForAgency } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";
import { phaseLabel } from "@/server/phases";
import { ClientStatusActions } from "./_ClientStatusActions";
import { ClientDomainSettings } from "./_ClientDomainSettings";
import { formatUkDateTime } from "@/lib/formatDateTime";

export default async function ClientSettingsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  await ensureHydrated();
  const { clientId } = await params;

  let session;
  try {
    session = await requireRoleForClient([...AGENCY_ROLES], clientId);
  } catch {
    redirect("/portal");
  }

  const client = getClientForAgency(session.agencyId, clientId);
  if (!client) notFound();

  const meta = client.metadata ?? {};
  const properties = Array.isArray(meta.properties)
    ? meta.properties.filter((property): property is { id: string; label: string; kind: string; liveUrl?: string } => (
      Boolean(property)
      && typeof property === "object"
      && typeof (property as { id?: unknown }).id === "string"
      && typeof (property as { label?: unknown }).label === "string"
      && typeof (property as { kind?: unknown }).kind === "string"
    ))
    : [];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Client settings</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-black/90">{client.name}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-black/60">
            Keep the operational record clean: owner details, project phase, portal state, and lifecycle controls.
          </p>
        </div>
        <Link
          href={`/portal/clients/${client.id}`}
          className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-medium text-black/75 shadow-sm hover:bg-black/[0.03]"
        >
          Back to client
        </Link>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <InfoCard label="Current phase" value={phaseLabel(client.stage)} />
        <InfoCard label="Portal login" value={client.ownerEmail ?? "Not added yet"} />
        <InfoCard label="Website" value={client.websiteUrl ?? "Not connected yet"} />
        <InfoCard label="Plan" value={stringMeta(meta.portalServicePlan) || planName(stringMeta(meta.planTier)) || "Not set"} />
      </section>

      <ClientDomainSettings
        clientId={client.id}
        initialWebsiteUrl={client.websiteUrl}
        properties={properties}
      />

      <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-black/85">Client record</h2>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <Detail label="Client ID" value={client.id} />
          <Detail label="Slug" value={client.slug} />
          <Detail label="Status" value={client.status === "suspended" ? "Paused" : client.status} />
          <Detail label="Updated" value={formatUkDateTime(client.updatedAt)} />
        </dl>
      </section>

      <ClientStatusActions clientId={client.id} status={client.status} />
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-black/40">{label}</p>
      <p className="mt-2 truncate text-base font-semibold text-black/85">{value}</p>
    </div>
  );
}

function planName(value: string): string {
  if (value === "foundational") return "Foundational Flow";
  if (value === "expansion") return "Expansion Plan";
  if (value === "mastery") return "Mastery Plan";
  return value;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-black/[0.025] px-3 py-2">
      <dt className="text-xs font-medium text-black/45">{label}</dt>
      <dd className="mt-1 break-words font-medium text-black/75">{value}</dd>
    </div>
  );
}

function stringMeta(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
