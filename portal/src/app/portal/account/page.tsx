import { ensureHydrated } from "@/server/storage";
import { requireSession } from "@/lib/server/auth";
import { getUserById } from "@/server/users";
import { redirect } from "next/navigation";
import { AvatarUploader } from "./AvatarUploader";
import { ColorModeToggle } from "@/components/chrome/ColorModeToggle";

function deriveInitials(seed: string): string {
  const t = seed.trim();
  if (!t) return "?";
  const parts = t.split(/[\s@.]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0]! + parts[1][0]!).toUpperCase();
  return parts[0]!.slice(0, 2).toUpperCase();
}

export const metadata = { title: "Edit profile · Milesy Media" };

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

  return (
    <main id="main-content" className="mm-portal-root relative flex min-h-screen w-full justify-center px-4 py-16 sm:py-20">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6"><ColorModeToggle /></div>
      <div className="w-full max-w-xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-black/90">Edit profile</h1>
          <p className="mt-1 text-sm text-black/55">
            {isCustomer
              ? "Manage the personal details used in your Milesymedia home."
              : "Your basic details. Email and role are managed by your agency owner."}
          </p>
        </header>

        <section className="mb-4">
          <h2 className="mb-2 text-sm font-medium text-black/70">Profile picture</h2>
          <AvatarUploader
            initialAvatarUrl={user.avatarUrl}
            displayInitials={deriveInitials(user.name || user.email)}
          />
          <p className="mt-1 text-xs text-black/45">
            PNG, JPEG, or WebP. Auto-resized to 256×256.
          </p>
        </section>

        <form
          method="post"
          action="/api/auth/profile/update"
          className="flex flex-col gap-4 rounded-xl border border-black/8 bg-white p-6 shadow-sm"
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
            {isCustomer ? (
              <a href="/portal/customer" className="text-xs text-black/55 underline underline-offset-2 hover:text-black/80">
                Back to my portal
              </a>
            ) : (
              <a href="/portal/account/permissions" className="text-xs text-black/55 underline underline-offset-2 hover:text-black/80">
                View my permissions →
              </a>
            )}
            <button type="submit" className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/85">
              Save changes
            </button>
          </div>
        </form>

        <details className="mt-6 rounded-xl border border-black/8 bg-white p-4 text-sm">
          <summary className="cursor-pointer text-black/70">Change password</summary>
          <p className="mt-3 text-xs leading-5 text-black/55">
            Use the secure password reset flow and we will send the next step to your email.
          </p>
          <a href="/login/forgot" className="mt-3 inline-flex text-xs font-medium text-black underline underline-offset-2">
            Reset my password
          </a>
        </details>
      </div>
    </main>
  );
}
