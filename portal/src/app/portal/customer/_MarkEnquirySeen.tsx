"use client";

import { useEffect, useRef } from "react";

// Clearing the unread mark on one enquiry, from the client.
//
// ── Why this exists at all ───────────────────────────────────────────────
//
// The obvious implementation marks it seen inside the server render, and that
// is exactly the pattern issue #21 spent real effort removing from this
// codebase. The read-path analyser caught it on the first test run and flagged
// TWO renders — including `customer/page.tsx`, which cannot reach the write but
// calls the same function, because a name-level call graph cannot see that the
// branch is unreachable there. Declaring a false positive as a deliberate
// writing render would have made the inventory less trustworthy, not more.
//
// So the render stays pure and the write happens where a write belongs: in
// response to something, once, after the page is on screen.
//
// ── Why it renders nothing ───────────────────────────────────────────────
//
// There is nothing to show. The enquiry is already in front of the person; the
// badge clearing is bookkeeping. It deliberately reports no failure either — if
// the POST does not land, the enquiry simply stays marked unread, which is the
// safe direction to fail in. An error toast about a badge would be noise about
// something nobody asked for.

export function MarkEnquirySeen({ noticeId }: { noticeId: string }) {
  // Effects run twice in development's strict mode, and this one POSTs. The
  // endpoint is idempotent, but firing it twice per view is still wasteful and
  // makes the server log lie about how often people open things.
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const controller = new AbortController();
    void fetch("/api/portal/customer/enquiries/seen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ noticeId }),
      signal: controller.signal,
    }).catch(() => undefined);
    return () => controller.abort();
  }, [noticeId]);

  return null;
}
