import Link from "next/link";
import { getCurrentUser } from "@/lib/server/auth";
import { resolvePostLoginPath } from "@/lib/server/postLoginRedirect";

export const metadata = {
  title: "Milesymedia Portal",
  description: "Standalone Milesymedia portal entrypoint.",
};

export default async function PortalLanding() {
  const user = await getCurrentUser();
  const portalHref = user ? resolvePostLoginPath(null, user) : "/login?next=/portal";

  return (
    <main className="min-h-screen bg-[#F7F4EE] px-6 py-10 text-[#17130C]">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-3xl flex-col justify-center">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#0EA5A4]">
          Milesymedia Portal
        </p>
        <h1 className="mt-4 max-w-2xl text-5xl font-semibold leading-[0.95] tracking-tight sm:text-7xl">
          Agency workspace.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-black/60">
          A separate local portal for running clients, fulfilment, forms,
          finance, and the agency backend without the public website attached.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={portalHref}
            className="rounded-md bg-black px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-black/85"
          >
            {user ? "Open portal" : "Sign in"}
          </Link>
        </div>
      </section>
    </main>
  );
}
