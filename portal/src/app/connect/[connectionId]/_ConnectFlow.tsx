"use client";

import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Lock, Plug } from "lucide-react";

/**
 * The whole connect journey, as one component.
 *
 * Kept together because it is one continuous act — welcome, sign in, confirm,
 * connected — and splitting it across page loads is what made it feel like
 * four unrelated errands. The step only ever moves forward, and each screen
 * says what the next one will be, so nobody is guessing how much is left.
 */

type Step = "welcome" | "code" | "working" | "done";

/**
 * What the loader reports.
 *
 * Each line is a real stage of the request, not decoration — the code is
 * checked, the connection is bound to the account, the portal is opened. A
 * progress list that names things which are not happening is a lie told
 * slowly, and it would be the one dishonest thing in an otherwise careful
 * flow.
 */
const STAGES = [
  "Confirming your code",
  "Linking your software",
  "Securing the connection",
  "Opening your portal",
] as const;

export function ConnectFlow({
  connectionId,
  label,
  accountName,
  signedIn,
  email,
  devCode,
  devSignInHref,
  signedInAs,
}: {
  connectionId: string;
  /** The software being connected. */
  label: string;
  /** Whose account this is — the greeting is warmer for naming it. */
  accountName: string;
  signedIn: boolean;
  email?: string;
  /** Dev only — the stand-in code, shown so the flow can be walked. */
  devCode?: string;
  /** Dev only — a way to be the customer without a real account. */
  devSignInHref?: string;
  /** Who is signed in now, when it is not the account this link is for. */
  signedInAs?: string;
}) {
  const [step, setStep] = useState<Step>(signedIn ? "code" : "welcome");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [loginEmail, setLoginEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  // Sending the code, and where it went. The `email` prop is only known when
  // the page rendered already signed in; after signing in on the welcome screen
  // the server tells us where the code landed so the screen can still name it.
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | undefined>(email);
  const requestedRef = useRef(false);

  // When the current code lapses, and how the last confirm attempt landed —
  // together these decide whether the screen should be nudging a resend rather
  // than another retry.
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [lastOutcome, setLastOutcome] = useState<string | null>(null);

  // Ask the server to email a code the moment the code screen opens, and again
  // on demand. The code is what the confirm step checks — without this call
  // nothing would ever arrive. Guarded so a re-render never re-sends.
  async function requestCode(options: { resend?: boolean } = {}) {
    setSending(true);
    setError(null);
    if (options.resend) setNotice(null);
    try {
      const response = await fetch("/api/portal/connections/request-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const data = await response.json() as { ok?: boolean; sent?: boolean; sentTo?: string; expiresAt?: number; error?: string };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "We couldn’t send your code. Try again in a moment.");
        return;
      }
      if (data.sentTo) setSentTo(data.sentTo);
      // A fresh code resets everything the old one carried: its clock, whatever
      // the last attempt said, and the half-typed digits of the code it replaces.
      if (data.expiresAt) setExpiresAt(data.expiresAt);
      setNowTick(Date.now());
      setLastOutcome(null);
      setCode("");
      if (options.resend) {
        setNotice(data.sent === false
          ? "A new code is ready. If the email doesn’t arrive, ask whoever sent you the link."
          : "We’ve sent you a fresh code.");
      }
    } catch {
      setError("We couldn’t send your code. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (step !== "code" || requestedRef.current) return;
    requestedRef.current = true;
    void requestCode();
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // A once-a-second tick, only while a code is live on the code screen, so the
  // countdown stays honest without a timer running the rest of the time.
  useEffect(() => {
    if (step !== "code" || expiresAt == null) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [step, expiresAt]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password }),
      });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Sign-in failed.");
      // Straight on rather than a reload: they are mid-way through one job,
      // and starting the page again would look like it had not worked.
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    setStep("working");
    try {
      const response = await fetch("/api/portal/connections/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connectionId, code }),
      });
      const result = await response.json() as { ok?: boolean; error?: string; confirmation?: string };
      if (!result.ok) {
        // Back to the code screen, carrying why it failed so it can point at the
        // right next step — a wrong code is a retry, an expired or locked one
        // wants a fresh code, not another guess.
        setStep("code");
        setLastOutcome(result.confirmation ?? "wrong-code");
        setError(result.error ?? "That did not work.");
        // A code that can never work again should not sit in the box inviting
        // another go at it.
        if (result.confirmation === "expired" || result.confirmation === "locked") setCode("");
        return;
      }
      setLastOutcome(null);
      setStep("done");
    } catch {
      setStep("code");
      setError("We couldn’t reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  // How long the current code has left, and whether the way forward is a retry
  // or a fresh code. `lastOutcome` is what the server said; the clock is the
  // client's own view of the same fifteen minutes.
  const remainingMs = expiresAt != null ? expiresAt - nowTick : null;
  const codeExpired = lastOutcome === "expired" || (remainingMs != null && remainingMs <= 0);
  const needsFreshCode = codeExpired || lastOutcome === "locked";

  if (step === "working" || step === "done") {
    return <Scene key="working"><Progress done={step === "done"} label={label} /></Scene>;
  }

  if (step === "code") {
    return (
      <Scene key="code">
        <Header
          icon={<Lock size={20} aria-hidden />}
          title="Awesome — one last step"
          lead={sentTo
            ? <>We have sent a code to <strong className="font-semibold text-white/80">{sentTo}</strong>. Enter it to confirm it is you.</>
            : <>We have sent a code to your email. Enter it to confirm it is you.</>}
        />
        <Steps active={2} />
        <form onSubmit={confirm} className="mt-5 grid gap-3">
          <label htmlFor="connect-code" className="sr-only">Confirmation code</label>
          <input
            id="connect-code"
            value={code}
            onChange={event => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            placeholder="000000"
            autoFocus
            className="w-full rounded-lg border border-white/12 bg-white/[0.06] px-3 py-3.5 text-center font-mono text-2xl tracking-[0.55em] text-white outline-none transition focus:border-white/35 focus:bg-white/[0.09]"
          />
          {/* The clock, told plainly. A live count while it runs; a clear "it's
              gone, get another" once it lapses — never leaving somebody typing
              into a code that can no longer work. */}
          {remainingMs != null && remainingMs > 0 && !needsFreshCode ? (
            <p className="text-center text-xs leading-5 text-white/40">Your code expires in {formatCountdown(remainingMs)}.</p>
          ) : null}
          {codeExpired && !error ? (
            <p className="text-xs leading-5 text-amber-200/90">Your code has expired. Send a new one to carry on.</p>
          ) : null}
          {devCode ? (
            <p className="rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-200">
              Development only: the dev bypass code is <strong className="font-mono font-semibold">{devCode}</strong> (a real code is also emailed).
            </p>
          ) : null}
          {notice ? <p className="text-xs leading-5 text-emerald-300/90">{notice}</p> : null}
          {error ? <p role="alert" className="text-xs leading-5 text-red-300">{error}</p> : null}
          <button
            type="submit"
            disabled={busy || !code.trim() || needsFreshCode}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-[#0e1013] transition hover:bg-white/90 disabled:opacity-40"
          >
            Confirm and connect
          </button>
          {/* A code can be missed, land in spam, or lapse after fifteen minutes.
              A resend is the one way forward that does not send somebody back to
              the start — and once a code is spent it becomes the main action. */}
          <button
            type="button"
            onClick={() => void requestCode({ resend: true })}
            disabled={sending}
            className={needsFreshCode
              ? "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/[0.06] px-4 text-sm font-semibold text-white/90 transition hover:bg-white/[0.1] disabled:opacity-40"
              : "text-center text-xs font-medium text-white/50 transition hover:text-white/75 disabled:opacity-40"}
          >
            {sending ? "Sending a code…" : needsFreshCode ? "Send me a new code" : "Didn’t get a code? Send it again"}
          </button>
        </form>
      </Scene>
    );
  }

  return (
    <Scene key="welcome">
      <Header
        icon={<Plug size={20} aria-hidden />}
        title={`Welcome, ${accountName}`}
        lead={<>Sign in to your account below and {label} will open your Aqua portal — billing, files and requests, without signing in twice.</>}
      />
      <Steps active={1} />
      {signedInAs ? (
        // Said quietly rather than as a wall: they are not stuck, they just
        // need to sign in on the account the link is for.
        <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs leading-5 text-white/50">
          You are signed in as <span className="text-white/70">{signedInAs}</span>. Sign in below on the
          {" "}{accountName} account to finish connecting.
        </p>
      ) : null}
      <form onSubmit={signIn} className="mt-5 grid gap-2.5">
        <div className="grid gap-1.5">
          <label htmlFor="connect-email" className="text-xs font-medium text-white/55">Email</label>
          <input
            id="connect-email"
            type="email"
            value={loginEmail}
            onChange={event => setLoginEmail(event.target.value)}
            autoComplete="username"
            required
            className="w-full rounded-lg border border-white/12 bg-white/[0.06] px-3.5 py-3 text-sm text-white outline-none transition focus:border-white/35 focus:bg-white/[0.09]"
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="connect-password" className="text-xs font-medium text-white/55">Password</label>
          <input
            id="connect-password"
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            className="w-full rounded-lg border border-white/12 bg-white/[0.06] px-3.5 py-3 text-sm text-white outline-none transition focus:border-white/35 focus:bg-white/[0.09]"
          />
        </div>
        {error ? <p role="alert" className="text-xs leading-5 text-red-300">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="mt-1.5 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-[#0e1013] transition hover:bg-white/90 disabled:opacity-40"
        >
          {busy ? <><LoaderCircle size={15} className="animate-spin" aria-hidden />Signing in…</> : "Sign in and continue"}
        </button>
        {/* Said here rather than after: somebody should know what signing in
            commits them to before they do it, not once it is done. */}
        <p className="text-center text-xs leading-5 text-white/40">
          {label} never receives your password. You can disconnect at any time.
        </p>
        {devSignInHref ? (
          <a href={devSignInHref} className="mt-1 text-center text-xs font-medium text-amber-200/80 hover:text-amber-200">
            Development only: sign in as a test customer
          </a>
        ) : null}
      </form>
    </Scene>
  );
}

/** `M:SS`, rounding up so the last second is shown as 0:01 rather than 0:00. */
function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1_000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** One beat of the sequence. Fades and lifts in, so a step change reads as a
 *  scene change rather than as the page having been replaced. */
function Scene({ children }: { children: React.ReactNode }) {
  return <div className="aq-scene">{children}</div>;
}

function Header({ icon, title, lead }: { icon: React.ReactNode; title: string; lead: React.ReactNode }) {
  return (
    <>
      <span className="grid size-12 place-items-center rounded-xl bg-white/10 text-white/85 ring-1 ring-inset ring-white/15">{icon}</span>
      <h1 className="mt-5 text-[1.4rem] font-semibold leading-tight text-white">{title}</h1>
      <p className="mt-2.5 text-sm leading-6 text-white/60">{lead}</p>
    </>
  );
}

/** Two dashes, filled as they are passed. Enough to show how much is left. */
function Steps({ active }: { active: 1 | 2 }) {
  return (
    <div className="mt-6 flex items-center gap-2" aria-hidden>
      {[1, 2].map(step => (
        <span
          key={step}
          className={`h-1 flex-1 rounded-full transition-colors duration-500 ${step <= active ? "bg-white/75" : "bg-white/12"}`}
        />
      ))}
    </div>
  );
}

/**
 * The staged loader.
 *
 * Runs on a timer rather than on real progress, because the request is one
 * round trip and has no intermediate events to report. The stages are honest
 * about what that round trip does, and the last one does not complete until
 * the server has actually answered — so it can look unhurried without ever
 * claiming to be finished before it is.
 */
function Progress({ done, label }: { done: boolean; label: string }) {
  const [reached, setReached] = useState(0);
  const doneRef = useRef(done);
  doneRef.current = done;

  useEffect(() => {
    const timers = STAGES.map((_, index) => window.setTimeout(() => {
      // The final stage waits for the server. Everything before it is the
      // request in flight, which genuinely is doing these things.
      setReached(current => {
        const next = index + 1;
        if (next === STAGES.length && !doneRef.current) return current;
        return Math.max(current, next);
      });
    }, 420 * (index + 1)));
    return () => timers.forEach(window.clearTimeout);
  }, []);

  useEffect(() => {
    if (done) setReached(STAGES.length);
  }, [done]);

  const complete = done && reached === STAGES.length;

  useEffect(() => {
    if (!complete) return;
    const timer = window.setTimeout(() => { window.location.href = "/portal/customer"; }, 1_400);
    return () => window.clearTimeout(timer);
  }, [complete]);

  return (
    <>
      <span className={`grid size-12 place-items-center rounded-xl transition-colors duration-200 ${complete ? "bg-emerald-400/20 text-emerald-300 ring-1 ring-inset ring-emerald-300/30" : "bg-white/10 text-white/85 ring-1 ring-inset ring-white/15"}`}>
        {complete ? <Check size={20} aria-hidden /> : <LoaderCircle size={20} className="animate-spin" aria-hidden />}
      </span>
      <h1 className="mt-5 text-[1.4rem] font-semibold leading-tight text-white">
        {complete ? "You\u2019re all set" : "Setting everything up"}
      </h1>
      <p className="mt-2.5 text-sm leading-6 text-white/60">
        {complete
          ? <>{label} is connected. Taking you to your portal…</>
          : <>Hang tight — this only takes a moment.</>}
      </p>

      <ul className="mt-6 grid gap-3" aria-live="polite">
        {STAGES.map((stage, index) => {
          const state = index < reached ? "done" : index === reached ? "active" : "waiting";
          return (
            <li key={stage} className="flex items-center gap-2.5 text-sm">
              <span className={[
                "grid size-5 shrink-0 place-items-center rounded-full transition-colors duration-200",
                state === "done" ? "bg-emerald-400/20 text-emerald-300 ring-1 ring-inset ring-emerald-300/25"
                  : state === "active" ? "bg-white/10 text-white/70"
                    : "bg-white/[0.04] text-white/20",
              ].join(" ")}>
                {state === "done"
                  ? <Check size={12} aria-hidden />
                  : state === "active"
                    ? <LoaderCircle size={12} className="animate-spin" aria-hidden />
                    : <span className="size-1.5 rounded-full bg-current" />}
              </span>
              <span className={`transition-colors duration-500 ${state === "waiting" ? "text-white/30" : state === "done" ? "text-white/85" : "text-white/70"}`}>{stage}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
