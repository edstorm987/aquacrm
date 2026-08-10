import { redirect } from "next/navigation";

import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { AGENCY_ROLES, type ClientPortalMode } from "@/server/types";
import { listClients } from "@/server/tenants";
import { ClientPortalStudio, type PortalStudioClient } from "./_ClientPortalStudio";

export default async function ClientPortalEditorPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; scope?: string; mode?: string; section?: string }>;
}) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }

  const agencyId = session.activeAgencyId ?? session.agencyId;
  const query = await searchParams;
  const clients: PortalStudioClient[] = listClients(agencyId, { includeArchived: true })
    .map(client => ({
      id: client.id,
      name: client.name,
      built: typeof client.metadata?.portalBuiltAt === "number",
      mode: cleanMode(client.metadata?.portalMode),
    }))
    .sort((a, b) => Number(b.built) - Number(a.built) || a.name.localeCompare(b.name));
  const requestedClient = clients.find(client => client.id === query.clientId);
  const initialClientId = requestedClient?.id ?? clients.find(client => client.built)?.id ?? clients[0]?.id ?? "";

  return (
    <ClientPortalStudio
      clients={clients}
      initialClientId={initialClientId}
      initialScope={query.scope === "template" ? "template" : "client"}
      initialMode={cleanMode(query.mode ?? requestedClient?.mode)}
      initialSection={cleanSection(query.section)}
      canManage={session.role === "agency-owner" || session.role === "agency-manager"}
    />
  );
}

function cleanMode(value: unknown): ClientPortalMode {
  return value === "designing" || value === "developed-launch" || value === "maintenance" ? value : "onboarding";
}

function cleanSection(value: unknown): "home" | "project" | "results" | "files" | "billing" | "support" | "resources" | "details" {
  return value === "project" || value === "results" || value === "files" || value === "billing" || value === "support" || value === "resources" || value === "details"
    ? value
    : "home";
}
