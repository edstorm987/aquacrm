"use client";

// Wraps a block's rendered children with an IntersectionObserver
// transition so admin-configured `styles.animate` types ("fade-in",
// "slide-up", etc.) play once when the block scrolls into view. Used
// only by the host-side BlockRenderer — the editor canvas always shows
// the resting state so layout work is precise.
//
// Faithful port of `02/src/components/editor/AnimateOnScroll.tsx`.

import { useEffect, useRef, useState } from "react";

type AnimateKind = "fade-in" | "slide-up" | "slide-left" | "slide-right" | "zoom-in" | "rotate-in" | "blur-in";

const REST: Record<AnimateKind, React.CSSProperties> = {
  "fade-in":     { opacity: 1, transform: "none", filter: "none" },
  "slide-up":    { opacity: 1, transform: "none", filter: "none" },
  "slide-left":  { opacity: 1, transform: "none", filter: "none" },
  "slide-right": { opacity: 1, transform: "none", filter: "none" },
  "zoom-in":     { opacity: 1, transform: "none", filter: "none" },
  "rotate-in":   { opacity: 1, transform: "none", filter: "none" },
  "blur-in":     { opacity: 1, transform: "none", filter: "none" },
};

const HIDDEN: Record<AnimateKind, React.CSSProperties> = {
  "fade-in":     { opacity: 0, transform: "none" },
  "slide-up":    { opacity: 0, transform: "translateY(24px)" },
  "slide-left":  { opacity: 0, transform: "translateX(-24px)" },
  "slide-right": { opacity: 0, transform: "translateX(24px)" },
  "zoom-in":     { opacity: 0, transform: "scale(0.96)" },
  "rotate-in":   { opacity: 0, transform: "rotate(-4deg) scale(0.98)" },
  "blur-in":     { opacity: 0, transform: "none", filter: "blur(8px)" },
};

interface Props {
  animate: AnimateKind;
  duration?: string;
  delay?: string;
  easing?: string;
  children: React.ReactNode;
}

export default function AnimateOnScroll({ animate, duration, delay, easing, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setShown(true);
          obs.disconnect();
          break;
        }
      }
    }, { threshold: 0.15 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const dur = duration ?? "600ms";
  const del = delay ?? "0ms";
  const ease = easing ?? "ease-out";

  return (
    <div
      ref={ref}
      style={{
        ...(shown ? REST[animate] : HIDDEN[animate]),
        transition: `opacity ${dur} ${ease} ${del}, transform ${dur} ${ease} ${del}, filter ${dur} ${ease} ${del}`,
        willChange: "opacity, transform, filter",
      }}
    >
      {children}
    </div>
  );
}
