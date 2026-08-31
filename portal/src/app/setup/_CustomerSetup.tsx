"use client";

import { useState } from "react";
import { ArrowRight, KeyRound, LoaderCircle, PartyPopper } from "lucide-react";
import { InstallHelp } from "@/app/portal/customer/_InstallHelp";

/**
 * The welcome, the password, and getting the portal onto their phone.
 *
 * Three short scenes rather than one long form. Somebody who has just been
 * told "your portal is ready" should meet a welcome first — the password is
 * the price of admission, and asking for it before saying hello is the wrong
 * way round.
 */

type Step = "hello" | "password" | "install";

export function CustomerSetup({
  firstName,
  clientName,
  providerName,
  videoUrl,
  welcomeNote,
  needsPassword,
}: {
  firstName: string;
  clientName: string;
  providerName: string;
  videoUrl?: string;
  welcomeNote?: string;
  needsPassword: boolean;
}) {
  const [step, setStep] = useState<Step>("hello");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmation) {
      setError("Those two do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/portal/customer/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await response.json() as { ok?: boolean; error?: string; sandbox?: boolean };
      // A sandbox account cannot have a real sign-in made for it, but the rest
      // of setup is still worth walking — so it goes on, saying why.
      if (result.sandbox) {
        setNotice(result.error ?? null);
        setStep("install");
        return;
      }
      if (!response.ok || !result.ok) throw new Error(result.error ?? "That could not be saved.");
      setStep("install");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "install") return <Scene><InstallStep clientName={clientName} notice={notice} /></Scene>;

  if (step === "password") {
    return (
      <Scene>
        <Badge icon={<KeyRound size={20} aria-hidden />} />
        <h1 className="mt-5 text-[1.4rem] font-semibold leading-tight text-white">Choose a password</h1>
        <p className="mt-2.5 text-sm leading-6 text-white/60">
          So you can come straight back any time, without waiting for a link.
        </p>
        <form onSubmit={savePassword} className="mt-6 grid gap-2.5">
          <div className="grid gap-1.5">
            <label htmlFor="setup-password" className="text-xs font-medium text-white/55">New password</label>
            <input
              id="setup-password"
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              autoFocus
              className="w-full rounded-lg border border-white/12 bg-white/[0.06] px-3.5 py-3 text-sm text-white outline-none transition focus:border-white/35 focus:bg-white/[0.09]"
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="setup-confirm" className="text-xs font-medium text-white/55">Again, to be sure</label>
            <input
              id="setup-confirm"
              type="password"
              value={confirmation}
              onChange={event => setConfirmation(event.target.value)}
              autoComplete="new-password"
              required
              className="w-full rounded-lg border border-white/12 bg-white/[0.06] px-3.5 py-3 text-sm text-white outline-none transition focus:border-white/35 focus:bg-white/[0.09]"
            />
          </div>
          <p className="text-xs leading-5 text-white/40">At least 8 characters.</p>
          {error ? <p role="alert" className="text-xs leading-5 text-red-300">{error}</p> : null}
          <button
            type="submit"
            disabled={busy || !password || !confirmation}
            className="mt-1.5 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-[#0e1013] transition hover:bg-white/90 disabled:opacity-40"
          >
            {busy ? <><LoaderCircle size={15} className="animate-spin" aria-hidden />Saving…</> : <>Save and continue<ArrowRight size={15} aria-hidden /></>}
          </button>
        </form>
      </Scene>
    );
  }

  return (
    <Scene>
      <Badge icon={<PartyPopper size={20} aria-hidden />} />
      <h1 className="mt-5 text-[1.5rem] font-semibold leading-tight text-white">
        Welcome, {firstName}
      </h1>
      <p className="mt-2.5 text-sm leading-6 text-white/60">
        {welcomeNote
          ?? <>We are so glad to have you on board. This is your {clientName} portal — your project,
             files, billing and support, all in one place. {providerName} is right here whenever you
             need us.</>}
      </p>

      {videoUrl ? (
        <div className="mt-5 overflow-hidden rounded-xl border border-white/12 bg-black/40">
          {/* A short hello does more than a page of instructions, and it is the
              one place a customer meets the people behind the work. */}
          <div className="relative aspect-video">
            <iframe
              src={videoUrl}
              title="Welcome"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 size-full"
            />
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setStep(needsPassword ? "password" : "install")}
        className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-[#0e1013] transition hover:bg-white/90"
      >
        Let&rsquo;s get you set up
        <ArrowRight size={15} aria-hidden />
      </button>
    </Scene>
  );
}

/**
 * Getting the portal onto their home screen.
 *
 * The guidance itself lives in one place — `InstallHelp` under the customer
 * portal — because the footer below promises the same help is waiting under
 * Support. A second copy here is how that promise quietly stops being true.
 */
function InstallStep({ clientName, notice }: { clientName: string; notice?: string | null }) {
  return (
    <>
      {notice ? (
        <p className="mb-4 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-200">
          {notice}
        </p>
      ) : null}
      <InstallHelp appName={clientName} tone="dark" showBadge headingLevel="h1" />

      <a
        href="/portal/customer"
        className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-[#0e1013] transition hover:bg-white/90"
      >
        Go to my portal
        <ArrowRight size={15} aria-hidden />
      </a>
      <p className="mt-2.5 text-center text-xs leading-5 text-white/40">
        You can do this later — it is in your portal under Support.
      </p>
    </>
  );
}

function Badge({ icon }: { icon: React.ReactNode }) {
  return (
    <span className="grid size-12 place-items-center rounded-xl bg-white/10 text-white/85 ring-1 ring-inset ring-white/15">
      {icon}
    </span>
  );
}

function Scene({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-[#0e1013] p-5">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <span className="aq-orb absolute -left-32 -top-40 size-[34rem] rounded-full bg-[#3d93a8] opacity-70 blur-[100px]" />
        <span className="aq-orb aq-orb-2 absolute -right-40 top-1/4 size-[30rem] rounded-full bg-[#c39241] opacity-60 blur-[110px]" />
        <span className="aq-orb aq-orb-3 absolute -bottom-20 left-1/3 size-[26rem] rounded-full bg-[#2c6a8f] opacity-65 blur-[110px]" />
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,transparent_0%,rgba(8,10,12,0.35)_55%,rgba(8,10,12,0.8)_100%)]" />
      </div>
      <section className="aq-scene relative w-full max-w-[26rem] rounded-2xl border border-white/14 bg-white/[0.07] p-7 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.85)] backdrop-blur-xl">
        {children}
      </section>
    </main>
  );
}
