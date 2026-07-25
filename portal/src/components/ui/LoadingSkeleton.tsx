// Shared loading-skeleton primitive. Three variants:
//   - "line" — single short bar (heading / value / caption).
//   - "box" — full-width block (image / card placeholder).
//   - "card" — composite (line-line-box) for list rows.
//
// Each variant accepts a `tone` prop — "light" (default) renders against
// white surfaces with `bg-black/5`; "dark" renders against the editor
// canvas / storefront-block surfaces with `bg-white/5`. The animation
// uses Tailwind's `animate-pulse` to match the Felicia-portal vocabulary.

import type { CSSProperties, HTMLAttributes } from "react";

export type SkeletonVariant = "line" | "box" | "card";
export type SkeletonTone = "light" | "dark";

export interface LoadingSkeletonProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  variant?: SkeletonVariant;
  tone?: SkeletonTone;
  // Number of repetitions — for "line" variant we render a stack of bars
  // with descending widths; for "box"/"card" we render `count` siblings.
  count?: number;
  // Optional label announced to screen readers (single live region).
  label?: string;
}

const TONE_CLASS: Record<SkeletonTone, string> = {
  light: "bg-black/5",
  dark: "bg-white/5",
};

const LINE_WIDTHS = ["w-3/4", "w-1/2", "w-2/3", "w-1/3"];

export function LoadingSkeleton(props: LoadingSkeletonProps) {
  const { variant = "card", tone = "light", count = 1, label = "Loading", className, style, ...rest } = props;
  const base = `${TONE_CLASS[tone]} animate-pulse rounded-md`;

  if (variant === "line") {
    return (
      <div role="status" aria-live="polite" aria-busy="true" className={className} style={style} {...rest}>
        <span className="sr-only">{label}</span>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={[base, "h-3 my-1.5", LINE_WIDTHS[i % LINE_WIDTHS.length]].join(" ")}
            aria-hidden
          />
        ))}
      </div>
    );
  }

  if (variant === "box") {
    return (
      <div role="status" aria-live="polite" aria-busy="true" className={className} style={style} {...rest}>
        <span className="sr-only">{label}</span>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className={[base, "h-32 w-full mb-2"].join(" ")} aria-hidden />
        ))}
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className} style={style} {...rest}>
      <span className="sr-only">{label}</span>
      <div className={["grid gap-3", count > 1 ? "md:grid-cols-2 lg:grid-cols-3" : ""].join(" ")}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="rounded-lg border border-black/10 p-4" aria-hidden>
            <div className={[base, "h-4 w-2/3 mb-2"].join(" ")} />
            <div className={[base, "h-3 w-full mb-1"].join(" ")} />
            <div className={[base, "h-3 w-3/4"].join(" ")} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Inline-style version for storefront blocks that render outside Tailwind's
// scope (the editor canvas + the customer iframe + the public storefront).
export function InlineSkeleton({ tone = "dark", style }: { tone?: SkeletonTone; style?: CSSProperties }) {
  const bg = tone === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        background: bg,
        borderRadius: 8,
        animation: "aqua-pulse 1.6s ease-in-out infinite",
        ...style,
      }}
    >
      <span style={{ position: "absolute", left: -9999, width: 1, height: 1 }}>Loading</span>
    </div>
  );
}
