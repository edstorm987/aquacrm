"use client";

import { Compass } from "lucide-react";

import type { NavigatorDestination, NavigatorPlan } from "@/engines/editor/editing/pageNavigator";

// ─── DEV EDITOR — the navigator ──────────────────────────────────────────────
//
// The second of Ed's two switchers: *"2 of them in total, projects selector and
// the navigation selector"*. The project switcher says WHICH project; this one
// says WHICH PAGE OF IT — the thing that was missing when Ed pointed the editor
// at a real website and found *"if i put in a website id get stuck"*.
//
// It is a LIST YOU PICK FROM. Not a URL bar: a URL bar asks the operator to
// already know the site's routes, and knowing them is the editor's job.
//
// The one rule it lives by is that it must say WHO ANSWERED. Every group is
// headed by its source — this portal's own document, the routes in a named
// repository, the links the tag can see on the page in front of you — and the
// line underneath counts them and states every caveat: a truncated GitHub
// tree, routes that need a real value, a tag that could not answer. The plan
// and its sentence are built in `editing/pageNavigator.ts`; nothing here
// invents a claim about where a row came from.
//
// A destination that cannot be OPENED is still shown, disabled, with the
// reason on the row. `/blog/[slug]` exists — you should be able to see that it
// exists — and opening it without a real value is a 404 with the editor's name
// on it.

export function PageNavigator({
  plan,
  value,
  onPick,
  disabled,
}: {
  plan: NavigatorPlan;
  /** The destination id currently showing, or "" when the address is unlisted. */
  value: string;
  onPick: (destination: NavigatorDestination) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 sm:min-w-52 sm:max-w-72 sm:shrink-0">
      <div className="flex min-w-0 items-center gap-1.5">
        <Compass size={13} aria-hidden className="shrink-0 text-white/30" />
        <select
          aria-label="Page navigator"
          value={value}
          disabled={disabled || plan.empty}
          onChange={event => {
            const destination = plan.destinations.find(item => item.id === event.target.value);
            if (destination) onPick(destination);
          }}
          className="h-10 w-full min-w-0 truncate rounded-md border border-white/10 bg-white/[0.06] px-2.5 text-xs font-medium text-white outline-none disabled:opacity-45"
        >
          {/* Shown when the address on screen is not one of the listed pages —
              a normal state (you typed one), so it says so rather than
              pretending some other row is selected. */}
          <option value="" className="bg-[#1a1c1a]">
            {plan.empty ? "No pages to list" : "Go to a page…"}
          </option>
          {plan.groups.map(group => (
            <optgroup key={group.source} label={group.label} className="bg-[#1a1c1a]">
              {group.destinations.map(destination => (
                <option
                  key={destination.id}
                  value={destination.id}
                  disabled={!destination.openable}
                  className="bg-[#1a1c1a]"
                >
                  {destination.openable ? destination.label : `${destination.label} — ${destination.note}`}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      {/* WHO ANSWERED. Truncated on screen because the row is a toolbar, whole
          in the title, and never dropped — a page list with no provenance is
          the thing this control exists not to be. */}
      <p className="truncate pl-[19px] text-[10px] leading-tight text-white/40" title={plan.sentence}>
        {plan.sentence}
      </p>
    </div>
  );
}
