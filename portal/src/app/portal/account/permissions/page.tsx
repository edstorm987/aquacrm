import { ensureHydrated } from "@/server/storage";
import { requireSession } from "@/lib/server/auth";
import { effectiveRole } from "@/lib/server/effectiveRole";
import { redirect } from "next/navigation";

export const metadata = { title: "Permissions · Milesy Media" };

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
    <main id="main-content" className="flex min-h-[calc(100vh-9rem)] w-full justify-center py-4 sm:py-8">
      <div className="w-full max-w-2xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-black/90">Permissions</h1>
          <p className="mt-1 text-sm text-black/55">
            What you&apos;re allowed to do in the portal, derived from your
            role. Read-only — your agency owner manages role assignments.
          </p>
        </header>

        <section className="rounded-xl border border-black/8 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-black/6 pb-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-black/45">Role</div>
              <div className="mt-1 text-lg font-semibold text-black/90">{session.role}</div>
            </div>
            {eff.isFounder && (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                ⚡ Founder
              </span>
            )}
          </div>

          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {eff.permissions.length === 0 ? (
              <li className="col-span-full text-sm italic text-black/55">
                No grid permissions. Founders bypass the grid entirely; leads have read-only on their own user.
              </li>
            ) : (
              eff.permissions.map(p => (
                <li key={p} className="rounded-md border border-black/8 bg-[#FDFCF8] px-3 py-2 font-mono text-xs text-black/70">
                  {p}
                </li>
              ))
            )}
          </ul>
        </section>

        <p className="mt-4 text-xs text-black/45">
          Permissions are granted by role, not per-user. Need a different
          role? Ask your agency owner.
        </p>
      </div>
    </main>
  );
}
