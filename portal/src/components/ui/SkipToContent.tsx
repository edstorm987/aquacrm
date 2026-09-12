// SkipToContent — first interactive element in the document, hidden
// off-screen until focused. Lets keyboard users jump past the chrome
// straight to `<main>`. Mounted at the root layout level.

"use client";

import Link from "next/link";
import type { MouseEvent } from "react";

export function SkipToContent({ targetId = "main-content" }: { targetId?: string }) {
  function moveFocus(event: MouseEvent<HTMLAnchorElement>) {
    const target = document.getElementById(targetId);
    if (!target) return;
    event.preventDefault();
    const hash = `#${targetId}`;
    if (window.location.hash === hash) window.history.replaceState(null, "", hash);
    else window.history.pushState(null, "", hash);
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "start" });
  }

  return (
    <Link
      href={`#${targetId}`}
      onClick={moveFocus}
      className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-2 focus-visible:top-2 focus-visible:z-[100] focus-visible:rounded-md focus-visible:bg-brand focus-visible:px-3 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-white"
    >
      Skip to content
    </Link>
  );
}
