import Link from "next/link";

export const metadata = {
  title: "Not found · Milesymedia Portal",
};

const SUGGESTED = [
  { href: "/", label: "Portal home", hint: "Start over" },
  { href: "/login?next=/portal", label: "Sign in", hint: "Open your portal" },
  { href: "/dev/pov", label: "Dev bypass", hint: "Local testing" },
];

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#0EA5A4]">
        Page not found
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-black/90">
        This portal page does not exist.
      </h1>
      <p className="mt-3 text-sm leading-6 text-black/55">
        This is the standalone Milesymedia portal app, so public website pages
        are not mounted here.
      </p>

      <ul className="mt-8 grid gap-3 sm:grid-cols-3">
        {SUGGESTED.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="block rounded-xl border border-black/10 bg-white p-4 text-left shadow-sm transition hover:bg-black/[0.02]"
            >
              <span className="block text-sm font-semibold text-black/85">{s.label}</span>
              <span className="mt-1 block text-xs text-black/50">{s.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
