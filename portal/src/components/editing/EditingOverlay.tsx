"use client";

import { useState } from "react";
import { Check, Lock, LoaderCircle, Send } from "lucide-react";

import { leaseNotice, type LeaseStatus } from "@/engines/editor/editing/leases";

/**
 * What a client sees while Aqua is working on their portal.
 *
 * A blocking overlay rather than the agency's banner, because the two
 * situations differ. An agency user seeing a colleague's lease can judge
 * whether to carry on; a client cannot know that what they are about to type
 * is going to be overwritten by work already in progress. Letting them edit
 * anyway means their change vanishes and they have no idea why.
 *
 * So it is blocked — and the block comes with somewhere to put the thing they
 * came to do. An overlay that only says "no" makes a client wait, forget, or
 * ring up. This captures the request as a real client request, which is the
 * same pipeline the portal's own request form uses, so it surfaces in Actions
 * like any other.
 */
export function EditingOverlay({
  status,
  clientId,
  onDismiss,
}: {
  status: LeaseStatus;
  clientId: string;
  /** Offered once a request is sent, so they are not trapped on the page. */
  onDismiss?: () => void;
}) {
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  if (status.state !== "held" || status.access !== "blocked") return null;

  async function send() {
    setState("sending");
    try {
      const response = await fetch("/api/tenants/client-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, type: "design-feedback", message }),
      });
      const result = await response.json() as { ok?: boolean };
      setState(result.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="editing-overlay-title"
      data-testid="editing-overlay"
      className="fixed inset-0 z-[95] grid place-items-center bg-black/45 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-2xl">
        <span className="grid size-10 place-items-center rounded-md bg-amber-50 text-amber-700">
          <Lock size={18} aria-hidden />
        </span>
        <h2 id="editing-overlay-title" className="mt-3 text-lg font-semibold text-black/85">
          We&rsquo;re updating your portal
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-black/60">{leaseNotice(status)}</p>

        {state === "sent" ? (
          <div className="mt-4 grid gap-3">
            <p className="flex items-start gap-2 rounded-md bg-emerald-50 px-3 py-2.5 text-sm leading-6 text-emerald-900">
              <Check size={15} aria-hidden className="mt-0.5 shrink-0" />
              Thank you — we&rsquo;ll incorporate your changes once we&rsquo;ve finished, and reply when it&rsquo;s done.
            </p>
            {onDismiss ? (
              <button
                type="button"
                onClick={onDismiss}
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-black/15 px-4 text-sm font-semibold text-black/70"
              >
                Close
              </button>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 grid gap-2.5">
            <label htmlFor="editing-overlay-message" className="text-xs font-semibold text-black/55">
              What would you like changed? We&rsquo;ll fold it into this round.
            </label>
            <textarea
              id="editing-overlay-message"
              value={message}
              onChange={event => setMessage(event.target.value)}
              rows={4}
              placeholder="Could the opening hours on the contact page say Saturday 9–1?"
              className="w-full resize-y rounded-md border border-black/12 px-3 py-2 text-sm outline-none focus:border-brand"
            />
            {state === "error" ? (
              <p role="alert" className="text-xs text-red-700">
                That didn&rsquo;t send. Please try again, or email us and we&rsquo;ll pick it up.
              </p>
            ) : null}
            <button
              type="button"
              disabled={!message.trim() || state === "sending"}
              onClick={() => void send()}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-40"
            >
              {state === "sending"
                ? <><LoaderCircle size={15} className="animate-spin" aria-hidden />Sending…</>
                : <><Send size={15} aria-hidden />Send it to us</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
