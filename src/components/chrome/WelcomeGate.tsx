"use client";

// WelcomeGate — first-landing welcome screen rendered when a client
// hits a phase with `welcomeHeading` / `welcomeBody` set and the
// per-client + per-phase dismiss cookie is absent. Server-side check
// gates rendering; client-side dismiss writes the cookie + hides.

import { useState } from "react";

interface Props {
  clientId: string;
  phaseId: string;
  heading: string;
  body: string;
  /** All token values resolved server-side from contact + client data. */
  tokens: Record<string, string>;
}

export function WelcomeGate({ clientId, phaseId, heading, body, tokens }: Props) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  function dismiss() {
    // ~6 month dismiss window per phase. Per-client + per-phase cookie
    // so re-entering the SAME phase doesn't re-prompt, but moving to a
    // new phase shows that phase's welcome.
    const name = `mm-welcomed-${clientId}-${phaseId}`;
    document.cookie = `${name}=1; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`;
    setDismissed(true);
  }

  // Token replacement — every key in `tokens` is matched against
  // `[key]` in the heading + body. Tokens are resolved server-side
  // from session/user/client data so phase authors never hand-type
  // names; copy is written once and personalized per client.
  function personalize(s: string): string {
    let out = s;
    for (const [key, value] of Object.entries(tokens)) {
      out = out.replaceAll(`[${key}]`, value);
    }
    return out;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-primary,#C9A76A)]">
          Welcome
        </div>
        <h2 className="mb-3 text-2xl font-semibold tracking-tight text-black/90">
          {personalize(heading)}
        </h2>
        <p className="whitespace-pre-line text-sm leading-relaxed text-black/70">
          {personalize(body)}
        </p>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-md bg-black/85 px-4 py-2 text-sm font-medium text-white transition hover:bg-black"
          >
            Let's go →
          </button>
        </div>
      </div>
    </div>
  );
}
