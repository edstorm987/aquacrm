"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, CheckCircle2, ChevronDown, Info, Sparkles, Target, X } from "lucide-react";

import {
  RESOLUTION_FOCUS_PARAM,
  RESOLUTION_PARAM,
  isResolutionFocus,
  resolutionCopy,
  resolutionProgress,
  withResolutionContext,
  type ResolutionPlan,
} from "@/lib/inbox/resolutionContext";
import type { ResolutionExplain } from "@/lib/inbox/resolutionExplain";

/**
 * The "what am I doing here?" bar, shown app-wide.
 *
 * Appears on any page opened from a Resolve click and states the task in plain
 * words. Pressing Resolve navigates you away from the alert that explains
 * itself, so without this the destination is context-free — you arrive at a
 * record with no memory of why.
 *
 * When the job spans several places it also shows the checklist and a link to
 * the next step, because the failure mode there is worse: you do step one, the
 * alert keeps firing, and the system looks broken.
 *
 * Clears three ways, none of them trapping: the X, automatically once the work
 * is done, or by navigating anywhere without the parameter.
 */
export function ResolutionBanner({ subject, done }: { subject?: string; done?: boolean }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const alertId = params.get(RESOLUTION_PARAM);
  const rawFocus = params.get(RESOLUTION_FOCUS_PARAM);
  const focus = isResolutionFocus(rawFocus) ? rawFocus : undefined;

  const [dismissed, setDismissed] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [plan, setPlan] = useState<ResolutionPlan | null>(null);
  const [explain, setExplain] = useState<ResolutionExplain | null>(null);
  // Whether this page actually has the control the focus promised. Checked in
  // the DOM because only the page knows, and it may render late.
  const [hasTarget, setHasTarget] = useState<boolean | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);

  const clear = useCallback(() => {
    setDismissed(true);
    const next = new URLSearchParams(params.toString());
    next.delete(RESOLUTION_PARAM);
    next.delete(RESOLUTION_FOCUS_PARAM);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  // Fetch the checklist, if this alert has one, and keep it current.
  //
  // Polled rather than pushed: the operator completes steps through whatever
  // controls the page happens to own, and requiring every one of those to
  // notify the banner would mean touching every page in the app — exactly the
  // coupling this component exists to avoid. The poll is cheap, stops once the
  // job is done, and only runs while a resolution is actually in progress.
  useEffect(() => {
    if (!alertId || dismissed) return;
    let cancelled = false;

    const load = () => fetch(
      `/api/portal/attention/plan?alert=${encodeURIComponent(alertId)}`,
      { cache: "no-store" },
    )
      .then(response => response.json())
      .then((payload: { plan?: ResolutionPlan | null; explain?: ResolutionExplain | null }) => {
        if (cancelled) return;
        setPlan(payload.plan ?? null);
        setExplain(payload.explain ?? null);
      })
      // A missing plan is not an error — the bar still names the task.
      .catch(() => { if (!cancelled) setPlan(null); });

    void load();
    const poll = setInterval(() => { void load(); }, 3000);
    return () => { cancelled = true; clearInterval(poll); };
  }, [alertId, dismissed, done]);

  // Give streamed content a moment before concluding there is nothing to
  // press — declaring "no control here" against a half-rendered page would be
  // wrong more often than right.
  useEffect(() => {
    if (!alertId) return;
    let cancelled = false;
    const check = (remaining: number) => {
      if (cancelled) return;
      const found = Boolean(document.querySelector("[data-resolution-focus]"));
      if (found || remaining === 0) { setHasTarget(found); return; }
      setTimeout(() => check(remaining - 1), 250);
    };
    check(8);
    return () => { cancelled = true; };
  }, [alertId, focus, pathname]);

  useEffect(() => {
    if ((hasTarget === false || explain?.kind === "judgement") && explain && !autoOpened) {
      setShowDetail(true);
      setAutoOpened(true);
    }
  }, [hasTarget, explain, autoOpened]);

  const progress = resolutionProgress(plan);
  // A multi-step job is finished only when every step is; a single-step one
  // when the page says so.
  const finished = plan ? progress.allDone : Boolean(done);

  useEffect(() => {
    if (!finished || !alertId || dismissed) return;
    setShowDone(true);
    const timer = setTimeout(() => clear(), 2200);
    return () => clearTimeout(timer);
  }, [finished, alertId, dismissed, clear]);

  if (!alertId || dismissed) return null;

  const copy = resolutionCopy(focus, subject);
  const heading = showDone
    ? "Done — that item is resolved."
    : plan?.title ?? copy.task;

  // Where the next step happens, carrying the context onward so the bar
  // survives the hop.
  const nextHref = progress.current
    ? withResolutionContext(progress.current.href, {
        alertId,
        focus: progress.current.focus,
      })
    : null;
  const nextIsElsewhere = Boolean(
    progress.current && !progress.current.href.split("?")[0].startsWith(pathname),
  );

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="resolution-banner"
      className={`sticky top-0 z-30 -mx-4 mb-4 border-b px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 ${
        showDone ? "border-emerald-200 bg-emerald-50" : "border-amber-300 bg-amber-100/90"
      }`}
    >
      <div className="flex items-start gap-3">
        {showDone
          ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden />
          : <Target size={18} className="mt-0.5 shrink-0 text-amber-800" aria-hidden />}

        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${showDone ? "text-emerald-900" : "text-amber-950"}`}>
            {heading}
            {!showDone && progress.total > 1 ? (
              <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                Step {Math.min(progress.completed + 1, progress.total)} of {progress.total}
              </span>
            ) : null}
          </p>
          {!showDone ? (
            <p className="mt-0.5 text-xs text-amber-900/80">
              {progress.current
                ? progress.current.label
                : explain?.kind === "judgement"
                  // No control exists and none should: this is a decision.
                  ? "This is a judgement call, not a task — there is nothing here to press."
                  : hasTarget === false
                    // Do not promise a highlight that does not exist.
                    ? "This one is handled off-screen — open the details for what will clear it."
                    : copy.hint}
            </p>
          ) : null}
        </div>

        {/* Walk the sequence without having to work out where each step lives.
            Labelled by what it does: "Go there" when the next step is on
            another page, "Next" when it is on this one. */}
        {!showDone && nextHref && progress.total > 1 ? (
          <Link
            href={nextHref}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-amber-900 px-3 text-sm font-semibold text-white hover:bg-amber-950"
          >
            {nextIsElsewhere ? "Go there" : "Next"} <ArrowRight size={14} aria-hidden />
          </Link>
        ) : null}

        <button
          type="button"
          onClick={clear}
          aria-label="Dismiss this reminder"
          title="Dismiss"
          className={`shrink-0 rounded-md p-1.5 ${
            showDone ? "text-emerald-800 hover:bg-emerald-100" : "text-amber-900 hover:bg-amber-200/70"
          }`}
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      {/* When there is nothing to press, give the operator what they need to
          act away from the screen — above all, what will make it stop firing.
          An alert with no button and no explanation gets dismissed, not
          dealt with. */}
      {!showDone && explain ? (
        <div className="mt-2.5 pl-7">
          <button
            type="button"
            onClick={() => setShowDetail(value => !value)}
            aria-expanded={showDetail}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-950 underline underline-offset-2"
          >
            <Info size={13} aria-hidden />
            {showDetail ? "Hide details" : "What we know"}
            <ChevronDown size={13} aria-hidden className={showDetail ? "rotate-180" : ""} />
          </button>

          {showDetail ? (
            <div className="mt-2 grid gap-2 rounded-md border border-amber-300/70 bg-amber-50/80 p-3">
              {explain.plainMeaning ? (
                <p className="rounded bg-white/70 px-2.5 py-1.5 text-xs leading-5 text-amber-950">
                  <strong className="font-semibold">In plain terms:</strong> {explain.plainMeaning}
                </p>
              ) : null}

              {explain.weakEvidence ? (
                <p className="rounded border-l-2 border-amber-700 bg-amber-100/70 px-2.5 py-1.5 text-xs leading-5 text-amber-950">
                  <strong className="font-semibold">Worth knowing:</strong> {explain.weakEvidence}
                </p>
              ) : null}

              <ul className="grid gap-1 text-xs leading-5 text-amber-950/85">
                {explain.evidence.map((line, index) => (
                  <li key={index} className="flex gap-2">
                    <span aria-hidden className="text-amber-700">·</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              {explain.clearsWhen ? (
                <p className="rounded border-l-2 border-amber-600 bg-white/70 px-2.5 py-1.5 text-xs leading-5 text-amber-950">
                  <strong className="font-semibold">Clears when:</strong> {explain.clearsWhen}
                </p>
              ) : explain.kind === "judgement" ? (
                <p className="rounded border-l-2 border-amber-600 bg-white/70 px-2.5 py-1.5 text-xs leading-5 text-amber-950">
                  <strong className="font-semibold">No fixed clearance.</strong> Nothing you press
                  resolves this — it changes when the business does, or when you decide it does not
                  matter and dismiss it.
                </p>
              ) : null}

              {/* Escalation for anything that does not make sense. The
                  question is loaded into the composer, not sent — spending a
                  request on the operator's behalf is not ours to decide. */}
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("aqua-advisor:open", {
                  detail: {
                    question: `Explain this alert in plain terms and tell me whether it is worth acting on.\n\n`
                      + `Alert: ${explain.title}\n`
                      + `Detail: ${explain.detail}\n`
                      + (explain.plainMeaning ? `What Aqua thinks it means: ${explain.plainMeaning}\n` : "")
                      + (explain.weakEvidence ? `Caveat: ${explain.weakEvidence}\n` : "")
                      + `\nWhat would you do about it, and what would you ignore?`,
                  },
                }))}
                className="inline-flex h-9 w-fit items-center gap-1.5 rounded-md border border-amber-700/40 bg-white px-3 text-xs font-semibold text-amber-900 hover:bg-amber-50"
              >
                <Sparkles size={13} aria-hidden /> Ask the Advisor about this
              </button>

              {explain.records.length ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {explain.records.map(record => (
                    <Link
                      key={record.href}
                      href={record.href}
                      className="text-xs font-medium text-amber-900 underline underline-offset-2"
                    >
                      {record.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* The checklist, so a job spanning several places is visibly a job
          spanning several places rather than an alert that will not clear. */}
      {!showDone && progress.total > 1 ? (
        <ol className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-7">
          {plan?.steps.map(step => (
            <li
              key={step.id}
              aria-current={step.id === progress.current?.id ? "step" : undefined}
              className={`flex items-center gap-1.5 text-xs ${
                step.done
                  ? "text-amber-900/45 line-through"
                  : step.id === progress.current?.id
                    ? "font-semibold text-amber-950"
                    : "text-amber-900/70"
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  step.done
                    ? "border-amber-700/40 bg-amber-700/20"
                    : "border-amber-700/50"
                }`}
              >
                {step.done ? <Check size={10} className="text-amber-900" aria-hidden /> : null}
              </span>
              {step.label}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
