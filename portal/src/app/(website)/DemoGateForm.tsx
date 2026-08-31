"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * The AquaCRM demo gate.
 *
 * Modelled on `LaunchGateForm` — same honeypot, same submit/status/error shape
 * — but it posts to `/api/public/demo-interest` and its consent line names the
 * demo terms and their VERSION, because that version is what gets recorded.
 *
 * The consent wording states plainly that the terms are a draft and that no
 * demo workspace exists yet. Neither is flattering; both are true, and a
 * consent box that overstated either would not be consent to anything.
 */
export function DemoGateForm({ termsVersion }: { termsVersion: string }) {
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `data-aqua-ignore` is load-bearing, not tidiness.
  //
  // `(website)/layout.tsx` injects `/aqua-tag.js` on every page in this route
  // group, under the milesymedia agency's site key. The tag's
  // `capturableForm()` reads every field VALUE and POSTs it to
  // `/api/public/form-capture` — the LIVE Supabase-backed surface — and that
  // capture is NOT behind a consent gate (pinned, deliberately, by
  // `smoke-privacy-notice-truth`).
  //
  // Left alone, this form would send the visitor's name, email, phone and
  // free-text note down a SECOND path into live tenant data, breaking both the
  // demo's one hard rule (nothing demo in the live realm) and the demo privacy
  // notice's "Nothing else." `data-aqua-ignore` is checked AHEAD of
  // `data-aqua-form`, so the submit still counts as an event while no field
  // value leaves the page. Do not remove it: without it the tag's fallback
  // heuristic captures this form anyway, on the email and tel inputs.
  return (
    <form
      className="grid gap-5 sm:grid-cols-2"
      data-aqua-form="AquaCRM demo request"
      data-aqua-ignore=""
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = new FormData(form);
        setSent(null);
        setError(null);
        setBusy(true);
        try {
          const response = await fetch("/api/public/demo-interest", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: values.get("name"),
              email: values.get("email"),
              phone: values.get("phone"),
              note: values.get("note"),
              consent: values.get("consent") === "yes",
              termsVersion,
              sourcePath: window.location.pathname,
              website: values.get("website"),
            }),
          });
          const payload = await response.json() as { ok?: boolean; error?: string; nextStep?: string };
          if (!response.ok || !payload.ok) {
            throw new Error(payload.error || "We could not record your request.");
          }
          form.reset();
          setSent(payload.nextStep ?? "Your request is on the list.");
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "We could not record your request.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="hidden" aria-hidden="true">
        <label>
          Website
          <input name="website" type="text" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-[#0C1A22]">Name</span>
        <input
          required
          type="text"
          name="name"
          autoComplete="name"
          placeholder="Your name"
          className="h-12 w-full rounded-md border border-[#BFD2DA] bg-white px-4 text-base text-[#0C1A22] outline-none transition placeholder:text-[#7A8D96] focus:border-[#12707F] focus:ring-2 focus:ring-[#12707F]/12"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-[#0C1A22]">Work email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@agency.com"
          className="h-12 w-full rounded-md border border-[#BFD2DA] bg-white px-4 text-base text-[#0C1A22] outline-none transition placeholder:text-[#7A8D96] focus:border-[#12707F] focus:ring-2 focus:ring-[#12707F]/12"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-[#0C1A22]">
          Phone <span className="font-normal text-[#5C6F79]">(if you would rather we called)</span>
        </span>
        <input
          type="tel"
          name="phone"
          autoComplete="tel"
          className="h-12 w-full rounded-md border border-[#BFD2DA] bg-white px-4 text-base text-[#0C1A22] outline-none transition placeholder:text-[#7A8D96] focus:border-[#12707F] focus:ring-2 focus:ring-[#12707F]/12"
        />
      </label>
      <p className="self-end text-sm leading-6 text-[#5C6F79] sm:col-span-1">
        Give us an email address or a phone number — either is enough.
      </p>
      <label className="block sm:col-span-2">
        <span className="mb-2 block text-sm font-semibold text-[#0C1A22]">
          What would you want the demo to show you?{" "}
          <span className="font-normal text-[#5C6F79]">(optional)</span>
        </span>
        <textarea
          name="note"
          rows={4}
          placeholder="The part of running the agency that costs you the most time."
          className="w-full resize-none rounded-md border border-[#BFD2DA] bg-white px-4 py-3 text-base text-[#0C1A22] outline-none transition placeholder:text-[#7A8D96] focus:border-[#12707F] focus:ring-2 focus:ring-[#12707F]/12"
        />
      </label>
      <label className="flex items-start gap-3 text-sm leading-6 text-[#41535C] sm:col-span-2">
        <input
          required
          type="checkbox"
          name="consent"
          value="yes"
          className="mt-1 h-4 w-4 shrink-0 accent-[#12707F]"
        />
        <span>
          I agree that my details can be stored so AquaCRM can contact me about
          the demo, under the{" "}
          <Link href="/terms" className="font-semibold underline">
            demo terms
          </Link>{" "}
          and{" "}
          <Link href="/demo-privacy" className="font-semibold underline">
            privacy notice
          </Link>
          . Both are <strong>draft wording</strong> awaiting legal review, and
          the version you agree to ({termsVersion}) is recorded with your
          request. Ask us to delete your details at any time and we will.
        </span>
      </label>
      <button
        type="submit"
        disabled={busy}
        className="h-12 w-full rounded-md bg-[#0F5F6D] px-5 text-base font-semibold text-white transition hover:bg-[#0B4A55] disabled:cursor-wait disabled:opacity-65 sm:col-span-2"
      >
        {busy ? "Recording..." : "Ask for the demo"}
      </button>
      {sent && (
        <p role="status" className="rounded-md border border-[#8FC1B8] bg-[#EAF4F1] px-4 py-3 text-sm text-[#205F59] sm:col-span-2">
          {sent}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:col-span-2">
          {error}
        </p>
      )}
    </form>
  );
}
