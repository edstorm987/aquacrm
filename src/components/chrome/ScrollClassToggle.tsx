"use client";
// Adds `mm-scrolled` to <body> once the page has scrolled past the
// initial threshold. CSS keys off this class to morph the stickybar
// from above-the-nav-full-width to below-the-nav-narrow with diagonal
// connector wedges.

import { useEffect } from "react";

export function ScrollClassToggle({ threshold = 40 }: { threshold?: number }) {
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const scrolled = window.scrollY > threshold;
      document.body.classList.toggle("mm-scrolled", scrolled);
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      document.body.classList.remove("mm-scrolled");
    };
  }, [threshold]);
  return null;
}
