"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { findSpot } from "./savedSpot";
import { useChromeLayout } from "./pinnedTabsStore";

// Landing on a saved tab that has a spot: go to the spot.
//
// The other half of Ed's *"the spot to get the right location"*. Saving the
// place is only useful if arriving there takes you to it.
//
// ── Why it says when it could not ─────────────────────────────────────────
//
// A page's markup changes, and a saved spot stops resolving. The tempting
// behaviour is to do nothing — the page still loads, after all. But a shortcut
// that silently stops working is worse than one that breaks loudly: the person
// keeps clicking it, keeps landing at the top, and slowly stops trusting all of
// their shortcuts without ever knowing why. So a near miss and a total miss both
// say so, briefly, and the message names the thing it was looking for.
//
// ── Why it watches the DOM instead of polling ────────────────────────────
//
// Most of these surfaces stream, so the target usually does not exist on the
// first frame. The first version retried on a 120ms interval for 2.4 seconds
// and gave up — which was fine on a warm page and wrong on every slow one. The
// browser walk caught it immediately: the Command Centre took far longer than
// that to paint, the loop expired against a loading curtain, and the shortcut
// reported the spot as gone when the page had simply not arrived yet. A "could
// not find it" that really means "I did not wait" is the worst possible
// message, because it teaches somebody their working shortcut is broken.
//
// So it watches for DOM changes and re-checks when the page actually changes,
// bounded by a deadline generous enough for a cold streaming render. Bounded
// still matters: an observer left running on every navigation is a leak.

const DEADLINE_MS = 15_000;
const HALO_MS = 1_600;

export function SavedSpotArrival() {
  const pathname = usePathname();
  const search = useSearchParams();
  const href = search.toString() ? `${pathname}?${search.toString()}` : pathname;
  const { savedTabs, ready } = useChromeLayout();
  const [notice, setNotice] = useState<string | null>(null);
  const [halo, setHalo] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  // One attempt per arrival: without this, a re-render mid-scroll would start a
  // second timer and fight the first one for the scroll position.
  const scheduled = useRef("");
  // The href the person is actually on, read by the retry loop.
  //
  // This is why the retry is NOT cancelled in the effect's cleanup, and it is
  // worth spelling out because the obvious version is wrong and looks right.
  // The effect depends on the saved tabs, which arrive from the store a moment
  // after mount; that re-runs the effect, the cleanup clears the pending
  // timer, and the re-run sees `scheduled.current === href` and returns without
  // scheduling another. The single attempt is cancelled and never replaced, and
  // the shortcut silently lands at the top of the page — which is the exact
  // failure this whole feature exists to avoid. So the loop outlives the effect
  // and stops itself when the person has navigated on.
  const activeHref = useRef(href);

  useEffect(() => { activeHref.current = href; }, [href]);

  useEffect(() => {
    if (!ready) return;
    if (scheduled.current === href) return;
    const tab = savedTabs.find(candidate => candidate.href === href && candidate.spot);
    if (!tab?.spot) return;
    scheduled.current = href;

    // Somebody who has already started reading should not be yanked elsewhere.
    if (window.scrollY > 40) return;

    const spot = tab.spot;
    let observer: MutationObserver | null = null;
    let deadline = 0;

    const stop = () => {
      observer?.disconnect();
      observer = null;
      window.clearTimeout(deadline);
    };

    // A brief halo, so it is obvious WHY the page has scrolled down.
    //
    // Drawn as this component's OWN fixed overlay rather than by setting
    // `style.outline` on the matched element. The first version did the
    // obvious thing and it was wrong in a way only a browser walk finds: this
    // runs from a MutationObserver, so it fires while OTHER subtrees are still
    // streaming in. It wrote a `style` attribute onto a server-rendered node,
    // React then hydrated that node, found an attribute it had never rendered,
    // and logged a hydration mismatch on the Agency dashboard on every single
    // arrival. Restoring the outline afterwards made it worse rather than
    // better: the "previous" value was the empty string, so it left
    // `outline-color/style/width` behind as inline residue on an element
    // belonging to somebody else's component.
    //
    // An overlay cannot collide with hydration, because it is part of this
    // component's tree and touches nothing the app rendered. It has to be
    // re-measured each frame: the scroll above is smooth, so the target is
    // still moving when the halo appears.
    const traceHalo = (element: HTMLElement) => {
      const until = Date.now() + HALO_MS;
      const follow = () => {
        if (activeHref.current !== href || Date.now() > until) { setHalo(null); return; }
        const rect = element.getBoundingClientRect();
        setHalo({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
        window.requestAnimationFrame(follow);
      };
      follow();
    };

    const attempt = () => {
      // Navigated on while we were waiting: stop, and do not scroll a page the
      // person is no longer looking at.
      if (activeHref.current !== href) { stop(); return; }
      const match = findSpot(spot);
      if (match.kind === "missing") return;   // wait for the next DOM change
      stop();
      // The portal scrolls an inner container, not the window, so this has to
      // be `scrollIntoView` on the element rather than a window scroll to a
      // computed offset — the offset would be relative to the wrong thing.
      match.element.scrollIntoView({ block: "center", behavior: "smooth" });
      traceHalo(match.element as HTMLElement);
      if (match.kind === "by-text") {
        setNotice(`This page has changed — found “${spot.text}” by name instead.`);
      }
    };

    // Try now, in case the page is already there, then on every DOM change.
    attempt();
    if (!observer && activeHref.current === href) {
      observer = new MutationObserver(attempt);
      observer.observe(document.body, { childList: true, subtree: true });
      deadline = window.setTimeout(() => {
        stop();
        if (activeHref.current !== href) return;
        setNotice(spot.text
          ? `Could not find “${spot.text}” on this page any more.`
          : "The saved spot is no longer on this page.");
      }, DEADLINE_MS);
    }
  }, [href, ready, savedTabs]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // A marker even when there is nothing to say. It costs one hidden element and
  // it is the only way a browser check can tell "no spot to restore" apart from
  // "this component never mounted" — a distinction that cost real time the first
  // time this was walked.
  const haloNode = halo ? (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[149]"
      style={{
        top: halo.top - 3,
        left: halo.left - 3,
        width: halo.width + 6,
        height: halo.height + 6,
        borderRadius: 6,
        boxShadow: "0 0 0 2px var(--brand, #2f6f8f)",
      }}
    />
  ) : null;

  if (!notice) {
    return (
      <>
        {haloNode}
        <span hidden data-saved-spot-arrival data-tabs={savedTabs.length} />
      </>
    );
  }
  return (
    <>
      {haloNode}
      <div
        role="status"
        className="fixed bottom-4 left-1/2 z-[150] -translate-x-1/2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900 shadow-lg"
      >
        {notice}
      </div>
    </>
  );
}
