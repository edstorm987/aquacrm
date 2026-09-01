"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, CalendarClock, Check, ChevronDown, ChevronRight, CircleDashed,
  CircleDot, FilePlus2, LoaderCircle, Plus, Trash2, UserRound,
} from "lucide-react";

import type {
  Horizon, ItemStatus, Roadmap, RoadmapItemView,
} from "@/lib/server/dev/devTeamRoadmap";
import { checkedDevTeamMutation } from "../_checkedMutation";

// The roadmap, made touchable.
//
// Reading it must work at a glance — horizon lanes, a schedule strip, a bar per
// item — and changing it must not mean opening a file: the status, the horizon
// and the date are editable in place, and a new outcome can be added or turned
// straight into a plan. Every write goes to the same markdown the workers read.

const HORIZON_LANES: { value: Horizon; label: string; hint: string; hue: string }[] = [
  { value: "now", label: "Now", hint: "In flight — someone is on it", hue: "var(--dev-info)" },
  { value: "next", label: "Next", hint: "Queued — starts when a slot frees", hue: "var(--dev-warning)" },
  { value: "later", label: "Later", hint: "After launch", hue: "var(--dev-violet)" },
  { value: "someday", label: "Someday", hint: "Ideas and requests", hue: "var(--dev-faint)" },
  { value: "shipped", label: "Shipped", hint: "Done and verified", hue: "var(--dev-success)" },
];

const STATUS_TONE: Record<ItemStatus, { chip: string; label: string }> = {
  idea: { chip: "bg-[color:var(--dt-hairline)] text-[color:var(--dt-faint)]", label: "idea" },
  planned: { chip: "bg-[color:var(--dev-accent-soft)] text-[color:var(--dev-accent)]", label: "planned" },
  building: { chip: "bg-[color:var(--dev-info-soft)] text-[color:var(--dev-info)]", label: "building" },
  shipped: { chip: "bg-[color:var(--dev-success-soft)] text-[color:var(--dev-success)]", label: "shipped" },
  parked: { chip: "bg-[color:var(--dev-warning-soft)] text-[color:var(--dev-warning)]", label: "parked" },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2026-08-22` → `22 Aug`; `2026-09` → `end of Sep`. */
function fmtTarget(target?: string): string {
  if (!target) return "";
  const month = MONTHS[Number(target.slice(5, 7)) - 1] ?? target.slice(5, 7);
  return target.length === 7 ? `end of ${month}` : `${Number(target.slice(8, 10))} ${month}`;
}

/** The countdown, in the words you'd actually use. */
function dueLabel(days: number | undefined): { text: string; overdue: boolean } | null {
  if (days === undefined) return null;
  if (days < 0) return { text: `${-days}d past target`, overdue: true };
  if (days === 0) return { text: "due today", overdue: false };
  if (days === 1) return { text: "due tomorrow", overdue: false };
  if (days <= 21) return { text: `in ${days} days`, overdue: false };
  return { text: `in ${Math.round(days / 7)} weeks`, overdue: false };
}

type SavedItem = { status: ItemStatus; horizon: Horizon; target?: string };
type RoadmapWritePayload = {
  ok?: boolean;
  item?: SavedItem;
  removed?: unknown;
};

function isSavedItem(value: unknown): value is SavedItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SavedItem>;
  return Boolean(
    item.status && Object.hasOwn(STATUS_TONE, item.status)
    && item.horizon && HORIZON_LANES.some(lane => lane.value === item.horizon)
    && (item.target === undefined || typeof item.target === "string"),
  );
}

function isRoadmapWriteSuccess(method: "POST" | "PATCH" | "DELETE", value: RoadmapWritePayload): boolean {
  if (value.ok !== true) return false;
  if (method === "DELETE") return Boolean(value.removed && typeof value.removed === "object");
  return isSavedItem(value.item);
}

async function send(
  method: "POST" | "PATCH" | "DELETE", body: unknown,
): Promise<{ ok: boolean; error?: string; item?: SavedItem }> {
  const result = await checkedDevTeamMutation<RoadmapWritePayload>("/api/portal/dev-team/roadmap", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }, {
    fallback: method === "DELETE" ? "That couldn't be removed." : "That didn't save.",
    validate: value => isRoadmapWriteSuccess(method, value),
  });
  if (!result.ok) return result;

  // The server has the last word — it coerces the horizon to match the status.
  // Handing that back lets the form show what was actually stored instead of
  // sitting on a value that was overruled.
  return { ok: true, item: result.value.item };
}

function TaskDot({ state }: { state: string }) {
  if (state === "done") return <Check size={11} className="text-[color:var(--dev-success)]" />;
  if (state === "doing") return <CircleDot size={11} className="animate-pulse text-[color:var(--dev-info)]" />;
  return <CircleDashed size={11} className="text-[color:var(--dt-faint)]" />;
}

function ItemCard({ item, hue }: { item: RoadmapItemView; hue: string }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<ItemStatus>(item.status);
  const [horizon, setHorizon] = useState<Horizon>(item.horizon);
  const [target, setTarget] = useState(item.target ?? "");
  const router = useRouter();

  const due = dueLabel(item.dueInDays);
  const tone = STATUS_TONE[item.status];
  const unresolved = item.missingPlans.length;

  async function save() {
    setBusy(true); setError("");
    // Picking "Shipped" as the horizon MEANS shipping it. Posting the horizon
    // on its own got silently overruled — the server forces the horizon back to
    // Now unless the status says shipped, so the card jumped to the Now lane
    // with a 200 and no explanation.
    const nextStatus: ItemStatus = horizon === "shipped" ? "shipped" : status;
    const result = await send("PATCH", { id: item.id, status: nextStatus, horizon, target });
    setBusy(false);
    if (!result.ok) { setError(result.error ?? ""); return; }
    // Mirror what was actually stored so the form never re-sends a rejected value.
    if (result.item?.status) setStatus(result.item.status);
    if (result.item?.horizon) setHorizon(result.item.horizon);
    if (result.item) setTarget(result.item.target ?? "");
    setEditing(false);
    router.refresh();
  }

  // Two taps to remove — the item is markdown, so an accidental delete costs
  // retyping it rather than a lost file, but it is still Ed's thinking.
  async function remove() {
    if (!confirming) { setConfirming(true); return; }
    setBusy(true); setError("");
    const result = await send("DELETE", { id: item.id });
    setBusy(false);
    if (!result.ok) { setError(result.error ?? ""); return; }
    setConfirming(false);
    router.refresh();
  }

  return (
    <li className="relative pl-6">
      {/* The rail dot — the item's place on the line. */}
      <span
        aria-hidden
        className="absolute left-0 top-4 h-2.5 w-2.5 rounded-full ring-4"
        style={{ background: hue, ["--tw-ring-color" as string]: "var(--dt-surface)" }}
      />
      <div
        className="group rounded-2xl border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-16px_rgba(0,0,0,0.28)]"
        style={{ ["--a-line" as string]: hue }}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1 text-left font-medium text-[color:var(--dt-ink)] transition-colors hover:text-[color:var(--dev-success)]"
              >
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {item.title}
              </button>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tone.chip}`}>{tone.label}</span>
              {item.size ? (
                <span className="rounded-full bg-[color:var(--dt-hairline)] px-2 py-0.5 text-[10px] text-[color:var(--dt-faint)]">
                  {item.size}
                </span>
              ) : null}
              {item.workers.map(w => (
                <span key={w} className="inline-flex items-center gap-1 text-[11px] text-[color:var(--dev-info)]">
                  <CircleDot size={10} className="animate-pulse" />{w}
                </span>
              ))}
              {item.workers.length === 0 && item.owner ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-[color:var(--dt-faint)]">
                  <UserRound size={10} />{item.owner}
                </span>
              ) : null}
            </div>
            {item.why ? (
              <p className="mt-1 text-xs leading-snug text-[color:var(--dt-muted)]">{item.why}</p>
            ) : null}
          </div>

          <div className="shrink-0 text-right">
            {item.target ? (
              <div className={`inline-flex items-center gap-1 text-[11px] ${due?.overdue ? "text-[color:var(--dev-danger)]" : "text-[color:var(--dt-faint)]"}`}>
                <CalendarClock size={11} />
                {fmtTarget(item.target)}
              </div>
            ) : null}
            {due ? (
              <div className={`text-[10px] ${due.overdue ? "font-medium text-[color:var(--dev-danger)]" : "text-[color:var(--dt-faint)]"}`}>
                {due.text}
              </div>
            ) : null}
            {item.shippedOn ? (
              <div className="text-[10px] text-[color:var(--dev-success)]">shipped {fmtTarget(item.shippedOn)}</div>
            ) : null}
          </div>
        </div>

        {/* Progress — computed from the tasks under this item's plans.
            Not shown once an item has shipped: the plan files rarely go back
            and tick every phase, so a shipped item would show "0/6 tasks" and
            look broken. The shipped date is the honest signal there.

            A plan name that matches no file contributes 0/0, so the bar would
            read 100% with a whole slice of the outcome unaccounted for. Rather
            than draw a full green bar it says so — on the COLLAPSED card, where
            the old "no such plan file" warning was buried inside the expanded
            panel and so was never seen. */}
        {item.status !== "shipped" && (item.total > 0 || unresolved > 0) ? (
          <div className="mt-3 flex items-center gap-2">
            {unresolved === 0 ? (
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-[color:var(--dt-hairline)]">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${item.pct}%`, background: hue }}
                />
              </div>
            ) : (
              <span
                className="inline-flex min-w-0 flex-1 items-center gap-1 text-[10px] font-medium text-[color:var(--dev-warning)]"
                title={`Not found: ${item.missingPlans.join(", ")}`}
              >
                <AlertTriangle size={10} className="shrink-0" />
                <span className="truncate">
                  {unresolved === 1
                    ? `${item.missingPlans[0]} — no plan file, so its work isn't counted`
                    : `${unresolved} plans not found — their work isn't counted`}
                </span>
              </span>
            )}
            {item.total > 0 ? (
              <span className="shrink-0 text-[10px] tabular-nums text-[color:var(--dt-faint)]">
                {item.done}/{item.total} tasks
              </span>
            ) : null}
          </div>
        ) : null}

        {open ? (
          <div className="mt-3 border-t border-[color:var(--dt-hairline)] pt-3">
            {item.notes ? (
              <p className="mb-3 whitespace-pre-wrap text-xs leading-relaxed text-[color:var(--dt-muted)]">{item.notes}</p>
            ) : null}

            {item.planLinks.length === 0 ? (
              <p className="text-xs text-[color:var(--dt-faint)]">
                No plan yet — this is still just an outcome. Write one from{" "}
                <Link href="/portal/dev-team/plans/new" className="text-[color:var(--dev-success)] hover:underline">Write a plan</Link>{" "}
                and add its name here.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {item.planLinks.map(plan => (
                  <li key={plan.name}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      {plan.relPath ? (
                        <Link
                          href={`/portal/dev-team/library?doc=${encodeURIComponent(plan.relPath)}`}
                          className="text-xs font-medium text-[color:var(--dt-ink)] hover:text-[color:var(--dev-success)]"
                        >
                          {plan.title}
                        </Link>
                      ) : (
                        <span className="text-xs font-medium text-[color:var(--dev-danger)]">{plan.name} — no such plan file</span>
                      )}
                      <span className="text-[10px] tabular-nums text-[color:var(--dt-faint)]">
                        {plan.total > 0 ? `${plan.done}/${plan.total} phases` : "no phases"}
                      </span>
                    </div>
                    {plan.tasks.length > 0 ? (
                      <ul className="mt-1 flex flex-col gap-0.5 border-l border-[color:var(--dt-hairline)] pl-3">
                        {plan.tasks.map(task => (
                          <li key={task.id} className="flex items-start gap-1.5 text-[11px] leading-snug">
                            <span className="mt-0.5 shrink-0"><TaskDot state={task.state} /></span>
                            <span className={task.state === "done" ? "text-[color:var(--dt-faint)] line-through decoration-1" : "text-[color:var(--dt-muted)]"}>
                              {task.title}
                            </span>
                            {task.worker ? (
                              <span className="shrink-0 text-[10px] text-[color:var(--dev-info)]">· {task.worker}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {editing ? (
                <>
                  <select
                    value={status} onChange={e => setStatus(e.target.value as ItemStatus)}
                    className="rounded-lg border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] px-2 py-1 text-[11px] text-[color:var(--dt-ink)]"
                  >
                    {(Object.keys(STATUS_TONE) as ItemStatus[]).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select
                    value={horizon} onChange={e => setHorizon(e.target.value as Horizon)}
                    className="rounded-lg border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] px-2 py-1 text-[11px] text-[color:var(--dt-ink)]"
                  >
                    {HORIZON_LANES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                  <input
                    value={target} onChange={e => setTarget(e.target.value)}
                    placeholder="2026-09-04 or 2026-09"
                    className="w-40 rounded-lg border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] px-2 py-1 text-[11px] text-[color:var(--dt-ink)] placeholder:text-[color:var(--dt-faint)]"
                  />
                  <button
                    type="button" onClick={save} disabled={busy}
                    className="inline-flex items-center gap-1 rounded-full bg-[color:var(--dev-success)] px-3 py-1 text-[11px] font-medium text-[color:var(--dev-on-accent)] transition-colors hover:bg-[color:var(--dev-success-hover)] disabled:opacity-50"
                  >
                    {busy ? <LoaderCircle size={11} className="animate-spin" /> : <Check size={11} />}
                    Save
                  </button>
                  <button
                    type="button" onClick={() => { setEditing(false); setConfirming(false); setError(""); }}
                    className="text-[11px] text-[color:var(--dt-faint)] hover:text-[color:var(--dt-muted)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button" onClick={remove} disabled={busy}
                    className={`ml-auto inline-flex items-center gap-1 text-[11px] transition-colors disabled:opacity-50 ${confirming ? "font-medium text-[color:var(--dev-danger)]" : "text-[color:var(--dt-faint)] hover:text-[color:var(--dev-danger)]"}`}
                  >
                    <Trash2 size={11} />{confirming ? "Really remove it?" : "Remove"}
                  </button>
                </>
              ) : (
                <button
                  type="button" onClick={() => setEditing(true)}
                  className="text-[11px] text-[color:var(--dt-faint)] transition-colors hover:text-[color:var(--dev-success)]"
                >
                  Change status, horizon or date
                </button>
              )}
            </div>
            {error ? (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-[color:var(--dev-danger)]">
                <AlertTriangle size={11} />{error}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function AddItem({ planNames }: { planNames: string[] }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const [horizon, setHorizon] = useState<Horizon>("someday");
  const [target, setTarget] = useState("");
  const [size, setSize] = useState("");
  const [plans, setPlans] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function add() {
    if (busy || !title.trim()) return;
    setBusy(true); setError("");
    const result = await send("POST", {
      title, why, horizon, target,
      size: size || undefined,
      plans: plans.split(",").map(p => p.trim()).filter(Boolean),
      source: "ed",
    });
    setBusy(false);
    if (!result.ok) { setError(result.error ?? ""); return; }
    setTitle(""); setWhy(""); setTarget(""); setSize(""); setPlans("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 self-start rounded-full border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] px-4 py-2 text-sm font-medium text-[color:var(--dt-ink)] transition-all hover:-translate-y-0.5 hover:border-[color:var(--dev-success)] hover:text-[color:var(--dev-success)]"
      >
        <Plus size={14} /> Add something to the roadmap
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--dt-faint)]">New roadmap item</h2>
      <p className="mt-0.5 mb-3 text-xs text-[color:var(--dt-faint)]">
        An outcome, not a task — what should be true when it&apos;s done.
      </p>
      <div className="flex flex-col gap-2">
        <input
          value={title} autoFocus onChange={e => setTitle(e.target.value)}
          placeholder="What do you want to exist?"
          maxLength={120}
          className="w-full rounded-lg border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] px-3 py-2 text-sm text-[color:var(--dt-ink)] outline-none placeholder:text-[color:var(--dt-faint)] focus:border-[color:var(--dev-success)]"
        />
        <textarea
          value={why} onChange={e => setWhy(e.target.value)}
          placeholder="Why it matters — one line."
          maxLength={400}
          className="min-h-[56px] w-full resize-y rounded-lg border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] px-3 py-2 text-sm text-[color:var(--dt-ink)] outline-none placeholder:text-[color:var(--dt-faint)] focus:border-[color:var(--dev-success)]"
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={horizon} onChange={e => setHorizon(e.target.value as Horizon)}
            className="rounded-lg border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] px-2 py-1.5 text-xs text-[color:var(--dt-ink)]"
          >
            {HORIZON_LANES.map(l => <option key={l.value} value={l.value}>{l.label} — {l.hint}</option>)}
          </select>
          <input
            value={target} onChange={e => setTarget(e.target.value)}
            placeholder="Target: 2026-09-04 or 2026-09"
            className="w-52 rounded-lg border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] px-2 py-1.5 text-xs text-[color:var(--dt-ink)] placeholder:text-[color:var(--dt-faint)]"
          />
          <select
            value={size} onChange={e => setSize(e.target.value)}
            className="rounded-lg border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] px-2 py-1.5 text-xs text-[color:var(--dt-ink)]"
          >
            <option value="">Size…</option>
            <option value="S">S — about a day</option>
            <option value="M">M — a few days</option>
            <option value="L">L — about a week</option>
            <option value="XL">XL — multi-week</option>
          </select>
        </div>
        <input
          value={plans} onChange={e => setPlans(e.target.value)}
          list="dt-plan-names"
          placeholder="Existing plans that deliver it (comma separated) — optional"
          className="w-full rounded-lg border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] px-3 py-2 text-xs text-[color:var(--dt-ink)] outline-none placeholder:text-[color:var(--dt-faint)] focus:border-[color:var(--dev-success)]"
        />
        <datalist id="dt-plan-names">
          {planNames.map(n => <option key={n} value={n} />)}
        </datalist>
        {error ? (
          <p className="flex items-center gap-1 text-xs text-[color:var(--dev-danger)]"><AlertTriangle size={12} />{error}</p>
        ) : null}
        <div className="flex items-center gap-2">
          <button
            type="button" onClick={add} disabled={busy || !title.trim()}
            className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--dev-success)] px-4 py-1.5 text-xs font-medium text-[color:var(--dev-on-accent)] transition-colors hover:bg-[color:var(--dev-success-hover)] disabled:opacity-50"
          >
            {busy ? <LoaderCircle size={12} className="animate-spin" /> : <FilePlus2 size={12} />}
            {busy ? "Adding…" : "Add to roadmap"}
          </button>
          <button
            type="button" onClick={() => { setOpen(false); setError(""); }}
            className="text-xs text-[color:var(--dt-faint)] hover:text-[color:var(--dt-muted)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function RoadmapWorkspace({
  roadmap, planNames,
}: {
  roadmap: Roadmap;
  planNames: string[];
  nowMs: number;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* The schedule — everything with a date, soonest first. This is the bit
          you look at to know what the next fortnight actually holds. */}
      {roadmap.schedule.length > 0 ? (
        <section className="rounded-2xl border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[color:var(--dt-faint)]">
            The schedule
          </h2>
          <ol className="flex flex-col gap-2">
            {roadmap.schedule.map(item => {
              const due = dueLabel(item.dueInDays);
              return (
                <li key={item.id} className="flex items-center gap-3">
                  <span className={`w-24 shrink-0 text-xs tabular-nums ${due?.overdue ? "font-medium text-[color:var(--dev-danger)]" : "text-[color:var(--dt-muted)]"}`}>
                    {fmtTarget(item.target)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-[color:var(--dt-ink)]">{item.title}</span>
                  {/* Same rule as the card: never draw a bar for an item whose
                      plans don't all resolve — 0/0 from a missing plan would
                      read as complete. */}
                  {item.missingPlans.length > 0 ? (
                    <span
                      className="hidden w-28 shrink-0 items-center justify-end gap-1 text-[10px] font-medium text-[color:var(--dev-warning)] sm:flex"
                      title={`Not found: ${item.missingPlans.join(", ")}`}
                    >
                      <AlertTriangle size={10} />
                      {item.missingPlans.length} plan{item.missingPlans.length > 1 ? "s" : ""} missing
                    </span>
                  ) : item.total > 0 ? (
                    <span className="hidden w-28 shrink-0 sm:block">
                      <span className="block h-1 overflow-hidden rounded-full bg-[color:var(--dt-hairline)]">
                        <span className="block h-full rounded-full bg-[color:var(--dev-success)]" style={{ width: `${item.pct}%` }} />
                      </span>
                    </span>
                  ) : null}
                  <span className={`w-28 shrink-0 text-right text-[11px] ${due?.overdue ? "text-[color:var(--dev-danger)]" : "text-[color:var(--dt-faint)]"}`}>
                    {due?.text}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <AddItem planNames={planNames} />

      {HORIZON_LANES.map(lane => {
        const items = roadmap.byHorizon[lane.value];
        return (
          <section key={lane.value}>
            <div className="mb-3 flex items-baseline gap-2 px-1">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: lane.hue }} />
              <h2 className="text-sm font-semibold text-[color:var(--dt-ink)]">{lane.label}</h2>
              <span className="text-xs text-[color:var(--dt-faint)]">{lane.hint}</span>
              <span className="ml-auto text-xs tabular-nums text-[color:var(--dt-faint)]">{items.length}</span>
            </div>
            {items.length === 0 ? (
              <p className="px-1 text-xs text-[color:var(--dt-faint)]">Nothing here yet.</p>
            ) : (
              <ul className="relative flex flex-col gap-3">
                {/* The lane's spine — the line everything hangs off. */}
                <span
                  aria-hidden
                  className="absolute bottom-4 left-[4.5px] top-4 w-px"
                  style={{ background: `color-mix(in srgb, ${lane.hue} 30%, transparent)` }}
                />
                {items.map(item => <ItemCard key={item.id} item={item} hue={lane.hue} />)}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
