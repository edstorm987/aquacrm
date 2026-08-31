"use client";
// Route-segment error boundary (T1 R030 — chapter `04-observability.md`).
//
// Catches render errors in the root segment's page and everything nested
// below it. It is NOT the root boundary: a React error boundary never wraps
// the layout above it, so a failure inside `src/app/layout.tsx` or the App
// Router shell bypasses this file entirely — `src/app/global-error.tsx`
// (issues #141) is the fallback for that. Renders a fallback UI with a reset
// action. Browser-side Sentry capture (when added) installs via
// @sentry/nextjs's own client config — we don't pull the server observability
// module into the client bundle.
//
// HONESTY (#132): this boundary must not claim a report it did not make.
// A server-side failure carries a `digest`; Next hands that same error to
// `src/instrumentation.ts` → `captureError()`, so it genuinely reaches the
// deployment log (and Sentry when the optional SDK is installed). A
// browser-only render error has no digest and no client sink is installed,
// so the copy says exactly that instead of promising a capture that never
// happened.

import { useEffect } from "react";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * What actually happened to this error, stated plainly. Exported so the
 * observability smoke can pin the honesty contract instead of grepping copy.
 */
export function describeErrorReporting(digest?: string): string {
  return digest
    ? "The server recorded this failure in the deployment logs. Quote the reference below if you need help with it."
    : "This failure happened in your browser and was not sent anywhere automatically. If it keeps happening, tell us what you were doing.";
}

export default function SegmentError({ error, reset }: Props) {
  useEffect(() => {
    // Best-effort browser-side log; Sentry browser SDK (when installed)
    // auto-captures unhandled errors itself.
    if (typeof console !== "undefined") {
      console.error("[app/error.tsx]", error.digest ?? "", error);
    }
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <h1 className="text-2xl font-semibold text-black/80">Something went wrong</h1>
      <p className="text-sm text-black/60">
        {describeErrorReporting(error.digest)} You can try again or head back to the homepage.
      </p>
      {error.digest && (
        <p className="text-xs text-black/40">Reference: {error.digest}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white"
        >
          Try again
        </button>
        <a
          href="/"
          className="rounded-md border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black/70 hover:bg-black/5"
        >
          Back to homepage
        </a>
      </div>
    </main>
  );
}
