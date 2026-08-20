"use client";

import {
  ArrowRight,
  Briefcase,
  Check,
  Compass,
  Crown,
  FlaskConical,
  IdCard,
  Loader2,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { DEV_MODE_LOADIN_KEY } from "@/lib/chrome/devModeLoadIn";

import { ACCENT, ACCENT_SOFT, Pill } from "../_ui";

// Client half of Dev Team → Inspector. Renders the seeded demo POVs as cards and
// hops the session into whichever one Ed picks by POSTing the fenced
// /api/auth/dev-mode mint route — mirroring DevModeSwitcher's fetch logic.
//
// `switch` requires an ACTIVE Dev Mode session (one carrying the signed
// devReturnAgencyId minted by `enter`). So from Ed's real founder session
// (`active` false) we `enter` first — safe, since this whole surface is
// founder-gated — then `switch`; when he is already in Dev Mode we switch
// straight away. Either way we stash the persona in sessionStorage first so the
// shared DevModeLoadIn cinematic (mounted by the /portal layout on the demo
// session we land in) plays on arrival — the same one-shot handoff the top-bar
// switcher uses.

export type Persona = "owner" | "staff" | "customer" | "freelancer";

interface Profile {
  id: Persona;
  label: string;
  identity: string;
  blurb: string;
  lands: string;
  Icon: LucideIcon;
}

// Mirrors the demo seed identities + the route's persona → landing dispatch.
const PROFILES: Profile[] = [
  {
    id: "owner",
    label: "Owner",
    identity: "demo@aqua.dev",
    blurb: "The agency owner’s full operating view — every client, workspace and module.",
    lands: "Agency workspace",
    Icon: Crown,
  },
  {
    id: "staff",
    label: "Staff",
    identity: "staff@aqua.dev",
    blurb: "A non-owner team member’s narrower scope, plus a seeded employee record.",
    lands: "Team workspace",
    Icon: IdCard,
  },
  {
    id: "customer",
    label: "Customer",
    identity: "demo-shopper@aqua.test",
    blurb: "The end-customer’s portal — only what’s deliberately shared with them.",
    lands: "Customer portal",
    Icon: ShoppingBag,
  },
  {
    id: "freelancer",
    label: "Freelancer",
    identity: "sky@aqua.freelance",
    blurb: "A contracted freelancer’s workspace — their assigned jobs only.",
    lands: "Freelancer workspace",
    Icon: Briefcase,
  },
];

async function postDevMode(
  body: Record<string, unknown>,
): Promise<{ ok?: boolean; redirect?: string; error?: string }> {
  const response = await fetch("/api/auth/dev-mode", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    redirect?: string;
    error?: string;
  };
  if (!response.ok || !result.ok) {
    throw new Error(result.error || "Dev Mode could not be changed.");
  }
  return result;
}

export function InspectorClient({
  active,
  currentPersona,
}: {
  active: boolean;
  currentPersona: Persona | null;
}) {
  const [busy, setBusy] = useState<Persona | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function become(persona: Persona) {
    if (busy) return;
    setBusy(persona);
    setError(null);
    try {
      // From the real founder session, mint an active Dev Mode session first —
      // `enter` re-mints as the demo owner and stashes the signed return path
      // that `switch` (and Exit Dev Mode) rely on.
      if (!active) {
        await postDevMode({ action: "enter" });
      }
      // Hand the shared cinematic the persona so it plays on arrival (the same
      // one-shot sessionStorage handoff DevModeSwitcher uses).
      try {
        window.sessionStorage.setItem(DEV_MODE_LOADIN_KEY, persona);
      } catch {
        /* private mode — no cinematic, still switches */
      }
      const result = await postDevMode({ action: "switch", persona });
      window.location.assign(result.redirect || "/portal/agency");
    } catch (err) {
      try {
        window.sessionStorage.removeItem(DEV_MODE_LOADIN_KEY);
      } catch {
        /* ignore */
      }
      setBusy(null);
      setError(err instanceof Error ? err.message : "Could not switch profile.");
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-start gap-2.5 rounded-xl border border-[color:var(--dt-line)] bg-[#f6f9f5] px-4 py-3 text-xs leading-relaxed text-[color:var(--dt-muted)]">
        <FlaskConical size={15} aria-hidden="true" className="mt-px shrink-0 text-[#0b6f6d]" />
        <p>
          {active ? (
            <>
              You are in Dev Mode
              {currentPersona ? <> — currently viewing as the demo {currentPersona}</> : null}. Switching
              swaps your POV instantly; Exit Dev Mode (Dev POV bar) returns you to your real account.
            </>
          ) : (
            <>
              Picking a profile enters Dev Mode on the fenced demo tenant. Your real account is stashed
              and restored when you Exit Dev Mode — no live client data is ever touched.
            </>
          )}
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-[#e7c9c9] bg-[#fbeeee] px-4 py-2.5 text-sm text-[#8a2f2f]"
        >
          {error}
        </p>
      ) : null}

      <div>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--dt-faint)]">
          Points of view
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PROFILES.map((profile) => {
            const { Icon } = profile;
            const isCurrent = active && currentPersona === profile.id;
            const isBusy = busy === profile.id;
            return (
              <li
                key={profile.id}
                className={
                  "group flex flex-col rounded-2xl border p-5 " +
                  (isCurrent
                    ? "border-[#bfe0dd] bg-[#f4faf9]"
                    : "border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] transition-all duration-150 hover:-translate-y-0.5 hover:border-[color:var(--dt-line)] hover:shadow-[0_8px_24px_-10px_rgba(20,35,31,0.22)]")
                }
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                    style={{ background: ACCENT_SOFT, color: ACCENT }}
                  >
                    <Icon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-[color:var(--dt-ink)]">{profile.label}</h3>
                      {isCurrent ? <Pill tone="accent">Current view</Pill> : null}
                    </div>
                    <p className="mt-0.5 truncate font-mono text-xs text-[color:var(--dt-faint)]">{profile.identity}</p>
                  </div>
                </div>

                <p className="mt-3 text-sm leading-snug text-[color:var(--dt-muted)]">{profile.blurb}</p>

                <div className="mt-4 flex items-center justify-between gap-3 border-t border-[color:var(--dt-hairline)] pt-3">
                  <span className="inline-flex items-center gap-1.5 text-xs text-[color:var(--dt-faint)]">
                    <Compass size={13} aria-hidden="true" /> Lands on {profile.lands}
                  </span>
                  <button
                    type="button"
                    onClick={() => void become(profile.id)}
                    disabled={Boolean(busy) || isCurrent}
                    aria-busy={isBusy}
                    title={isCurrent ? `Currently viewing as demo ${profile.label.toLowerCase()}` : `Become the demo ${profile.label.toLowerCase()}`}
                    className={
                      "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition-colors " +
                      (isCurrent
                        ? "cursor-default bg-[color:var(--dt-hairline)] text-[color:var(--dt-muted)]"
                        : "bg-[#0b6f6d] text-white hover:bg-[#0a5f5d] disabled:cursor-default disabled:opacity-60")
                    }
                  >
                    {isBusy ? (
                      <>
                        <Loader2 size={14} aria-hidden="true" className="animate-spin" /> Switching…
                      </>
                    ) : isCurrent ? (
                      <>
                        <Check size={14} aria-hidden="true" /> You’re here
                      </>
                    ) : (
                      <>
                        Become this profile
                        <ArrowRight
                          size={14}
                          aria-hidden="true"
                          className="transition-transform group-hover:translate-x-0.5"
                        />
                      </>
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
