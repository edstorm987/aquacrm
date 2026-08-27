import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRoleForClient } from "@/lib/server/auth/auth";
import { ensureHydrated } from "@/server/storage";
import { getClientForAgency } from "@/server/tenants";
import { previewClientErasure } from "@/server/clientErasure";
import { AGENCY_ROLES, isAgencyRole } from "@/server/types";
import { phaseLabel } from "@/server/phases";
import { ClientStatusActions } from "./_ClientStatusActions";
import { ClientDangerZone } from "./_ClientDangerZone";
import { ClientDomainSettings } from "./_ClientDomainSettings";
import { formatUkDateTime } from "@/lib/shared/formatDateTime";
import { getPortalFormFields } from "@/server/portalEditor";
import { ClientCustomFieldsSettings } from "./_ClientCustomFieldsSettings";
import type { PortalCustomFieldValues } from "@/components/forms/PortalCustomFields";
import {
  clientWorkspaceElementAtLeast,
  clientWorkspaceElementLevel,
  currentClientWorkspaceElementAccess,
  visibleClientWorkspaceTabs,
} from "@/lib/server/access/clientWorkspaceElementAccess";
import { clientWorkspaceHref } from "@/lib/clients/clientWorkspace";

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
  const { access: clientAccess } = await currentClientWorkspaceElementAccess(client.id);
  const settingsLevel = clientWorkspaceElementLevel(clientAccess, "client.settings");
  if (!clientWorkspaceElementAtLeast(settingsLevel, "view")) redirect("/portal");
  const canManageSettings = isAgencyRole(session.role)
    && !session.publicShowcase
    && clientWorkspaceElementAtLeast(settingsLevel, "manage");
  const fallbackTab = visibleClientWorkspaceTabs(clientAccess)[0];
  const backHref = fallbackTab ? clientWorkspaceHref(client.id, fallbackTab) : "/portal";

  const meta = client.metadata ?? {};
  // Owner-only: erasure is irreversible. The count is worked out here so the
  // danger zone can say exactly how much will go.
  const canErase = session.role === "agency-owner" && canManageSettings;
  const erasureCount = canErase ? await previewClientErasure(session.agencyId, client.id) ?? 0 : 0;
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
          href={backHref}
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

      {canManageSettings ? (
        <>
          <ClientDomainSettings
            clientId={client.id}
            initialWebsiteUrl={client.websiteUrl}
            properties={properties}
          />

          <ClientCustomFieldsSettings
            clientId={client.id}
            fields={getPortalFormFields(session.agencyId, "clients")}
            initialValues={portalCustomFieldValues(client.metadata?.customFields)}
          />
        </>
      ) : (
        <p className="rounded-lg border border-black/10 bg-white px-4 py-3 text-sm text-black/55">
          This client settings element is view-only. An owner can grant Manage access for configuration changes.
        </p>
      )}

      <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-black/85">Client record</h2>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <Detail label="Client ID" value={client.id} />
          <Detail label="Slug" value={client.slug} />
          <Detail label="Status" value={client.status === "suspended" ? "Paused" : client.status} />
          <Detail label="Updated" value={formatUkDateTime(client.updatedAt)} />
        </dl>
      </section>

      {canManageSettings ? <ClientStatusActions clientId={client.id} status={client.status} /> : null}

      {canErase ? (
        <ClientDangerZone clientId={client.id} clientName={client.name} recordCount={erasureCount} />
      ) : null}
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

function portalCustomFieldValues(value: unknown): PortalCustomFieldValues {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, PortalCustomFieldValues[string]] => {
    const fieldValue = entry[1];
    return typeof fieldValue === "string"
      || typeof fieldValue === "boolean"
      || Array.isArray(fieldValue) && fieldValue.every(item => typeof item === "string");
  }));
}
