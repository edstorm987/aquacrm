import { ensureHydrated } from "@/server/storage";
import { requireSession } from "@/lib/server/auth";
import { effectiveRole } from "@/lib/server/effectiveRole";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ColorModeToggle } from "@/components/chrome/ColorModeToggle";
import { ArrowLeft, Check, ShieldCheck } from "lucide-react";

export const metadata = { title: "Permissions · AquaCRM" };

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
    <main id="main-content" data-portal-area="account" className="mm-portal-root mm-route-canvas relative flex min-h-screen w-full justify-center px-4 py-16 sm:px-6 sm:py-20">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6"><ColorModeToggle /></div>
      <div className="w-full max-w-2xl">
        <Link href="/portal/account" className="mb-7 inline-flex min-h-9 items-center gap-2 text-xs font-medium text-black/50 transition hover:text-black/80">
          <ArrowLeft size={14} aria-hidden="true" /> Back to profile
        </Link>
        <header className="mb-7 flex items-start gap-4">
          <span className="mm-area-icon grid size-11 shrink-0 place-items-center rounded-lg" aria-hidden="true"><ShieldCheck size={19} /></span>
          <div>
          <p className="text-[10px] font-semibold uppercase text-black/40">Account access</p>
          <h1 className="mt-1 text-2xl font-semibold text-black/90">Permissions</h1>
          <p className="mt-2 text-sm leading-6 text-black/55">
            A clear summary of what your account can view and change.
          </p>
          </div>
        </header>

        <section className="mm-surface-card rounded-lg border p-5 sm:p-6">
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
                <li key={p} className="flex min-h-10 items-center gap-2 rounded-md border border-black/8 bg-[#FDFCF8] px-3 py-2 text-xs font-medium text-black/70">
                  <Check size={13} className="shrink-0 text-emerald-700" aria-hidden="true" /> {permissionLabel(p)}
                </li>
              ))
            )}
          </ul>
        </section>

        <p className="mt-4 text-xs text-black/45">
          Permissions are based on each person&apos;s role. The business owner
          can update access in <Link href="/portal/agency/settings#team" className="font-medium text-black/65 underline decoration-black/25 underline-offset-2 hover:text-black">Team settings</Link>.
        </p>
      </div>
    </main>
  );
}
