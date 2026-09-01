"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, FileSearch, LoaderCircle } from "lucide-react";

import {
  attentionScopeKey,
  isAttentionPlanReads,
  unavailableAttentionPlanReads,
} from "@/lib/inbox/attentionPlanRead";
import type { ReadResult } from "@/lib/readAvailability";
import type { ResolutionEvidence } from "@/lib/inbox/resolutionEvidence";
import { MetricSparkline } from "@/components/attention/MetricSparkline";
import { stepsFor } from "@/lib/inbox/evidenceSteps";

/**
 * The records behind an alert, shown where the alert is.
 *
 * Built as a panel rather than a destination on purpose. Sending somebody to a
 * list to "see the evidence" costs them the queue position they were working
 * and makes them reconstruct why the alert fired; by the time they are back,
 * the reason has gone. Here the records come to them and the queue stays put.
 *
 * Loaded on expand rather than with the queue: pulling the underlying records
 * for every row in a 30-item list would cost far more than it saves, when most
 * rows are never opened.
 */
export function EvidenceCard({
  alertId,
  fallback,
}: {
  alertId: string;
  /**
   * What the row already knows, used when the id does not resolve to a live
   * alert — pipeline signals are generated from leads and invoices, not from
   * the alert list, so a lookup by id finds nothing. Without this they would
   * show "no records" while their details sat on the row above.
   */
  fallback?: { title: string; detail: string; href?: string };
}) {
  return (
    <EvidenceCardForAlert
      key={attentionScopeKey("evidence", alertId)}
      alertId={alertId}
      fallback={fallback}
    />
  );
}

function EvidenceCardForAlert({
  alertId,
  fallback,
}: {
  alertId: string;
  fallback?: { title: string; detail: string; href?: string };
}) {
  const [evidence, setEvidence] = useState<ResolutionEvidence | null>(null);
  const [read, setRead] = useState<ReadResult<ResolutionEvidence | null> | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(
          `/api/portal/attention/plan?alert=${encodeURIComponent(alertId)}`,
          { cache: "no-store" },
        );
        const payload = await response.json() as { ok?: boolean; reads?: unknown; error?: string };
        if (!response.ok || payload.ok !== true || !isAttentionPlanReads(payload.reads)) {
          throw new Error(payload.error || "Alert records could not be read.");
        }
        if (cancelled) return;
        const next = payload.reads.evidence;
        setRead(next);
        // A failed retry changes availability only. The last confirmed record
        // remains visible and is explicitly labelled as retained below.
        if (next.available) setEvidence(next.data);
      } catch {
        if (!cancelled) {
          setRead(unavailableAttentionPlanReads(
            "The records behind this alert could not be read. Retry before treating the evidence as empty.",
          ).evidence);
        }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [alertId, retryAttempt]);

  if (!read) {
    return (
      <p className="flex items-center gap-2 px-4 py-3 text-xs text-black/45">
        <LoaderCircle size={13} className="animate-spin" aria-hidden />Loading the records…
      </p>
    );
  }

  const unavailableNotice = !read.available ? (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-l-2 border-amber-600 bg-amber-50 px-3 py-2 text-xs text-amber-950">
      <span>
        {evidence
          ? "The records were not refreshed. The last confirmed evidence remains below and may be stale."
          : read.reason ?? "The records behind this alert were not read."}
      </span>
      <button
        type="button"
        onClick={() => setRetryAttempt(value => value + 1)}
        className="shrink-0 font-semibold underline underline-offset-2"
      >
        Retry records
      </button>
    </div>
  ) : null;

  // Nothing came back for this id. Show what the row itself knows rather than
  // an empty panel — "no records" reads as "nothing is wrong", which is the
  // opposite of what an action means.
  if (!evidence && fallback) {
    return (
      <div className="grid gap-2 px-4 py-3">
        {unavailableNotice}
        <p className="text-xs font-semibold text-black/60">{fallback.title}</p>
        <p className="text-xs leading-5 text-black/60">{fallback.detail}</p>
        <ol className="grid gap-1.5">
          {stepsFor(alertId, { href: fallback.href }).map((step, index) => (
            <li key={index} className="flex gap-2 text-xs leading-5 text-black/70">
              <span aria-hidden className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-black/[0.07] text-[10px] font-semibold text-black/55">{index + 1}</span>
              {step.label}
            </li>
          ))}
        </ol>
        {fallback.href ? (
          <Link href={fallback.href} className="inline-flex w-fit items-center gap-1 text-[11px] font-semibold text-black/55 hover:text-black">
            Open the source <ArrowUpRight size={12} aria-hidden />
          </Link>
        ) : null}
      </div>
    );
  }

  if (!evidence && !read.available) {
    return <div className="px-4 py-3">{unavailableNotice}</div>;
  }

  if (!evidence) {
    return (
      <p className="px-4 py-3 text-xs text-black/45">
        No inline records for this one yet — open Evidence to inspect it at source.
      </p>
    );
  }

  if (evidence.unavailable) {
    return (
      <div className="grid gap-2 px-4 py-3">
        {unavailableNotice}
        <p className="text-xs font-semibold text-amber-900">{evidence.summary}</p>
        <p className="mt-1 text-xs text-black/50">{evidence.unavailable}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 px-4 py-3" data-testid="evidence-card">
      {unavailableNotice}
      <p className="flex items-center gap-1.5 text-xs font-semibold text-black/60">
        <FileSearch size={13} className="text-black/35" aria-hidden />
        {evidence.summary}
      </p>

      {/* What to do, before the data rather than after it. The operator's
          first question is "what do I do", not "what are the numbers" — the
          numbers are how they check the instruction is sensible. */}
      {evidence.steps?.length ? (
        <ol className="grid gap-1.5 rounded-md border border-black/10 bg-white p-3" data-testid="evidence-steps">
          <li className="text-[11px] font-semibold uppercase tracking-wide text-black/45">Do this</li>
          {evidence.steps.map((step, index) => (
            <li key={index} className="flex gap-2.5 text-xs leading-5">
              <span
                aria-hidden
                className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${
                  step.done ? "bg-emerald-100 text-emerald-700" : "bg-black/[0.07] text-black/55"
                }`}
              >
                {index + 1}
              </span>
              {step.href ? (
                <Link href={step.href} className={`min-w-0 underline decoration-black/20 underline-offset-2 ${step.done ? "text-black/35 line-through" : "text-black/75"}`}>
                  {step.label}
                </Link>
              ) : (
                <span className={`min-w-0 ${step.done ? "text-black/35 line-through" : "text-black/75"}`}>
                  {step.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      ) : null}

      {evidence.records.map(record => (
        <article key={record.id} className="rounded-md border border-black/10 bg-black/[0.015] p-3">
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <strong className="text-sm text-black/82">{record.label}</strong>
            {record.meta ? <span className="text-[11px] text-black/45">{record.meta}</span> : null}
          </header>

          {record.series ? <MetricSparkline series={record.series} /> : null}

          <dl className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {record.fields.map(field => (
              <div key={field.label} className="flex min-w-0 gap-2 text-xs">
                <dt className="shrink-0 text-black/40">{field.label}</dt>
                <dd
                  className={`min-w-0 break-words ${
                    // The figure that actually breached, not just another row.
                    field.emphasis ? "font-semibold text-amber-800" : "text-black/70"
                  }`}
                >
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>

          {record.href ? (
            <Link
              href={record.href}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-black/55 hover:text-black"
            >
              Open the full record <ArrowUpRight size={12} aria-hidden />
            </Link>
          ) : null}
        </article>
      ))}

      {!evidence.records.length ? (
        <p className="text-xs text-black/45">
          Nothing is outstanding on this one any more — it should clear on the next check.
        </p>
      ) : null}
    </div>
  );
}
