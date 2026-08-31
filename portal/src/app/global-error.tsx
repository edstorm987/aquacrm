"use client";
// Root-level error boundary (T1 R030 — chapter `04-observability.md`, issues #141).
//
// `src/app/error.tsx` is a ROUTE-SEGMENT boundary: React error boundaries do
// not wrap the layout above them, so a failure inside `src/app/layout.tsx`
// (or in the App Router shell itself) blows straight past it. Until this file
// existed Next fell back to its own builtin document
// (`next/dist/client/components/builtin/global-error.js`) — a generic
// unbranded page with no reference to quote and no way back into the portal.
//
// This file REPLACES the root layout when it is active, so per the Next 16
// convention it must render its own <html>/<body>, and it cannot rely on
// `globals.css`, Tailwind classes, fonts or providers — any of those may be
// exactly what failed. Everything here is inline-styled and self-contained.
//
// HONESTY (#132): this boundary must not claim a report it did not make. It
// reuses `describeErrorReporting()` from the segment boundary so both fallbacks
// tell the same truth — a server failure carries a `digest` and genuinely
// reached the deployment log via `src/instrumentation.ts` → `captureError()`;
// a browser-only failure reached no sink at all, and says so. No browser
// capture sink is installed (@sentry/nextjs is not a dependency), so the wire
// here is console.error and nothing more.

import { useEffect } from "react";
import { describeErrorReporting } from "./error";

interface Props {
  error: Error & { digest?: string };
  /** Next 16 hands the root boundary both; `retry` re-fetches, `reset` only clears. */
  retry?: () => void;
  reset?: () => void;
}

export default function RootGlobalError({ error, retry, reset }: Props) {
  useEffect(() => {
    // Best-effort browser-side log. There is no client capture sink installed,
    // so this is the whole of the client-side reporting — do not describe it
    // to the user as anything more.
    if (typeof console !== "undefined") {
      console.error("[app/global-error.tsx]", error.digest ?? "", error);
    }
  }, [error]);

  const tryAgain = retry ?? reset;

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          backgroundColor: "#f6f5f3",
          color: "#141414",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <title>Something went wrong · Milesymedia client portal</title>
        <main
          style={{
            width: "100%",
            maxWidth: "34rem",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0 0 12px" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: "0.875rem", lineHeight: 1.6, margin: "0 0 12px", opacity: 0.7 }}>
            {describeErrorReporting(error.digest)} The portal could not finish
            loading, so this basic page is standing in for it.
          </p>
          {/* The copy above tells the user to quote this reference, so it has
              to stay readable: at 12px on #f6f5f3 the ink must not fade past
              ~0.62 opacity or it drops under the 4.5:1 contrast floor. */}
          {error.digest && (
            <p style={{ fontSize: "0.75rem", margin: "0 0 20px", opacity: 0.62 }}>
              Reference: {error.digest}
            </p>
          )}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              justifyContent: "center",
            }}
          >
            {tryAgain && (
              <button
                type="button"
                onClick={() => tryAgain()}
                style={{
                  minHeight: "44px",
                  padding: "10px 18px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: "#8A563A",
                  color: "#ffffff",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Try again
              </button>
            )}
            <button
              type="button"
              // A hard document load, not a router navigation: the router shell
              // is part of what failed, so `<Link>` / `router.push` cannot be
              // trusted to get the user out of here.
              onClick={() => {
                window.location.assign("/");
              }}
              style={{
                minHeight: "44px",
                padding: "10px 18px",
                borderRadius: "6px",
                border: "1px solid rgba(0,0,0,0.12)",
                backgroundColor: "#ffffff",
                color: "rgba(0,0,0,0.7)",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Reload the portal
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
