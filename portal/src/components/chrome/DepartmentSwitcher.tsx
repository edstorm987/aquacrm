"use client";

// "Working as" — putting a department hat on, and taking it off.
//
// Ed, 2026-08-29: *"say owner needs to do sales, he will go to owner's profile
// and then switch to sales profile — reason being if you look at the micro
// you'll see the impact rather than a macro view… become a worker in your own
// company, otherwise you'll never grow."*
//
// ── It narrows. It never grants. ──────────────────────────────────────────
//
// Putting a hat on filters the sidebar to that department and nothing else.
// `applyDepartmentLens` is an intersection with panels that were already
// assembled and role-filtered, so this control cannot hand anybody a row they
// were not already entitled to — which is why it is allowed to be a cookie and
// a `router.refresh()` rather than a server round-trip through the access
// authority.
//
// The label says "Working as" rather than "View as" on purpose. Viewing is
// passive and this is not: the point is to DO the department's work from inside
// its own narrow view, so the time and output can be judged against that
// department rather than blended into one reassuring average.

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { ChevronDown, Check, LoaderCircle } from "lucide-react";

import { DEPARTMENT_PROFILES } from "@/lib/access/departmentProfiles";

// The cookie is written by the SERVER, not here.
//
// It used to be set from the browser, and that quietly split the feature in
// half: the nav narrowed and no hours were ever stamped, because nothing called
// `switchDashboardWorkDepartment`. One POST now does both, so a future change
// cannot do one without the other. See `api/portal/chrome/department`.

export function DepartmentSwitcher({ active }: { active?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [note, setNote] = useState("");

  const choose = useCallback(async (id: string) => {
    setOpen(false);
    setNote("");
    try {
      const response = await fetch("/api/portal/chrome/department", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ departmentId: id }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; stamped?: boolean } | null;
      if (!response.ok || !result?.ok) {
        setNote("Could not switch.");
        return;
      }
      // Said out loud rather than implied: with no session running this changed
      // the view and nothing else. Silence here would let somebody spend a
      // morning believing their hours were being attributed.
      if (id && result.stamped === false) setNote("View only — you are not clocked in.");
    } catch {
      setNote("Could not switch.");
      return;
    }
    // The sidebar is assembled on the SERVER — the cookie alone changes
    // nothing on screen until the server rebuilds the panels. Without this the
    // hat goes on and the nav sits there unchanged, which reads as broken.
    startTransition(() => router.refresh());
  }, [router]);

  const current = DEPARTMENT_PROFILES.find(profile => profile.id === active);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/12 bg-white px-2.5 text-xs font-medium text-black/70 hover:bg-black/[0.03]"
      >
        {pending ? <LoaderCircle size={12} className="animate-spin" aria-hidden="true" /> : null}
        <span className="text-black/40">Working as</span>
        {current ? current.label : "Owner"}
        <ChevronDown size={12} aria-hidden="true" className="text-black/35" />
      </button>

      {note ? (
        <span role="status" className="absolute right-0 top-full mt-1 whitespace-nowrap rounded-md bg-black/80 px-2 py-1 text-[10px] text-white">
          {note}
        </span>
      ) : null}

      {open ? (
        <div role="menu" className="absolute right-0 top-full z-[120] mt-1 w-64 rounded-lg border border-black/10 bg-white p-1 shadow-xl shadow-black/10">
          {/* Taking the hat off comes first: the way back has to be the easiest
              thing in the menu, or a narrow view feels like a trap. */}
          <button
            type="button"
            role="menuitem"
            onClick={() => void choose("")}
            className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-black/[0.04]"
          >
            <span className="mt-0.5 w-4 shrink-0">{!current ? <Check size={13} className="text-[#0b6f6d]" aria-hidden="true" /> : null}</span>
            <span>
              <strong className="block text-xs font-semibold text-black/80">Owner</strong>
              <span className="block text-[11px] leading-4 text-black/45">Everything you can reach.</span>
            </span>
          </button>

          <div className="my-1 border-t border-black/[0.07]" />

          {DEPARTMENT_PROFILES.map(profile => (
            <button
              key={profile.id}
              type="button"
              role="menuitem"
              onClick={() => void choose(profile.id)}
              className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-black/[0.04]"
            >
              <span className="mt-0.5 w-4 shrink-0">
                {current?.id === profile.id ? <Check size={13} className="text-[#0b6f6d]" aria-hidden="true" /> : null}
              </span>
              <span>
                <strong className="block text-xs font-semibold text-black/80">{profile.label}</strong>
                {/* The purpose line, not a feature list — it is what tells you
                    which hat to put on this morning. */}
                <span className="block text-[11px] leading-4 text-black/45">{profile.purpose}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
