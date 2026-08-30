"use client";

// Lead helpers shared between the pipeline workspace and the views split out of
// it — the value-level counterpart to `_leadTypes.ts`.
//
// Created 2026-08-29 while extracting `DetailsEditor`. A parallel analysis
// proved these three are the only symbols the extracted block needs that the
// PARENT also still uses:
//
//   • `LeadTimingTrace` — rendered by DetailsEditor and by the workspace's own
//     lead panel;
//   • `splitTags`       — called by DetailsEditor and twice by the workspace;
//   • `sourceLabel`     — called four ways across the file.
//
// Everything else DetailsEditor touches is exclusively its own and travelled
// with it. Importing these back from the parent would be a circular import; a
// third module is the same resolution `_radarShared.ts` used for the Command
// Centre.

import { formatElapsed, leadTimingSnapshot } from "@/lib/enquiries/leadTiming";
import { formatUkDateTime } from "@/lib/shared/formatDateTime";
import type { LeadTimingSnapshot } from "@/lib/enquiries/leadTiming";

import type { LeadJourneyEventView, LeadView } from "./_leadTypes";

export function sourceLabel(source: string): string {
  return source.replace(/[-_]+/g, " ").replace(/\b\w/g, character => character.toUpperCase());
}

export function LeadTimingTrace({
  lead,
  events,
  clock,
}: {
  lead: Pick<LeadView, "capturedAt" | "lastEnquiryAt" | "lastEnquiryRespondedAt" | "enquiryCount" | "firstContactedAt" | "lastContactedAt" | "currentStageId" | "stageEnteredAt" | "convertedAt">;
  events: LeadJourneyEventView[];
  clock: number;
}) {
  const timing = leadTimingSnapshot(lead, clock);
  return (
    <section className="mb-3 border-y border-black/10 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-[10px] font-semibold uppercase tracking-wide text-black/35">Time and journey trace</p><p className="mt-1 text-xs text-black/45">Every recorded wait, response and stage change stays attached to this lead.</p></div>
        <span className="rounded-full bg-black/[0.05] px-2.5 py-1 text-[10px] font-medium text-black/55">{lead.enquiryCount ?? 0} enquir{(lead.enquiryCount ?? 0) === 1 ? "y" : "ies"}</span>
      </div>
      <dl className="mt-4 grid gap-px overflow-hidden rounded-md border border-black/10 bg-black/10 sm:grid-cols-4">
        <TimingDatum label="Total journey" value={formatElapsed(timing.journeyAgeMs)} />
        <TimingDatum label="First response" value={timing.firstResponseMs === undefined ? "Waiting" : formatElapsed(timing.firstResponseMs)} />
        <TimingDatum label="Current stage" value={formatElapsed(timing.stageAgeMs)} />
        <TimingDatum label="Since last contact" value={lead.lastContactedAt === undefined ? "No contact" : formatElapsed(timing.followUpWaitMs ?? 0)} />
      </dl>
      <div className="mt-4 max-h-48 overflow-y-auto border-l border-black/15 pl-4">
        {[...events].sort((a, b) => b.at - a.at).map(event => (
          <div key={event.id} className="relative pb-4 last:pb-0">
            <span className="absolute -left-[19px] top-1 size-2 rounded-full border border-white bg-brand" />
            <div className="flex flex-wrap items-baseline justify-between gap-2"><strong className="text-xs font-semibold text-black/68">{journeyEventLabel(event)}</strong><time className="text-[10px] text-black/35">{formatUkDateTime(event.at)} · {formatElapsed(clock - event.at)} ago</time></div>
            <p className="mt-1 text-[11px] leading-4 text-black/45">{journeyEventDetail(event)}</p>
          </div>
        ))}
        {!events.length ? <p className="text-xs text-black/40">Timing begins with this lead&apos;s capture record.</p> : null}
      </div>
    </section>
  );
}

export function splitTags(value: string): string[] {
  return value.split(",").map(tag => tag.trim()).filter(Boolean);
}

function TimingDatum({ label, value }: { label: string; value: string }) {
  return <div className="bg-white px-3 py-3"><dt className="text-[10px] text-black/38">{label}</dt><dd className="mt-1 text-sm font-semibold tabular-nums text-black/72">{value}</dd></div>;
}

function journeyEventLabel(event: LeadJourneyEventView): string {
  if (event.type === "enquiry-received") return "Enquiry received";
  if (event.type === "lead-captured") return "Lead captured";
  if (event.type === "contact-recorded") return "Contact recorded";
  if (event.type === "stage-changed") return `Entered ${stageLabel(event.toStage)}`;
  if (event.type === "meeting-scheduled") return "Meeting scheduled";
  // Before the archive/restore events existed this fell through to "Converted
  // to client" for anything unrecognised, so a new event type silently claimed
  // the most consequential label on the screen.
  if (event.type === "archived") return "Archived";
  if (event.type === "restored") return "Restored to the board";
  if (event.type === "converted") return "Converted to client";
  return "Recorded";
}

function journeyEventDetail(event: LeadJourneyEventView): string {
  if (event.type === "stage-changed") return event.fromStage ? `${stageLabel(event.fromStage)} to ${stageLabel(event.toStage)}` : `Started in ${stageLabel(event.toStage)}`;
  if (event.type === "contact-recorded") return [event.channel && stageLabel(event.channel), event.outcome && stageLabel(event.outcome), event.note].filter(Boolean).join(" · ") || "Contact recorded.";
  if (event.type === "enquiry-received" || event.type === "lead-captured") return [event.source && sourceLabel(event.source), event.enquiryId && `Submission ${event.enquiryId}`].filter(Boolean).join(" · ") || "Journey started.";
  if (event.type === "meeting-scheduled" && event.scheduledFor) return `Meeting booked for ${formatUkDateTime(event.scheduledFor)}.`;
  if (event.type === "archived") return "Taken off the active board. The record and its history were kept.";
  if (event.type === "restored") return "Put back on the active board with its history intact.";
  return event.note || (event.clientId ? `Client ${event.clientId}` : "Recorded in the journey history.");
}

export function stageLabel(value?: string): string {
  if (!value) return "stage";
  return value.replaceAll("-", " ").replace(/\b\w/g, character => character.toUpperCase());
}
