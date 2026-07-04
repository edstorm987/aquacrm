"use client";
// Wires the scroll-reveal IntersectionObserver. The mount fade-up was
// removed in the ULTRA FAST pass — content paints fully visible from
// the first byte — so we no longer add `mm-page-ready`. We also clear
// any stuck `mm-page-leaving` class on every navigation so users never
// land on a "blank/no-CSS" page after a client-side route change.

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function PageReveal() {
  const pathname = usePathname();

  // Clear the leaving class on every route change. This runs synchronously
  // during the render of the new route so the new page is never invisible.
  useEffect(() => {
    document.documentElement.classList.remove("mm-page-leaving");
  }, [pathname]);

  useEffect(() => {
    document.documentElement.classList.remove("mm-page-leaving");

    const targets = document.querySelectorAll<HTMLElement>("[data-mm-reveal]");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      targets.forEach((el) => el.classList.add("mm-revealed"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("mm-revealed");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    targets.forEach((el) => io.observe(el));

    return () => {
      io.disconnect();
      document.documentElement.classList.remove("mm-page-leaving");
    };
  }, [pathname]);

  return null;
}
