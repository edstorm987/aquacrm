import { ensureHydrated } from "@/server/storage";
import { requireSession } from "@/lib/server/auth";
import { redirect } from "next/navigation";

export const metadata = { title: "Preferences · Milesy Media" };

export default async function PreferencesPage() {
  await ensureHydrated();
  try {
    await requireSession();
  } catch {
    redirect("/login?next=/portal/account/preferences");
  }

  return (
    <div className="flex min-h-[calc(100vh-9rem)] w-full justify-center py-4 sm:py-8">
      <div className="w-full max-w-xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-black/90">Preferences</h1>
          <p className="mt-1 text-sm text-black/55">
            How the portal looks and behaves for you. These are personal —
            they don&apos;t affect anyone else on the agency.
          </p>
        </header>

        <form className="flex flex-col gap-4 rounded-xl border border-black/8 bg-white p-6 shadow-sm">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-black/70">Display name</span>
            <input type="text" placeholder="Same as profile name" disabled className="cursor-not-allowed rounded-md border border-black/10 bg-black/[0.03] px-3 py-2 text-black/55" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-black/70">Time zone</span>
            <select disabled className="cursor-not-allowed rounded-md border border-black/10 bg-black/[0.03] px-3 py-2 text-black/55">
              <option>(auto-detected from browser)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-black/70">Email notifications</span>
            <select disabled className="cursor-not-allowed rounded-md border border-black/10 bg-black/[0.03] px-3 py-2 text-black/55">
              <option>Daily digest (default)</option>
              <option>Real-time</option>
              <option>Off</option>
            </select>
          </label>
          <p className="text-xs text-black/45">Saving preferences arrives in a follow-up — for now this is a preview.</p>
        </form>
      </div>
    </div>
  );
}
