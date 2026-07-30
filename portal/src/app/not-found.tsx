import Link from "next/link";

export const metadata = {
  title: "Not found · Milesymedia client portal",
};

export default function NotFound() {
  const websiteUrl =
    process.env.NEXT_PUBLIC_MILESYMEDIA_WEBSITE_URL ?? "http://localhost:3030";
  const suggested = [
    { href: websiteUrl, label: "Milesymedia", hint: "Return to the website" },
    { href: "/login?next=/portal", label: "Sign in", hint: "Open your portal" },
    {
      href: "mailto:hello@milesymedia.co",
      label: "Get help",
      hint: "Contact Milesymedia",
    },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16 text-center">
      <p className="text-sm font-semibold uppercase text-[#8A563A]">
        Page not found
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-black/90">
        This portal page does not exist.
      </h1>
      <p className="mt-3 text-sm leading-6 text-black/55">
        The address may be incomplete or the portal page may have moved.
      </p>

      <ul className="mt-8 grid gap-3 sm:grid-cols-3">
        {suggested.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="block rounded-md border border-black/10 bg-white p-4 text-left shadow-sm transition hover:bg-black/[0.02]"
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
