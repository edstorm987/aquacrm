"use client";
// Top-level error boundary (T1 R030 — chapter `04-observability.md`).
//
// Catches render errors anywhere in the App Router tree. Renders a
// fallback UI with a reset action. Browser-side Sentry capture (when
// added) installs via @sentry/nextjs's own client config — we don't
// pull the server observability module into the client bundle.

import { useEffect } from "react";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
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
        We&apos;ve logged the issue. You can try again or head back to the homepage.
      </p>
      {error.digest && (
        <p className="text-xs text-black/40">Reference: {error.digest}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-[var(--brand-primary,#06B6D4)] px-4 py-2 text-sm font-medium text-white"
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
