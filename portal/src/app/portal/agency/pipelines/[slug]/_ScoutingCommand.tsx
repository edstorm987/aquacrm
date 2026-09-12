"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CallButton, CallLinePicker } from "@/components/telephony/CallControls";
import { EmailButton, EmailLinePicker } from "@/components/telephony/EmailControls";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Binoculars,
  CalendarClock,
  CheckCircle2,
  CircleCheck,
  ClipboardList,
  Columns3,
  ExternalLink,
  FileText,
  Globe2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  SkipForward,
  Tag,
  Flame,
  Target,
} from "lucide-react";
import { formatElapsed } from "@/lib/enquiries/leadTiming";
import { formatUkDate } from "@/lib/shared/formatDateTime";
import { GoogleMapsAttribution } from "@/components/attribution/GoogleMapsAttribution";
import { prospectVisibleInWorkspace } from "@/lib/sales/prospectWorkflow";
import type { ProspectOutreachReceipt } from "@/lib/telephony/prospectOutreachReceipt";

export type ProspectQualificationState = "unreviewed" | "researching" | "ready" | "outreach" | "engaged" | "not-now";
export type ProspectOutreachChannel = "call" | "email" | "sms" | "whatsapp" | "dm" | "in-person";
export type ProspectOutreachOutcome = "attempted" | "no-answer" | "left-message" | "sent" | "replied" | "interested" | "not-now" | "not-fit" | "wrong-contact" | "meeting-booked";
export type ProspectInspectionCheck = "business-verified" | "contact-route-verified" | "opportunity-confirmed" | "decision-maker-identified" | "timing-understood";
export type ProspectFollowUpStatus = "scheduled" | "completed" | "skipped";
export type ProspectWorkspaceMode = "researching" | "prospecting";

export interface ScoutingProspectView {
  id: string;
  status: "scouting" | "qualified" | "dismissed";
  dismissedAt?: number;
  dismissedActorLabel?: string;
  restoredAt?: number;
  restoredActorLabel?: string;
  qualifiedLeadId?: string;
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  /** Durable Google identifier; Google profile content itself is not cached in the dossier. */
  googlePlaceId?: string;
  googleMapsUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  linkedinUrl?: string;
  niche?: string;
  tags: string[];
  source: string;
  foundAt?: string;
  opportunity?: string;
  researchNotes?: string;
  nextStep?: string;
  qualificationState: ProspectQualificationState;
  fitScore?: number;
  preferredChannel?: ProspectOutreachChannel;
  doNotContact?: boolean;
  nextContactAt?: number;
  nextContactReason?: string;
  lastContactedAt?: number;
  inspectionChecks: ProspectInspectionCheck[];
  inspectedAt?: number;
  researchUpdatedAt?: number;
  researchActorLabel?: string;
  followUps: Array<{
    id: string;
    createdAt: number;
    dueAt: number;
    reason: string;
    channel?: ProspectOutreachChannel;
    status: ProspectFollowUpStatus;
    resolvedAt?: number;
    resolutionNote?: string;
    actorLabel?: string;
    resolverActorLabel?: string;
  }>;
  outreachAttempts: Array<{
    id: string;
    at: number;
    channel: ProspectOutreachChannel;
    outcome: ProspectOutreachOutcome;
    note?: string;
    followUpAt?: number;
    followUpReason?: string;
    actorLabel?: string;
    finalisedAt?: number;
    finaliserActorLabel?: string;
  }>;
  notes: Array<{ id: string; at: number; body: string; actorLabel?: string }>;
  capturedAt: number;
  updatedAt: number;
}

type Queue = "due" | "all" | "new" | "untouched" | "research" | "outreach" | "engaged" | "parked";
type ScoutingView = "research" | "power-dialler" | "email" | "pipeline";

const REQUIRED_INSPECTION_CHECKS: ProspectInspectionCheck[] = ["business-verified", "contact-route-verified", "opportunity-confirmed"];
const INSPECTION_LABELS: Record<ProspectInspectionCheck, { label: string; detail: string }> = {
  "business-verified": { label: "Business verified", detail: "Identity, trading status, and location make sense." },
  "contact-route-verified": { label: "Contact route verified", detail: "At least one route reaches the right business." },
  "opportunity-confirmed": { label: "Opportunity confirmed", detail: "There is a specific, evidence-backed reason to approach." },
  "decision-maker-identified": { label: "Decision maker identified", detail: "The owner or responsible person is known." },
  "timing-understood": { label: "Timing understood", detail: "A reason to act now or recontact window is recorded." },
};

const CHANNEL_LABELS: Record<ProspectOutreachChannel, string> = {
  call: "Call",
  email: "Email",
  sms: "Text",
  whatsapp: "WhatsApp",
  dm: "Social DM",
  "in-person": "In person",
};

const OUTCOME_LABELS: Record<ProspectOutreachOutcome, string> = {
  attempted: "Attempt logged",
  "no-answer": "No answer",
  "left-message": "Message left",
  sent: "Message sent",
  replied: "Replied",
  interested: "Interested",
  "not-now": "Not now",
  "not-fit": "Not a fit",
  "wrong-contact": "Wrong contact",
  "meeting-booked": "Meeting booked",
};

const QUEUES: Array<{ id: Queue; label: string }> = [
  { id: "due", label: "Due now" },
  { id: "all", label: "All active" },
  { id: "new", label: "New" },
  { id: "untouched", label: "Untouched" },
  { id: "research", label: "In progress" },
  { id: "outreach", label: "Outreach" },
  { id: "engaged", label: "Engaged" },
  { id: "parked", label: "Parked" },
];

export interface ScoutingQuotaViewModel {
  quotas: Array<{
    entryId: string;
    title: string;
    metric: "prospects-scouted" | "calls-made" | "emails-sent" | "leads-qualified" | "clients-converted";
    recurrence: "daily" | "weekly";
    target: number;
    current: number;
    streakDays: number;
  }>;
  streakDays: number;
}

export function ScoutingCommand({
  mode,
  googleMapsEmbedApiKey,
  prospects,
  focusedProspectId,
  initialOutreachView,
  referenceNow,
  quota,
  quotaWritable,
  canManage,
  canQualify,
  onEdit,
  onQualify,
  onDismiss,
}: {
  mode: ProspectWorkspaceMode;
  googleMapsEmbedApiKey: string;
  prospects: ScoutingProspectView[];
  /** A just-created record to reveal after the refreshed server list arrives. */
  focusedProspectId?: string;
  initialOutreachView?: "power-dialler" | "email" | "pipeline";
  referenceNow: number;
  /** Self-set targets with server-derived progress. Absent = none set yet. */
  quota?: ScoutingQuotaViewModel;
  quotaWritable: boolean;
  canManage: boolean;
  canQualify: boolean;
  onEdit: (prospect: ScoutingProspectView) => void;
  onQualify: (prospect: ScoutingProspectView) => void;
  onDismiss: (prospect: ScoutingProspectView) => void;
}) {
  const router = useRouter();
  const workspaceProspects = useMemo(
    () => prospects.filter(item => prospectVisibleInWorkspace(item.qualificationState, mode)),
    [mode, prospects],
  );
  const visibleQueues = mode === "researching"
    ? QUEUES.filter(item => ["all", "new", "research", "parked"].includes(item.id))
    : QUEUES.filter(item => ["due", "all", "untouched", "outreach", "engaged", "parked"].includes(item.id));
  const [queue, setQueue] = useState<Queue>("all");
  const [view, setView] = useState<ScoutingView>(mode === "researching" ? "research" : initialOutreachView ?? "power-dialler");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(
    workspaceProspects.find(item => !item.doNotContact)?.id
      ?? workspaceProspects[0]?.id
      ?? "",
  );
  const [channel, setChannel] = useState<ProspectOutreachChannel>("call");
  const [outcome, setOutcome] = useState<ProspectOutreachOutcome>("attempted");
  const [attemptNote, setAttemptNote] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [followUpReason, setFollowUpReason] = useState("");
  const [fieldNote, setFieldNote] = useState("");
  const [inspectionChecks, setInspectionChecks] = useState<ProspectInspectionCheck[]>(workspaceProspects[0]?.inspectionChecks ?? []);
  const [readyForNext, setReadyForNext] = useState(false);
  const [activeAttemptId, setActiveAttemptId] = useState<string | undefined>();
  const [heldProviderReceipt, setHeldProviderReceipt] = useState(false);
  const [providerPending, setProviderPending] = useState<{ prospectId: string; channel: "call" | "email" } | null>(null);
  const [busy, setBusy] = useState<"outreach" | "note" | "follow-up" | "inspection" | "resolve" | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const dossierRef = useRef<HTMLDivElement>(null);
  const appliedFocusId = useRef("");
  const selectedProspectIdRef = useRef("");

  const now = referenceNow;
  const dueCount = workspaceProspects.filter(item => !item.doNotContact && item.nextContactAt !== undefined && item.nextContactAt <= now).length;
  const overdueCount = workspaceProspects.filter(item => !item.doNotContact && item.nextContactAt !== undefined && item.nextContactAt < now - 86_400_000).length;
  const untouchedCount = workspaceProspects.filter(item => item.outreachAttempts.length === 0 && !item.doNotContact).length;
  const engagedCount = workspaceProspects.filter(item => item.qualificationState === "engaged").length;
  const readyCount = workspaceProspects.filter(item => item.qualificationState === "ready" || (item.fitScore ?? 0) >= 70).length;

  const queueCounts = useMemo<Record<Queue, number>>(() => ({
    due: dueCount,
    all: workspaceProspects.filter(item => !item.doNotContact).length,
    new: workspaceProspects.filter(item => item.qualificationState === "unreviewed" && !item.doNotContact).length,
    untouched: untouchedCount,
    research: workspaceProspects.filter(item => item.qualificationState === "researching" && !item.doNotContact).length,
    outreach: workspaceProspects.filter(item => item.qualificationState === "outreach" && !item.doNotContact).length,
    engaged: engagedCount,
    parked: workspaceProspects.filter(item => item.doNotContact || item.qualificationState === "not-now").length,
  }), [dueCount, engagedCount, untouchedCount, workspaceProspects]);

  const visibleProspects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return workspaceProspects
      .filter(item => {
        if (queue === "due") return !item.doNotContact && item.nextContactAt !== undefined && item.nextContactAt <= now;
        if (queue === "new") return !item.doNotContact && item.qualificationState === "unreviewed";
        if (queue === "untouched") return !item.doNotContact && item.outreachAttempts.length === 0;
        if (queue === "research") return !item.doNotContact && item.qualificationState === "researching";
        if (queue === "outreach") return !item.doNotContact && item.qualificationState === "outreach";
        if (queue === "engaged") return !item.doNotContact && item.qualificationState === "engaged";
        if (queue === "parked") return Boolean(item.doNotContact || item.qualificationState === "not-now");
        return !item.doNotContact;
      })
      .filter(item => !needle || [
        item.company,
        item.name,
        item.niche,
        item.address,
        item.source,
        item.opportunity,
        item.researchNotes,
        item.tags.join(" "),
      ].filter(Boolean).join(" ").toLowerCase().includes(needle))
      .sort((a, b) => scoutingPriority(a, now) - scoutingPriority(b, now));
  }, [now, query, queue, workspaceProspects]);

  const modeProspects = useMemo(() => {
    if (mode !== "prospecting" || view === "pipeline") return visibleProspects;
    if (view === "power-dialler") return visibleProspects.filter(item => Boolean(item.phone));
    if (view === "email") return visibleProspects.filter(item => Boolean(item.email));
    return visibleProspects;
  }, [mode, view, visibleProspects]);

  const selected = modeProspects.find(item => item.id === selectedId) ?? modeProspects[0];
  selectedProspectIdRef.current = selected?.id ?? "";
  const outreachLocked = providerPending !== null || heldProviderReceipt;

  useEffect(() => {
    if (modeProspects.length && !modeProspects.some(item => item.id === selectedId)) {
      setSelectedId(modeProspects[0]!.id);
    }
  }, [modeProspects, selectedId]);

  useEffect(() => {
    setInspectionChecks(selected?.inspectionChecks ?? []);
    setFollowUpReason(selected?.nextContactReason ?? "");
  }, [selected?.id, selected?.inspectionChecks, selected?.nextContactReason]);

  useEffect(() => {
    setAttemptNote("");
    setFollowUpAt("");
    setFieldNote("");
    setOutcome("attempted");
    setReadyForNext(false);
    setActiveAttemptId(undefined);
    setHeldProviderReceipt(false);
    setNotice(null);
  }, [selected?.id]);

  async function post(
    path: string,
    body: Record<string, unknown>,
    mode: "outreach" | "note" | "follow-up" | "inspection" | "resolve",
    success: string,
    method?: "POST" | "PATCH",
  ): Promise<boolean> {
    setBusy(mode);
    setNotice(null);
    try {
      const response = await fetch(`/api/portal/leads-pipeline/${path}`, {
        method: method ?? (path.startsWith("prospects?") ? "PATCH" : "POST"),
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not update this prospect.");
      setNotice({ tone: "success", text: success });
      router.refresh();
      return true;
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : String(error) });
      return false;
    } finally {
      setBusy(null);
    }
  }

  // Research completeness is context, not authorisation. Recipient binding,
  // access and suppression remain server-enforced; a new scout may be called
  // immediately and can return here for research before or after contact.
  const selectedInspected = selected ? inspectionComplete(selected) : false;
  const qualificationBlockReason = selected?.status === "qualified"
    ? null
    : !canQualify
    ? "You need Leads use access to qualify this prospect into Journey."
    : selected?.doNotContact
    ? "Remove the do-not-contact status before moving this prospect into Journey."
    : selected && !selected.email && !selected.phone
      ? "Add and verify an email address or phone number before moving this prospect into Journey."
      : null;
  const qualificationUnavailableReason = outreachLocked
    ? "Finish or repair the current provider attempt before moving this prospect into Journey."
    : qualificationBlockReason;

  function selectProspect(prospectId: string, force = false) {
    if (!force && outreachLocked) return;
    setSelectedId(prospectId);
    if (!window.matchMedia("(min-width: 1024px)").matches) {
      window.requestAnimationFrame(() => {
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        dossierRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        dossierRef.current?.focus({ preventScroll: true });
      });
    }
  }

  function advanceToNextProspect() {
    if (!selected || providerPending || !readyForNext || modeProspects.length < 2) return;
    const index = modeProspects.findIndex(item => item.id === selected.id);
    const next = modeProspects[(index + 1) % modeProspects.length];
    if (next) {
      setActiveAttemptId(undefined);
      setHeldProviderReceipt(false);
      selectProspect(next.id, true);
    }
  }

  useEffect(() => {
    if (!focusedProspectId || appliedFocusId.current === focusedProspectId) return;
    const prospect = workspaceProspects.find(item => item.id === focusedProspectId);
    if (!prospect) return;
    appliedFocusId.current = focusedProspectId;
    setQuery("");
    setView(mode === "researching"
      ? "research"
      : initialOutreachView ?? (prospect.preferredChannel === "email" && prospect.email
        ? "email"
        : "power-dialler"));
    setQueue(
      prospect.doNotContact || prospect.qualificationState === "not-now"
        ? "parked"
        : ["unreviewed", "researching"].includes(prospect.qualificationState)
          ? "research"
          : "all",
    );
    selectProspect(prospect.id);
  }, [focusedProspectId, initialOutreachView, mode, workspaceProspects]);

  /**
   * Ed: *"if i want to cold call a bunch of people i can go press call button
   * ... and logging what i do how many times."* Logged as `attempted`/`sent`
   * ONLY after the action actually happened (the call POST succeeded, the
   * composer sent) — never on render or picker open, because recordOutreach
   * advances qualificationState and auto-completes due follow-ups, and a
   * misclick must not do either.
   */
  function onOutreachLogged(prospectId: string, channel: "call" | "email", receipt: ProspectOutreachReceipt) {
    // The server attempts the provider action and its Prospect ledger write in
    // one request (rather than a fire-and-forget client log). The receipt still
    // distinguishes delivery from persistence because those two systems cannot
    // be one database transaction; a failed ledger write must be repaired, not
    // presented as complete. Device calls also return a receipt before the tel:
    // hand-off because the handset cannot call Aqua back afterwards.
    // A provider request can finish after the operator has selected another
    // dossier. Refresh the old record, but never attach its receipt or notice
    // to the newly selected person.
    if (selectedProspectIdRef.current !== prospectId) {
      router.refresh();
      return;
    }
    setActiveAttemptId(receipt.outreachAttemptId);
    setHeldProviderReceipt(true);
    setChannel(channel);
    setOutcome(channel === "email" ? "sent" : "attempted");
    if (receipt.outreachRecorded) {
      setNotice({ tone: "success", text: channel === "call"
        ? "Call logged — record the outcome below once you hang up."
        : "Email sent and logged." });
      if (channel === "email") setReadyForNext(true);
    } else {
      setNotice({
        tone: "error",
        text: channel === "call"
          ? "The call was initiated, but Aqua could not save its history. Save the outcome below to repair this attempt before advancing."
          : "The email was delivered, but Aqua could not save its history. Save the sent outcome below to repair this attempt before advancing.",
      });
      setReadyForNext(false);
    }
    router.refresh();
  }

  function onDeviceEmailPrepared(prospectId: string, receipt: ProspectOutreachReceipt) {
    if (selectedProspectIdRef.current !== prospectId) {
      router.refresh();
      return;
    }
    setActiveAttemptId(receipt.outreachAttemptId);
    setHeldProviderReceipt(true);
    setChannel("email");
    setOutcome("attempted");
    setReadyForNext(false);
    setNotice({
      tone: receipt.outreachRecorded ? "success" : "error",
      text: receipt.outreachRecorded
        ? "Draft opened in your default email app. Send or cancel it there, then record the real outcome below."
        : "The draft opened, but Aqua could not retain the handoff. Record the real outcome below before moving on.",
    });
    router.refresh();
  }

  function onProviderPendingChange(prospectId: string, channel: "call" | "email", pending: boolean) {
    if (pending) {
      setReadyForNext(false);
      setActiveAttemptId(undefined);
      setHeldProviderReceipt(false);
      setProviderPending({ prospectId, channel });
      return;
    }
    setProviderPending(current => current?.prospectId === prospectId && current.channel === channel ? null : current);
  }

  async function recordOutreach(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const saved = await post("prospects/outreach", {
      id: selected.id,
      channel,
      outcome,
      note: attemptNote || undefined,
      followUpAt: followUpAt ? new Date(followUpAt).getTime() : undefined,
      followUpReason: followUpReason || undefined,
      attemptId: activeAttemptId,
      finalise: Boolean(activeAttemptId),
    }, "outreach", `${CHANNEL_LABELS[channel]} outcome recorded.`);
    if (saved) {
      setAttemptNote("");
      setFollowUpAt("");
      setFollowUpReason("");
      setActiveAttemptId(undefined);
      setHeldProviderReceipt(false);
      setReadyForNext(true);
    }
  }

  async function addNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !fieldNote.trim()) return;
    const saved = await post("prospects/notes", { id: selected.id, body: fieldNote }, "note", mode === "researching" ? "Research note added." : "Call note added.");
    if (saved) setFieldNote("");
  }

  async function scheduleFollowUp(offset: { hours?: number; days?: number }) {
    if (!selected) return;
    const target = new Date();
    if (offset.hours) target.setHours(target.getHours() + offset.hours);
    if (offset.days) {
      target.setDate(target.getDate() + offset.days);
      target.setHours(9, 0, 0, 0);
    }
    await scheduleExactFollowUp(target.getTime());
  }

  async function scheduleExactFollowUp(dueAt?: number) {
    if (!selected) return;
    const target = dueAt ?? (followUpAt ? new Date(followUpAt).getTime() : Number.NaN);
    if (!Number.isFinite(target)) {
      setNotice({ tone: "error", text: "Choose a valid recontact date and time." });
      return;
    }
    const saved = await post("prospects/follow-ups", {
      id: selected.id,
      dueAt: target,
      reason: followUpReason || "Continue the conversation",
      channel,
    }, "follow-up", `Follow-up scheduled for ${formatDateTime(target)}.`);
    if (saved) setFollowUpAt("");
  }

  async function resolveFollowUp(followUpId: string, status: "completed" | "skipped") {
    if (!selected) return;
    await post("prospects/follow-ups", {
      id: selected.id,
      followUpId,
      status,
    }, "resolve", status === "completed" ? "Follow-up completed." : "Follow-up skipped.", "PATCH");
  }

  async function saveInspection() {
    if (!selected) return;
    const complete = REQUIRED_INSPECTION_CHECKS.every(check => inspectionChecks.includes(check));
    const saved = await post("prospects/inspection", {
      id: selected.id,
      checks: inspectionChecks,
    }, "inspection", complete
      ? "Research complete. This prospect is ready in Outreach Command."
      : "Inspection progress saved.");
    if (saved && complete) {
      router.push(`/portal/agency/prospecting?prospect=${encodeURIComponent(selected.id)}`);
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-black/10 bg-[#fbfaf8] shadow-sm">
      <header className="border-b border-black/10 bg-[#102f31] px-4 py-4 text-white sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[#72d5ca]/15 text-[#72d5ca]">{mode === "researching" ? <Search size={19} aria-hidden="true" /> : <Target size={19} aria-hidden="true" />}</span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#72d5ca]">{mode === "researching" ? "Research workbench" : "Engagement desk"}</p>
              <h2 className="truncate text-lg font-semibold">{mode === "researching" ? "Research when it helps" : "Outreach Command"}</h2>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={mode === "researching" ? "/portal/agency/scouting" : "/portal/agency/researching"} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/20 px-4 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#72d5ca] focus-visible:ring-offset-2 focus-visible:ring-offset-[#102f31]">
              {mode === "researching" ? <Binoculars size={15} aria-hidden="true" /> : <Search size={15} aria-hidden="true" />}
              {mode === "researching" ? "Back to Scouting" : "Open Researching"}
            </Link>
          </div>
        </div>
      </header>

      {/* Ed: "quotas ... set myself a target ... make it super cool". Rings
          with DERIVED progress — the counters come from the outreach records
          themselves, so this can never disagree with the timeline below it. */}
      {mode === "prospecting" ? <ScoutingQuotaStrip quota={quota} writable={quotaWritable} /> : null}

      {mode === "prospecting" ? <section className="border-b border-black/10 bg-white px-4 py-3 sm:px-5" aria-labelledby="outreach-mode-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p id="outreach-mode-heading" className="text-xs font-semibold uppercase tracking-wide text-black/65">Choose outreach mode</p>
            <p className="mt-1 text-xs leading-5 text-black/65">One deliberate contact at a time. Aqua never auto-dials or bulk-sends this queue.</p>
          </div>
          <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-md border border-black/10 bg-[#fbfaf8] p-1" role="group" aria-label="Outreach mode">
            <button type="button" aria-pressed={view === "power-dialler"} disabled={outreachLocked} onClick={() => setView("power-dialler")} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 ${view === "power-dialler" ? "bg-[#102f31] text-white shadow-sm" : "text-black/65"}`}><Phone size={13} aria-hidden="true" /> Power dialler</button>
            <button type="button" aria-pressed={view === "email"} disabled={outreachLocked} onClick={() => setView("email")} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 ${view === "email" ? "bg-[#102f31] text-white shadow-sm" : "text-black/65"}`}><Mail size={13} aria-hidden="true" /> Email</button>
            <button type="button" aria-pressed={view === "pipeline"} disabled={outreachLocked} onClick={() => setView("pipeline")} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 ${view === "pipeline" ? "bg-[#102f31] text-white shadow-sm" : "text-black/65"}`}><Columns3 size={13} aria-hidden="true" /> Pipeline</button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {view === "power-dialler" ? <CallLinePicker /> : null}
          {view === "email" ? <EmailLinePicker /> : null}
          {view === "pipeline" ? <p className="text-xs text-black/65">Open any stage card to return to the correct one-to-one contact mode.</p> : null}
        </div>
      </section> : null}

      <div className="grid border-b border-black/10 sm:grid-cols-2 lg:grid-cols-5">
        {mode === "prospecting" ? <CommandMetric disabled={outreachLocked} icon={<CalendarClock size={15} />} label="Due now" value={dueCount} tone={overdueCount ? "critical" : dueCount ? "warning" : "calm"} detail={overdueCount ? `${overdueCount} overdue` : "Follow-up queue"} onClick={() => setQueue("due")} /> : null}
        <CommandMetric disabled={outreachLocked} icon={<ShieldAlert size={15} />} label="Untouched" value={untouchedCount} tone={untouchedCount ? "warning" : "calm"} detail={mode === "researching" ? "Research not started" : "No attempt yet"} onClick={() => setQueue("untouched")} />
        <CommandMetric disabled={outreachLocked} icon={<Search size={15} />} label={mode === "researching" ? "Available to research" : "Research ready"} value={mode === "researching" ? workspaceProspects.length : readyCount} tone="neutral" detail={mode === "researching" ? "Optional, revisitable context" : "Brief already prepared"} onClick={() => setQueue("all")} />
        {mode === "prospecting" ? <CommandMetric disabled={outreachLocked} icon={<MessageCircle size={15} />} label="Engaged" value={engagedCount} tone={engagedCount ? "calm" : "neutral"} detail="Reply or interest" onClick={() => setQueue("engaged")} /> : null}
        <CommandMetric disabled={outreachLocked} icon={<ClipboardList size={15} />} label="Active dossiers" value={workspaceProspects.length} tone="neutral" detail="Retained evidence" onClick={() => setQueue("all")} />
      </div>

      <nav className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 bg-white px-3 py-2" aria-label={mode === "researching" ? "Research queues" : "Outreach Command queues"}>
        <div className="flex min-w-0 gap-1 overflow-x-auto">
          {visibleQueues.map(item => (
            <button key={item.id} type="button" disabled={outreachLocked} aria-pressed={queue === item.id && view !== "pipeline"} onClick={() => { setQueue(item.id); if (view === "pipeline") setView(mode === "researching" ? "research" : "power-dialler"); }} className={`min-h-11 shrink-0 rounded-md px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 ${queue === item.id && view !== "pipeline" ? "bg-[#102f31] text-white" : "text-black/65 hover:bg-black/[0.04]"}`}>
              {item.label} <span className={queue === item.id && view !== "pipeline" ? "text-white/70" : "text-black/65"}>{queueCounts[item.id]}</span>
            </button>
          ))}
        </div>
      </nav>

      {notice ? <div role={notice.tone === "error" ? "alert" : "status"} className={`border-b px-4 py-3 text-sm sm:px-6 ${notice.tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{notice.text}</div> : null}

      {view === "pipeline" ? (
        <ScoutingPipeline
          prospects={workspaceProspects}
          now={now}
          onOpen={prospect => {
            if (outreachLocked) return;
            selectProspect(prospect.id);
            setQueue(prospect.doNotContact || prospect.qualificationState === "not-now" ? "parked" : "all");
            setView(prospect.preferredChannel === "email" && prospect.email ? "email" : "power-dialler");
          }}
        />
      ) : null}

      <div className={`${view === "pipeline" ? "hidden" : "grid"} min-h-[650px] lg:grid-cols-[minmax(280px,0.78fr)_minmax(0,2.22fr)]`}>
        <aside className="border-b border-black/10 bg-white lg:border-b-0 lg:border-r">
          <div className="border-b border-black/10 p-3">
            <label className="flex min-h-11 items-center gap-2 rounded-md border border-black/10 bg-[#fbfaf8] px-3 py-2 focus-within:ring-2 focus-within:ring-[#16877f] focus-within:ring-offset-2">
              <Search size={15} className="text-black/35" aria-hidden="true" />
              <input value={query} onChange={event => setQuery(event.target.value)} disabled={outreachLocked} className="min-w-0 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50" placeholder="Search dossiers" aria-label="Search scouting dossiers" />
            </label>
          </div>
          <div className="max-h-[420px] overflow-y-auto lg:max-h-[720px]">
            {modeProspects.map(prospect => {
              const due = prospect.nextContactAt !== undefined && prospect.nextContactAt <= now && !prospect.doNotContact;
              const active = selected?.id === prospect.id;
              return (
                <button key={prospect.id} type="button" disabled={outreachLocked} onClick={() => selectProspect(prospect.id)} aria-pressed={active} className={`block w-full border-b border-black/[0.07] px-4 py-4 text-left transition focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-60 ${active ? "bg-[#e9f5f2] shadow-[inset_3px_0_0_#16877f]" : "hover:bg-black/[0.025]"}`}>
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <strong className="block truncate text-sm font-semibold text-black/85">{prospect.company || prospect.name || prospect.website || "Unnamed prospect"}</strong>
                      <span className="mt-1 block truncate text-xs text-black/65">{[prospect.niche, sourceLabel(prospect.source)].filter(Boolean).join(" · ")}</span>
                    </span>
                    {prospect.fitScore !== undefined ? <span className="shrink-0 text-xs font-semibold tabular-nums text-black/65">{prospect.fitScore}%</span> : null}
                  </span>
                  <span className="mt-3 flex items-center justify-between gap-3 text-[11px]">
                    <span className={`font-semibold uppercase ${due ? "text-red-700" : prospect.doNotContact ? "text-black/65" : "text-[#16776f]"}`}>{due ? "Follow-up due" : qualificationLabel(prospect)}</span>
                    <span className="text-black/65">{prospect.outreachAttempts.length} attempt{prospect.outreachAttempts.length === 1 ? "" : "s"}</span>
                  </span>
                </button>
              );
            })}
            {!modeProspects.length ? <div className="p-8 text-center text-sm text-black/65">{view === "power-dialler" ? "No active prospects with a phone number in this queue." : view === "email" ? "No active prospects with an email address in this queue." : "No prospects in this queue."}</div> : null}
          </div>
        </aside>

        {selected ? (
          <div ref={dossierRef} tabIndex={-1} role="region" aria-label="Selected prospect dossier" className="min-w-0 scroll-mt-4 focus:outline focus:outline-2 focus:outline-offset-[-2px] focus:outline-[#16877f]">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/10 px-4 py-5 sm:px-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="min-w-0 break-words text-xl font-semibold text-black/90">{selected.company || selected.name || selected.website || "Unnamed prospect"}</h3>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase ${qualificationTone(selected)}`}>{qualificationLabel(selected)}</span>
                  {selected.status === "qualified" ? <span className="rounded-full bg-violet-50 px-2 py-1 text-xs font-semibold uppercase text-violet-700 ring-1 ring-inset ring-violet-200">In Journey</span> : null}
                  {selected.doNotContact ? <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold uppercase text-red-700">Do not contact</span> : null}
                </div>
                <p className="mt-1 text-sm text-black/65">Scouted {formatElapsed(now - selected.capturedAt)} ago{selected.address ? ` · ${selected.address}` : ""}</p>
              </div>
              <div className="flex max-w-sm flex-col items-start gap-2 sm:items-end">
                <div className="flex flex-wrap gap-2">
                {mode === "prospecting" ? <button type="button" onClick={advanceToNextProspect} disabled={providerPending !== null || !readyForNext || modeProspects.length < 2} title={!readyForNext ? "Record the outcome or send the reviewed email before advancing." : undefined} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#16877f]/25 bg-[#e9f5f2] px-3 py-2 text-xs font-semibold text-[#166a64] hover:bg-[#dff1ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45">
                  Next contact <SkipForward size={13} aria-hidden="true" />
                </button> : null}
                <button type="button" disabled={outreachLocked} onClick={() => onEdit(selected)} className="min-h-11 rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/65 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45">Edit dossier</button>
                {mode === "prospecting" && selected.status === "scouting" ? <button type="button" disabled={Boolean(qualificationUnavailableReason)} onClick={() => { if (!qualificationUnavailableReason) onQualify(selected); }} aria-describedby={qualificationUnavailableReason ? `qualify-block-${selected.id}` : undefined} className={`inline-flex min-h-11 items-center gap-2 rounded-md bg-black px-3 py-2 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 ${qualificationUnavailableReason ? "cursor-not-allowed opacity-45" : "hover:bg-black/85"}`}>
                  Qualify to Journey <ArrowRight size={13} aria-hidden="true" />
                </button> : selected.status === "qualified" && selected.qualifiedLeadId ? <Link href={`/portal/agency/pipelines/leads?lead=${encodeURIComponent(selected.qualifiedLeadId)}`} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Open in Journey <ArrowRight size={13} aria-hidden="true" /></Link> : null}
                </div>
                {mode === "prospecting" && selected.status === "scouting" && qualificationUnavailableReason ? <p id={`qualify-block-${selected.id}`} className="text-xs leading-5 text-black/65">{qualificationUnavailableReason}</p> : null}
              </div>
            </div>

            <div className="grid xl:grid-cols-[minmax(0,1.15fr)_minmax(330px,0.85fr)]">
              <div className="min-w-0 border-b border-black/10 xl:border-b-0 xl:border-r">
                {mode === "researching" ? <ProspectResearchBrowser prospect={selected} embedApiKey={googleMapsEmbedApiKey} /> : null}
                <section className="border-b border-black/10 px-4 py-5 sm:px-6">
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <DossierField label="Opportunity" value={selected.opportunity} />
                    <DossierField label="Research verdict" value={selected.researchNotes} />
                    <DossierField label={mode === "researching" ? "Next research or contact step" : "Next planned step"} value={selected.nextStep} />
                    <DossierField label="Preferred route" value={selected.preferredChannel ? CHANNEL_LABELS[selected.preferredChannel] : undefined} />
                  </dl>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selected.tags.map(item => <span key={item} className="inline-flex items-center gap-1 rounded-full bg-black/[0.05] px-2 py-1 text-[11px] text-black/65"><Tag size={10} />{item}</span>)}
                  </div>
                </section>

                <section className="border-b border-black/10 px-4 py-5 sm:px-6">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-black/65">{mode === "researching" ? "Research sources" : "Contact routes"}</h4>
                  {mode === "prospecting" && selected.doNotContact ? (
                    <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
                      This prospect has opted out of contact. The call and email
                      routes are closed; the record stays for reference.
                    </p>
                  ) : mode === "prospecting" && !selectedInspected ? (
                    <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                      Research is incomplete. You can still contact this person
                      now; use Researching before, during, or after the outreach
                      when extra context would make the conversation stronger.
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {/* These audited controls replace the bare tel:/mailto: routes
                        (Ed's opt-out finding, 2026-08-30): these go through the
                        telephony routes, which enforce suppression server-side
                        and log the attempt — a raw anchor did neither. */}
                    {mode === "prospecting" && view === "power-dialler" && selected.phone && !selected.doNotContact ? (
                      <CallButton
                        phone={selected.phone}
                        name={selected.name}
                        prospectId={selected.id}
                        disabled={outreachLocked}
                        onCalled={receipt => onOutreachLogged(selected.id, "call", receipt)}
                        onPendingChange={pending => onProviderPendingChange(selected.id, "call", pending)}
                      />
                    ) : null}
                    {mode === "prospecting" && view === "email" && selected.email && !selected.doNotContact ? (
                      <EmailButton
                        email={selected.email}
                        phone={selected.phone}
                        name={selected.name}
                        prospectId={selected.id}
                        disabled={outreachLocked}
                        onSent={receipt => onOutreachLogged(selected.id, "email", receipt)}
                        onPrepared={receipt => onDeviceEmailPrepared(selected.id, receipt)}
                        onPendingChange={pending => onProviderPendingChange(selected.id, "email", pending)}
                      />
                    ) : null}
                    {/* Unlogged raw SMS/WhatsApp anchors do not belong in this
                        audited outreach queue. They return only when a server
                        route can re-check suppression and retain the outcome. */}
                    {selected.website ? <a href={selected.website} target="_blank" rel="noopener noreferrer" className={CONTACT_ROUTE_CLASS}><Globe2 size={14} /> Website</a> : null}
                    {selected.googleMapsUrl ? <a href={selected.googleMapsUrl} target="_blank" rel="noopener noreferrer" className={CONTACT_ROUTE_CLASS}><MapPin size={14} /> Google Maps</a> : null}
                    {selected.instagramUrl ? <a href={selected.instagramUrl} target="_blank" rel="noopener noreferrer" onClick={() => { if (!outreachLocked) setChannel("dm"); }} className={CONTACT_ROUTE_CLASS}><ExternalLink size={14} /> Instagram</a> : null}
                    {selected.facebookUrl ? <a href={selected.facebookUrl} target="_blank" rel="noopener noreferrer" onClick={() => { if (!outreachLocked) setChannel("dm"); }} className={CONTACT_ROUTE_CLASS}><ExternalLink size={14} /> Facebook</a> : null}
                    {selected.linkedinUrl ? <a href={selected.linkedinUrl} target="_blank" rel="noopener noreferrer" onClick={() => { if (!outreachLocked) setChannel("dm"); }} className={CONTACT_ROUTE_CLASS}><ExternalLink size={14} /> LinkedIn</a> : null}
                    {mode === "prospecting" ? <Link href={`/portal/agency/researching?prospect=${encodeURIComponent(selected.id)}`} target="_blank" rel="noopener noreferrer" className={CONTACT_ROUTE_CLASS}><Search size={14} /> Research brief</Link> : null}
                    {mode === "prospecting" ? <Link href="/portal/agency/sop-library?query=call" target="_blank" rel="noopener noreferrer" className={CONTACT_ROUTE_CLASS}><ClipboardList size={14} /> Call playbooks</Link> : null}
                  </div>
                </section>

                <section className="px-4 py-5 sm:px-6">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-black/65">Contact and research history</h4>
                    <span className="text-xs text-black/65">{selected.outreachAttempts.length + selected.notes.length + selected.followUps.length} records</span>
                  </div>
                  <div className="mt-4 divide-y divide-black/[0.07] border-y border-black/[0.07]">
                    {timeline(selected).map(item => (
                      <div key={item.id} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 py-3">
                        <span className={`grid size-8 place-items-center rounded-md ${item.kind === "attempt" ? "bg-[#e9f5f2] text-[#16776f]" : item.kind === "follow-up" ? "bg-amber-50 text-amber-700" : "bg-black/[0.05] text-black/50"}`}>{item.kind === "attempt" ? <Send size={14} /> : item.kind === "follow-up" ? <CalendarClock size={14} /> : <FileText size={14} />}</span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <strong className="text-xs font-semibold text-black/75">{item.title}</strong>
                            <span className="text-right text-xs text-black/65">
                              <time>{formatDateTime(item.at)}</time>
                              {item.actorLabel ? <span className="mt-0.5 block text-[11px] text-black/65">{item.kind === "attempt" ? "started by" : "by"} {item.actorLabel}</span> : <span className="mt-0.5 block text-[11px] text-black/65">actor not recorded</span>}
                              {item.finaliserActorLabel ? <span className="mt-0.5 block text-[11px] text-black/65">outcome by {item.finaliserActorLabel}{item.finalisedAt ? ` · ${formatDateTime(item.finalisedAt)}` : ""}</span> : null}
                            </span>
                          </div>
                          {item.body ? <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-black/65">{item.body}</p> : null}
                          {item.followUpAt ? <p className="mt-1 text-[11px] font-medium text-amber-700">Recontact {formatDateTime(item.followUpAt)}{item.followUpReason ? ` · ${item.followUpReason}` : ""}</p> : null}
                        </div>
                      </div>
                    ))}
                    {!selected.outreachAttempts.length && !selected.notes.length && !selected.followUps.length ? <p className="py-6 text-center text-sm text-black/65">No contact, follow-up, or field notes recorded yet.</p> : null}
                  </div>
                </section>
              </div>

              <aside className="min-w-0 bg-white/55">
                <section className="border-b border-black/10 px-4 py-5 sm:px-5" aria-labelledby={`research-contact-${selected.id}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div><p className="text-xs font-semibold uppercase text-[#16776f]">{mode === "researching" ? "Right-hand reference" : "Active contact card"}</p><h4 id={`research-contact-${selected.id}`} className="mt-1 text-sm font-semibold text-black/80">Company and contact</h4></div>
                      <button type="button" disabled={outreachLocked} onClick={() => onEdit(selected)} className="min-h-11 rounded-md border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45">Edit</button>
                    </div>
                    <dl className="mt-3 divide-y divide-black/[0.07] border-y border-black/[0.07] text-xs">
                      <DossierRow label="Contact" value={selected.name || "Not found yet"} />
                      <DossierRow label="Email" value={selected.email || "Not found yet"} />
                      <DossierRow label="Phone" value={selected.phone || "Not found yet"} />
                      <DossierRow label="Address" value={selected.address || "Not verified"} />
                      <DossierRow label="Website" value={selected.website || "Not found yet"} />
                      <DossierRow label="Niche" value={selected.niche || "Not classified"} />
                      <DossierRow label="Last attempt" value={selected.lastContactedAt ? formatDateTime(selected.lastContactedAt) : "Never"} />
                      <DossierRow label="Last conversation" value={lastMeaningfulContactLabel(selected)} />
                      <DossierRow label="Research updated" value={researchUpdatedLabel(selected)} />
                    </dl>
                  </section>
                {mode === "prospecting" ? <div className={`border-b px-4 py-3 text-xs sm:px-5 ${inspectionComplete(selected) ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                  <span className="flex items-start gap-2"><ShieldCheck size={14} className="mt-0.5 shrink-0" /><span><strong className="block font-semibold">{inspectionComplete(selected) ? "Research brief prepared" : "Research brief is optional"}</strong><span className="mt-0.5 block opacity-75">{inspectionComplete(selected) ? "The supporting context has been reviewed." : "Outreach is available now; return to Researching whenever extra context is useful."}</span></span></span>
                </div> : null}
                {mode === "prospecting" ? <form onSubmit={recordOutreach} className="border-b border-black/10 px-4 py-5 sm:px-5">
                  <h4 className="text-sm font-semibold text-black/80">Record an outreach attempt</h4>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <SelectField label="Channel" value={channel} onChange={value => setChannel(value as ProspectOutreachChannel)} options={Object.entries(CHANNEL_LABELS)} disabled={outreachLocked} />
                    <SelectField label="Outcome" value={outcome} onChange={value => setOutcome(value as ProspectOutreachOutcome)} options={Object.entries(OUTCOME_LABELS)} disabled={providerPending !== null} />
                  </div>
                  {outcome === "meeting-booked" ? <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">{selected.status === "qualified" && selected.qualifiedLeadId ? <>Save this outcome, then <Link href={`/portal/agency/pipelines/leads?lead=${encodeURIComponent(selected.qualifiedLeadId)}#lead-record`} className="rounded-sm font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-1">open the Journey record</Link> to add the time, format, preparation, link, and reminders.</> : <>Save this outcome, then use <strong>Qualify to Journey</strong> above. Aqua will open the meeting record so you can add the time, format, preparation, link, and reminders once.</>}</p> : null}
                  {heldProviderReceipt ? <p className="mt-2 text-xs leading-5 text-black/65">Channel is locked to the provider receipt until this attempt is finalised.</p> : null}
                  <label className="mt-3 block text-xs font-medium text-black/65">What happened<textarea value={attemptNote} onChange={event => setAttemptNote(event.target.value)} disabled={providerPending !== null} rows={3} className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-[#16877f] focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-black/[0.035]" placeholder="Person spoken to, objection, useful context..." /></label>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <label className="text-xs font-medium text-black/65">Recontact at<input type="datetime-local" value={followUpAt} onChange={event => setFollowUpAt(event.target.value)} disabled={providerPending !== null} className="mt-1 min-h-11 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-black/[0.035]" /></label>
                    <label className="text-xs font-medium text-black/65">Reason<input value={followUpReason} onChange={event => setFollowUpReason(event.target.value)} disabled={providerPending !== null} className="mt-1 min-h-11 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-black/[0.035]" placeholder="Asked me to call back" /></label>
                  </div>
                  <button type="submit" disabled={busy !== null || providerPending !== null || selected.doNotContact} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#102f31] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#174246] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:opacity-40"><CheckCircle2 size={15} />{busy === "outreach" ? "Saving..." : "Save attempt"}</button>
                </form> : null}

                {mode === "prospecting" ? <section className="border-b border-black/10 px-4 py-5 sm:px-5">
                  <div className="flex items-center justify-between gap-3"><h4 className="text-sm font-semibold text-black/80">Outreach plan & callbacks</h4>{selected.nextContactAt ? <span className={`text-[11px] font-semibold ${selected.nextContactAt <= now ? "text-red-700" : "text-amber-700"}`}>{selected.nextContactAt <= now ? "Due " : "Next "}{formatDateTime(selected.nextContactAt)}</span> : null}</div>
                  <p className="mt-1 text-xs leading-5 text-black/65">Build the next steps one at a time across calls, email, social DM, WhatsApp, SMS, or in-person contact. Plans stay editable as the conversation changes.</p>
                  <div className="mt-3 space-y-2">
                    {selected.followUps.filter(item => item.status === "scheduled").sort((a, b) => a.dueAt - b.dueAt).map(item => (
                      <div key={item.id} className={`border-l-2 px-3 py-2 ${item.dueAt <= now ? "border-red-500 bg-red-50" : "border-amber-400 bg-amber-50/70"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0"><strong className="block text-xs text-black/75">{item.reason}</strong><span className="mt-0.5 block text-xs text-black/65">{item.channel ? CHANNEL_LABELS[item.channel] : "Any channel"} · {formatDateTime(item.dueAt)}</span></div>
                          <div className="flex shrink-0 gap-1">
                            <button type="button" onClick={() => void resolveFollowUp(item.id, "completed")} disabled={busy !== null || outreachLocked} className="grid size-11 place-items-center rounded border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45" title="Mark completed" aria-label="Mark follow-up completed"><CircleCheck size={13} /></button>
                            <button type="button" onClick={() => void resolveFollowUp(item.id, "skipped")} disabled={busy !== null || outreachLocked} className="grid size-11 place-items-center rounded border border-black/10 bg-white text-black/65 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45" title="Skip follow-up" aria-label="Skip follow-up"><SkipForward size={13} /></button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {!selected.followUps.some(item => item.status === "scheduled") ? <p className="rounded-md border border-dashed border-black/10 px-3 py-3 text-center text-xs text-black/65">No planned step. Add the next responsible contact action below.</p> : null}
                  </div>
                  <label className="mt-3 block text-xs font-medium text-black/65">Reason<input value={followUpReason} onChange={event => setFollowUpReason(event.target.value)} disabled={outreachLocked} className="mt-1 min-h-11 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-black/[0.035]" placeholder="Timing, decision maker, next opening..." /></label>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <label className="text-xs font-medium text-black/65">Exact time<input type="datetime-local" value={followUpAt} onChange={event => setFollowUpAt(event.target.value)} disabled={outreachLocked} className="mt-1 min-h-11 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-black/[0.035]" /></label>
                    <label className="text-xs font-medium text-black/65">Channel<select value={channel} onChange={event => setChannel(event.target.value as ProspectOutreachChannel)} disabled={outreachLocked} className="mt-1 min-h-11 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-black/[0.035] disabled:text-black/45">{Object.entries(CHANNEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  </div>
                  <button type="button" disabled={busy !== null || outreachLocked || !followUpAt} onClick={() => void scheduleExactFollowUp()} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#16877f]/25 bg-[#e9f5f2] px-3 py-2 text-xs font-semibold text-[#16776f] hover:bg-[#dff1ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"><CalendarClock size={13} /> Schedule exact follow-up</button>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <button type="button" disabled={busy !== null || outreachLocked} onClick={() => void scheduleFollowUp({ hours: 1 })} className="min-h-11 rounded-md border border-black/10 bg-white px-2 py-2 text-xs font-semibold text-black/65 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45">In 1 hour</button>
                    <button type="button" disabled={busy !== null || outreachLocked} onClick={() => void scheduleFollowUp({ days: 1 })} className="min-h-11 rounded-md border border-black/10 bg-white px-2 py-2 text-xs font-semibold text-black/65 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45">Tomorrow</button>
                    <button type="button" disabled={busy !== null || outreachLocked} onClick={() => void scheduleFollowUp({ days: 3 })} className="min-h-11 rounded-md border border-black/10 bg-white px-2 py-2 text-xs font-semibold text-black/65 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45">In 3 days</button>
                  </div>
                </section> : null}

                <form onSubmit={addNote} className="border-b border-black/10 px-4 py-5 sm:px-5">
                  <label htmlFor="scouting-field-note" className="text-sm font-semibold text-black/80">{mode === "researching" ? "Research sticky note" : "Call note"}</label>
                  <textarea id="scouting-field-note" value={fieldNote} onChange={event => setFieldNote(event.target.value)} disabled={outreachLocked} rows={3} className="mt-3 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-[#16877f] focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-black/[0.035]" placeholder="Research, in-person observation, owner detail..." />
                  <button type="submit" disabled={busy !== null || outreachLocked || !fieldNote.trim()} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/65 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"><Plus size={13} />{busy === "note" ? "Adding..." : "Add note"}</button>
                </form>

                {mode === "researching" ? <section className="px-4 py-5 sm:px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="text-xs font-semibold uppercase text-[#16776f]">Optional preparation</p><h4 className="mt-1 text-sm font-semibold text-black/80">Research checklist</h4></div>
                    <span className={`grid size-9 place-items-center rounded-md ${REQUIRED_INSPECTION_CHECKS.every(check => inspectionChecks.includes(check)) ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}><ShieldCheck size={17} /></span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-black/65">Capture the context that will make an approach more useful. Save any amount now and return before, during, or after outreach.</p>
                  <div className="mt-3 space-y-2">
                    {(Object.entries(INSPECTION_LABELS) as Array<[ProspectInspectionCheck, { label: string; detail: string }]>).map(([check, copy]) => {
                      const coreCheck = REQUIRED_INSPECTION_CHECKS.includes(check);
                      return <label key={check} className="flex cursor-pointer items-start gap-3 rounded-md border border-black/[0.08] bg-white p-3 hover:border-[#16877f]/30">
                        <input type="checkbox" checked={inspectionChecks.includes(check)} onChange={event => setInspectionChecks(current => event.target.checked ? [...new Set([...current, check])] : current.filter(item => item !== check))} className="mt-0.5 size-4 accent-[#16877f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2" />
                        <span className="min-w-0"><span className="block text-xs font-semibold text-black/70">{copy.label}{coreCheck ? <span className="ml-1 font-normal text-black/65">· core brief</span> : null}</span><span className="mt-0.5 block text-xs leading-5 text-black/65">{copy.detail}</span></span>
                      </label>;
                    })}
                  </div>
                  <button type="button" onClick={() => void saveInspection()} disabled={busy !== null} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#102f31] px-3 py-2.5 text-xs font-semibold text-white hover:bg-[#174246] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:opacity-40"><ShieldCheck size={13} />{busy === "inspection" ? "Saving research..." : REQUIRED_INSPECTION_CHECKS.every(check => inspectionChecks.includes(check)) ? "Save completed research brief" : "Save research progress"}</button>
                  <dl className="mt-4 divide-y divide-black/[0.07] border-y border-black/[0.07] text-xs">
                    <DossierRow label="Fit score" value={selected.fitScore === undefined ? "Not scored" : `${selected.fitScore} / 100 fit`} />
                    <DossierRow label="Contact identity" value={selected.email || selected.phone ? "Ready" : "Missing"} />
                    <DossierRow label="Last attempt" value={selected.lastContactedAt ? formatDateTime(selected.lastContactedAt) : "Never"} />
                  </dl>
                  {canManage && selected.status === "scouting" ? <button type="button" onClick={() => onDismiss(selected)} className="mt-4 inline-flex min-h-11 items-center rounded-md px-2 text-xs font-medium text-red-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Not qualified — remove from active workflow</button> : null}
                </section> : null}
              </aside>
            </div>
          </div>
        ) : (
          <div className="grid min-h-[420px] place-items-center p-8 text-center"><div>{mode === "researching" ? <Search size={28} className="mx-auto text-black/40" /> : <Target size={28} className="mx-auto text-black/40" />}<p className="mt-3 text-sm text-black/65">{mode === "researching" ? "No active prospects match this research view." : "No active prospects match this outreach view."}</p><Link href="/portal/agency/scouting" className="mt-3 inline-flex min-h-11 items-center rounded-md px-2 text-xs font-semibold text-[#166a64] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Scout a business</Link></div></div>
        )}
      </div>
    </section>
  );
}

function researchQuery(prospect: ScoutingProspectView): string {
  return [prospect.company || prospect.name || prospect.website, prospect.address]
    .filter(Boolean)
    .join(" ")
    .trim() || "businesses near me";
}

function researchMapEmbedUrl(key: string, prospect: ScoutingProspectView): string {
  if (!key) return "";
  const placeId = prospect.googlePlaceId?.trim();
  const params = new URLSearchParams({
    key,
    q: placeId ? `place_id:${placeId}` : researchQuery(prospect),
    language: "en",
    region: "GB",
  });
  return `https://www.google.com/maps/embed/v1/${placeId ? "place" : "search"}?${params.toString()}`;
}

function googleResearchHref(prospect: ScoutingProspectView): string {
  const params = new URLSearchParams({ q: researchQuery(prospect) });
  return `https://www.google.com/search?${params.toString()}`;
}

function ProspectResearchBrowser({
  prospect,
  embedApiKey,
}: {
  prospect: ScoutingProspectView;
  embedApiKey: string;
}) {
  const mapSrc = researchMapEmbedUrl(embedApiKey, prospect);
  const label = prospect.company || prospect.name || prospect.website || "selected prospect";
  return (
    <section className="border-b border-black/10 bg-[#f3f1ec]" aria-labelledby={`research-browser-${prospect.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/10 bg-white px-4 py-4 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#16776f]">In-app research browser</p>
          <h4 id={`research-browser-${prospect.id}`} className="mt-1 text-sm font-semibold text-black/80">Research {label}</h4>
          <p className="mt-1 max-w-xl text-xs leading-5 text-black/65">Inspect the live Maps profile here. Web search and sites open in a separate browser tab when the publisher does not allow embedding.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={googleResearchHref(prospect)} target="_blank" rel="noopener noreferrer" className={CONTACT_ROUTE_CLASS}><Search size={14} /> Google search</a>
          {prospect.website ? <a href={prospect.website} target="_blank" rel="noopener noreferrer" className={CONTACT_ROUTE_CLASS}><Globe2 size={14} /> Website</a> : null}
        </div>
      </div>
      <div className="min-h-[28rem]">
        {mapSrc ? (
          <iframe
            title={`Google Maps research for ${label}`}
            src={mapSrc}
            loading="lazy"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="h-[clamp(28rem,58vh,46rem)] w-full border-0"
          />
        ) : (
          <div className="flex min-h-[28rem] flex-col items-center justify-center px-6 text-center">
            <MapPin size={28} className="text-black/25" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-black/65">The restricted Google Maps embed key is not configured.</p>
            <p className="mt-1 max-w-md text-xs leading-5 text-black/65">Research notes and qualification still work. Open the live Google results in a separate browser tab until the map key is connected.</p>
            <a href={googleResearchHref(prospect)} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Open Google search <ExternalLink size={13} /></a>
          </div>
        )}
      </div>
      <div className="border-t border-black/10 bg-white px-4 py-2 sm:px-6"><GoogleMapsAttribution /></div>
    </section>
  );
}

const PIPELINE_STAGES: Array<{ id: ProspectQualificationState; label: string; detail: string }> = [
  { id: "unreviewed", label: "New scouts", detail: "Freshly captured" },
  { id: "researching", label: "Researching", detail: "Building the case" },
  { id: "ready", label: "Ready", detail: "Ready to approach" },
  { id: "outreach", label: "In outreach", detail: "Contact sequence active" },
  { id: "engaged", label: "Engaged", detail: "Reply or interest" },
  { id: "not-now", label: "Recontact", detail: "Parked with a reason" },
];

function ScoutingPipeline({ prospects, now, onOpen }: { prospects: ScoutingProspectView[]; now: number; onOpen: (prospect: ScoutingProspectView) => void }) {
  const active = prospects.filter(item => !item.doNotContact);
  const attempts = active.flatMap(item => item.outreachAttempts);
  const replies = attempts.filter(item => ["replied", "interested", "meeting-booked"].includes(item.outcome)).length;
  const meetings = attempts.filter(item => item.outcome === "meeting-booked").length;
  const due = active.filter(item => item.nextContactAt !== undefined && item.nextContactAt <= now).length;
  const replyRate = attempts.length ? Math.round((replies / attempts.length) * 100) : 0;

  return <section className="min-h-[650px] bg-[#f3f6f5]">
    <header className="grid border-b border-black/10 bg-white sm:grid-cols-2 lg:grid-cols-4">
      <PipelineMetric label="Active prospects" value={active.length} detail="Research and outreach" />
      <PipelineMetric label="Follow-ups due" value={due} detail="Requires a decision" tone={due ? "critical" : "calm"} />
      <PipelineMetric label="Reply rate" value={`${replyRate}%`} detail={`${replies} positive replies from ${attempts.length} attempts`} />
      <PipelineMetric label="Meetings booked" value={meetings} detail="From cold scouting" tone={meetings ? "calm" : "neutral"} />
    </header>
    <div className="px-4 py-5 sm:px-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-[#16776f]">Cold outreach flow</p><h3 className="mt-1 text-xl font-semibold text-black/85">From first sighting to ongoing conversation</h3></div>
        <p className="max-w-md text-xs leading-5 text-black/65">Open any prospect to inspect the evidence, choose the contact route, schedule follow-ups, and retain every outcome.</p>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {PIPELINE_STAGES.map(stage => {
          const rows = prospects
            .filter(item => (item.doNotContact ? stage.id === "not-now" : item.qualificationState === stage.id))
            .sort((a, b) => scoutingPriority(a, now) - scoutingPriority(b, now));
          return <section key={stage.id} className="min-w-0 border border-black/10 bg-white">
            <header className="border-b border-black/10 px-3 py-3">
              <div className="flex items-center justify-between gap-2"><h4 className="text-xs font-semibold text-black/75">{stage.label}</h4><span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-xs font-semibold tabular-nums text-black/65">{rows.length}</span></div>
              <p className="mt-1 text-xs text-black/65">{stage.detail}</p>
            </header>
            <div className="min-h-36 divide-y divide-black/[0.07]">
              {rows.map(prospect => {
                const isDue = prospect.nextContactAt !== undefined && prospect.nextContactAt <= now && !prospect.doNotContact;
                return <button key={prospect.id} type="button" onClick={() => onOpen(prospect)} className="block min-h-11 w-full px-3 py-3 text-left hover:bg-[#e9f5f2] focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-inset">
                  <span className="flex items-start justify-between gap-2"><strong className="min-w-0 truncate text-xs text-black/75">{prospect.company || prospect.name || prospect.website || "Unnamed prospect"}</strong>{prospect.fitScore !== undefined ? <span className="shrink-0 text-xs font-semibold tabular-nums text-black/65">{prospect.fitScore}%</span> : null}</span>
                  <span className="mt-1 block truncate text-xs text-black/65">{[prospect.niche, sourceLabel(prospect.source)].filter(Boolean).join(" · ") || "Unclassified"}</span>
                  <span className="mt-2 flex items-center justify-between gap-2 text-xs"><span className={isDue ? "font-semibold text-red-700" : "text-black/65"}>{isDue ? "Follow-up due" : `${prospect.outreachAttempts.length} attempts`}</span><span className={inspectionComplete(prospect) ? "text-emerald-700" : "text-amber-700"}>{inspectionComplete(prospect) ? "Inspected" : "Inspect"}</span></span>
                </button>;
              })}
              {!rows.length ? <p className="px-3 py-8 text-center text-xs text-black/65">Nothing here</p> : null}
            </div>
          </section>;
        })}
      </div>
    </div>
  </section>;
}

function PipelineMetric({ label, value, detail, tone = "neutral" }: { label: string; value: string | number; detail: string; tone?: "critical" | "calm" | "neutral" }) {
  return <div className="border-b border-black/10 px-5 py-4 sm:border-r lg:border-b-0">
    <span className="text-xs font-semibold uppercase text-black/65">{label}</span>
    <strong className={`mt-1 block text-2xl font-semibold tabular-nums ${tone === "critical" ? "text-red-700" : tone === "calm" ? "text-emerald-700" : "text-black/80"}`}>{value}</strong>
    <span className="mt-1 block text-xs text-black/65">{detail}</span>
  </div>;
}

const CONTACT_ROUTE_CLASS = "inline-flex min-h-11 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65 hover:border-[#16877f]/40 hover:text-[#16776f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2";

function CommandMetric({ icon, label, value, detail, tone, onClick, disabled = false }: { icon: ReactNode; label: string; value: number; detail: string; tone: "critical" | "warning" | "calm" | "neutral"; onClick: () => void; disabled?: boolean }) {
  const colors = tone === "critical" ? "text-red-700" : tone === "warning" ? "text-amber-700" : tone === "calm" ? "text-emerald-700" : "text-black/65";
  return <button type="button" onClick={onClick} disabled={disabled} className="flex min-h-24 items-center gap-3 border-b border-black/10 px-4 py-3 text-left last:border-b-0 hover:bg-black/[0.025] focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-45 sm:border-r lg:border-b-0">
    <span className={`grid size-8 shrink-0 place-items-center rounded-md bg-black/[0.04] ${colors}`}>{icon}</span><span><span className="block text-xs font-semibold uppercase text-black/65">{label}</span><strong className={`mt-0.5 block text-2xl font-semibold tabular-nums ${colors}`}>{value}</strong><span className="block text-xs text-black/65">{detail}</span></span>
  </button>;
}

function DossierField({ label, value }: { label: string; value?: string }) {
  return <div><dt className="text-xs font-semibold uppercase text-black/65">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-black/65">{value || "Not recorded"}</dd></div>;
}

function DossierRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3 py-2.5"><dt className="shrink-0 text-black/65">{label}</dt><dd className="min-w-0 break-words text-right font-semibold text-black/70">{value}</dd></div>;
}

function SelectField({ label, value, onChange, options, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]>; disabled?: boolean }) {
  return <label className="text-xs font-medium text-black/65">{label}<select value={value} onChange={event => onChange(event.target.value)} disabled={disabled} className="mt-1 min-h-11 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-black/[0.035] disabled:text-black/45">{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}

function timeline(prospect: ScoutingProspectView) {
  return [
    ...prospect.outreachAttempts.map(item => ({ id: item.id, kind: "attempt" as const, at: item.at, title: `${CHANNEL_LABELS[item.channel]} · ${OUTCOME_LABELS[item.outcome]}`, body: item.note, followUpAt: item.followUpAt, followUpReason: item.followUpReason, actorLabel: item.actorLabel, finalisedAt: item.finalisedAt, finaliserActorLabel: item.finaliserActorLabel })),
    ...prospect.notes.map(item => ({ id: item.id, kind: "note" as const, at: item.at, title: "Scouting note", body: item.body, followUpAt: undefined, followUpReason: undefined, actorLabel: item.actorLabel, finalisedAt: undefined, finaliserActorLabel: undefined })),
    ...prospect.followUps.map(item => ({
      id: item.id,
      kind: "follow-up" as const,
      at: item.resolvedAt ?? item.createdAt,
      title: `${item.status === "scheduled" ? "Scheduled" : item.status === "completed" ? "Completed" : "Skipped"} follow-up${item.channel ? ` · ${CHANNEL_LABELS[item.channel]}` : ""}`,
      body: item.resolutionNote,
      followUpAt: item.dueAt,
      followUpReason: item.reason,
      actorLabel: item.status === "scheduled" ? item.actorLabel : item.resolverActorLabel ?? item.actorLabel,
      finalisedAt: undefined,
      finaliserActorLabel: undefined,
    })),
  ].sort((a, b) => b.at - a.at);
}

function lastMeaningfulContactLabel(prospect: ScoutingProspectView): string {
  const last = prospect.outreachAttempts
    .filter(item => ["replied", "interested", "not-now", "not-fit", "wrong-contact", "meeting-booked"].includes(item.outcome))
    .sort((a, b) => b.at - a.at)[0];
  if (!last) return "No reply or conversation recorded";
  return `${formatDateTime(last.at)}${last.actorLabel ? ` · ${last.actorLabel}` : ""}`;
}

function researchUpdatedLabel(prospect: ScoutingProspectView): string {
  if (!prospect.researchUpdatedAt) return "Not recorded";
  return `${formatDateTime(prospect.researchUpdatedAt)}${prospect.researchActorLabel ? ` · ${prospect.researchActorLabel}` : ""}`;
}

function inspectionComplete(prospect: ScoutingProspectView): boolean {
  return Boolean(prospect.inspectedAt) && REQUIRED_INSPECTION_CHECKS.every(check => prospect.inspectionChecks.includes(check));
}

function scoutingPriority(prospect: ScoutingProspectView, now: number): number {
  if (prospect.nextContactAt !== undefined && prospect.nextContactAt <= now) return prospect.nextContactAt;
  if (!prospect.outreachAttempts.length) return now + 1;
  return prospect.nextContactAt ?? prospect.updatedAt + 10_000_000_000;
}

function qualificationLabel(prospect: ScoutingProspectView): string {
  if (prospect.doNotContact) return "Held";
  return ({ unreviewed: "Unreviewed", researching: "Researching", ready: "Ready", outreach: "In outreach", engaged: "Engaged", "not-now": "Not now" })[prospect.qualificationState];
}

function qualificationTone(prospect: ScoutingProspectView): string {
  if (prospect.doNotContact) return "bg-red-100 text-red-700";
  if (prospect.qualificationState === "engaged") return "bg-emerald-100 text-emerald-700";
  if (prospect.qualificationState === "outreach") return "bg-blue-100 text-blue-700";
  if (prospect.qualificationState === "ready") return "bg-amber-100 text-amber-700";
  return "bg-black/[0.06] text-black/65";
}

function sourceLabel(source: string): string {
  return source.split("-").map(part => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part).join(" ");
}

function formatDateTime(value: number): string {
  return formatUkDate(value, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Ed's finding (2026-08-30): three of these metrics have NO per-actor
// attribution on their records (capturedAt/qualified/converted carry no user),
// so a "personal" quota on them silently counted the whole workspace. Labelled
// honestly rather than removed — for a one-person agency they are the same
// number, and the label is what keeps the ring truthful when staff join.
const QUOTA_METRIC_LABELS: Record<ScoutingQuotaViewModel["quotas"][number]["metric"], string> = {
  "prospects-scouted": "prospects scouted (whole workspace)",
  "calls-made": "calls made",
  "emails-sent": "emails sent",
  "leads-qualified": "leads qualified (whole workspace)",
  "clients-converted": "clients converted (whole workspace)",
};

function ScoutingQuotaStrip({ quota, writable }: { quota?: ScoutingQuotaViewModel; writable: boolean }) {
  const [creating, setCreating] = useState(false);
  const [metric, setMetric] = useState<ScoutingQuotaViewModel["quotas"][number]["metric"]>("calls-made");
  const [recurrence, setRecurrence] = useState<"daily" | "weekly">("daily");
  const [target, setTarget] = useState("20");
  const [note, setNote] = useState<string | null>(null);
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  async function createQuota(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;   // a slow submit must not create the target twice
    const value = Number(target);
    if (!Number.isFinite(value) || value <= 0) { setNote("Pick a number above zero."); return; }
    setSaving(true);
    try {
      // The same store and route the Actions calendar already uses for
      // goal/target entries — one target system, another door onto it.
      const response = await fetch("/api/portal/calendar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "target",
          title: `${value} ${QUOTA_METRIC_LABELS[metric]} ${recurrence === "daily" ? "a day" : "a week"}`,
          startsAt: Date.now(),
          allDay: true,
          targetValue: value,
          targetUnit: QUOTA_METRIC_LABELS[metric],
          recurrence,
          metric,
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "The target could not be saved.");
      setCreating(false);
      setNote(null);
      router.refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  if (!quota && !writable) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-black/10 bg-white px-4 py-2.5 sm:px-5">
      {(quota?.quotas ?? []).map(item => <QuotaRing key={item.entryId} quota={item} />)}
      {quota && quota.streakDays > 1 ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800" title="Consecutive days with at least one outreach attempt">
          <Flame size={13} aria-hidden /> {quota.streakDays}-day streak
        </span>
      ) : null}
      {writable && creating ? (
        <form onSubmit={createQuota} className="flex flex-wrap items-center gap-2 text-xs">
          <input value={target} onChange={event => setTarget(event.target.value)} inputMode="numeric" className="min-h-11 w-16 rounded-md border border-black/15 px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2" aria-label="Target number" />
          <select value={metric} onChange={event => setMetric(event.target.value as typeof metric)} className="min-h-11 rounded-md border border-black/15 px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2" aria-label="What to count">
            {Object.entries(QUOTA_METRIC_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <select value={recurrence} onChange={event => setRecurrence(event.target.value as "daily" | "weekly")} className="min-h-11 rounded-md border border-black/15 px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2" aria-label="How often it resets">
            <option value="daily">a day</option>
            <option value="weekly">a week</option>
          </select>
          <button type="submit" disabled={saving} className="min-h-11 rounded-md bg-black/85 px-3 py-1.5 font-semibold text-white hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:opacity-50">{saving ? "Saving…" : "Set"}</button>
          <button type="button" onClick={() => { setCreating(false); setNote(null); }} className="min-h-11 rounded-md px-2 text-black/65 hover:text-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Cancel</button>
          {note ? <span role="alert" className="text-red-700">{note}</span> : null}
        </form>
      ) : writable ? (
        <button type="button" onClick={() => setCreating(true)} className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-dashed border-black/25 px-3 py-1.5 text-xs font-medium text-black/65 hover:border-black/45 hover:text-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
          <Target size={13} aria-hidden /> Set a target
        </button>
      ) : null}
    </div>
  );
}

/**
 * One quota as a ring. SVG stroke-dasharray, no library. Hitting the target
 * swaps the number for a check and one congratulatory line; the pulse rides a
 * CSS transition that prefers-reduced-motion already clamps app-wide, and the
 * DONE state itself is a static change — nobody needs motion to see it.
 */
function QuotaRing({ quota }: { quota: ScoutingQuotaViewModel["quotas"][number] }) {
  const done = quota.current >= quota.target;
  const fraction = Math.min(1, quota.current / quota.target);
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  return (
    <span
      className="inline-flex items-center gap-2"
      title={`${quota.current} of ${quota.target} ${QUOTA_METRIC_LABELS[quota.metric]} ${quota.recurrence === "daily" ? "today" : "this week"}`}
    >
      <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden className={done ? "scale-105 transition-transform" : "transition-transform"}>
        <circle cx="19" cy="19" r={radius} fill="none" stroke="rgb(0 0 0 / 0.08)" strokeWidth="3.5" />
        <circle
          cx="19" cy="19" r={radius} fill="none"
          stroke={done ? "#187554" : "var(--brand-primary, #0B6F6D)"}
          strokeWidth="3.5" strokeLinecap="round"
          strokeDasharray={`${fraction * circumference} ${circumference}`}
          transform="rotate(-90 19 19)"
          style={{ transition: "stroke-dasharray 400ms ease" }}
        />
        {done ? <path d="M12 19.5l4.5 4.5L26 14.5" fill="none" stroke="#187554" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
      </svg>
      <span className="text-xs leading-4">
        <strong className="block font-semibold text-black/80">
          {done ? "Target hit!" : `${quota.current}/${quota.target}`}
        </strong>
        <span className="text-black/65">
          {QUOTA_METRIC_LABELS[quota.metric]} {quota.recurrence === "daily" ? "today" : "this week"}
          {done && quota.recurrence === "weekly" ? (
            <> · <a href="/portal/agency/you-deserve-it" className="rounded-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-1">Pick something from You deserve it →</a></>
          ) : null}
        </span>
      </span>
    </span>
  );
}
