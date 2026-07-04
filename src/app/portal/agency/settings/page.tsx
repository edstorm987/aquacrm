// /portal/agency/settings — the one-page tabbed settings hub. Picks
// up the agency layout's sidebar + topbar; renders the gear header +
// SettingsTabs (client-side tab switcher) below.

import { redirect } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";
import { getAgency, listClients } from "@/server/tenants";
import { getUserById } from "@/server/users";
import { listPhasesForAgency } from "@/server/phases";
import { listInstalledFor } from "@/server/pluginInstalls";
import { SettingsTabs } from "./SettingsTabs";

export default async function AgencySettingsPage() {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }

  const agency = getAgency(session.agencyId);
  if (!agency) redirect("/login");

  const user = getUserById(session.userId);

  const ctx = {
    user: {
      name: user?.name,
      email: session.email,
      role: session.role,
      avatarUrl: user?.avatarUrl,
    },
    agency: {
      id: agency.id,
      name: agency.name,
      slug: agency.slug,
      primaryColor: agency.brand?.primaryColor,
    },
    workspace: {
      clientCount: listClients(agency.id).length,
      phaseCount: listPhasesForAgency(agency.id).length,
      pluginCount: listInstalledFor({ agencyId: agency.id }).length,
    },
  };

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8 flex items-start gap-4">
        <span aria-hidden className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-black/5 to-black/10 shadow-inner">
          <svg viewBox="0 0 24 24" className="h-8 w-8 text-black/55" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </span>
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold text-black/90">Settings</h1>
          <p className="mt-1 text-sm text-black/55">
            One page for the whole workspace — profile, preferences, permissions, phases and plugins.
          </p>
        </div>
      </header>

      <SettingsTabs ctx={ctx} />
    </div>
  );
}
