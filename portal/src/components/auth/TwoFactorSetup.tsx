"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";

/**
 * Setting up, or confirming, two-factor authentication.
 *
 * One component for both because from the person's side they are the same
 * moment: something needs a code from their authenticator, and either they
 * have one set up or they are about to. Splitting it into a setup wizard and a
 * separate challenge box would make the first-time path feel like a detour
 * from the thing they were actually doing.
 */
export function TwoFactorSetup({
  mode,
  onVerified,
}: {
  /** `enrol` shows the QR first; `challenge` goes straight to the code box. */
  mode: "enrol" | "challenge";
  onVerified: () => void;
}) {
  const [factor, setFactor] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "verifying" | "error">(
    mode === "enrol" ? "loading" : "ready",
  );
  const [message, setMessage] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    if (mode !== "enrol") return;
    fetch("/api/portal/mfa/enrol", { method: "POST" })
      .then(response => response.json())
      .then((payload: { ok?: boolean; error?: string; factorId?: string; qrCode?: string; secret?: string }) => {
        if (!payload.ok || !payload.factorId) throw new Error(payload.error ?? "Setup could not be started.");
        setFactor({ factorId: payload.factorId, qrCode: payload.qrCode ?? "", secret: payload.secret ?? "" });
        setState("ready");
      })
      .catch(error => { setState("error"); setMessage(error instanceof Error ? error.message : String(error)); });
  }, [mode]);

  async function verify() {
    setState("verifying");
    setMessage("");
    try {
      const response = await fetch("/api/portal/mfa/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ factorId: factor?.factorId, code }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!result.ok) throw new Error(result.error ?? "That code was not right.");
      onVerified();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  if (state === "loading") {
    return (
      <p className="flex items-center gap-2 py-3 text-sm text-black/50">
        <LoaderCircle size={14} className="animate-spin" aria-hidden />Setting up…
      </p>
    );
  }

  return (
    <div className="mt-5 grid gap-3 rounded-md border border-black/12 bg-black/[0.02] p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-black/75">
        <ShieldCheck size={15} aria-hidden className="text-black/45" />
        {mode === "enrol" ? "Set up two-factor authentication" : "Confirm it is you"}
      </p>

      {mode === "enrol" && factor ? (
        <>
          <p className="text-xs leading-5 text-black/55">
            Scan this with your authenticator app, then enter the six-digit code it shows.
          </p>
          {/* Supabase returns the QR as an SVG data URI. */}
          {factor.qrCode ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={factor.qrCode} alt="Two-factor setup QR code" className="size-40 self-center rounded bg-white p-1.5" />
          ) : null}
          {/* Anybody using a desktop authenticator cannot scan their own
              screen, so the secret is available to type by hand. */}
          <button
            type="button"
            onClick={() => setShowSecret(value => !value)}
            className="text-xs font-medium text-black/45 underline underline-offset-2 hover:text-black/70"
          >
            {showSecret ? "Hide the setup key" : "Can’t scan it?"}
          </button>
          {showSecret ? (
            <code className="select-all break-all rounded bg-black/[0.05] p-2 text-center font-mono text-xs text-black/70">
              {factor.secret}
            </code>
          ) : null}
        </>
      ) : null}

      <label className="grid gap-1.5 text-xs font-semibold text-black/55">
        Six-digit code
        <input
          value={code}
          onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          className="h-11 rounded-md border border-black/12 px-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-brand"
        />
      </label>

      {message ? <p role="alert" className="text-xs text-red-700">{message}</p> : null}

      <button
        type="button"
        disabled={code.length !== 6 || state === "verifying"}
        onClick={() => void verify()}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-40"
      >
        {state === "verifying" ? <><LoaderCircle size={15} className="animate-spin" aria-hidden />Checking…</> : "Confirm"}
      </button>
    </div>
  );
}
