"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Star, X } from "lucide-react";

import { isPinned, usePinnedTabs } from "./pinnedTabs";

// The full current location (path + query) — a pin must remember ?tab=…/?view=…
// so it returns you to the exact working view, not just the base route.
function useCurrentHref(): string {
  const pathname = usePathname();
  const search = useSearchParams();
  const qs = search.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

// Prettify the last path segment as a fallback page name.
function prettyPathLabel(href: string): string {
  try {
    const path = href.split("?")[0].replace(/\/+$/, "");
    const seg = path.split("/").filter(Boolean).pop() || "Page";
    const words = seg.replace(/[-_]+/g, " ").trim();
    return words.replace(/\b\w/g, c => c.toUpperCase()) || "Page";
  } catch {
    return "Page";
  }
}

// The label the user recognises the page by — the page's own heading, not the
// tenant name the topbar shows. Read live at pin time; fall back to a prettified
// route segment, then the provided fallback.
function derivePageLabel(href: string, fallback: string): string {
  if (typeof document !== "undefined") {
    const heading = document.querySelector("main h1, h1")?.textContent?.trim();
    if (heading) return heading.length > 42 ? `${heading.slice(0, 41)}…` : heading;
  }
  const pretty = prettyPathLabel(href);
  return pretty !== "Page" ? pretty : fallback;
}

/** The ★ toggle that lives in the topbar — pins/unpins the current page. */
export function PinCurrentControl({ userKey, label }: { userKey: string; label: string }) {
  const href = useCurrentHref();
  const { pins, toggle } = usePinnedTabs(userKey);
  const pinned = isPinned(pins, href);
  return (
    <button
      type="button"
      onClick={() => toggle({ href, label: derivePageLabel(href, label) })}
      aria-pressed={pinned}
      aria-label={pinned ? "Unpin this page" : "Pin this page for quick access"}
      title={pinned ? "Unpin this page" : "Pin this page"}
      data-mm-pin-toggle
      className="mm-pinned-toggle inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-black/10 bg-white/60 text-black/45 transition hover:bg-white hover:text-black"
    >
      <Star size={16} className={pinned ? "fill-amber-400 text-amber-500" : ""} aria-hidden />
    </button>
  );
}

/** The strip of pinned pages, rendered as a thin bar under the topbar header. */
export function PinnedTabsBar({ userKey }: { userKey: string }) {
  const currentHref = useCurrentHref();
  const { pins, remove } = usePinnedTabs(userKey);
  if (!pins.length) return null;
  return (
    <nav
      aria-label="Pinned pages"
      className="mm-pinned-bar flex items-center gap-1.5 overflow-x-auto border-b border-black/10 bg-white/25 px-3 py-1.5 backdrop-blur-xl sm:px-4 md:px-6"
    >
      <span className="mm-pinned-bar-label hidden shrink-0 items-center gap-1 pr-1 text-[10px] font-semibold uppercase tracking-wide text-black/35 sm:inline-flex">
        <Star size={11} className="fill-amber-400 text-amber-500" aria-hidden /> Pinned
      </span>
      {pins.map(pin => {
        const active = pin.href === currentHref;
        return (
          <span
            key={pin.href}
            className={[
              "mm-pinned-chip group inline-flex shrink-0 items-center gap-1 rounded-md border py-1 pl-2.5 pr-1 text-xs transition",
              active
                ? "border-brand/40 bg-brand/10 text-brand"
                : "border-black/10 bg-white/60 text-black/70 hover:border-black/20 hover:bg-white hover:text-black",
            ].join(" ")}
          >
            <Link href={pin.href} className="max-w-[12rem] truncate font-medium" title={pin.label}>
              {pin.label}
            </Link>
            <button
              type="button"
              onClick={() => remove(pin.href)}
              aria-label={`Unpin ${pin.label}`}
              title="Unpin"
              className="mm-pinned-chip-close grid size-4 shrink-0 place-items-center rounded text-black/30 transition hover:bg-black/10 hover:text-black/70"
            >
              <X size={11} aria-hidden />
            </button>
          </span>
        );
      })}
    </nav>
  );
}
