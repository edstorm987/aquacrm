// What /portal/agency shows while a department hat is on.
//
// Ed: *"the modes solely focus on it — no Command Centre or anything… focus down
// fully."* So under a hat the Command Centre is not shown here at all. Choosing a
// hat lands you in that department's workspace (via the switcher); this is only
// what a DIRECT visit to /portal/agency renders — a small, calm "you're focused"
// card with the one door back into the work, and the reminder that taking the hat
// off in the top bar brings everything back. No macro dashboard, no heavy graph.

import Link from "next/link";
import { ArrowRight, Focus } from "lucide-react";

export function FocusedStub({ label, workspaceHref }: { label: string; workspaceHref: string }) {
  return (
    <div
      className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center gap-5 px-4 py-10 text-center"
      data-testid="focused-stub"
      data-focus-department={label}
    >
      <span className="rounded-2xl bg-brand/10 p-3 text-brand" aria-hidden="true">
        <Focus size={28} strokeWidth={1.8} />
      </span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">Working as {label}</p>
        <h1 className="mt-1 text-2xl font-semibold text-black/90">Focused on {label}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-black/55">
          You&rsquo;re locked into {label} — the Command Centre and the rest of the business are tucked away so you
          can just do the work. Everything comes back when you switch to <span className="font-medium text-black/70">Working as → Owner</span> in the top bar.
        </p>
      </div>
      <Link
        href={workspaceHref}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-black px-4 text-sm font-semibold text-white hover:bg-black/85"
      >
        Open your {label} workspace <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}
