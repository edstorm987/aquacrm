"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Download, Share, Smartphone } from "lucide-react";

/**
 * Getting the portal onto a home screen — the one copy of that guidance.
 *
 * Setup shows it once on the way in and promises "you can do this later — it
 * is in your portal under Support". That promise is only true if Support can
 * show the very same help, so both surfaces render this component rather than
 * keeping a second copy of the platform detection and the instructions.
 *
 * The browser prompt is offered where there is one and instructions where
 * there is not — which is every iPhone, and on Chromium every install the
 * manifest is not yet good enough to earn. Declining the prompt spends it, so
 * the fallback instructions are what comes back afterwards: telling somebody
 * to press a button that no longer does anything would be a lie.
 */

type Platform = "ios" | "android" | "desktop";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void> | void;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallHelpTone = "dark" | "light";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const displayMode = typeof window.matchMedia === "function"
    && window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return displayMode || iosStandalone;
}

const TONE = {
  dark: {
    heading: "mt-5 text-[1.4rem] font-semibold leading-tight text-white",
    body: "mt-2.5 text-sm leading-6 text-white/60",
    done: "mt-5 flex items-center gap-2 rounded-lg border border-emerald-300/25 bg-emerald-400/10 px-3 py-2.5 text-sm text-emerald-200",
    button: "mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.08] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.12]",
    list: "mt-5 grid gap-2.5 text-sm leading-6 text-white/65",
    marker: "grid size-5 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] font-semibold text-white/70",
    strong: "font-semibold text-white/85",
    note: "mt-2.5 text-xs leading-5 text-white/40",
  },
  light: {
    heading: "font-serif text-xl text-[#1b1a18]",
    body: "mt-2 text-sm leading-6 text-black/50",
    done: "mt-5 flex items-center gap-2 rounded-md border border-black/10 bg-white px-3 py-2.5 text-sm text-[#1b1a18]",
    button: "mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--portal-hero)] px-4 text-sm font-medium text-white transition hover:opacity-90",
    list: "mt-5 grid gap-2.5 text-sm leading-6 text-black/55",
    marker: "grid size-5 shrink-0 place-items-center rounded-full bg-black/8 text-[11px] font-semibold text-black/55",
    strong: "font-medium text-[#1b1a18]",
    note: "mt-3 text-xs leading-5 text-black/38",
  },
} as const satisfies Record<InstallHelpTone, Record<string, string>>;

/**
 * Wraps the whole card, chrome included, so that an installed app is offered
 * nothing rather than an empty panel.
 *
 * `InstallHelp`'s own `hideWhenInstalled` can only remove itself — the caller's
 * surrounding surface is server-rendered around it and would survive as a
 * bordered, padded, empty box. The wrapper is a client component sharing the
 * one `isStandalone()` check, and a server-rendered `children` it declines to
 * render costs nothing.
 */
export function HideWhenInstalled({ children }: { children: React.ReactNode }) {
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    if (isStandalone()) setStandalone(true);
  }, []);
  if (standalone) return null;
  return <>{children}</>;
}

export function InstallHelp({
  appName,
  tone = "dark",
  heading = "Keep it one tap away",
  headingLevel = "h2",
  hideWhenInstalled = false,
  showBadge = false,
}: {
  appName: string;
  tone?: InstallHelpTone;
  heading?: string;
  /** Setup shows this as the scene's own title; Support nests it under one. */
  headingLevel?: "h1" | "h2";
  /** Support hides the card entirely for somebody already inside the app. */
  hideWhenInstalled?: boolean;
  showBadge?: boolean;
}) {
  const style = TONE[tone];
  const Heading = headingLevel;
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [alreadyInstalled, setAlreadyInstalled] = useState(false);
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    const agent = navigator.userAgent;
    setPlatform(
      /iPhone|iPad|iPod/.test(agent) ? "ios"
        : /Android/.test(agent) ? "android"
          : "desktop",
    );
    if (isStandalone()) setAlreadyInstalled(true);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
      setDeclined(false);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async (event: InstallPromptEvent) => {
    // A `beforeinstallprompt` event is good for exactly one call. Whatever the
    // answer, it is spent afterwards — so it is cleared either way, and a
    // decline falls back to the instructions rather than a dead button.
    setPrompt(null);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice && choice.outcome === "accepted") setInstalled(true);
      else setDeclined(true);
    } catch {
      setDeclined(true);
    }
  }, []);

  if (alreadyInstalled && hideWhenInstalled && !installed) return null;

  const steps = platform === "ios"
    ? [<>Tap the <Share size={13} className="inline align-[-1px]" aria-hidden /> share button in Safari.</>,
       <>Scroll down and choose <strong className={style.strong}>Add to Home Screen</strong>.</>,
       <>Tap <strong className={style.strong}>Add</strong>, and it is on your phone.</>]
    : platform === "android"
      ? [<>Open the browser menu (three dots).</>,
         <>Choose <strong className={style.strong}>Install app</strong> or <strong className={style.strong}>Add to home screen</strong>.</>,
         <>Confirm, and it is on your phone.</>]
      : [<>Look for the install icon at the right of the address bar.</>,
         <>Choose <strong className={style.strong}>Install</strong>.</>,
         <>It opens in its own window from now on.</>];

  return (
    <div>
      {showBadge ? (
        <span className="grid size-12 place-items-center rounded-xl bg-white/10 text-white/85 ring-1 ring-inset ring-white/15">
          <Smartphone size={20} aria-hidden />
        </span>
      ) : null}
      <Heading className={style.heading}>{heading}</Heading>
      <p className={style.body}>
        Add {appName} to your home screen and it opens like an app — no address to remember,
        no signing in each time.
      </p>

      {installed || alreadyInstalled ? (
        <p className={style.done}>
          <Check size={15} aria-hidden /> Installed. You will find it with your other apps.
        </p>
      ) : prompt ? (
        <button type="button" onClick={() => void install(prompt)} className={style.button}>
          <Download size={15} aria-hidden />
          Install the app
        </button>
      ) : (
        <>
          {declined ? (
            <p className={style.note}>
              No problem — nothing was installed. You can still add it by hand whenever you like:
            </p>
          ) : null}
          <ol className={style.list}>
            {steps.map((line, index) => (
              <li key={index} className="flex gap-3">
                <span className={style.marker}>{index + 1}</span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
