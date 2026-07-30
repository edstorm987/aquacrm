import { ensureHydrated } from "@/server/storage";
import { requireSession } from "@/lib/server/auth";
import { effectiveRole } from "@/lib/server/effectiveRole";
import { redirect } from "next/navigation";
import { ColorModeToggle } from "@/components/chrome/ColorModeToggle";

export const metadata = { title: "Permissions · Milesy Media" };

const ROLE_LABEL: Record<string, string> = {
  "agency-owner": "Business owner",
  "agency-manager": "Manager",
  "agency-staff": "Team member",
  "client-owner": "Client owner",
  "client-staff": "Client team member",
  "end-customer": "Customer",
  lead: "Lead",
};

function permissionLabel(permission: string): string {
  return permission
    .replace(/^plugins[._-]+install$/, "Manage systems")
    .replace(/^kanban[._-]+view$/, "View work boards")
    .replace(/^kanban[._-]+edit$/, "Edit work boards")
    .replace(/^sops[._-]+view$/, "View playbooks")
    .replace(/^sops[._-]+tag[._-]+/, "Manage playbooks: ")
    .replace(/[._-]+/g, " ")
    .replace(/\bSops\b/gi, "Playbooks")
    .replace(/\bPlugins\b/gi, "Systems")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

export default async function PermissionsPage() {
  await ensureHydrated();
  let session;
  try {
    session = await requireSession();
  } catch {
    redirect("/login?next=/portal/account/permissions");
  }
  const eff = effectiveRole(session);

  return (
    <main id="main-content" className="mm-portal-root relative flex min-h-screen w-full justify-center px-4 py-16 sm:py-20">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6"><ColorModeToggle /></div>
      <div className="w-full max-w-2xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-black/90">Permissions</h1>
          <p className="mt-1 text-sm text-black/55">
            A clear summary of what your account can view and change.
          </p>
        </header>

        <section className="rounded-xl border border-black/8 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-black/6 pb-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-black/45">Role</div>
              <div className="mt-1 text-lg font-semibold text-black/90">{ROLE_LABEL[session.role] ?? permissionLabel(session.role)}</div>
            </div>
            {eff.isFounder && (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                Account owner
              </span>
            )}
          </div>

          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {eff.permissions.length === 0 ? (
              <li className="col-span-full text-sm italic text-black/55">
                Your account owner permissions include every area of this workspace.
              </li>
            ) : (
              eff.permissions.map(p => (
                <li key={p} className="rounded-md border border-black/8 bg-[#FDFCF8] px-3 py-2 font-mono text-xs text-black/70">
                  {permissionLabel(p)}
                </li>
              ))
            )}
          </ul>
        </section>

        <p className="mt-4 text-xs text-black/45">
          Permissions are based on each person&apos;s role. The business owner
          can update team access.
        </p>
      </div>
    </main>
  );
}
