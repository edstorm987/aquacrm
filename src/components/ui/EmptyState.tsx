// EmptyState — friendly placeholder for "no rows yet" lists. Replaces
// the bare empty `<ul>` / "0 items" pattern across the 25+ list pages
// flagged in the audit. Accepts a heading, body, optional icon glyph,
// and a single primary CTA (link or button).
//
// Visual: dashed border + subtle bg, centred. Brand-neutral so it
// inherits the tenant's brand tokens via globals.css.

import Link from "next/link";
import type { ReactNode } from "react";

export interface EmptyStateProps {
  heading: string;
  body?: ReactNode;
  // A short icon glyph or emoji rendered above the heading. Decorative
  // only — `aria-hidden`.
  icon?: ReactNode;
  // Primary CTA. `href` → renders Next `<Link>`; `onClick` → renders
  // a `<button>`. Both omitted → no CTA shown.
  cta?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  // Optional secondary CTA (e.g., "Read the docs").
  secondaryCta?: {
    label: string;
    href: string;
  };
  className?: string;
}

export function EmptyState({ heading, body, icon, cta, secondaryCta, className }: EmptyStateProps) {
  return (
    <div
      className={[
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-black/15 bg-white/40 px-6 py-10 text-center",
        className ?? "",
      ].join(" ")}
    >
      {icon && (
        <div className="text-3xl text-black/40" aria-hidden>
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-black/80">{heading}</h3>
      {body && <p className="max-w-md text-sm text-black/60">{body}</p>}
      {(cta || secondaryCta) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {cta?.href ? (
            <Link
              href={cta.href}
              className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              {cta.label}
            </Link>
          ) : cta?.onClick ? (
            <button
              type="button"
              onClick={cta.onClick}
              className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              {cta.label}
            </button>
          ) : null}
          {secondaryCta && (
            <Link
              href={secondaryCta.href}
              className="rounded-md border border-black/15 bg-white px-4 py-2 text-sm font-medium text-black/80 hover:bg-black/5"
            >
              {secondaryCta.label}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
