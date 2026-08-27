import { ensureHydrated } from "@/server/storage";
import { requireSession } from "@/lib/server/auth/auth";
import { getUserById } from "@/server/users";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AvatarUploader } from "./AvatarUploader";
import { TwoFactorPanel } from "./TwoFactorPanel";
import { ColorModeToggle } from "@/components/chrome/ColorModeToggle";
import { ArrowLeft, ArrowRight, KeyRound, ShieldCheck, UserRound } from "lucide-react";

function deriveInitials(seed: string): string {
  const t = seed.trim();
  if (!t) return "?";
  const parts = t.split(/[\s@.]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0]! + parts[1][0]!).toUpperCase();
  return parts[0]!.slice(0, 2).toUpperCase();
}

export const metadata = { title: "Edit profile · AquaCRM" };

export default async function AccountPage() {
  await ensureHydrated();
  let session;
  try {
    session = await requireSession();
  } catch {
    redirect("/login?next=/portal/account");
  }
  const user = getUserById(session.userId);
  if (!user) redirect("/login");
  const isCustomer = session.role === "end-customer";
  const isAgencyStaff = session.role === "agency-staff";
  const workspaceHref = isCustomer ? "/portal/customer" : isAgencyStaff ? "/portal/team" : "/portal/agency";

  return (
    <main id="main-content" data-portal-area="account" className="mm-portal-root mm-route-canvas relative flex min-h-screen w-full justify-center px-4 py-16 sm:px-6 sm:py-20">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6"><ColorModeToggle /></div>
      <div className="w-full max-w-3xl">
        <Link href={workspaceHref} className="mb-7 inline-flex min-h-9 items-center gap-2 text-xs font-medium text-black/50 transition hover:text-black/80">
          <ArrowLeft size={14} aria-hidden="true" />
          {isCustomer ? "Back to my portal" : "Back to workspace"}
        </Link>
        <header className="mb-7 flex items-start gap-4">
          <span className="mm-area-icon grid size-11 shrink-0 place-items-center rounded-lg" aria-hidden="true"><UserRound size={19} /></span>
          <div>
          <p className="text-[10px] font-semibold uppercase text-black/40">Account</p>
          <h1 className="mt-1 text-2xl font-semibold text-black/90">Edit profile</h1>
          <p className="mt-2 text-sm leading-6 text-black/55">
            {isCustomer
              ? "Manage the personal details used in your client portal."
              : isAgencyStaff
                ? "Your basic details. An owner or manager manages your email and role."
                : <>Your basic details. Email and role are managed from <Link href="/portal/agency/settings#team" className="font-medium underline decoration-black/25 underline-offset-2 hover:text-black">Team settings</Link>.</>}
          </p>
          </div>
        </header>

        <section className="mm-surface-card mb-5 rounded-lg border p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-2">
            <UserRound size={16} className="text-black/40" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-black/75">Profile picture</h2>
          </div>
          <AvatarUploader
            initialAvatarUrl={user.avatarUrl}
            displayInitials={deriveInitials(user.name || user.email)}
          />
          <p className="mt-4 border-t border-black/10 pt-3 text-xs text-black/45">
            Saved as a 256 x 256 circular crop and used throughout AquaCRM.
          </p>
        </section>

        <form
          method="post"
          action="/api/auth/profile/update"
          className="mm-surface-card flex flex-col gap-4 rounded-lg border p-5 sm:p-6"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-black/70">Name</span>
            <input
              name="name"
              type="text"
              defaultValue={user.name ?? ""}
              autoComplete="name"
              className="rounded-md border border-black/15 bg-[#FDFCF8] px-3 py-2 outline-none focus:border-[#C9A76A] focus:bg-white"
            />
          </label>
          <div className={`grid gap-4 ${isCustomer ? "" : "sm:grid-cols-2"}`}>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-black/70">Email</span>
              <input
                type="email"
                defaultValue={user.email}
                disabled
                className="cursor-not-allowed rounded-md border border-black/10 bg-black/[0.03] px-3 py-2 text-black/55"
              />
            </label>
            {!isCustomer && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-black/70">Role</span>
                <input
                  type="text"
                  defaultValue={user.role}
                  disabled
                  className="cursor-not-allowed rounded-md border border-black/10 bg-black/[0.03] px-3 py-2 text-black/55"
                />
              </label>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 pt-2">
            <Link href={isCustomer ? "/portal/customer/details" : "/portal/account/permissions"} className="inline-flex items-center gap-1.5 text-xs font-medium text-black/55 hover:text-black/80">
              {isCustomer ? "View account details" : "View my permissions"} <ArrowRight size={13} aria-hidden="true" />
            </Link>
            <button type="submit" className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/85">
              Save changes
            </button>
          </div>
        </form>

        <TwoFactorPanel />

        <details className="mm-surface-card group mt-5 rounded-lg border p-4 text-sm sm:p-5">
          <summary className="flex cursor-pointer list-none items-center gap-3 text-black/75">
            <span className="mm-area-icon grid size-9 place-items-center rounded-md" aria-hidden="true"><KeyRound size={16} /></span>
            <span className="font-semibold">Change password</span>
            <ShieldCheck size={15} className="ml-auto text-black/30" aria-hidden="true" />
          </summary>
          <div className="ml-12 border-t border-black/8 pt-4">
            <p className="text-xs leading-5 text-black/55">
              Use the secure password reset flow and we will send the next step to your email.
            </p>
            <a href="/login/forgot" className="mt-3 inline-flex text-xs font-medium text-black underline underline-offset-2">
              Reset my password
            </a>
          </div>
        </details>
      </div>
    </main>
  );
}
