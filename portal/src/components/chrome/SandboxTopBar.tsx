// The bar that says, unmissably, that this is not real data.
//
// Ed, 2026-08-28: *"cani have a toptopbar you are in sandbox mode or something
// just for sandbox mode so its clear and move the controls to this toptopbar as
// well just at the top full app width basically above the app so pushes app
// downwards"*.
//
// ── Why it pushes rather than floats ─────────────────────────────────────
//
// The sandbox controls used to be a pill floating at `bottom-4`. A floating
// control is something you learn to ignore — it sits over the content, it is
// out of the reading path, and on a phone it competes with the OS gesture bar.
// The whole point of this bar is that you cannot be in sandbox mode and not
// know it, so it takes real space at the top of the viewport and moves the
// application down. Nothing overlaps it and nothing hides behind it.
//
// ── How the shells stay the right height ─────────────────────────────────
//
// Eight shells are `h-dvh` — they fill the viewport exactly and manage their
// own internal scrolling. Putting a bar above one of those would push its
// bottom edge off-screen, so they now measure `--aqua-shell-h`, which defaults
// to `100dvh` and which this bar redefines while it is on screen.
//
// That is deliberately NOT a CSS override fighting the utility layer — the
// shells opt in by naming the variable, so the dependency is visible in the
// markup rather than hidden in a stylesheet that happens to win the cascade.
//
// The height is FIXED (`--aqua-sandbox-bar-h`), because a bar that wrapped to
// two lines would change the height the shells subtract and leave a gap or a
// clipped edge at exactly the widths nobody tests.
//
// ── What the first version got wrong ─────────────────────────────────────
//
// It kept the height fixed by letting the bar scroll sideways. Seen at 800px,
// that pushed **Exit** off the right edge — the single most important control
// in the bar, since it is how you stop being in sandbox mode, reachable only by
// discovering you could scroll a bar. So nothing scrolls now: the SENTENCE
// truncates (it is the only part that can be shortened without losing a
// function), the controls never shrink, and the persona switcher — a power
// feature, not a safety one — drops away below `sm` where there is no room for
// it. Exit survives at every width, down to 320px.

import { FlaskConical } from "lucide-react";

import { SandboxModeSwitcher } from "@/components/chrome/SandboxModeSwitcher";
import type { Role, SandboxSessionEnvironment } from "@/server/types";

const DATASET_COPY: Record<SandboxSessionEnvironment["dataset"], string> = {
  empty: "an empty dataset",
  demo: "demo data",
  snapshot: "a snapshot of real data",
};

export function SandboxTopBar({
  environment,
  role,
}: {
  environment: SandboxSessionEnvironment;
  role: Role;
}) {
  // A snapshot is a COPY of real records. Saying "nothing you do here is real"
  // over the top of one would be a comfortable lie: the actions are discarded,
  // but the names and numbers on screen are somebody's actual data, and that
  // changes who may look at your screen.
  const snapshot = environment.dataset === "snapshot";

  return (
    <>
      {/* Set once, read by every `h-dvh` shell. Rendered as a style element so
          the correct height is present in the FIRST paint — a `useEffect` would
          leave the shells a bar too tall until hydration. */}
      <style>{`:root{--aqua-shell-h:calc(100dvh - var(--aqua-sandbox-bar-h));}`}</style>
      <div
        data-sandbox-bar="on"
        className="mm-sandbox-topbar flex w-full items-center gap-3 px-3 sm:px-4"
        role="status"
        aria-live="polite"
      >
        <span className="flex shrink-0 items-center gap-2 font-semibold uppercase tracking-[0.14em]">
          <FlaskConical size={14} aria-hidden="true" />
          Sandbox mode
        </span>
        <span className="mm-sandbox-topbar-detail hidden min-w-0 flex-1 truncate sm:block">
          {snapshot
            ? `You are working on ${DATASET_COPY.snapshot} — the records are real, your changes are not kept.`
            : `You are working on ${DATASET_COPY[environment.dataset]}. Nothing here touches live data.`}
        </span>
        {/* The short form for phones, where the sentence above would eat the bar. */}
        <span className="mm-sandbox-topbar-detail min-w-0 flex-1 truncate sm:hidden">
          {snapshot ? "Real records · changes discarded" : "Not live data"}
        </span>
        <div className="flex shrink-0 items-center">
          <SandboxModeSwitcher environment={environment} role={role} variant="bar" />
        </div>
      </div>
    </>
  );
}
