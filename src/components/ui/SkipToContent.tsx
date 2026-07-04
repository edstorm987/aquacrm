// SkipToContent — first interactive element in the document, hidden
// off-screen until focused. Lets keyboard users jump past the chrome
// straight to `<main>`. Mounted at the root layout level.

import Link from "next/link";

export function SkipToContent({ targetId = "main-content" }: { targetId?: string }) {
  return (
    <Link
      href={`#${targetId}`}
      className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-2 focus-visible:top-2 focus-visible:z-[100] focus-visible:rounded-md focus-visible:bg-[var(--brand-primary)] focus-visible:px-3 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-white"
    >
      Skip to content
    </Link>
  );
}
