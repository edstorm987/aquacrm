import Link from "next/link";

export const metadata = {
  title: "Not found · Aqua",
};

// Portal-scoped 404 — fires for any /portal/* URL not matched by an
// agency / clients / customer route. No SiteShell here because the
// signed-in user already has portal chrome from the layout.
export default function PortalNotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-black/45">
        404
      </span>
      <h1 className="text-3xl font-semibold tracking-tight text-black/90">
        That portal page isn&apos;t here.
      </h1>
      <p className="max-w-prose text-sm text-black/55">
        It might have been renamed, or the plugin powering it isn&apos;t
        installed for this tenant. Head back to your dashboard.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/portal/agency"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/85"
        >
          Agency dashboard
        </Link>
        <Link
          href="/portal/account"
          className="rounded-md border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black/75 hover:bg-black/5"
        >
          My profile
        </Link>
        <Link
          href="/"
          className="rounded-md border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black/75 hover:bg-black/5"
        >
          Back to website
        </Link>
      </div>
    </main>
  );
}
