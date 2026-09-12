"use client";

// AUTH-001 — the client half of the managed bot-challenge (DECISIONS #13).
//
// Renders the Cloudflare Turnstile widget and hands the resulting token up to
// the form, which posts it to the server. The server (verifyBotChallenge) is
// the only place a token is trusted; this component just obtains one.
//
// Deliberate choices:
//   - No new dependency. The project's node_modules is frozen (symlinked to the
//     integration tree), so the vanilla explicit-render API is used directly
//     rather than a React wrapper package.
//   - Fail-open ONLY at render time: with no site key the component renders
//     nothing and the form still submits. The SERVER decides enforcement — in
//     production an unconfigured challenge fails closed there, not here.
//   - Accessible: the widget itself is keyboard- and screen-reader-navigable
//     inside its iframe; on load/verify failure we surface a real, focusable
//     "Try again" control and an assertive live region, never a dead end.
//   - Reduced motion: the managed widget honours prefers-reduced-motion; the
//     surrounding chrome adds no animation of its own.

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

// Minimal typing for the global the Turnstile script installs.
interface TurnstileRenderOptions {
  sitekey: string;
  action?: string;
  theme?: "auto" | "light" | "dark";
  retry?: "auto" | "never";
  "refresh-expired"?: "auto" | "manual" | "never";
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
}
interface TurnstileApi {
  render: (el: HTMLElement, opts: TurnstileRenderOptions) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_MARKER = "data-aqua-turnstile";

// One shared load. Reset to null on error so a retry re-attempts the load.
let scriptPromise: Promise<void> | null = null;
function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no-window"));
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[${SCRIPT_MARKER}]`);
    if (existing) {
      if (window.turnstile) return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("turnstile-script-failed")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.setAttribute(SCRIPT_MARKER, "");
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => {
      scriptPromise = null;
      reject(new Error("turnstile-script-failed"));
    }, { once: true });
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export interface BotChallengeHandle {
  /** Discard the current token and re-issue a fresh one (single-use tokens). */
  reset: () => void;
}

interface Props {
  /** Public site key. Null/empty → the widget renders nothing. */
  siteKey: string | null | undefined;
  /** The action this token is bound to, e.g. "login". Must match the server. */
  action: string;
  /** Called with a fresh token, or null when it expires / errors / is reset. */
  onToken: (token: string | null) => void;
  className?: string;
}

export const BotChallenge = forwardRef<BotChallengeHandle, Props>(function BotChallenge(
  { siteKey, action, onToken, className },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Keep the latest onToken without re-running the render effect.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  // Bumping this forces a fresh mount+render attempt (used by "Try again").
  const [attempt, setAttempt] = useState(0);

  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        const api = window.turnstile;
        if (api && widgetIdRef.current != null) {
          api.reset(widgetIdRef.current);
          onTokenRef.current(null);
        }
      },
    }),
    [],
  );

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    setStatus("loading");
    loadTurnstileScript()
      .then(() => {
        if (cancelled) return;
        const api = window.turnstile;
        const el = containerRef.current;
        if (!api || !el) {
          setStatus("error");
          return;
        }
        // Guard against a double render (React 18 StrictMode dev double-invoke).
        if (widgetIdRef.current != null) return;
        widgetIdRef.current = api.render(el, {
          sitekey: siteKey,
          action,
          theme: "auto",
          retry: "auto",
          "refresh-expired": "auto",
          callback: (token: string) => {
            if (cancelled) return;
            setStatus("ready");
            onTokenRef.current(token);
          },
          "error-callback": () => {
            if (cancelled) return;
            setStatus("error");
            onTokenRef.current(null);
          },
          "expired-callback": () => {
            if (!cancelled) onTokenRef.current(null);
          },
          "timeout-callback": () => {
            if (!cancelled) onTokenRef.current(null);
          },
        });
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
      const api = window.turnstile;
      if (api && widgetIdRef.current != null) {
        try {
          api.remove(widgetIdRef.current);
        } catch {
          /* widget already gone */
        }
        widgetIdRef.current = null;
      }
    };
    // `attempt` is included so "Try again" forces a clean re-render.
  }, [siteKey, action, attempt]);

  const retry = useCallback(() => {
    widgetIdRef.current = null;
    onTokenRef.current(null);
    setStatus("loading");
    setAttempt((n) => n + 1);
  }, []);

  // Nothing to show when the challenge is not configured. The form still works;
  // the server decides whether an unconfigured challenge is allowed.
  if (!siteKey) return null;

  return (
    <div className={className}>
      <div ref={containerRef} className="mm-captcha" data-testid="bot-challenge" />
      <p role="status" aria-live="polite" className="mm-captcha-status">
        {status === "loading" ? "Loading the verification challenge…" : null}
      </p>
      {status === "error" && (
        <p role="alert" className="mm-form-error">
          The verification challenge couldn&apos;t load.{" "}
          <button type="button" className="mm-link-button" onClick={retry}>
            Try again
          </button>
          .
        </p>
      )}
    </div>
  );
});
