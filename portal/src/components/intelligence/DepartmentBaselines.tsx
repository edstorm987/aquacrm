"use client";

// Setting what each department is MEANT to get.
//
// Ed, 2026-08-29: *"the owner needs to margin their time out in Command Centre
// — what's going to do today, we need to allocate time… we need to make
// projections and baselines for what we want to achieve."*
//
// ── Without this, the radar can only ever say "no baseline" ───────────────
//
// `summariseDepartmentAllocation` can total hours from the moment work is
// stamped, but "starved" is a comparison and there is nothing to compare
// against until somebody states an intention. That is the whole reason this
// small form matters more than it looks: it turns a description of where the
// hours went into a judgement about where they should have gone.
//
// ── The total is shown, and it is the honest part ─────────────────────────
//
// Five departments each quietly assigned "a day a week" is a 40-hour week
// nobody planned. The running total against a real working week is what makes
// over-allocation visible at the moment it is being committed to, rather than
// four weeks later when every department reads as starved and the reason is
// arithmetic rather than effort.

import { useCallback, useMemo, useState } from "react";
import { Check, LoaderCircle, TriangleAlert } from "lucide-react";

import { DEPARTMENT_PROFILES, departmentCapabilities, departmentTemplateName } from "@/lib/access/departmentProfiles";

export interface BaselineValue {
  departmentId: string;
  weeklyHours: number;
}

/** A full working week, for judging whether the plan is even possible. */
const REFERENCE_WEEK_HOURS = 40;

export function DepartmentBaselines({ initial }: { initial: BaselineValue[] }) {
  const [hours, setHours] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const profile of DEPARTMENT_PROFILES) {
      const found = initial.find(entry => entry.departmentId === profile.id);
      seed[profile.id] = found ? String(found.weeklyHours) : "";
    }
    return seed;
  });
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const total = useMemo(
    () => Object.values(hours).reduce((sum, value) => sum + (Number(value) || 0), 0),
    [hours],
  );

  /**
   * Create the five worker profiles as editable role templates.
   *
   * An explicit button rather than a side effect of rendering this page. The
   * first version seeded them during the page render and the read-path
   * mutation inventory caught it — a write on a read path is a write on every
   * page load, and this codebase polices that for good reason (issue #21).
   *
   * Posts to the access API that already exists, once per profile. Creation is
   * idempotent on `idempotencyKey`, so pressing it twice is a no-op and — more
   * importantly — pressing it after an owner has EDITED a profile does not
   * reset their edit.
   */
  const createProfiles = useCallback(async () => {
    setSeeding(true);
    setNote(null);
    try {
      for (const profile of DEPARTMENT_PROFILES) {
        const response = await fetch("/api/portal/access/templates", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: departmentTemplateName(profile),
            description: profile.purpose,
            capabilities: departmentCapabilities(profile),
            allowedScopeKinds: ["agency", "workspace"],
            idempotencyKey: `department-profile:${profile.id}:v1`,
          }),
        });
        // 409 and friends mean it is already there, which is success for a
        // button whose job is "make sure these exist".
        if (!response.ok && response.status !== 409) throw new Error("failed");
      }
      setNote({ tone: "ok", text: "Worker profiles are in your access settings." });
    } catch {
      setNote({ tone: "bad", text: "Could not create the worker profiles." });
    } finally {
      setSeeding(false);
    }
  }, []);

  const save = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      // Blank means "no baseline", which is a real and different statement from
      // zero — so blanks are omitted rather than sent as 0. A department with
      // no baseline reads as `unplanned`; one with a baseline of 0 reads as
      // planned to receive nothing.
      const departmentBaselines = DEPARTMENT_PROFILES
        .filter(profile => hours[profile.id]?.trim() !== "")
        .map(profile => ({ departmentId: profile.id, weeklyHours: Number(hours[profile.id]) || 0 }));

      const response = await fetch("/api/portal/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ departmentBaselines }),
      });
      if (!response.ok) throw new Error("save failed");
      setNote({ tone: "ok", text: "Baselines saved." });
    } catch {
      setNote({ tone: "bad", text: "Could not save the baselines." });
    } finally {
      setBusy(false);
    }
  }, [hours]);

  return (
    <section className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
      <header className="pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-black/45">Baselines</p>
        <h2 className="mt-0.5 text-sm font-semibold text-black/85">Hours a week per department</h2>
        <p className="mt-1 text-xs text-black/55">
          What each area is meant to get. Leave one blank to say nothing is planned for it —
          that reads differently from planning zero.
        </p>
      </header>

      <ul className="divide-y divide-black/[0.07] border-t border-black/[0.07]">
        {DEPARTMENT_PROFILES.map(profile => (
          <li key={profile.id} className="flex items-center gap-3 py-2.5">
            <span className="min-w-0 flex-1">
              <strong className="block text-xs font-semibold text-black/80">{profile.label}</strong>
              <span className="block text-[11px] leading-4 text-black/45">{profile.purpose}</span>
            </span>
            <label className="flex shrink-0 items-center gap-1.5">
              <span className="sr-only">{profile.label} hours a week</span>
              <input
                type="number"
                min={0}
                max={168}
                inputMode="numeric"
                value={hours[profile.id] ?? ""}
                onChange={event => { setHours(current => ({ ...current, [profile.id]: event.target.value })); setNote(null); }}
                placeholder="—"
                className="min-h-9 w-20 rounded-md border border-black/15 px-2 text-right text-xs tabular-nums text-black/80 outline-none focus:border-black/35"
              />
              <span className="text-[11px] text-black/40">h</span>
            </label>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        {/* Over-allocation, named as it is being committed to rather than
            discovered four weeks later as five starved departments. */}
        <p className={`text-[11px] ${total > REFERENCE_WEEK_HOURS ? "text-amber-800" : "text-black/45"}`}>
          {total > REFERENCE_WEEK_HOURS ? (
            <span className="inline-flex items-center gap-1.5">
              <TriangleAlert size={12} aria-hidden="true" />
              {total}h planned across a {REFERENCE_WEEK_HOURS}h week — something will be starved by arithmetic.
            </span>
          ) : (
            <>{total}h planned of a {REFERENCE_WEEK_HOURS}h week.</>
          )}
        </p>

        <span className="flex items-center gap-3">
          {note ? (
            <span role="status" className={`text-[11px] ${note.tone === "ok" ? "text-emerald-700" : "text-red-700"}`}>{note.text}</span>
          ) : null}
          {/* The seat a hire is put into. Here rather than buried in access
              settings because this is the page where departments are the
              subject — and a profile nobody created is a seat nobody can be
              given. */}
          <button
            type="button"
            onClick={() => void createProfiles()}
            disabled={seeding}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/15 bg-white px-3 text-xs font-semibold text-black/70 hover:bg-black/[0.03] disabled:opacity-50"
          >
            {seeding ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> : null}
            Create worker profiles
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85 disabled:opacity-50"
          >
            {busy ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
            Save baselines
          </button>
        </span>
      </div>
    </section>
  );
}
