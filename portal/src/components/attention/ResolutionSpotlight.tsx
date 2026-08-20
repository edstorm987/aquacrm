"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

import {
  RESOLUTION_FOCUS_PARAM,
  RESOLUTION_RECORD_PARAM,
  isResolutionFocus,
} from "@/lib/inbox/resolutionContext";

/**
 * Points at the control that needs acting on.
 *
 * Mounted once in the layout and driven entirely by a data attribute, so
 * making any screen resolvable is a one-line change:
 *
 *     <section data-resolution-focus="payment">
 *
 * The alternative — bespoke focus logic in each of the twenty-odd destination
 * pages — means threading props through large components and guarantees drift
 * as pages get refactored. An attribute survives a rewrite; a prop chain does
 * not.
 *
 * Applied via the DOM rather than React state for the same reason: the target
 * lives inside a server component the layout cannot pass props into.
 */
export function ResolutionSpotlight() {
  const params = useSearchParams();
  const rawFocus = params.get(RESOLUTION_FOCUS_PARAM);
  const focus = isResolutionFocus(rawFocus) ? rawFocus : undefined;
  const record = params.get(RESOLUTION_RECORD_PARAM);

  useEffect(() => {
    if (!focus && !record) return;

    let cancelled = false;
    let applied: HTMLElement | null = null;

    // The target may render after this effect — server content streaming in,
    // or a section that only appears once data resolves. Retry briefly rather
    // than giving up on the first miss.
    const attempt = (remaining: number) => {
      if (cancelled) return;
      // The exact record wins over the section that contains it: being shown
      // the row beats being shown the list it is somewhere inside.
      const target = (record
        ? document.querySelector<HTMLElement>(`[data-resolution-record="${CSS.escape(record)}"]`)
        : null)
        ?? (focus
          ? document.querySelector<HTMLElement>(`[data-resolution-focus="${focus}"]`)
          : null);

      if (!target) {
        // No annotated target on this page is a legitimate outcome, not a
        // failure: the banner still explains the task. Stop quietly.
        if (remaining > 0) setTimeout(() => attempt(remaining - 1), 250);
        return;
      }

      applied = target;
      target.classList.add("aqua-resolution-target");
      // A named record scrolls to the top of the viewport rather than the
      // centre, so the rows beneath it stay visible as supporting context.
      target.scrollIntoView({ block: record ? "start" : "center", behavior: "smooth" });
    };

    attempt(8);

    return () => {
      cancelled = true;
      applied?.classList.remove("aqua-resolution-target");
    };
  }, [focus, record]);

  return null;
}
