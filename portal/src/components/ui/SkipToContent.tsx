// SkipToContent — first interactive element in the document, hidden
// off-screen until focused. Lets keyboard users jump past the chrome
// straight to `<main>`. Mounted at the root layout level.

"use client";

export function SkipToContent({ targetId = "main-content" }: { targetId?: string }) {
  function moveFocus() {
    let target = document.getElementById(targetId);
    if (!target) {
      // Standalone roots (connections, proposals, embeds, previews and error
      // documents) predate the shared landmark id. Normalise the first visible
      // real <main> at activation time so the href keeps native fragment,
      // history and scrolling semantics instead of becoming a dead skip link.
      const mains = Array.from(document.querySelectorAll<HTMLElement>("main"));
      target = mains.find(main => (
        !main.hidden
        && main.getAttribute("aria-hidden") !== "true"
        && main.getClientRects().length > 0
      )) ?? mains[0] ?? null;
      if (target) target.id = targetId;
    }
    if (!target) return;

    // Most application shells use a plain <main>, which is not focusable by
    // default. Add the programmatic-only tabindex at the point of use so every
    // existing #main-content target works without requiring each route to
    // duplicate accessibility plumbing.
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }

  return (
    <a
      href={`#${targetId}`}
      onClick={moveFocus}
      className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-2 focus-visible:top-2 focus-visible:z-[100] focus-visible:rounded-md focus-visible:bg-brand focus-visible:px-3 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-white"
    >
      Skip to content
    </a>
  );
}
