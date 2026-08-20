import Link from "next/link";
import { ArrowLeft, KeyRound, UserRound } from "lucide-react";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { AvatarUploader } from "@/app/portal/account/AvatarUploader";
import { requireRole } from "@/lib/server/auth";
import { ensureHydrated } from "@/server/storage";
import { getUserById } from "@/server/users";
import { listOwnPortalConnections } from "@/server/portalConnectionStore";
import { getAuthBrand } from "@/lib/authBrand";
import { ConnectedApps } from "./_ConnectedApps";

function initials(seed: string): string {
  const parts = seed.trim().split(/[\s@.]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return parts[0]?.slice(0, 2).toUpperCase() || "?";
}

export default async function CustomerAccountPage() {
  await ensureHydrated();
  const session = await requireRole("end-customer");
  const user = getUserById(session.userId);
  if (!user) notFound();
  const cookieStore = await cookies();
  const authBrand = getAuthBrand(cookieStore.get("aqua_public_brand")?.value);
  const connectedApps = session.clientId
    ? listOwnPortalConnections({ clientId: session.clientId, userId: session.userId })
        .map(connection => ({ id: connection.id, label: connection.label, connectedAt: connection.connectedAt }))
    : [];

  return (
    <>
      <header className="mb-8 flex flex-col justify-between gap-5 border-b border-black/10 pb-7 md:flex-row md:items-end">
        <div className="max-w-3xl">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--portal-accent)]">Your account</p>
          <h1 className="mt-3 font-serif text-4xl leading-[1.05] text-[#1b1a18] sm:text-5xl">Personal, private, yours.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-black/52">
            Keep the name and photograph used throughout your {authBrand.name} home up to date.
          </p>
        </div>
        <Link href="/portal/customer" className="inline-flex min-h-10 items-center gap-2 self-start rounded-md border border-black/12 bg-white px-4 text-sm font-medium text-black/65">
          <ArrowLeft size={14} aria-hidden="true" />
          Back to home
        </Link>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-md border border-black/10 bg-[#fbfaf8] p-6 sm:p-8">
          <div className="flex items-center gap-3 border-b border-black/10 pb-5">
            <UserRound size={18} className="text-[var(--portal-accent)]" aria-hidden="true" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-black/40">Profile</p>
              <h2 className="mt-1 font-serif text-2xl">How you appear here</h2>
            </div>
          </div>

          <div className="mt-6">
            <p className="mb-2 text-xs font-medium text-black/55">Profile picture</p>
            <AvatarUploader
              initialAvatarUrl={user.avatarUrl}
              displayInitials={initials(user.name || user.email)}
            />
            <p className="mt-2 text-xs leading-5 text-black/38">PNG, JPEG, or WebP. Your image is resized automatically.</p>
          </div>

          <form method="post" action="/api/auth/profile/update" className="mt-7 grid gap-5 border-t border-black/10 pt-6">
            <label className="grid gap-2 text-xs font-medium text-black/55">
              Name
              <input
                name="name"
                type="text"
                defaultValue={user.name ?? ""}
                autoComplete="name"
                className="min-h-11 rounded-md border border-black/12 bg-white px-3 text-sm outline-none focus:border-[var(--portal-accent)] focus:ring-2 focus:ring-black/10"
              />
            </label>
            <label className="grid gap-2 text-xs font-medium text-black/55">
              Sign-in email
              <input
                type="email"
                defaultValue={user.email}
                disabled
                className="min-h-11 cursor-not-allowed rounded-md border border-black/8 bg-black/[0.025] px-3 text-sm text-black/45"
              />
            </label>
            <div className="flex justify-end border-t border-black/10 pt-5">
              <button type="submit" className="min-h-11 rounded-md bg-[#1b1a18] px-5 text-sm font-medium text-white">
                Save profile
              </button>
            </div>
          </form>
        </section>

        <aside className="h-fit rounded-md bg-[#1b1a18] p-6 text-white">
          <KeyRound size={18} className="text-[var(--portal-accent)]" aria-hidden="true" />
          <p className="mt-8 text-[10px] uppercase tracking-[0.16em] text-white/40">Secure access</p>
          <h2 className="mt-2 font-serif text-2xl">Need a new password?</h2>
          <p className="mt-3 text-sm leading-6 text-white/52">
            We will send the secure next step to your sign-in email.
          </p>
          <Link href={`/login/forgot?brand=${authBrand.id}`} className="mt-7 inline-flex min-h-10 items-center rounded-md border border-white/15 px-4 text-sm font-medium text-white/85">
            Reset password
          </Link>
        </aside>
      </div>

      <ConnectedApps initial={connectedApps} accentName={authBrand.name} />
    </>
  );
}
