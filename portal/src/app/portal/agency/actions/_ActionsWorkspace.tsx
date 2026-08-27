"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlarmClock, ArrowUpDown, ArrowUpRight, Bell, BookOpen, Bot, BriefcaseBusiness, Building2, CalendarCheck2, CalendarDays, CalendarRange, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CirclePause, Clock3, Cloud, CloudOff, ExternalLink, Flag, Inbox, Info, Layers3, List, LoaderCircle, NotebookPen, Pencil, Plus, Radar, RefreshCw, Repeat2, Save, Search, Settings2, ShieldCheck, Sparkles, Target, Trash2, UserRound, Workflow, X } from "lucide-react";
import type { AdvisorActionSuggestion } from "@/lib/advisor/advisorActions";
import {
  buildProtectedAttentionWindow,
  promoteForDeferrals,
  type ProtectedAttentionWindow,
} from "@/lib/intelligence/attentionProtection";
import { AttentionControls } from "@/components/attention/AttentionControls";
import type { ResolutionKind } from "@/lib/inbox/resolutionExplain";
import { EvidenceCard } from "@/components/attention/EvidenceCard";
import { CompletedRegister } from "@/components/attention/CompletedRegister";
import { DeferralNote } from "@/components/attention/DeferralNote";

import { TaskChecklist } from "@/components/attention/TaskChecklist";
import { TaskTemplateModal } from "@/components/attention/TaskTemplates";

import { TodayView } from "./_TodayView";
import { dateInputValue, formatUkDate } from "@/lib/shared/formatDateTime";
import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";
import type { AgencyTask, AgencyTaskOrigin, AgencyTaskPriority, AgencyTaskRecurrence, AgencyTaskStatus, CommandCalendarConnection, CommandCalendarEntry, CommandCalendarEntryType, CommandCalendarExternalEvent, CommandCalendarSource, ExternalAssistantActionProposal, PortalFormFieldDefinition, SopDocument } from "@/server/types";
import { useNotificationAttention } from "@/components/chrome/NotificationAttentionProvider";
import { PortalCustomFields, type PortalCustomFieldValues } from "@/components/forms/PortalCustomFields";

export type GeneratedAction = {
  id: string;
  title: string;
  detail: string;
  href: string;
  kind: string;
  dueAt?: number;
  priority: "normal" | "high" | "urgent";
  clientId?: string;
  // Defaults to "crm" for the pipeline-derived signals that predate this.
  // Needs-attention alerts set "inbox" so they are not mislabelled.
  origin?: Extract<AgencyTaskOrigin, "crm" | "inbox">;
  /** Lands on the exact record behind this, not the list containing it. */
  evidenceHref?: string;
  /**
   * How many times this has been put off, and since when.
   *
   * Off-system work is the case that needs it: nothing in Aqua does the job,
   * so the only pressure to act is knowing how long you have not.
   */
  deferrals?: number;
  firstDeferredAt?: number;
  /**
   * How it can be dealt with, declared by the check. Named apart from `kind`
   * above, which is the badge label ("Needs attention"), not a classification.
   */
  resolutionKind?: ResolutionKind;
};

export type TeamMember = { id: string; name: string; email: string };
export type ActionClient = { id: string; name: string; status: string; stage: string };
type CalendarConnectionView = Omit<CommandCalendarConnection, "encryptedAccessToken" | "encryptedRefreshToken"> & { canRefresh: boolean };
type CalendarIntegrationState = { configured: boolean; connections: CalendarConnectionView[]; sources: CommandCalendarSource[]; events: CommandCalendarExternalEvent[] };

export type ActionsView = "list" | "calendar";
// "completed" is a view, not an origin — it shows finished work from every
// origin at once.
// "today" and "completed" are views over the same work, not origins.
type ActionSource = "all" | "today" | "completed" | AgencyTaskOrigin;
type ActionSort = "priority" | "due-soon" | "newest" | "oldest" | "recently-updated";
type UnifiedActionItem =
  | { type: "task"; id: string; source: AgencyTaskOrigin; priority: AgencyTaskPriority; dueAt?: number; createdAt: number; updatedAt: number; task: AgencyTask }
  | { type: "suggestion"; id: string; source: "radar" | "advisor"; priority: AgencyTaskPriority; dueAt?: number; createdAt: number; updatedAt: number; suggestion: AdvisorActionSuggestion }
  | { type: "proposal"; id: string; source: "advisor"; priority: AgencyTaskPriority; dueAt?: number; createdAt: number; updatedAt: number; proposal: ExternalAssistantActionProposal }
  | { type: "crm"; id: string; source: "crm"; priority: AgencyTaskPriority; dueAt?: number; createdAt: number; updatedAt: number; action: GeneratedAction };

export function ActionsWorkspace({
  initialTasks,
  initialExternalProposals,
  generatedActions,
  commandRecommendations,
  recommendationsGeneratedAt,
  advisorConfigured,
  team,
  clients,
  sops,
  taskCustomFields,
  calendarEvents = [],
  initialCalendarEntries = [],
  initialCalendarIntegration,
  initialView = "list",
  heading = "Actions",
  description = "Everything that needs to happen, who owns it, and when it is due.",
}: {
  initialTasks: AgencyTask[];
  initialExternalProposals: ExternalAssistantActionProposal[];
  generatedActions: GeneratedAction[];
  commandRecommendations: AdvisorActionSuggestion[];
  recommendationsGeneratedAt: number;
  advisorConfigured: boolean;
  team: TeamMember[];
  clients: ActionClient[];
  sops: SopDocument[];
  taskCustomFields: PortalFormFieldDefinition[];
  calendarEvents?: GeneratedAction[];
  initialCalendarEntries?: CommandCalendarEntry[];
  initialCalendarIntegration: CalendarIntegrationState;
  initialView?: ActionsView;
  heading?: string;
  description?: string;
}) {
  const router = useRouter();
  const attention = useNotificationAttention();
  const [tasks, setTasks] = useState(initialTasks);
  const [calendarEntries, setCalendarEntries] = useState(initialCalendarEntries);
  const [calendarIntegration, setCalendarIntegration] = useState(initialCalendarIntegration);
  const [externalProposals, setExternalProposals] = useState(initialExternalProposals);
  const notificationAttention = useNotificationAttention();
  const [crmIntake, setCrmIntake] = useState(generatedActions);
  // One list. Needs-attention work and pipeline signals are both "things Aqua
  // noticed that you have not accepted yet" — splitting them made you check
  // two tabs for the same job. The per-row origin badge keeps the provenance.
  const [source, setSource] = useState<ActionSource>("all");
  const [sort, setSort] = useState<ActionSort>("priority");
  const [view, setView] = useState<ActionsView>(initialView);
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pickingTemplate, setPickingTemplate] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [linkedTaskId, setLinkedTaskId] = useState<string | null>(null);
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [advisorSuggestions, setAdvisorSuggestions] = useState<AdvisorActionSuggestion[]>([]);
  const [advisorBusy, setAdvisorBusy] = useState(false);
  const [advisorError, setAdvisorError] = useState("");
  const [advisorReviewedAt, setAdvisorReviewedAt] = useState<number | null>(null);
  const [addingSuggestionId, setAddingSuggestionId] = useState<string | null>(null);
  const [acceptanceError, setAcceptanceError] = useState("");
  const [taskError, setTaskError] = useState("");
  const [liveRecommendations, setLiveRecommendations] = useState(commandRecommendations);
  const [proposalBusyId, setProposalBusyId] = useState<string | null>(null);
  const openTasks = tasks.filter(task => task.status !== "done");
  const sourceTasks = tasks.filter(task => source === "all" || taskOrigin(task) === source);
  const visibleTasks = useMemo(
    () => sortTasks(showDone ? sourceTasks : sourceTasks.filter(task => task.status !== "done"), sort),
    [showDone, sort, sourceTasks],
  );
  const filteredOpenTasks = sourceTasks.filter(task => task.status !== "done");
  const overdue = filteredOpenTasks.filter(task => task.dueAt && task.dueAt < startOfDay(Date.now())).length;
  const pendingCount = (source === "all" || source === "radar" ? liveRecommendations.length : 0)
    + (source === "all" || source === "advisor" ? advisorSuggestions.length + externalProposals.filter(item => item.status === "pending").length : 0)
    + (source === "all" || source === "crm" ? crmIntake.length : 0);
  const sourceCounts = sourceCountMap(openTasks, liveRecommendations, advisorSuggestions, crmIntake, externalProposals);
  const unifiedItems = useMemo(() => buildUnifiedActionQueue({
    tasks: showDone ? tasks : openTasks,
    radar: liveRecommendations,
    advisor: advisorSuggestions,
    proposals: externalProposals,
    crm: crmIntake,
    recommendationsGeneratedAt,
    advisorReviewedAt,
    sort,
  }), [advisorReviewedAt, advisorSuggestions, crmIntake, externalProposals, liveRecommendations, openTasks, recommendationsGeneratedAt, showDone, sort, tasks]);
  const protectedWindow = useMemo(() => buildProtectedAttentionWindow(unifiedItems, {
    groupKey: item => item.source,
    // Work put off repeatedly is promoted a tier, so it breaks out of the
    // reserve rather than being hidden by the very act of deferring it.
    urgencyRank: item => promoteForDeferrals(priorityRank(item.priority), deferralsOf(item)),
    enabled: attention?.focusProtectionEnabled ?? true,
  }), [attention?.focusProtectionEnabled, unifiedItems]);
  const unifiedWindow = useMemo(
    () => promoteLinkedTask(protectedWindow, linkedTaskId),
    [linkedTaskId, protectedWindow],
  );

  const refreshExternalProposals = useCallback(async () => {
    const response = await fetch("/api/portal/external-ai/proposals", { method: "GET", cache: "no-store" }).catch(() => null);
    if (!response?.ok) return false;
    const result = await response.json().catch(() => null) as { proposals?: ExternalAssistantActionProposal[] } | null;
    if (!result?.proposals) return false;
    setExternalProposals(result.proposals);
    return true;
  }, []);

  useEffect(() => {
    const refreshWhenActive = () => {
      if (!document.hidden) void refreshExternalProposals();
    };
    const interval = window.setInterval(refreshWhenActive, 30_000);
    window.addEventListener("focus", refreshWhenActive);
    document.addEventListener("visibilitychange", refreshWhenActive);
    window.addEventListener("hashchange", refreshWhenActive);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenActive);
      document.removeEventListener("visibilitychange", refreshWhenActive);
      window.removeEventListener("hashchange", refreshWhenActive);
    };
  }, [refreshExternalProposals]);

  useEffect(() => {
    const targetId = decodeURIComponent(window.location.hash.slice(1));
    if (targetId.startsWith("task-")) {
      const taskId = targetId.slice("task-".length);
      const task = tasks.find(item => item.id === taskId);
      setView("list");
      setSource("all");
      setLinkedTaskId(taskId);
      setEditing(taskId);
      if (task?.status === "done") setShowDone(true);
      return;
    }
    setLinkedTaskId(null);
    if (!targetId.startsWith("external-proposal-")) return;
    window.requestAnimationFrame(() => document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [externalProposals, tasks]);

  useEffect(() => {
    if (!editing) return;
    const targetId = `task-${editing}`;
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" })));
  }, [editing, unifiedWindow]);

  async function patchTask(id: string, patch: Partial<AgencyTask>) {
    setTaskError("");
    try {
      const response = await fetch("/api/portal/tasks", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; field?: string; task?: AgencyTask; tasks?: AgencyTask[] } | null;
      if (!response.ok || !result?.ok || !result.task) throw new Error(result?.error || "The task could not be saved.");
      setTasks(result.tasks ?? (current => current.map(task => task.id === id ? result.task as AgencyTask : task)));
      void attention?.refreshAlerts();
      router.refresh();
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "The task could not be saved.");
    }
  }

  async function deleteTask(id: string) {
    const response = await fetch(`/api/portal/tasks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) {
      setTasks(current => current.filter(task => task.id !== id));
      void attention?.refreshAlerts();
      router.refresh();
    }
  }

  async function requestAdvisorReview() {
    setAdvisorBusy(true);
    setAdvisorError("");
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "suggest-actions" }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; suggestions?: AdvisorActionSuggestion[]; generatedAt?: number } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error || "Aqua Advisor could not review the business right now.");
      const acceptedSourceIds = new Set(tasks.filter(task => task.status !== "done").map(task => task.sourceId).filter(Boolean));
      const acceptedTitles = new Set(tasks.filter(task => task.status !== "done").map(task => normaliseTitle(task.title)));
      setAdvisorSuggestions((result.suggestions ?? []).filter(suggestion => !acceptedSourceIds.has(suggestion.id) && !acceptedTitles.has(normaliseTitle(suggestion.title))));
      setAdvisorReviewedAt(result.generatedAt ?? Date.now());
    } catch (error) {
      setAdvisorError(error instanceof Error ? error.message : "Aqua Advisor could not review the business right now.");
    } finally {
      setAdvisorBusy(false);
    }
  }

  async function acceptSuggestion(suggestion: AdvisorActionSuggestion, origin: "radar" | "advisor") {
    setAddingSuggestionId(suggestion.id);
    setAdvisorError("");
    setAcceptanceError("");
    try {
      const response = await fetch("/api/portal/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: suggestion.title,
          notes: `${suggestion.detail}\n\nEvidence reviewed by ${origin === "radar" ? "Business Radar" : "Aqua Advisor"}: ${suggestion.evidence}`,
          priority: suggestion.priority,
          dueAt: suggestion.dueAt,
          origin,
          sourceId: suggestion.id,
          sourceHref: suggestion.href,
          evidence: [suggestion.evidence],
          evidenceSourceIds: suggestion.sourceAlertIds,
          expectedOutcome: `Resolve the linked condition and confirm Radar no longer reports it.`,
          reconciliationSourceIds: suggestion.sourceAlertIds,
          clientId: clientIdFromHref(suggestion.href),
        }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; task?: AgencyTask } | null;
      if (!response.ok || !result?.ok || !result.task) throw new Error(result?.error || "The suggested task could not be added.");
      setTasks(current => [result.task as AgencyTask, ...current]);
      if (origin === "advisor") setAdvisorSuggestions(current => current.filter(item => item.id !== suggestion.id));
      if (origin === "radar") setLiveRecommendations(current => current.filter(item => item.id !== suggestion.id));
      void attention?.refreshAlerts();
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "The suggested task could not be added.";
      setAdvisorError(message);
      setAcceptanceError(message);
    } finally {
      setAddingSuggestionId(null);
    }
  }

  // Park and dismiss route through the same provider Master Inbox uses, so an
  // item parked here is parked there too. Two independent stores would let the
  // same alert be live in one place and parked in the other.
  async function handleAttentionAction(action: GeneratedAction, kind: "park" | "dismiss", until?: number) {
    const alertId = action.id.startsWith("attention:") ? action.id.slice("attention:".length) : action.id;
    const ok = await notificationAttention?.updateAlert(alertId, kind, until);
    // Only drop it from view once the server confirmed — otherwise a failed
    // call silently looks like success and the item comes back on refresh.
    if (ok) setCrmIntake(current => current.filter(item => item.id !== action.id));
  }

  // Off-system work is finished elsewhere; all Aqua can do is record it.
  // Logged as completed AND dismissed, so it both leaves the queue and appears
  // in the register — recording it without clearing it would leave the
  // operator looking at work they have already done.
  async function markAttentionDone(action: GeneratedAction) {
    const alertId = alertIdOf(action);
    setAddingSuggestionId(action.id);
    try {
      const response = await fetch("/api/portal/attention/completed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceId: alertId, title: action.title, detail: action.detail }),
      });
      const result = await response.json() as { ok: boolean };
      if (!result.ok) return;
      await notificationAttention?.updateAlert(alertId, "dismiss");
      setCrmIntake(current => current.filter(item => item.id !== action.id));
    } finally {
      setAddingSuggestionId(null);
    }
  }

  // A postponed action lands on a real date so it reappears then, and shows up
  // in the calendar alongside everything else committed to that day. Hiding it
  // instead would make it somebody's forgotten problem.
  async function postponeTask(task: AgencyTask, until: number) {
    setAddingSuggestionId(task.id);
    try {
      await patchTask(task.id, { dueAt: until });
    } finally {
      setAddingSuggestionId(null);
    }
  }

  async function completeTask(task: AgencyTask) {
    setAddingSuggestionId(task.id);
    try {
      // Goes through the same patch as anywhere else, so it lands in the
      // completed register rather than just disappearing.
      await patchTask(task.id, { status: "done" });
    } finally {
      setAddingSuggestionId(null);
    }
  }

  async function acceptCrmAction(action: GeneratedAction) {
    setAddingSuggestionId(action.id);
    setAcceptanceError("");
    try {
      const response = await fetch("/api/portal/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: action.title,
          notes: `${action.detail}\n\nAccepted from ${action.origin === "inbox" ? "a Needs attention alert" : "AquaCRM's live workspace signals"}.`,
          priority: action.priority,
          dueAt: action.dueAt,
          origin: action.origin ?? "crm",
          sourceId: action.id,
          sourceHref: action.href,
          clientId: action.clientId,
        }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; task?: AgencyTask } | null;
      if (!response.ok || !result?.ok || !result.task) throw new Error(result?.error || "The CRM task could not be accepted.");
      setTasks(current => [result.task as AgencyTask, ...current]);
      setCrmIntake(current => current.filter(item => item.id !== action.id));
      void attention?.refreshAlerts();
      router.refresh();
    } catch (error) {
      setAcceptanceError(error instanceof Error ? error.message : "The CRM task could not be accepted.");
    } finally {
      setAddingSuggestionId(null);
    }
  }

  async function decideExternalProposal(proposal: ExternalAssistantActionProposal, decision: "accept" | "park" | "reject", options?: { assigneeUserId?: string; dueAt?: number }) {
    setProposalBusyId(proposal.id);
    setAcceptanceError("");
    try {
      const response = await fetch("/api/portal/external-ai/proposals", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          proposalId: proposal.id,
          decision,
          assigneeUserId: options?.assigneeUserId,
          dueAt: options?.dueAt,
          parkedUntil: decision === "park" ? Date.now() + 86_400_000 : undefined,
        }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; task?: AgencyTask; proposals?: ExternalAssistantActionProposal[] } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error || "The proposal decision could not be saved.");
      if (result.task) setTasks(current => [result.task as AgencyTask, ...current.filter(task => task.id !== result.task?.id)]);
      if (result.proposals) setExternalProposals(result.proposals);
      void attention?.refreshAlerts();
      router.refresh();
    } catch (error) {
      setAcceptanceError(error instanceof Error ? error.message : "The proposal decision could not be saved.");
    } finally {
      setProposalBusyId(null);
    }
  }

  return <div className={`mx-auto flex w-full flex-col gap-5 ${initialView === "calendar" ? "max-w-none" : "max-w-7xl"}`}>
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-brand">{initialView === "calendar" ? "Schedule" : "Work"}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-black/90">{heading}</h1><p className="mt-2 text-sm text-black/50">{description}</p></div>
      {initialView !== "calendar" ? <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        {/* Offered beside the blank form rather than inside it: reaching for a
            template is a decision about which job this is, made before there
            is anything to type. */}
        <button type="button" onClick={() => setPickingTemplate(true)} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-black/15 px-4 text-sm font-semibold text-black/70 hover:bg-black/[0.035] sm:flex-none"><BookOpen size={16} />Use a template</button>
        <button type="button" onClick={() => setAdding(true)} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white sm:flex-none"><Plus size={16} />Add task</button>
      </div> : null}
    </header>

    {initialView !== "calendar" ? <section aria-label="Action controls" className="overflow-hidden rounded-lg border border-black/10 bg-white">
      <ActionSourceFilters source={source} counts={sourceCounts} onChange={setSource} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 px-3 py-3 sm:px-4">
        <div className="grid w-full grid-cols-3 gap-2 text-xs sm:flex sm:w-auto sm:gap-5 sm:text-sm"><span><strong className="text-black/85">{filteredOpenTasks.length + pendingCount}</strong> open</span><span className={overdue ? "text-red-700" : "text-black/45"}><strong>{overdue}</strong> overdue</span><span className="text-black/45"><strong>{pendingCount}</strong> awaiting approval</span></div>
        <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
          <label className="inline-flex min-h-9 items-center gap-2 text-xs text-black/50"><ArrowUpDown size={14} /><span className="sr-only sm:not-sr-only">Sort</span><select aria-label="Sort actions" value={sort} onChange={event => setSort(event.target.value as ActionSort)} className="min-h-9 rounded-md border border-black/10 bg-white px-2 text-xs font-medium text-black/65"><option value="priority">Priority</option><option value="due-soon">Due soon</option><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="recently-updated">Recently updated</option></select></label>
          <label className="flex min-h-9 items-center gap-2 text-xs text-black/50"><input type="checkbox" checked={showDone} onChange={event => setShowDone(event.target.checked)} />Show completed</label>
          <div className="flex rounded-md border border-black/10 bg-white p-0.5">
            <ModeButton active={view === "list"} onClick={() => setView("list")} icon={<List size={15} />} label="List" />
            <ModeButton active={view === "calendar"} onClick={() => setView("calendar")} icon={<CalendarDays size={15} />} label="Calendar" />
          </div>
        </div>
      </div>
    </section> : null}

    {acceptanceError ? <p role="alert" className="border-l-2 border-red-500 pl-3 text-xs leading-5 text-red-700">{acceptanceError}</p> : null}
    {taskError ? <p role="alert" className="border-l-2 border-red-500 pl-3 text-xs leading-5 text-red-700">{taskError}</p> : null}

    {view === "list" ? source === "all" ? <UnifiedActionQueue
      window={unifiedWindow}
      team={team}
      clients={clients}
      sops={sops}
      taskCustomFields={taskCustomFields}
      editing={editing}
      addingId={addingSuggestionId}
      proposalBusyId={proposalBusyId}
      advisorConfigured={advisorConfigured}
      advisorBusy={advisorBusy}
      advisorError={advisorError}
      onEdit={id => setEditing(current => current === id ? null : id)}
      onPatch={patchTask}
      onDelete={deleteTask}
      onAcceptSuggestion={acceptSuggestion}
      onAcceptCrm={acceptCrmAction}
      onAttentionAction={handleAttentionAction}
      onMarkDone={markAttentionDone}
      onProposalDecision={decideExternalProposal}
      onAdvisorReview={requestAdvisorReview}
      onDismissAdvisor={id => setAdvisorSuggestions(current => current.filter(item => item.id !== id))}
      onOpenSource={setSource}
    /> : <>
      {source === "radar" ? <CommandRecommendations recommendations={liveRecommendations} generatedAt={recommendationsGeneratedAt} addingId={addingSuggestionId} onAdd={suggestion => acceptSuggestion(suggestion, "radar")} /> : null}
      {source === "advisor" ? <ExternalAiProposalInbox proposals={externalProposals} team={team} busyId={proposalBusyId} onDecision={decideExternalProposal} /> : null}
      {source === "advisor" ? <AdvisorPanel configured={advisorConfigured} suggestions={advisorSuggestions} busy={advisorBusy} reviewedAt={advisorReviewedAt} error={advisorError} addingId={addingSuggestionId} onReview={requestAdvisorReview} onAdd={suggestion => acceptSuggestion(suggestion, "advisor")} onDismiss={id => setAdvisorSuggestions(current => current.filter(item => item.id !== id))} /> : null}
      {source === "crm" ? <CrmIntake actions={crmIntake} addingId={addingSuggestionId} onAccept={acceptCrmAction} onAttentionAction={handleAttentionAction} onMarkDone={markAttentionDone} /> : null}
      {source === "today" ? <TodayView
        tasks={tasks}
        entries={calendarEntries}
        // The needs-attention alerts already held here (origin "inbox"). They
        // are the un-accepted "do this now" items — surfaced in Today so one
        // glance shows attention alerts alongside today's actions. Deduped
        // upstream against alerts already accepted as tasks, so no double count.
        attentionActions={crmIntake.filter(action => action.origin === "inbox")}
        busyId={addingSuggestionId}
        onComplete={task => void completeTask(task)}
        onPostpone={(task, until) => void postponeTask(task, until)}
        // Both resolution paths kept intact: an alert clears through the
        // operational-alert store, a task clears via completeTask/postponeTask.
        onAttentionAction={handleAttentionAction}
        onMarkAttentionDone={markAttentionDone}
        onOpenCalendar={() => setView("calendar")}
      /> : null}
      {source === "completed" ? <section aria-labelledby="completed-heading" className="overflow-hidden rounded-lg border border-black/10 bg-white"><header className="border-b border-black/10 bg-black/[0.02] px-4 py-4 sm:px-5"><h2 id="completed-heading" className="text-lg font-semibold text-black/82">Completed</h2><p className="mt-1 text-xs leading-5 text-black/48">Everything you have resolved, accepted or judged not worth acting on.</p></header><CompletedRegister /></section> : null}

      <section data-resolution-focus="task" aria-label="Accepted actions" className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-black/10 pb-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-black/40">Accepted actions</p><h2 className="mt-1 text-lg font-semibold text-black/80">{`${sourceLabel(source)} tasks`}</h2></div><span className="text-xs text-black/40">{visibleTasks.length} shown</span></div>
        {visibleTasks.map(task => <TaskCard key={task.id} task={task} team={team} clients={clients} sops={sops} customFields={taskCustomFields} expanded={editing === task.id} onToggle={() => setEditing(current => current === task.id ? null : task.id)} onPatch={patch => patchTask(task.id, patch)} onDelete={() => deleteTask(task.id)} />)}
        {!visibleTasks.length ? <div className="py-12 text-center"><Check className="mx-auto text-emerald-600" size={24} /><h2 className="mt-3 text-sm font-semibold text-black/70">No accepted tasks in this view</h2><p className="mt-1 text-xs text-black/42">Create one manually or approve a suggested task above.</p></div> : null}
      </section>
    </> : <CalendarView
      month={month}
      tasks={sourceTasks}
      actions={source === "all" || source === "crm" ? calendarEvents : []}
      entries={calendarEntries}
      integration={calendarIntegration}
      team={team}
      clients={clients}
      customFields={taskCustomFields}
      onNavigate={amount => setMonth(addMonths(month, amount))}
      onToday={() => setMonth(startOfMonth(new Date()))}
      onTaskCreated={task => setTasks(current => [task, ...current.filter(item => item.id !== task.id)])}
      onTaskUpdated={task => setTasks(current => current.map(item => item.id === task.id ? task : item))}
      onEntriesChange={setCalendarEntries}
      onIntegrationChange={setCalendarIntegration}
    />}

    {adding ? <TaskModal team={team} clients={clients} sops={sops} customFields={taskCustomFields} onClose={() => setAdding(false)} onCreated={task => { setTasks(current => [task, ...current]); setAdding(false); }} /> : null}
    {pickingTemplate ? <TaskTemplateModal sops={sops} onClose={() => setPickingTemplate(false)} onCreated={task => { setTasks(current => [task, ...current]); setPickingTemplate(false); setEditing(task.id); }} /> : null}
  </div>;
}

function ActionSourceFilters({ source, counts, onChange }: { source: ActionSource; counts: Record<ActionSource, number>; onChange: (source: ActionSource) => void }) {
  const options: Array<{ id: ActionSource; label: string; icon: React.ReactNode }> = [
    { id: "all", label: "All", icon: <Layers3 size={15} /> },
    { id: "today", label: "Today", icon: <CalendarCheck2 size={15} /> },
    { id: "radar", label: "Radar", icon: <Radar size={15} /> },
    { id: "advisor", label: "Advisor", icon: <Bot size={15} /> },
    { id: "manual", label: "Manual", icon: <UserRound size={15} /> },
    { id: "crm", label: "CRM", icon: <Workflow size={15} /> },
    { id: "completed", label: "Completed", icon: <CheckCircle2 size={15} /> },
  ];
  return <div role="tablist" aria-label="Filter actions by source" className="flex w-full gap-1 overflow-x-auto p-1.5">
    {options.map(option => <button key={option.id} type="button" role="tab" aria-selected={source === option.id} onClick={() => onChange(option.id)} className={`inline-flex min-h-10 min-w-max flex-1 items-center justify-center gap-2 rounded-md px-3 text-xs font-semibold transition ${source === option.id ? "bg-black text-white shadow-sm" : "text-black/52 hover:bg-black/[0.04] hover:text-black/75"}`}>{option.icon}<span>{option.label}</span>{/* No badge on Completed: its contents load separately, so a number
          here would always read 0 and be a lie about an empty register. */}
      {option.id === "completed" ? null : <span className={`grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[9px] tabular-nums ${source === option.id ? "bg-white/15 text-white" : "bg-black/[0.055] text-black/45"}`}>{counts[option.id]}</span>}</button>)}
  </div>;
}

function UnifiedActionQueue({
  window,
  team,
  clients,
  sops,
  taskCustomFields,
  editing,
  addingId,
  proposalBusyId,
  advisorConfigured,
  advisorBusy,
  advisorError,
  onEdit,
  onPatch,
  onDelete,
  onAcceptSuggestion,
  onAcceptCrm,
  onAttentionAction,
  onMarkDone,
  onProposalDecision,
  onAdvisorReview,
  onDismissAdvisor,
  onOpenSource,
}: {
  window: ProtectedAttentionWindow<UnifiedActionItem>;
  team: TeamMember[];
  clients: ActionClient[];
  sops: SopDocument[];
  taskCustomFields: PortalFormFieldDefinition[];
  editing: string | null;
  addingId: string | null;
  proposalBusyId: string | null;
  advisorConfigured: boolean;
  advisorBusy: boolean;
  advisorError: string;
  onEdit: (id: string) => void;
  onPatch: (id: string, patch: Partial<AgencyTask>) => void;
  onDelete: (id: string) => void;
  onAcceptSuggestion: (suggestion: AdvisorActionSuggestion, origin: "radar" | "advisor") => void;
  onAcceptCrm: (action: GeneratedAction) => void;
  onAttentionAction?: (action: GeneratedAction, kind: "park" | "dismiss", until?: number) => Promise<void>;
  onMarkDone?: (action: GeneratedAction) => Promise<void>;
  onProposalDecision: (proposal: ExternalAssistantActionProposal, decision: "accept" | "park" | "reject", options?: { assigneeUserId?: string; dueAt?: number }) => void;
  onAdvisorReview: () => void;
  onDismissAdvisor: (id: string) => void;
  onOpenSource: (source: ActionSource) => void;
}) {
  return <section data-resolution-focus="task" aria-labelledby="unified-actions-heading" className="grid gap-3">
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-black/10 pb-3">
      <div>
        <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-brand">Unified priority queue</p><span title="Committed tasks and approval candidates are ranked together. Source icons show where each item came from." className="inline-flex items-center gap-1 rounded-full bg-black/[0.045] px-2 py-0.5 text-[10px] font-medium text-black/48"><Info size={10} />System ranked</span></div>
        <h2 id="unified-actions-heading" className="mt-1 text-lg font-semibold text-black/82">{window.protected ? "Your protected attention window" : "Everything that needs a decision or action"}</h2>
        <p className="mt-1 text-xs text-black/45">{window.protected ? `${window.focus.length} highest-priority items are visible. ${window.reserveCount} remain safely retained and will promote as the focus clears.` : "Urgency, deadline and recency determine the order. Use the source filters for a deeper Radar, Advisor, Manual or CRM view."}</p>
      </div>
      {advisorConfigured ? <button type="button" onClick={onAdvisorReview} disabled={advisorBusy} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/60 hover:bg-black/[0.03] disabled:opacity-50">{advisorBusy ? <LoaderCircle size={13} className="animate-spin" /> : <Sparkles size={13} />}{advisorBusy ? "Reviewing..." : "Refresh Advisor"}</button> : <Link href="/portal/agency/company?view=connections&integration=openai" className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/60">Configure Advisor <ArrowUpRight size={13} /></Link>}
    </header>
    {window.protected ? <ActionReserveSummary window={window} onOpenSource={onOpenSource} /> : null}
    {advisorError ? <p role="alert" className="border-l-2 border-red-500 pl-3 text-xs leading-5 text-red-700">{advisorError}</p> : null}
    {window.focus.map(item => {
      if (item.type === "task") return <TaskCard key={item.id} task={item.task} team={team} clients={clients} sops={sops} customFields={taskCustomFields} expanded={editing === item.id} onToggle={() => onEdit(item.id)} onPatch={patch => onPatch(item.id, patch)} onDelete={() => onDelete(item.id)} />;
      if (item.type === "suggestion") return <UnifiedSuggestionCard key={item.id} suggestion={item.suggestion} source={item.source} busy={addingId === item.id} onAccept={() => onAcceptSuggestion(item.suggestion, item.source)} onDismiss={item.source === "advisor" ? () => onDismissAdvisor(item.id) : undefined} />;
      if (item.type === "proposal") return <ExternalProposalRow key={item.id} proposal={item.proposal} team={team} busy={proposalBusyId === item.id} onDecision={onProposalDecision} unified />;
      return <UnifiedCrmCard key={item.id} action={item.action} busy={addingId === item.id} onAccept={() => onAcceptCrm(item.action)} onAttentionAction={onAttentionAction} onMarkDone={onMarkDone} />;
    })}
    {!window.focus.length ? <div className="rounded-lg border border-dashed border-black/12 bg-white py-12 text-center"><Check className="mx-auto text-emerald-600" size={24} /><h2 className="mt-3 text-sm font-semibold text-black/70">The unified queue is clear</h2><p className="mt-1 text-xs text-black/42">New tasks and approval candidates will be ranked here automatically.</p></div> : null}
  </section>;
}

function ActionReserveSummary({ window, onOpenSource }: { window: ProtectedAttentionWindow<UnifiedActionItem>; onOpenSource: (source: ActionSource) => void }) {
  return <section className="rounded-lg border border-emerald-200/80 bg-emerald-50/60 p-4" aria-label="Action overload protection">
    <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-md bg-emerald-100 text-emerald-800"><ShieldCheck size={16} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">Attention shield · {window.level}</p><h3 className="mt-0.5 text-sm font-semibold text-emerald-950">Process five, not everything</h3></div><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-emerald-800 shadow-sm">{window.reserveCount} safely queued</span></div><p className="mt-1 text-xs leading-5 text-emerald-950/58">Nothing has been deleted or deprioritised out of existence. Clear the focus window and the system promotes the next best item automatically.</p></div></div>
    <div className="mt-3 flex flex-wrap gap-2">{window.reserveGroups.map(group => <button key={group.key} type="button" onClick={() => onOpenSource(group.key as ActionSource)} className="inline-flex min-h-8 items-center gap-2 rounded-md border border-emerald-900/10 bg-white px-2.5 text-xs font-semibold text-emerald-950/65 hover:border-emerald-900/20">{group.key === "radar" ? <Radar size={12} /> : group.key === "advisor" ? <Bot size={12} /> : group.key === "crm" ? <Workflow size={12} /> : <UserRound size={12} />}<span>{sourceLabel(group.key as Exclude<ActionSource, "all">)}</span><span className="tabular-nums text-emerald-700">{group.count}</span></button>)}</div>
  </section>;
}

function UnifiedSuggestionCard({ suggestion, source, busy, onAccept, onDismiss }: { suggestion: AdvisorActionSuggestion; source: "radar" | "advisor"; busy: boolean; onAccept: () => void; onDismiss?: () => void }) {
  const [showEvidence, setShowEvidence] = useState(false);
  // A radar suggestion carries the incident it came from; that is the id the
  // evidence builder keys on.
  const alertId = suggestion.sourceAlertIds?.[0] ?? suggestion.id;
  return <article className={`mm-surface-card mm-hover-lift rounded-lg border bg-white transition ${suggestion.priority === "urgent" ? "border-red-200" : "border-black/10"}`}>
    <div className="grid min-h-20 gap-3 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-4">
      <span className={`grid size-9 place-items-center rounded-md ${source === "radar" ? "bg-teal-50 text-teal-700" : "bg-violet-50 text-violet-700"}`}>{source === "radar" ? <Radar size={16} /> : <Bot size={16} />}</span>
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-black/82">{suggestion.title}</strong><SourceBadge origin={source} /><Priority value={suggestion.priority} /><ApprovalBadge /></div><p className="mt-1 text-xs leading-5 text-black/48">{suggestion.detail}</p><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-black/35"><strong className="font-semibold text-black/50">Evidence:</strong> {suggestion.evidence || "Open the linked source to inspect the supporting records."} · Due {formatUkDate(suggestion.dueAt, { day: "numeric", month: "short" })}</p></div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end"><button type="button" onClick={() => setShowEvidence(open => !open)} aria-expanded={showEvidence} title="Show the measurements behind this" className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold ${showEvidence ? "border-black/25 bg-black/[0.045] text-black/80" : "border-black/15 text-black/60 hover:bg-black/[0.035]"}`}><Search size={13} />Evidence</button>{onDismiss ? <button type="button" onClick={onDismiss} className="inline-flex min-h-9 items-center gap-1.5 px-2 text-xs font-medium text-black/42 hover:text-black"><X size={13} />Dismiss</button> : null}<button type="button" onClick={onAccept} disabled={busy} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-xs font-semibold text-white disabled:opacity-55">{busy ? <LoaderCircle className="animate-spin" size={13} /> : <Check size={13} />}{busy ? "Accepting..." : "Accept"}</button></div>
    </div>
    {showEvidence ? <div className="border-t border-black/[0.07] bg-black/[0.012]"><EvidenceCard alertId={alertId} fallback={{ title: suggestion.title, detail: suggestion.detail, href: suggestion.href }} /></div> : null}
  </article>;
}

function UnifiedCrmCard({ action, busy, onAccept, onAttentionAction, onMarkDone }: { action: GeneratedAction; busy: boolean; onAccept: () => void; onAttentionAction?: (action: GeneratedAction, kind: "park" | "dismiss", until?: number) => Promise<void>; onMarkDone?: (action: GeneratedAction) => Promise<void> }) {
  const [showEvidence, setShowEvidence] = useState(false);
  const alertId = alertIdOf(action);
  return <article data-resolution-record={action.id} className={`mm-surface-card mm-hover-lift scroll-mt-24 rounded-lg border bg-white transition ${action.priority === "urgent" ? "border-red-200" : "border-black/10"}`}>
    <div className="grid min-h-20 gap-3 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-4">
      <span className="grid size-9 place-items-center rounded-md bg-sky-50 text-sky-700"><Workflow size={16} /></span>
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-black/82">{action.title}</strong><SourceBadge origin={action.origin ?? "crm"} /><Pill>{action.kind}</Pill><Priority value={action.priority} /><DeferralNote deferrals={action.deferrals} firstDeferredAt={action.firstDeferredAt} /><ApprovalBadge /></div><p className="mt-1 text-xs leading-5 text-black/48">{action.detail}{action.dueAt ? ` · Due ${formatUkDate(action.dueAt, { day: "numeric", month: "short" })}` : ""}</p></div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {/* Inbox work carries the same controls it has in Master Inbox.
            The operator should not have to learn a second set of buttons for
            the same job depending on which screen they opened it from. */}
        {/* Every generated action carries the same controls. A pipeline signal
            is no less actionable than an inbox one, and giving it only a
            "Source" link made half the queue feel like a dead end. */}
        <AttentionControls
          title={action.title}
          kind={action.resolutionKind ?? "in-app"}
          resolveHref={action.href}
          busy={busy}
          evidenceOpen={showEvidence}
          onToggleEvidence={() => setShowEvidence(open => !open)}
          onMarkDone={onMarkDone ? () => void onMarkDone(action) : undefined}
          onPark={onAttentionAction ? (until: number) => void onAttentionAction(action, "park", until) : undefined}
          onDismiss={onAttentionAction ? () => void onAttentionAction(action, "dismiss") : undefined}
        />
        <button type="button" onClick={onAccept} disabled={busy} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-xs font-semibold text-white disabled:opacity-55">{busy ? <LoaderCircle className="animate-spin" size={13} /> : <Check size={13} />}{busy ? "Accepting..." : "Accept"}</button>
      </div>
    </div>
  </article>;
}

function ApprovalBadge() {
  return <span title="This is a recommendation, not committed work. Accept it to assign ownership and track resolution." className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700"><Info size={10} />Approval required</span>;
}

function CrmIntake({ actions, addingId, onAccept, onAttentionAction, onMarkDone }: { actions: GeneratedAction[]; addingId: string | null; onAccept: (action: GeneratedAction) => void; onAttentionAction?: (action: GeneratedAction, kind: "park" | "dismiss", until?: number) => Promise<void>; onMarkDone?: (action: GeneratedAction) => Promise<void> }) {
  return <section aria-labelledby="crm-intake-heading" className="overflow-hidden rounded-lg border border-sky-200/70 bg-white">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-sky-100 bg-sky-50/55 px-4 py-4 sm:px-5">
      <div className="flex min-w-0 items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-md bg-sky-100 text-sky-700"><Workflow size={18} /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-sky-700">CRM intake</p><h2 id="crm-intake-heading" className="mt-1 text-lg font-semibold text-black/82">{actions.length} live signal{actions.length === 1 ? "" : "s"} awaiting approval</h2><p className="mt-1 text-xs leading-5 text-black/48">AquaCRM can spot the work, but it does not enter your committed list until you accept it.</p></div></div>
      <Pill>Approval required</Pill>
    </header>
    <div className="divide-y divide-black/[0.07]">{actions.map(action => <GeneratedCard key={action.id} action={action} busy={addingId === action.id} onAccept={() => onAccept(action)} onAttentionAction={onAttentionAction} onMarkDone={onMarkDone} />)}{!actions.length ? <div className="px-5 py-7 text-center"><Check className="mx-auto text-emerald-600" size={20} /><p className="mt-2 text-sm font-semibold text-black/68">CRM intake is clear</p><p className="mt-1 text-xs text-black/42">New follow-ups and workspace signals will wait here for your approval.</p></div> : null}</div>
  </section>;
}

function ExternalAiProposalInbox({
  proposals,
  team,
  busyId,
  onDecision,
}: {
  proposals: ExternalAssistantActionProposal[];
  team: TeamMember[];
  busyId: string | null;
  onDecision: (proposal: ExternalAssistantActionProposal, decision: "accept" | "park" | "reject", options?: { assigneeUserId?: string; dueAt?: number }) => void;
}) {
  const actionable = proposals.filter(proposal => proposal.status === "pending");
  const parked = proposals.filter(proposal => proposal.status === "parked");
  const decided = proposals.filter(proposal => proposal.status === "accepted" || proposal.status === "rejected").slice(0, 12);
  return <section data-resolution-focus="approval" id="external-ai-proposals" aria-labelledby="external-ai-proposals-heading" className="scroll-mt-20 overflow-hidden rounded-lg border border-cyan-200/80 bg-white">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-cyan-100 bg-cyan-50/55 px-4 py-4 sm:px-5">
      <div className="flex min-w-0 items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-md bg-cyan-100 text-cyan-800"><Inbox size={18} /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-cyan-800">External AI proposal inbox</p><h2 id="external-ai-proposals-heading" className="mt-1 text-lg font-semibold text-black/82">{actionable.length} proposal{actionable.length === 1 ? "" : "s"} awaiting your decision</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-black/48">Outside assistants can place evidence here, but only you can turn it into owned work. Approval preserves the evidence and activates Radar reconciliation.</p></div></div>
      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-cyan-800 shadow-sm">Human approval boundary</span>
    </header>
    <div className="divide-y divide-black/[0.07]">
      {actionable.map(proposal => <ExternalProposalRow key={proposal.id} proposal={proposal} team={team} busy={busyId === proposal.id} onDecision={onDecision} />)}
      {!actionable.length ? <div className="px-5 py-7 text-center"><ShieldCheck className="mx-auto text-emerald-600" size={21} /><p className="mt-2 text-sm font-semibold text-black/68">Proposal inbox clear</p><p className="mt-1 text-xs text-black/42">New external recommendations will wait here rather than entering the task list.</p></div> : null}
    </div>
    {parked.length ? <details className="border-t border-black/10"><summary className="cursor-pointer list-none px-5 py-3 text-xs font-semibold text-amber-700">Parked for later ({parked.length})</summary><div className="divide-y divide-black/[0.06] border-t border-black/10">{parked.map(proposal => <div key={proposal.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs"><span className="min-w-0"><strong className="block truncate text-black/65">{proposal.title}</strong><span className="text-black/38">{proposal.assistantName} · returns {proposal.parkedUntil ? formatDateTime(proposal.parkedUntil) : "later"}</span></span><span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Parked</span></div>)}</div></details> : null}
    {decided.length ? <details className="border-t border-black/10"><summary className="cursor-pointer list-none px-5 py-3 text-xs font-semibold text-black/50">Recent decisions ({decided.length})</summary><div className="divide-y divide-black/[0.06] border-t border-black/10">{decided.map(proposal => <div key={proposal.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs"><span className="min-w-0"><strong className="block truncate text-black/65">{proposal.title}</strong><span className="text-black/38">{proposal.assistantName} · {proposal.decidedAt ? formatDateTime(proposal.decidedAt) : "Decision recorded"}</span></span><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${proposal.status === "accepted" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{proposal.status}</span></div>)}</div></details> : null}
  </section>;
}

function ExternalProposalRow({ proposal, team, busy, onDecision, unified = false }: { proposal: ExternalAssistantActionProposal; team: TeamMember[]; busy: boolean; onDecision: (proposal: ExternalAssistantActionProposal, decision: "accept" | "park" | "reject", options?: { assigneeUserId?: string; dueAt?: number }) => void; unified?: boolean }) {
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [dueAt, setDueAt] = useState(dateInput(proposal.suggestedDueAt ?? Date.now() + 3 * 86_400_000));
  return <article id={`external-proposal-${proposal.id}`} className={`scroll-mt-20 grid gap-4 px-4 py-4 target:bg-cyan-50/60 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)] lg:items-start ${unified ? "mm-surface-card mm-hover-lift rounded-lg border border-black/10 bg-white" : ""}`}>
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2"><SourceBadge origin="advisor" /><Priority value={proposal.priority} /><Pill>{proposal.category}</Pill><ApprovalBadge /><span className="text-[10px] font-medium text-black/38">{proposal.assistantName} · {formatDateTime(proposal.submittedAt)}</span>{proposal.status === "parked" ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Parked until {proposal.parkedUntil ? formatDateTime(proposal.parkedUntil) : "later"}</span> : null}</div>
      <h3 className="mt-2 text-sm font-semibold text-black/82">{proposal.title}</h3>
      <p className="mt-1 text-xs leading-5 text-black/52">{proposal.detail}</p>
      {proposal.expectedOutcome ? <p className="mt-2 border-l-2 border-cyan-300 pl-3 text-[11px] leading-5 text-black/45"><strong className="font-semibold text-black/62">Expected outcome:</strong> {proposal.expectedOutcome}</p> : null}
      {proposal.evidence.length ? <ul className="mt-2 grid gap-1 text-[10px] leading-4 text-black/38">{proposal.evidence.slice(0, 4).map((item, index) => <li key={`${proposal.id}-evidence-${index}`}>• {item}</li>)}</ul> : <p className="mt-2 text-[10px] text-amber-700">No written evidence supplied. Inspect the source before accepting.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">{proposal.sourceHref ? <Link href={proposal.sourceHref} className="inline-flex min-h-8 items-center gap-1.5 text-xs font-medium text-black/52 hover:text-black">Open evidence <ArrowUpRight size={13} /></Link> : null}<span className="font-mono text-[9px] text-black/28">{proposal.sourceIds.length} source ID{proposal.sourceIds.length === 1 ? "" : "s"}</span></div>
    </div>
    <div className="grid gap-3 border-l-2 border-black/[0.06] pl-4">
      <div className="grid gap-2 sm:grid-cols-2"><Select label="Owner" value={assigneeUserId} onChange={setAssigneeUserId} options={[["", "Me (approver)"], ...team.map(member => [member.id, member.name] as [string, string])]} /><DateField label="Deadline" value={dueAt} onChange={setDueAt} /></div>
      <div className="grid grid-cols-3 gap-2"><button type="button" disabled={busy} onClick={() => onDecision(proposal, "reject")} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-red-200 text-xs font-semibold text-red-700 disabled:opacity-50"><X size={13} />Reject</button><button type="button" disabled={busy} onClick={() => onDecision(proposal, "park")} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-amber-200 text-xs font-semibold text-amber-700 disabled:opacity-50"><CirclePause size={13} />Park</button><button type="button" disabled={busy} onClick={() => onDecision(proposal, "accept", { assigneeUserId: assigneeUserId || undefined, dueAt: toTimestamp(dueAt, true) })} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-brand px-3 text-xs font-semibold text-white disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={13} /> : <Check size={13} />}Approve</button></div>
      <p className="text-[10px] leading-4 text-black/35">Approve creates one assigned task. Park returns it tomorrow. Reject records the decision for the submitting assistant.</p>
    </div>
  </article>;
}

/**
 * One ranked recommendation, with its measurements one click away.
 *
 * A row of its own because it holds open/closed state, and because this is the
 * case that needed the evidence card most: "drifted from its median" cannot be
 * acted on until you can see the median it drifted from.
 */
function RecommendationRow({ item, index, addingId, onAdd }: { item: AdvisorActionSuggestion; index: number; addingId: string | null; onAdd: (suggestion: AdvisorActionSuggestion) => void }) {
  const [showEvidence, setShowEvidence] = useState(false);
  // Radar recommendations carry the incident they were built from; that is the
  // id the evidence builder keys on.
  const alertId = item.sourceAlertIds?.[0] ?? item.id;

  return <li className="px-4 py-3 sm:px-5">
    <div className="grid gap-3 sm:grid-cols-[32px_minmax(0,1fr)_auto] sm:items-start">
      <span className={`grid size-8 place-items-center rounded-full text-xs font-semibold ${item.priority === "urgent" ? "bg-red-700 text-white" : item.priority === "high" ? "bg-amber-100 text-amber-800" : "bg-black/[0.05] text-black/55"}`}>{index + 1}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-black/82">{item.title}</h3><Pill>{item.category}</Pill><span className={`text-[10px] font-semibold uppercase ${item.confidence === "high" ? "text-emerald-700" : item.confidence === "medium" ? "text-amber-700" : "text-black/38"}`}>{item.confidence} confidence</span></div>
        <p className="mt-1 text-xs leading-5 text-black/48">{item.detail}</p>
        <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-black/35"><strong className="font-semibold text-black/50">Evidence:</strong> {item.evidence || "Open the linked source to inspect the supporting records."}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <button type="button" onClick={() => setShowEvidence(open => !open)} aria-expanded={showEvidence} title="Show the measurements behind this" className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold ${showEvidence ? "border-black/25 bg-black/[0.045] text-black/80" : "border-black/15 text-black/60 hover:bg-black/[0.035]"}`}><Search size={13} />Evidence</button>
        <button type="button" onClick={() => onAdd(item)} disabled={addingId === item.id} title={`Accept ${item.title} as a Radar task`} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-xs font-semibold text-white disabled:opacity-55">{addingId === item.id ? <LoaderCircle className="animate-spin" size={13} /> : <Check size={13} />}{addingId === item.id ? "Accepting..." : "Accept task"}</button>
      </div>
    </div>
    {showEvidence ? <div className="mt-3 rounded-md border border-black/10 bg-black/[0.012]"><EvidenceCard alertId={alertId} /></div> : null}
  </li>;
}

function CommandRecommendations({ recommendations, generatedAt, addingId, onAdd }: { recommendations: AdvisorActionSuggestion[]; generatedAt: number; addingId: string | null; onAdd: (suggestion: AdvisorActionSuggestion) => void }) {
  return <section aria-labelledby="command-recommendations-heading" className="mm-surface-card overflow-hidden rounded-lg border border-black/10 bg-white">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-black/10 px-4 py-4 sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-700"><Target size={18} /></span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-brand">Command recommendations</p><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Shared with Advisor</span></div>
          <h2 id="command-recommendations-heading" className="mt-1 text-lg font-semibold text-black/85">Top {recommendations.length || 5} actions from live data</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-black/48">Radar ranks incidents, alerts, blind spots, targets, evidence readiness, and open work. Inspect the evidence, then approve only the recommendations that should become owned tasks.</p>
          <p className="mt-1 text-[10px] text-black/32">Updated {formatDateTime(generatedAt)} · suggestions only · every task requires approval</p>
        </div>
      </div>
      <Link href="/portal/agency/radar?view=incidents" className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/58 hover:bg-black/[0.03] sm:w-auto">Inspect Radar <ArrowUpRight size={13} /></Link>
    </header>
    <ol className="divide-y divide-black/[0.07]">
      {recommendations.map((item, index) => <RecommendationRow key={item.id} item={item} index={index} addingId={addingId} onAdd={onAdd} />)}
      {!recommendations.length ? <li className="px-5 py-8 text-center"><ShieldCheck className="mx-auto text-emerald-600" size={22} /><p className="mt-2 text-sm font-semibold text-black/68">No defensible action is being forced</p><p className="mt-1 text-xs text-black/42">Radar will add a recommendation when evidence shows a gap, risk, or missed target.</p></li> : null}
    </ol>
  </section>;
}

function AdvisorPanel({ configured, suggestions, busy, reviewedAt, error, addingId, onReview, onAdd, onDismiss }: { configured: boolean; suggestions: AdvisorActionSuggestion[]; busy: boolean; reviewedAt: number | null; error: string; addingId: string | null; onReview: () => void; onAdd: (suggestion: AdvisorActionSuggestion) => void; onDismiss: (id: string) => void }) {
  return <section aria-labelledby="advisor-actions-heading" className="mm-surface-card overflow-hidden rounded-lg border border-brand/20 bg-brand/[0.035] px-4 py-4 sm:px-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-brand text-white"><Sparkles size={17} /></span>
        <div>
          <h2 id="advisor-actions-heading" className="text-sm font-semibold text-black/85">Aqua Advisor</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-black/50">Reviews live company health, alerts and open work, then proposes the most useful next actions. You decide what becomes a task.</p>
          {reviewedAt ? <p className="mt-1 text-[10px] text-black/35">Last reviewed {formatUkDate(reviewedAt, { dateStyle: "medium", timeStyle: "short" })}</p> : null}
        </div>
      </div>
      {configured ? <button type="button" onClick={onReview} disabled={busy} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-black px-4 text-xs font-semibold text-white disabled:opacity-55 sm:w-auto">{busy ? <LoaderCircle className="animate-spin" size={15} /> : <Sparkles size={15} />}{busy ? "Reviewing business..." : reviewedAt ? "Review again" : "Find smart actions"}</button> : <Link href="/portal/agency/company?view=connections&integration=openai" className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-black px-4 text-xs font-semibold text-white sm:w-auto">Configure advisor <ArrowUpRight size={14} /></Link>}
    </div>

    {error ? <p role="alert" className="mt-4 border-l-2 border-red-500 pl-3 text-xs leading-5 text-red-700">{error}</p> : null}
    {reviewedAt && !busy && !suggestions.length && !error ? <div className="mt-4 flex items-center gap-2 border-t border-brand/15 pt-4 text-xs font-medium text-emerald-700"><Check size={15} />No additional actions are suggested from the current records.</div> : null}
    {suggestions.length ? <div className="mt-4 divide-y divide-brand/15 border-t border-brand/15">
      {suggestions.map(suggestion => <article key={suggestion.id} className="grid gap-3 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Priority value={suggestion.priority} />
            <Pill>{suggestion.category}</Pill>
            <span className="text-[10px] capitalize text-black/38">{suggestion.confidence} confidence</span>
          </div>
          <h3 className="mt-2 text-sm font-semibold text-black/82">{suggestion.title}</h3>
          <p className="mt-1 text-xs leading-5 text-black/52">{suggestion.detail}</p>
          <p className="mt-2 text-[11px] leading-5 text-black/42"><strong className="font-semibold text-black/58">Why:</strong> {suggestion.evidence} · Due {formatUkDate(suggestion.dueAt, { day: "numeric", month: "short" })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <Link href={suggestion.href} className="inline-flex min-h-9 items-center gap-1.5 px-2 text-xs font-medium text-black/52 hover:text-black">Open evidence <ArrowUpRight size={13} /></Link>
          <button type="button" onClick={() => onDismiss(suggestion.id)} className="inline-flex min-h-9 items-center gap-1.5 px-2 text-xs font-medium text-black/42 hover:text-black"><X size={13} /> Dismiss</button>
          <button type="button" onClick={() => onAdd(suggestion)} disabled={addingId === suggestion.id} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-xs font-semibold text-white disabled:opacity-55">{addingId === suggestion.id ? <LoaderCircle className="animate-spin" size={13} /> : <Check size={13} />}{addingId === suggestion.id ? "Accepting..." : "Accept task"}</button>
        </div>
      </article>)}
    </div> : null}
  </section>;
}

function TaskCard({ task, team, clients, sops, customFields, expanded, onToggle, onPatch, onDelete }: { task: AgencyTask; team: TeamMember[]; clients: ActionClient[]; sops: SopDocument[]; customFields: PortalFormFieldDefinition[]; expanded: boolean; onToggle: () => void; onPatch: (patch: Partial<AgencyTask>) => void; onDelete: () => void }) {
  const owner = team.find(member => member.id === task.assigneeUserId);
  const client = clients.find(item => item.id === task.clientId);
  const attachedSops = sops.filter(sop => task.sopIds?.includes(sop.id));
  const isOverdue = task.status !== "done" && task.dueAt && task.dueAt < startOfDay(Date.now());
  return <article id={`task-${task.id}`} className={`mm-surface-card mm-hover-lift scroll-mt-24 rounded-lg border bg-white transition target:border-cyan-300 target:ring-2 target:ring-cyan-100 ${isOverdue ? "border-red-200" : "border-black/10"}`}>
    <div className="grid min-h-20 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-4">
      <button type="button" onClick={() => onPatch({ status: task.status === "done" ? "todo" : "done" })} title={task.status === "done" ? "Reopen task" : "Complete task"} className={`grid size-9 place-items-center rounded-full border ${task.status === "done" ? "border-emerald-600 bg-emerald-600 text-white" : "border-black/15 text-transparent hover:text-black/25"}`}><Check size={16} /></button>
      <button type="button" onClick={onToggle} className="min-w-0 text-left"><span className="flex flex-wrap items-center gap-2"><strong className={`text-sm ${task.status === "done" ? "text-black/40 line-through" : "text-black/82"}`}>{task.title}</strong><SourceBadge origin={taskOrigin(task)} /><Priority value={task.priority} />{task.status === "in-progress" ? <Pill>In progress</Pill> : null}{task.reconciliation ? <ReconciliationBadge status={task.reconciliation.status} /> : null}{attachedSops.length ? <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700"><BookOpen size={11} />{attachedSops.length} {attachedSops.length === 1 ? "SOP" : "SOPs"}</span> : null}</span><span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-black/45">{client ? <span className="inline-flex items-center gap-1 font-medium text-sky-700"><Building2 size={13} />{client.name}</span> : null}{owner ? <span className="inline-flex items-center gap-1"><UserRound size={13} />{owner.name}</span> : <span>Unassigned</span>}{task.startAt || task.dueAt ? <span className={`inline-flex items-center gap-1 ${isOverdue ? "font-medium text-red-700" : ""}`}><Clock3 size={13} />{dateRange(task.startAt, task.dueAt)}</span> : <span>No date</span>}{task.reminderAt ? <span className="inline-flex items-center gap-1"><Bell size={12} />{formatDateTime(task.reminderAt)}</span> : null}{task.recurrence ? <span className="inline-flex items-center gap-1 capitalize"><Repeat2 size={12} />{task.recurrence}</span> : null}</span></button>
      <button type="button" onClick={onToggle} className="col-start-2 inline-flex w-fit items-center gap-1.5 rounded-md border border-black/10 px-3 py-2 text-xs font-medium text-black/55 sm:col-start-auto">{expanded ? <X size={13} /> : <Pencil size={13} />}{expanded ? "Close" : "Edit"}</button>
    </div>
    {expanded ? <TaskEditor task={task} team={team} clients={clients} sops={sops} customFields={customFields} onPatch={onPatch} onDelete={onDelete} /> : null}
  </article>;
}

function TaskEditor({ task, team, clients, sops, customFields, onPatch, onDelete }: { task: AgencyTask; team: TeamMember[]; clients: ActionClient[]; sops: SopDocument[]; customFields: PortalFormFieldDefinition[]; onPatch: (patch: Partial<AgencyTask>) => void; onDelete: () => void }) {
  const [draft, setDraft] = useState({ title: task.title, notes: task.notes ?? "", status: task.status, priority: task.priority, assigneeUserId: task.assigneeUserId ?? "", clientId: task.clientId ?? "", startAt: dateInput(task.startAt), dueAt: dateInput(task.dueAt), reminderAt: dateTimeInput(task.reminderAt), recurrence: task.recurrence ?? "none" as AgencyTaskRecurrence, sopIds: task.sopIds ?? [], customFields: task.customFields ?? {} as PortalCustomFieldValues });
  return <div className="grid gap-3 border-t border-black/10 bg-black/[0.015] p-4">
    <input value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm font-medium" />
    <textarea value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} rows={3} className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm" placeholder="Notes, links, or the expected outcome" />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Select label="Status" value={draft.status} onChange={value => setDraft(current => ({ ...current, status: value as AgencyTaskStatus }))} options={[["todo","To do"],["in-progress","In progress"],["done","Done"]]} />
      <Select label="Priority" value={draft.priority} onChange={value => setDraft(current => ({ ...current, priority: value as AgencyTaskPriority }))} options={[["low","Low"],["normal","Normal"],["high","High"],["urgent","Urgent"]]} />
      <div className="grid grid-cols-2 gap-2"><DateField label="Start" value={draft.startAt} onChange={value => setDraft(current => ({ ...current, startAt: value }))} /><DateField label="Due" value={draft.dueAt} onChange={value => setDraft(current => ({ ...current, dueAt: value }))} /></div>
    </div>
    <AssignmentPicker team={team} clients={clients} assigneeUserId={draft.assigneeUserId} clientId={draft.clientId} onAssigneeChange={assigneeUserId => setDraft(current => ({ ...current, assigneeUserId }))} onClientChange={clientId => setDraft(current => ({ ...current, clientId }))} />
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-[10px] font-medium text-black/45">Reminder<input type="datetime-local" value={draft.reminderAt} onChange={event => setDraft(current => ({ ...current, reminderAt: event.target.value }))} className="min-h-10 rounded-md border border-black/15 bg-white px-2 text-xs" /></label>
      <Select label="Repeats" value={draft.recurrence} onChange={value => setDraft(current => ({ ...current, recurrence: value as AgencyTaskRecurrence }))} options={[["none","Does not repeat"],["daily","Daily"],["weekly","Weekly"],["monthly","Monthly"]]} />
    </div>
    <PortalCustomFields fields={customFields} values={draft.customFields} onChange={values => setDraft(current => ({ ...current, customFields: values }))} legend="Action custom fields" />
    <div className="px-3 pb-3"><TaskChecklist task={task} sops={sops} onChange={next => onPatch(next)} /></div>
    {task.expectedOutcome || task.evidence?.length || task.reconciliation ? <section aria-label="Task evidence and reconciliation" className="overflow-hidden rounded-md border border-black/10 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 px-3 py-2.5"><span className="inline-flex items-center gap-2 text-xs font-semibold text-black/65"><ShieldCheck size={14} />Evidence and resolution</span>{task.reconciliation ? <ReconciliationBadge status={task.reconciliation.status} /> : null}</div>
      <div className="grid gap-3 px-3 py-3 text-xs leading-5 text-black/48">
        {task.expectedOutcome ? <p><strong className="font-semibold text-black/65">Expected outcome:</strong> {task.expectedOutcome}</p> : null}
        {task.evidence?.length ? <div><strong className="font-semibold text-black/65">Evidence retained at acceptance</strong><ul className="mt-1 grid gap-1">{task.evidence.map((item, index) => <li key={`${task.id}-evidence-${index}`}>• {item}</li>)}</ul></div> : null}
        {task.reconciliation ? <div className="border-l-2 border-black/10 pl-3"><p className="font-medium text-black/62">{task.reconciliation.detail}</p><p className="mt-1 font-mono text-[9px] leading-4 text-black/32">Watching {task.reconciliation.sourceIds.join(", ")}</p>{task.reconciliation.checkedAt ? <p className="mt-1 text-[10px] text-black/35">Last checked {formatDateTime(task.reconciliation.checkedAt)}</p> : null}</div> : null}
        {task.sourceHref ? <Link href={task.sourceHref} className="inline-flex min-h-8 w-fit items-center gap-1.5 font-semibold text-black/58 hover:text-black">Open linked evidence <ArrowUpRight size={13} /></Link> : null}
      </div>
    </section> : null}
    <SopPicker sops={sops} selected={draft.sopIds} onChange={sopIds => setDraft(current => ({ ...current, sopIds }))} />
    <div className="flex justify-between gap-3"><button type="button" onClick={onDelete} className="inline-flex min-h-10 items-center gap-2 px-2 text-xs font-medium text-red-700"><Trash2 size={14} />Delete</button><button type="button" onClick={() => onPatch({ title: draft.title, notes: draft.notes, status: draft.status, priority: draft.priority, assigneeUserId: draft.assigneeUserId, clientId: draft.clientId, startAt: toTimestamp(draft.startAt), dueAt: toTimestamp(draft.dueAt, true), reminderAt: toDateTimeTimestamp(draft.reminderAt) ?? 0, recurrence: draft.recurrence, sopIds: draft.sopIds, customFields: draft.customFields })} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-xs font-semibold text-white"><Save size={14} /> Save changes</button></div>
  </div>;
}

function GeneratedCard({ action, busy, onAccept, onAttentionAction, onMarkDone }: { action: GeneratedAction; busy: boolean; onAccept: () => void; onAttentionAction?: (action: GeneratedAction, kind: "park" | "dismiss", until?: number) => Promise<void>; onMarkDone?: (action: GeneratedAction) => Promise<void> }) {
  const [showEvidence, setShowEvidence] = useState(false);
  const alertId = action.id.startsWith("attention:") ? action.id.slice("attention:".length) : action.id;
  return <div data-resolution-record={action.id} className="scroll-mt-24">
    <article className="grid gap-3 scroll-mt-24 px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:px-5"><span className={`grid size-9 place-items-center rounded-md ${action.priority === "urgent" ? "bg-red-50 text-red-600" : action.priority === "high" ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700"}`}><Workflow size={15} /></span><div className="min-w-0"><span className="flex flex-wrap items-center gap-2"><strong className="text-sm text-black/82">{action.title}</strong><Pill>{action.kind}</Pill><Priority value={action.priority} /><DeferralNote deferrals={action.deferrals} firstDeferredAt={action.firstDeferredAt} /></span><p className="mt-1 text-xs leading-5 text-black/45">{action.detail}{action.dueAt ? ` · ${formatUkDate(action.dueAt, { dateStyle: "medium" })}` : ""}</p></div><div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-auto sm:justify-end">{action.origin === "inbox" ? <AttentionControls title={action.title} kind={action.resolutionKind ?? "in-app"} resolveHref={action.href} busy={busy} evidenceOpen={showEvidence} onToggleEvidence={() => setShowEvidence(open => !open)} onMarkDone={() => void onMarkDone?.(action)} onPark={(until: number) => void onAttentionAction?.(action, "park", until)} onDismiss={() => void onAttentionAction?.(action, "dismiss")} /> : <Link href={action.href} className="inline-flex min-h-9 items-center gap-1.5 px-2 text-xs font-medium text-black/50 hover:text-black">Open source <ArrowUpRight size={13} /></Link>}<button type="button" onClick={onAccept} disabled={busy} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-xs font-semibold text-white disabled:opacity-55">{busy ? <LoaderCircle className="animate-spin" size={13} /> : <Check size={13} />}{busy ? "Accepting..." : "Accept task"}</button></div></article>
    {showEvidence ? <div className="border-t border-black/[0.07] bg-black/[0.012]"><EvidenceCard alertId={alertId} fallback={{ title: action.title, detail: action.detail, href: action.href }} /></div> : null}
  </div>;
}

function CalendarView({ month, tasks, actions, entries, integration, team, customFields, onNavigate, onToday, onTaskCreated, onTaskUpdated, onEntriesChange, onIntegrationChange }: { month: Date; tasks: AgencyTask[]; actions: GeneratedAction[]; entries: CommandCalendarEntry[]; integration: CalendarIntegrationState; team: TeamMember[]; clients: ActionClient[]; customFields: PortalFormFieldDefinition[]; onNavigate: (months: number) => void; onToday: () => void; onTaskCreated: (task: AgencyTask) => void; onTaskUpdated: (task: AgencyTask) => void; onEntriesChange: React.Dispatch<React.SetStateAction<CommandCalendarEntry[]>>; onIntegrationChange: React.Dispatch<React.SetStateAction<CalendarIntegrationState>> }) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(dateKey(Date.now()));
  const [quarterMode, setQuarterMode] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CommandCalendarEntry | null>(null);
  const [editingTask, setEditingTask] = useState<AgencyTask | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connectionBusyId, setConnectionBusyId] = useState<string | null>(null);
  const [integrationError, setIntegrationError] = useState("");
  const [googleCreateOperationId, setGoogleCreateOperationId] = useState<string | null>(null);
  const [googleCreateRequestKey, setGoogleCreateRequestKey] = useState<string | null>(null);
  const [connectionNotice] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("calendarConnected") || new URLSearchParams(window.location.search).get("calendarError") || "");
  const days = calendarDays(month);
  const selected = new Date(`${selectedDate}T12:00:00`);
  const selectedTasks = tasks.filter(task => overlapsDay(task.startAt ?? task.dueAt, task.dueAt ?? task.startAt, selected));
  const selectedActions = actions.filter(action => action.dueAt && sameDay(action.dueAt, selected.getTime()));
  const selectedEntries = entries.filter(entry => overlapsDay(entry.startsAt, entry.endsAt ?? entry.startsAt, selected));
  const selectedSourceIds = new Set(integration.sources.filter(source => source.selected).map(source => source.id));
  const visibleExternalEvents = integration.events.filter(event => selectedSourceIds.has(event.sourceId));
  const selectedExternalEvents = visibleExternalEvents.filter(event => overlapsDay(event.startsAt, event.endsAt ?? event.startsAt, selected));
  const quarterStart = Math.floor(month.getMonth() / 3) * 3;
  const quarterMonths = [0, 1, 2].map(offset => new Date(month.getFullYear(), quarterStart + offset, 1));
  const periodLabel = quarterMode
    ? `Q${Math.floor(month.getMonth() / 3) + 1} ${month.getFullYear()} · ${quarterMonths[0].toLocaleDateString("en-GB", { month: "short" })}–${quarterMonths[2].toLocaleDateString("en-GB", { month: "short" })}`
    : month.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const dueReminders = [
    ...tasks.filter(task => task.status !== "done" && task.reminderAt).map(task => ({ id: task.id, title: task.title, reminderAt: task.reminderAt! })),
    ...entries.filter(entry => entry.status === "planned" && (entry.reminderAt || entry.type === "reminder")).map(entry => ({ id: entry.id, title: entry.title, reminderAt: entry.reminderAt ?? entry.startsAt })),
  ]
    .filter(item => item.reminderAt <= Date.now() + 7 * 86_400_000)
    .sort((left, right) => left.reminderAt - right.reminderAt);
  const lastSyncedAt = Math.max(0, ...integration.connections.map(connection => connection.lastSyncedAt ?? 0));

  const syncCalendars = useCallback(async (connectionId?: string, quiet = false) => {
    if (!integration.connections.length || syncing) return;
    setSyncing(true);
    if (!quiet) setIntegrationError("");
    try {
      const response = await fetch("/api/portal/calendar/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(connectionId ? { connectionId } : {}) });
      const result = await response.json().catch(() => null) as ({ ok?: boolean; error?: string } & Partial<CalendarIntegrationState>) | null;
      if (!response.ok || !result?.ok || !result.connections || !result.sources || !result.events) throw new Error(result?.error || "Calendars could not be synchronised.");
      onIntegrationChange({ configured: result.configured ?? integration.configured, connections: result.connections, sources: result.sources, events: result.events });
    } catch (caught) { if (!quiet) setIntegrationError(caught instanceof Error ? caught.message : "Calendars could not be synchronised."); }
    finally { setSyncing(false); }
  }, [integration.configured, integration.connections.length, onIntegrationChange, syncing]);

  useEffect(() => {
    if (!integration.connections.length || syncing || (lastSyncedAt && Date.now() - lastSyncedAt < 5 * 60_000)) return;
    void syncCalendars(undefined, true);
  }, [integration.connections.length, lastSyncedAt, syncCalendars, syncing]);

  async function toggleCalendarSource(sourceId: string) {
    const nextIds = integration.sources.filter(source => source.id === sourceId ? !source.selected : source.selected).map(source => source.id);
    setConnectionBusyId(sourceId); setIntegrationError("");
    try {
      const result = await checkedJsonMutation<({ ok?: boolean } & Partial<CalendarIntegrationState>)>("/api/portal/calendar/connections", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ selectedSourceIds: nextIds }) }, {
        fallback: "Calendar visibility could not be saved.",
        validate: value => value.ok === true && Boolean(value.connections && value.sources && value.events),
      });
      onIntegrationChange({ configured: result.configured ?? integration.configured, connections: result.connections!, sources: result.sources!, events: result.events! });
      if (nextIds.includes(sourceId) && !integration.events.some(event => event.sourceId === sourceId)) void syncCalendars();
    } catch (cause) { setIntegrationError(mutationErrorMessage(cause, "Calendar visibility could not be saved.")); }
    finally { setConnectionBusyId(null); }
  }

  async function disconnectCalendar(connectionId: string) {
    if (!window.confirm("Disconnect this Google account and remove its cached events from Command Calendar?")) return;
    setConnectionBusyId(connectionId);
    setIntegrationError("");
    try {
      const result = await checkedJsonMutation<({ ok?: boolean } & Partial<CalendarIntegrationState>)>(`/api/portal/calendar/connections?connectionId=${encodeURIComponent(connectionId)}`, { method: "DELETE" }, {
        fallback: "Calendar account could not be disconnected.",
        validate: value => value.ok === true && Boolean(value.connections && value.sources && value.events),
      });
      onIntegrationChange({ configured: result.configured ?? integration.configured, connections: result.connections!, sources: result.sources!, events: result.events! });
    } catch (cause) { setIntegrationError(mutationErrorMessage(cause, "Calendar account could not be disconnected.")); }
    finally { setConnectionBusyId(null); }
  }

  function selectDay(day: Date) {
    setSelectedDate(dateKey(day.getTime()));
    const monthDifference = (day.getFullYear() - month.getFullYear()) * 12 + day.getMonth() - month.getMonth();
    if (monthDifference) onNavigate(monthDifference);
  }

  function openNew() {
    setEditingEntry(null);
    setEditingTask(null);
    setGoogleCreateOperationId(null);
    setGoogleCreateRequestKey(null);
    setError("");
    setEditorOpen(true);
  }

  async function saveEntry(input: CalendarEditorPayload) {
    setBusy(true);
    setError("");
    try {
      if (input.destinationSourceId && input.type === "event" && !editingEntry && !editingTask) {
        const requestBody = { sourceId: input.destinationSourceId, title: input.title, notes: input.notes ?? "", startsAt: input.startsAt, endsAt: input.endsAt ?? null, allDay: input.allDay };
        const requestKey = JSON.stringify(requestBody);
        const operationId = googleCreateOperationId && googleCreateRequestKey === requestKey ? googleCreateOperationId : crypto.randomUUID();
        if (operationId !== googleCreateOperationId) setGoogleCreateOperationId(operationId);
        if (requestKey !== googleCreateRequestKey) setGoogleCreateRequestKey(requestKey);
        const response = await fetch("/api/portal/calendar/google/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operationId, ...requestBody }) });
        const result = await response.json().catch(() => null) as ({ ok?: boolean; error?: string; warning?: string } & Partial<CalendarIntegrationState>) | null;
        if (!response.ok || !result?.ok || !result.connections || !result.sources || !result.events) throw new Error(result?.error || "Google event could not be saved.");
        onIntegrationChange({ configured: result.configured ?? integration.configured, connections: result.connections, sources: result.sources, events: result.events });
        setIntegrationError(result.warning ?? "");
      } else if (input.type === "task") {
        const response = await fetch("/api/portal/tasks", { method: editingTask ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...(editingTask ? { id: editingTask.id } : {}), title: input.title, notes: input.notes ?? "", priority: input.priority, startAt: input.startsAt, dueAt: input.endsAt ?? input.startsAt, reminderAt: input.reminderAt ?? (editingTask ? 0 : undefined), status: editingTask?.status ?? "todo", origin: "manual", customFields: input.customFields }) });
        const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; task?: AgencyTask } | null;
        if (!response.ok || !result?.ok || !result.task) throw new Error(result?.error || "Task could not be saved.");
        (editingTask ? onTaskUpdated : onTaskCreated)(result.task);
      } else {
        const response = await fetch("/api/portal/calendar", { method: editingEntry ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...(editingEntry ? { id: editingEntry.id } : {}), ...input, notes: input.notes ?? "", endsAt: input.endsAt ?? null, reminderAt: input.reminderAt ?? null, targetValue: input.targetValue ?? null, currentValue: input.currentValue ?? null, targetUnit: input.targetUnit ?? "" }) });
        const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; entry?: CommandCalendarEntry } | null;
        if (!response.ok || !result?.ok || !result.entry) throw new Error(result?.error || "Calendar item could not be saved.");
        onEntriesChange(current => editingEntry ? current.map(entry => entry.id === result.entry!.id ? result.entry! : entry) : [...current, result.entry!]);
      }
      setEditorOpen(false);
      setEditingEntry(null);
      setEditingTask(null);
      setGoogleCreateOperationId(null);
      setGoogleCreateRequestKey(null);
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Calendar item could not be saved."); }
    finally { setBusy(false); }
  }

  async function removeEntry() {
    if (!editingEntry) return;
    setBusy(true); setError("");
    try {
      await checkedJsonMutation<{ ok?: boolean }>(`/api/portal/calendar?id=${encodeURIComponent(editingEntry.id)}`, { method: "DELETE" }, {
        fallback: "Calendar item could not be removed.",
        validate: value => value.ok === true,
      });
      onEntriesChange(current => current.filter(entry => entry.id !== editingEntry.id));
      setEditorOpen(false);
      setEditingEntry(null);
      router.refresh();
    } catch (cause) { setError(mutationErrorMessage(cause, "Calendar item could not be removed.")); }
    finally { setBusy(false); }
  }

  async function completeItem(item: CommandCalendarEntry | AgencyTask) {
    setIntegrationError("");
    try {
      if ("type" in item) {
        const result = await checkedJsonMutation<{ ok?: boolean; entry?: CommandCalendarEntry }>("/api/portal/calendar", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, status: item.status === "completed" ? "planned" : "completed" }) }, {
          fallback: "Calendar item could not be updated.",
          validate: value => value.ok === true && Boolean(value.entry),
        });
        onEntriesChange(current => current.map(entry => entry.id === item.id ? result.entry! : entry)); router.refresh();
      } else {
        const result = await checkedJsonMutation<{ ok?: boolean; task?: AgencyTask }>("/api/portal/tasks", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, status: item.status === "done" ? "todo" : "done" }) }, {
          fallback: "Task could not be updated.",
          validate: value => value.ok === true && Boolean(value.task),
        });
        onTaskUpdated(result.task!); router.refresh();
      }
    } catch (cause) { setIntegrationError(mutationErrorMessage(cause, "The item could not be updated.")); }
  }

  return <section className="mm-actions-calendar rounded-lg border border-black/10 bg-white p-3 sm:p-4" data-calendar-surface="command">
    <div className="mm-actions-calendar-toolbar flex flex-wrap items-center justify-between gap-3 pb-3"><div><p className="mm-actions-calendar-kicker text-[10px] font-semibold uppercase text-black/35">Command Calendar · Aqua plans + connected work calendars</p><h2 className="mt-1 text-lg font-semibold text-black/80">{periodLabel}</h2><p className="mt-1 text-[10px] text-black/38">{integration.connections.length ? `${integration.connections.length} Google account${integration.connections.length === 1 ? "" : "s"} · ${integration.sources.filter(source => source.selected).length} calendars visible${lastSyncedAt ? ` · synced ${relativeTime(lastSyncedAt)}` : ""}` : "Aqua Calendar only"}</p></div><div className="flex flex-wrap gap-1"><button onClick={() => onNavigate(quarterMode ? -3 : -1)} aria-label={quarterMode ? "Previous quarter" : "Previous month"} className="grid size-9 place-items-center rounded-md border border-black/10"><ChevronLeft size={16} /></button><button onClick={() => { setSelectedDate(dateKey(Date.now())); onToday(); }} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 px-3 text-xs font-medium"><CalendarDays size={13} /> Today</button><button onClick={() => setQuarterMode(value => !value)} aria-pressed={quarterMode} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 px-3 text-xs font-medium"><CalendarRange size={13} />{quarterMode ? "Month" : "Quarter"}</button><button onClick={() => onNavigate(quarterMode ? 3 : 1)} aria-label={quarterMode ? "Next quarter" : "Next month"} className="grid size-9 place-items-center rounded-md border border-black/10"><ChevronRight size={16} /></button><button type="button" onClick={() => setSourcesOpen(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 px-3 text-xs font-semibold"><Settings2 size={14} />Calendars{integration.connections.some(connection => connection.status === "error" || connection.status === "revoked") ? <i className="size-1.5 rounded-full bg-red-500" /> : null}</button>{integration.connections.length ? <button type="button" disabled={syncing} onClick={() => void syncCalendars()} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 px-3 text-xs font-semibold disabled:opacity-50"><RefreshCw size={14} className={syncing ? "animate-spin" : ""} />{syncing ? "Syncing" : "Sync"}</button> : null}<button type="button" onClick={() => openNew()} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-black px-3 text-xs font-semibold text-white"><Plus size={14} />Add</button></div></div>
    {connectionNotice || integrationError ? <div role={integrationError ? "alert" : "status"} className={`mb-3 flex items-center gap-2 border-l-2 px-3 py-2 text-xs ${integrationError ? "border-red-500 bg-red-50 text-red-700" : "border-emerald-500 bg-emerald-50 text-emerald-700"}`}>{integrationError ? <CloudOff size={14} /> : <CalendarCheck2 size={14} />}{integrationError || `Connected ${connectionNotice}. Calendar events are now on the command plot.`}</div> : null}
    {quarterMode ? <div className="mm-calendar-quarter-grid grid gap-3 lg:grid-cols-3">{quarterMonths.map(quarterMonth => <MiniMonth key={quarterMonth.toISOString()} month={quarterMonth} selectedDate={selectedDate} tasks={tasks} actions={actions} entries={entries} externalEvents={visibleExternalEvents} onSelect={day => { setSelectedDate(dateKey(day.getTime())); onNavigate((day.getFullYear() - month.getFullYear()) * 12 + day.getMonth() - month.getMonth()); setQuarterMode(false); }} />)}</div> : <div className="mm-calendar-command-layout grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]"><div className="mm-actions-calendar-scroll overflow-x-auto overscroll-x-contain"><CalendarGrid month={month} days={days} selectedDate={selectedDate} tasks={tasks} actions={actions} entries={entries} externalEvents={visibleExternalEvents} sources={integration.sources} team={team} onSelect={selectDay} /></div><aside className="mm-calendar-day-inspector min-w-0 border border-black/10 bg-black/[0.015]"><header className="flex items-start justify-between gap-3 border-b border-black/10 p-4"><div><p className="text-[10px] font-semibold uppercase text-black/40">Selected day</p><h3 className="mt-1 text-lg font-semibold text-black/80">{selected.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</h3><p className="mt-1 text-xs text-black/42">{selectedTasks.length + selectedActions.length + selectedEntries.length + selectedExternalEvents.length} plotted item{selectedTasks.length + selectedActions.length + selectedEntries.length + selectedExternalEvents.length === 1 ? "" : "s"}</p></div><button onClick={() => openNew()} aria-label="Add to selected day" className="grid size-9 place-items-center rounded-md border border-black/10"><Plus size={15} /></button></header><div className="grid gap-2 p-3">{selectedTasks.map(task => <DayAgendaRow key={task.id} type="task" title={task.title} detail={`${calendarTime(task.startAt ?? task.dueAt)} · ${task.priority}`} complete={task.status === "done"} onComplete={() => void completeItem(task)} onOpen={() => { setEditingTask(task); setEditingEntry(null); setEditorOpen(true); }} />)}{selectedEntries.map(entry => <DayAgendaRow key={entry.id} type={entry.type} title={entry.title} detail={entryDetail(entry)} complete={entry.status === "completed"} onComplete={() => void completeItem(entry)} onOpen={() => { setEditingEntry(entry); setEditingTask(null); setEditorOpen(true); }} />)}{selectedExternalEvents.map(event => <ExternalCalendarAgendaRow key={event.id} event={event} source={integration.sources.find(source => source.id === event.sourceId)} />)}{selectedActions.map(action => <Link key={action.id} href={action.href} className="flex min-w-0 gap-3 border border-black/8 bg-white p-3"><span className="grid size-8 shrink-0 place-items-center bg-amber-50 text-amber-700"><Workflow size={14} /></span><span className="min-w-0"><strong className="block truncate text-xs text-black/75">{action.title}</strong><span className="mt-1 block text-[10px] text-black/40">CRM signal · {calendarTime(action.dueAt)}</span></span></Link>)}{!selectedTasks.length && !selectedEntries.length && !selectedExternalEvents.length && !selectedActions.length ? <div className="py-8 text-center"><CalendarDays className="mx-auto text-black/18" size={22} /><p className="mt-2 text-sm font-semibold text-black/55">Clear day</p><button onClick={() => openNew()} className="mt-3 text-xs font-semibold text-brand">Plan something</button></div> : null}</div></aside></div>}
    <div className="mm-calendar-command-footer mt-4 grid gap-3 border-t border-black/10 pt-4 lg:grid-cols-[1fr_auto]"><div><p className="text-[10px] font-semibold uppercase text-black/38">Due reminders · next 7 days</p><div className="mt-2 flex flex-wrap gap-2">{dueReminders.slice(0,6).map(item => <button key={item.id} type="button" onClick={() => { setSelectedDate(dateKey(Number(item.reminderAt))); onNavigate((new Date(Number(item.reminderAt)).getFullYear() - month.getFullYear()) * 12 + new Date(Number(item.reminderAt)).getMonth() - month.getMonth()); }} className="inline-flex min-h-8 items-center gap-1.5 border border-black/10 px-2.5 text-[10px] font-medium text-black/58"><AlarmClock size={12} />{item.title} · {calendarTime(Number(item.reminderAt), true)}</button>)}{!dueReminders.length ? <span className="text-xs text-black/35">No reminders due in the next seven days.</span> : null}</div></div><div className="grid grid-cols-3 gap-2 text-center text-[10px]"><CalendarMetric label="Open tasks" value={tasks.filter(task => task.status !== "done").length} /><CalendarMetric label="Goals" value={entries.filter(entry => entry.type === "goal" && entry.status === "planned").length} /><CalendarMetric label="Targets" value={entries.filter(entry => entry.type === "target" && entry.status === "planned").length} /></div></div>
    {editorOpen ? <CalendarEditor selectedDate={selectedDate} entry={editingEntry} task={editingTask} customFields={customFields} writableSources={integration.sources.filter(source => source.selected && source.writable)} busy={busy} error={error} onClose={() => { if (!busy) { setEditorOpen(false); setEditingEntry(null); setEditingTask(null); setGoogleCreateOperationId(null); setGoogleCreateRequestKey(null); setError(""); } }} onSave={saveEntry} onDelete={editingEntry ? removeEntry : undefined} /> : null}
    {sourcesOpen ? <CalendarSourcesDialog integration={integration} syncing={syncing} busyId={connectionBusyId} error={integrationError} onClose={() => setSourcesOpen(false)} onToggle={sourceId => void toggleCalendarSource(sourceId)} onSync={connectionId => void syncCalendars(connectionId)} onDisconnect={connectionId => void disconnectCalendar(connectionId)} /> : null}
  </section>;
}

type CalendarEditorPayload = { type: CommandCalendarEntryType | "task"; title: string; notes?: string; startsAt: number; endsAt?: number; allDay: boolean; reminderAt?: number; status?: "planned" | "completed" | "cancelled"; targetValue?: number; currentValue?: number; targetUnit?: string; priority?: AgencyTaskPriority; destinationSourceId?: string; customFields?: PortalCustomFieldValues };

function CalendarEditor({
  selectedDate,
  entry,
  task,
  customFields,
  writableSources,
  busy,
  error,
  onClose,
  onSave,
  onDelete,
}: {
  selectedDate: string;
  entry: CommandCalendarEntry | null;
  task: AgencyTask | null;
  customFields: PortalFormFieldDefinition[];
  writableSources: CommandCalendarSource[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (input: CalendarEditorPayload) => void;
  onDelete?: () => void;
}) {
  const initialType = task ? "task" : (entry?.type ?? "event");
  const [type, setType] = useState<CommandCalendarEntryType | "task">(
    initialType,
  );
  const [allDay, setAllDay] = useState(entry?.allDay ?? !task?.startAt);
  const [customFieldValues, setCustomFieldValues] =
    useState<PortalCustomFieldValues>(task?.customFields ?? {});
  const starts =
    entry?.startsAt ??
    task?.startAt ??
    new Date(`${selectedDate}T09:00:00`).getTime();
  const ends =
    entry?.endsAt ??
    task?.dueAt ??
    new Date(`${selectedDate}T10:00:00`).getTime();
  return (
    <div className="fixed inset-0 z-[100] grid items-end bg-black/45 sm:items-center sm:p-5">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close calendar editor"
        onClick={onClose}
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-editor-heading"
        className="mm-calendar-editor relative mx-auto grid max-h-[94dvh] w-full max-w-2xl gap-4 overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl sm:rounded-lg"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const start = allDay
            ? new Date(`${data.get("date")}T12:00:00`).getTime()
            : new Date(String(data.get("startsAt"))).getTime();
          const endRaw = allDay ? "" : String(data.get("endsAt") ?? "");
          onSave({
            type,
            title: String(data.get("title") ?? ""),
            notes: String(data.get("notes") ?? "") || undefined,
            startsAt: start,
            endsAt: endRaw ? new Date(endRaw).getTime() : undefined,
            allDay,
            reminderAt: data.get("reminderAt")
              ? new Date(String(data.get("reminderAt"))).getTime()
              : undefined,
            status: entry?.status ?? "planned",
            targetValue: data.get("targetValue")
              ? Number(data.get("targetValue"))
              : undefined,
            currentValue: data.get("currentValue")
              ? Number(data.get("currentValue"))
              : undefined,
            targetUnit: String(data.get("targetUnit") ?? "") || undefined,
            priority: String(
              data.get("priority") ?? "normal",
            ) as AgencyTaskPriority,
            destinationSourceId:
              String(data.get("destinationSourceId") ?? "") || undefined,
            customFields: type === "task" ? customFieldValues : undefined,
          });
        }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-black/10 pb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase text-brand">
              Command Calendar
            </p>
            <h2
              id="calendar-editor-heading"
              className="mt-1 text-xl font-semibold"
            >
              {entry || task ? "Edit plotted item" : "Add to the plan"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-md border border-black/10"
          >
            <X size={16} />
          </button>
        </header>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-medium text-black/55">
            Item type
            <select
              data-calendar-editor-type
              name="type"
              value={type}
              disabled={Boolean(entry || task)}
              onChange={(event) =>
                setType(event.target.value as CommandCalendarEntryType | "task")
              }
              className="min-h-11 rounded-md border border-black/15 bg-white px-3 text-sm"
            >
              <option value="task">Task</option>
              <option value="event">Event</option>
              <option value="work-block">Work block</option>
              <option value="reminder">Reminder</option>
              <option value="note">Note</option>
              <option value="goal">Goal</option>
              <option value="target">Numeric target</option>
            </select>
          </label>
          {!entry && !task && type === "event" && writableSources.length ? (
            <label className="grid gap-1 text-xs font-medium text-black/55">
              Save to
              <select
                name="destinationSourceId"
                defaultValue=""
                className="min-h-11 rounded-md border border-black/15 bg-white px-3 text-sm"
              >
                <option value="">Aqua Calendar</option>
                {writableSources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name} · Google
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <label className="grid gap-1 text-xs font-medium text-black/55">
          Title
          <input
            name="title"
            required
            defaultValue={entry?.title ?? task?.title ?? ""}
            className="min-h-11 rounded-md border border-black/15 px-3 text-sm"
            placeholder={
              type === "work-block"
                ? "Deep work: proposal system"
                : type === "target"
                  ? "Monthly recurring revenue"
                  : "What is happening?"
            }
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-black/55">
          Notes
          <textarea
            name="notes"
            defaultValue={entry?.notes ?? task?.notes ?? ""}
            rows={3}
            className="rounded-md border border-black/15 p-3 text-sm"
            placeholder="Context, desired outcome, links or preparation..."
          />
        </label>
        <label className="inline-flex items-center gap-2 text-xs font-medium text-black/55">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(event) => setAllDay(event.target.checked)}
          />
          All-day item
        </label>
        {allDay ? (
          <label className="grid gap-1 text-xs font-medium text-black/55">
            Date
            <input
              name="date"
              type="date"
              required
              defaultValue={dateKey(starts)}
              className="min-h-11 rounded-md border border-black/15 px-3 text-sm"
            />
          </label>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium text-black/55">
              Starts
              <input
                name="startsAt"
                type="datetime-local"
                required
                defaultValue={dateTimeInput(starts)}
                className="min-h-11 rounded-md border border-black/15 px-3 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-black/55">
              Ends
              <input
                name="endsAt"
                type="datetime-local"
                defaultValue={dateTimeInput(ends)}
                className="min-h-11 rounded-md border border-black/15 px-3 text-sm"
              />
            </label>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-medium text-black/55">
            Reminder
            <input
              name="reminderAt"
              type="datetime-local"
              defaultValue={dateTimeInput(
                entry?.reminderAt ?? task?.reminderAt,
              )}
              className="min-h-11 rounded-md border border-black/15 px-3 text-sm"
            />
          </label>
          {type === "task" ? (
            <label className="grid gap-1 text-xs font-medium text-black/55">
              Priority
              <select
                name="priority"
                defaultValue={task?.priority ?? "normal"}
                className="min-h-11 rounded-md border border-black/15 bg-white px-3 text-sm"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
          ) : null}
        </div>
        {type === "goal" || type === "target" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-xs font-medium text-black/55">
              Current
              <input
                name="currentValue"
                type="number"
                min="0"
                step="any"
                defaultValue={entry?.currentValue}
                className="min-h-11 rounded-md border border-black/15 px-3 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-black/55">
              Target
              <input
                name="targetValue"
                type="number"
                min="0"
                step="any"
                defaultValue={entry?.targetValue}
                className="min-h-11 rounded-md border border-black/15 px-3 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-black/55">
              Unit
              <input
                name="targetUnit"
                defaultValue={entry?.targetUnit}
                className="min-h-11 rounded-md border border-black/15 px-3 text-sm"
                placeholder="GBP, %, leads"
              />
            </label>
          </div>
        ) : null}
        {type === "task" ? (
          <PortalCustomFields
            fields={customFields}
            values={customFieldValues}
            onChange={setCustomFieldValues}
            legend="Action custom fields"
          />
        ) : null}
        {error ? (
          <p
            role="alert"
            className="border-l-2 border-red-500 pl-3 text-xs text-red-700"
          >
            {error}
          </p>
        ) : null}
        <footer className="flex flex-wrap justify-between gap-3 border-t border-black/10 pt-4">
          {onDelete ? (
            <button
              type="button"
              disabled={busy}
              onClick={onDelete}
              className="inline-flex min-h-10 items-center gap-2 px-2 text-xs font-semibold text-red-700"
            >
              <Trash2 size={14} />
              Delete
            </button>
          ) : (
            <span />
          )}
          <button
            disabled={busy}
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy ? (
              <LoaderCircle className="animate-spin" size={14} />
            ) : (
              <Save size={14} />
            )}
            {busy ? "Saving..." : "Save to calendar"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function CalendarGrid({
  month,
  days,
  selectedDate,
  tasks,
  actions,
  entries,
  externalEvents,
  sources,
  team,
  onSelect,
}: {
  month: Date;
  days: Date[];
  selectedDate: string;
  tasks: AgencyTask[];
  actions: GeneratedAction[];
  entries: CommandCalendarEntry[];
  externalEvents: CommandCalendarExternalEvent[];
  sources: CommandCalendarSource[];
  team: TeamMember[];
  onSelect: (day: Date) => void;
}) {
  return (
    <div className="mm-actions-calendar-grid grid min-w-[700px] grid-cols-7 border-l border-t border-black/10">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
        <div
          key={day}
          className="mm-actions-calendar-weekday border-b border-r border-black/10 bg-black/[0.02] px-2 py-2 text-center text-[10px] font-semibold uppercase text-black/40"
        >
          {day}
        </div>
      ))}
      {days.map((day) => {
        const dayTasks = tasks.filter((task) =>
          overlapsDay(
            task.startAt ?? task.dueAt,
            task.dueAt ?? task.startAt,
            day,
          ),
        );
        const dayActions = actions.filter(
          (action) => action.dueAt && sameDay(action.dueAt, day.getTime()),
        );
        const dayEntries = entries.filter((entry) =>
          overlapsDay(entry.startsAt, entry.endsAt ?? entry.startsAt, day),
        );
        const dayExternal = externalEvents.filter((event) =>
          overlapsDay(event.startsAt, event.endsAt ?? event.startsAt, day),
        );
        const total =
          dayTasks.length +
          dayActions.length +
          dayEntries.length +
          dayExternal.length;
        const currentMonth = day.getMonth() === month.getMonth();
        const today = sameDay(day.getTime(), Date.now());
        const selected = dateKey(day.getTime()) === selectedDate;
        return (
          <button
            type="button"
            key={day.toISOString()}
            data-current-month={currentMonth}
            data-today={today}
            data-selected={selected}
            onClick={() => onSelect(day)}
            className="mm-actions-calendar-day min-h-28 border-b border-r border-black/10 p-1.5 text-left"
          >
            <span
              className={`mm-actions-calendar-date grid size-6 place-items-center rounded-full text-[11px] ${today ? "bg-black text-white" : "text-black/50"}`}
            >
              {day.getDate()}
            </span>
            <div className="mt-1 grid gap-1">
              {dayTasks.slice(0, 2).map((task) => (
                <span
                  key={task.id}
                  title={task.title}
                  data-calendar-entry="task"
                  data-complete={task.status === "done"}
                  className="truncate rounded px-1.5 py-1 text-[10px]"
                >
                  {task.title}
                  {task.assigneeUserId
                    ? ` · ${team.find((member) => member.id === task.assigneeUserId)?.name ?? ""}`
                    : ""}
                </span>
              ))}
              {dayEntries.slice(0, 2).map((entry) => (
                <span
                  key={entry.id}
                  title={entry.title}
                  data-calendar-entry={entry.type}
                  data-complete={entry.status === "completed"}
                  className="truncate rounded px-1.5 py-1 text-[10px]"
                >
                  {entry.title}
                </span>
              ))}
              {dayExternal.slice(0, 3).map((event) => {
                const source = sources.find(
                  (item) => item.id === event.sourceId,
                );
                return (
                  <span
                    key={event.id}
                    title={`${event.title} · ${source?.name ?? "Google Calendar"}`}
                    data-calendar-entry="google"
                    className="truncate rounded border-l-2 px-1.5 py-1 text-[10px]"
                    style={{
                      borderLeftColor: source?.color,
                      backgroundColor: `${source?.color ?? "#2563eb"}18`,
                      color: source?.color,
                    }}
                  >
                    {event.title}
                  </span>
                );
              })}
              {dayActions.slice(0, 1).map((action) => (
                <span
                  key={action.id}
                  data-calendar-entry="signal"
                  className="truncate rounded px-1.5 py-1 text-[10px]"
                >
                  {action.title}
                </span>
              ))}
              {total > 7 ? (
                <span className="px-1 text-[9px] text-black/35">
                  +{total - 7} more
                </span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function MiniMonth({ month, selectedDate, tasks, actions, entries, externalEvents, onSelect }: { month: Date; selectedDate: string; tasks: AgencyTask[]; actions: GeneratedAction[]; entries: CommandCalendarEntry[]; externalEvents: CommandCalendarExternalEvent[]; onSelect: (day: Date) => void }) { const days = calendarDays(month); return <section className="border border-black/10 p-3"><h3 className="text-sm font-semibold text-black/75">{month.toLocaleDateString("en-GB", { month: "long" })}</h3><div className="mt-3 grid grid-cols-7 gap-1 text-center">{["M","T","W","T","F","S","S"].map((label,index) => <span key={`${label}-${index}`} className="text-[8px] font-semibold text-black/30">{label}</span>)}{days.map(day => { const count = tasks.filter(task => overlapsDay(task.startAt ?? task.dueAt, task.dueAt ?? task.startAt, day)).length + actions.filter(action => action.dueAt && sameDay(action.dueAt, day.getTime())).length + entries.filter(entry => overlapsDay(entry.startsAt, entry.endsAt ?? entry.startsAt, day)).length + externalEvents.filter(event => overlapsDay(event.startsAt, event.endsAt ?? event.startsAt, day)).length; const inMonth = day.getMonth() === month.getMonth(); return <button key={day.toISOString()} type="button" onClick={() => onSelect(day)} data-selected={dateKey(day.getTime()) === selectedDate} className={`relative grid aspect-square place-items-center text-[9px] ${inMonth ? "text-black/58" : "text-black/18"}`}><span>{day.getDate()}</span>{count ? <i className="absolute bottom-0.5 size-1 rounded-full bg-brand" /> : null}</button>; })}</div></section>; }

function ExternalCalendarAgendaRow({ event, source }: { event: CommandCalendarExternalEvent; source?: CommandCalendarSource }) {
  const content = <><span className="grid size-8 shrink-0 place-items-center" style={{ backgroundColor: `${source?.color ?? "#2563eb"}18`, color: source?.color ?? "#2563eb" }}><Cloud size={14} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-black/75">{event.title}</strong><span className="mt-1 block truncate text-[10px] text-black/40">{event.allDay ? "All day" : event.endsAt ? `${calendarTime(event.startsAt)}–${calendarTime(event.endsAt)}` : calendarTime(event.startsAt)} · {source?.name ?? "Google Calendar"}</span>{event.location || event.attendeeCount ? <span className="mt-1 block truncate text-[10px] text-black/35">{[event.location, event.attendeeCount ? `${event.attendeeCount} attendee${event.attendeeCount === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")}</span> : null}</span>{event.htmlLink ? <ExternalLink size={13} className="shrink-0 text-black/28" /> : null}</>;
  return event.htmlLink ? <a href={event.htmlLink} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 border border-black/8 bg-white p-2.5">{content}</a> : <div className="flex min-w-0 items-center gap-2 border border-black/8 bg-white p-2.5">{content}</div>;
}

function CalendarSourcesDialog({ integration, syncing, busyId, error, onClose, onToggle, onSync, onDisconnect }: { integration: CalendarIntegrationState; syncing: boolean; busyId: string | null; error: string; onClose: () => void; onToggle: (sourceId: string) => void; onSync: (connectionId: string) => void; onDisconnect: (connectionId: string) => void }) {
  return <div className="fixed inset-0 z-[105] grid items-end bg-black/45 sm:items-center sm:p-6"><button type="button" className="absolute inset-0" aria-label="Close calendar sources" onClick={onClose} /><section role="dialog" aria-modal="true" aria-labelledby="calendar-sources-heading" className="mm-calendar-sources relative mx-auto flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-lg bg-white shadow-2xl sm:rounded-lg"><header className="flex items-start justify-between gap-4 border-b border-black/10 p-5"><div><p className="text-[10px] font-semibold uppercase text-brand">Unified calendar layer</p><h2 id="calendar-sources-heading" className="mt-1 text-xl font-semibold text-black/85">Calendars and accounts</h2><p className="mt-2 max-w-xl text-xs leading-5 text-black/45">Overlay several Google work accounts with Aqua tasks, goals and plans. Account grants are separate, encrypted and independently removable.</p></div><button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-md border border-black/10"><X size={16} /></button></header><div className="grid flex-1 gap-4 overflow-y-auto p-4 sm:p-5">{!integration.configured ? <div className="border-l-2 border-amber-500 bg-amber-50 p-4"><strong className="text-sm text-amber-900">Google Calendar needs credentials</strong><p className="mt-1 text-xs leading-5 text-amber-800/75">Add the Calendar OAuth client ID, secret and callback URI from <code>.env.example</code>. Aqua Calendar remains fully usable meanwhile.</p></div> : null}{integration.connections.map(connection => { const sources = integration.sources.filter(source => source.connectionId === connection.id); return <article key={connection.id} className="overflow-hidden rounded-md border border-black/10"><header className="flex flex-wrap items-center justify-between gap-3 bg-black/[0.025] px-4 py-3"><div className="flex min-w-0 items-center gap-3"><span className={`grid size-9 shrink-0 place-items-center rounded-md ${connection.status === "error" || connection.status === "revoked" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>{connection.status === "error" || connection.status === "revoked" ? <CloudOff size={16} /> : <Cloud size={16} />}</span><div className="min-w-0"><strong className="block truncate text-sm text-black/78">{connection.accountName || connection.accountEmail}</strong><span className="block truncate text-[10px] text-black/40">{connection.accountEmail} · {connection.lastSyncedAt ? `synced ${relativeTime(connection.lastSyncedAt)}` : "not synced yet"}{connection.canRefresh ? " · background refresh ready" : " · reconnect when access expires"}</span></div></div><div className="flex items-center gap-1"><button type="button" disabled={syncing} onClick={() => onSync(connection.id)} title="Sync this account" className="grid size-9 place-items-center rounded-md border border-black/10 text-black/55 disabled:opacity-40"><RefreshCw size={14} className={syncing ? "animate-spin" : ""} /></button><button type="button" disabled={busyId === connection.id} onClick={() => onDisconnect(connection.id)} title="Disconnect account" className="grid size-9 place-items-center rounded-md border border-black/10 text-red-600 disabled:opacity-40">{busyId === connection.id ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}</button></div></header>{connection.lastError ? <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-[10px] leading-4 text-red-700">{connection.lastError}</p> : null}<div className="divide-y divide-black/[0.07]">{sources.map(source => <label key={source.id} className="flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-black/[0.02]"><input type="checkbox" checked={source.selected} onChange={() => onToggle(source.id)} /><i className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: source.color }} /><span className="min-w-0 flex-1"><strong className="block truncate text-xs font-semibold text-black/68">{source.name}</strong><span className="block truncate text-[9px] text-black/35">{[source.primary ? "Primary" : "Google calendar", source.timeZone, source.writable ? "Can edit at Google" : "Read only"].filter(Boolean).join(" · ")}</span></span><span className="text-[9px] font-semibold uppercase text-black/30">{integration.events.filter(event => event.sourceId === source.id).length} events</span></label>)}{!sources.length ? <p className="px-4 py-5 text-xs text-black/40">No calendars were returned by this account.</p> : null}</div></article>; })}{!integration.connections.length ? <div className="grid place-items-center border border-dashed border-black/15 px-5 py-10 text-center"><Cloud className="text-black/20" size={26} /><strong className="mt-3 text-sm text-black/65">Your first work calendar can join the plot</strong><p className="mt-1 max-w-sm text-xs leading-5 text-black/40">Connect Google, choose exactly which calendars are visible, then add another account whenever you need it.</p></div> : null}{error ? <p role="alert" className="border-l-2 border-red-500 bg-red-50 p-3 text-xs text-red-700">{error}</p> : null}</div><footer className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 bg-black/[0.018] p-4 sm:px-5"><div><strong className="block text-xs text-black/60">Aqua Calendar is always available</strong><span className="text-[10px] text-black/35">Tasks, notes, goals and targets stay owned by AquaCRM.</span></div>{integration.configured ? <a href="/api/portal/calendar/google/start?returnUrl=%2Fportal%2Fagency%2Fcalendar" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-xs font-semibold text-white"><Plus size={14} />Connect another Google account</a> : null}</footer></section></div>;
}

function DayAgendaRow({ type, title, detail, complete, onComplete, onOpen }: { type: string; title: string; detail: string; complete: boolean; onComplete: () => void; onOpen: () => void }) { const Icon = type === "task" ? CheckCircle2 : type === "work-block" ? BriefcaseBusiness : type === "reminder" ? AlarmClock : type === "note" ? NotebookPen : type === "goal" || type === "target" ? Target : CalendarDays; return <div className="flex min-w-0 items-center gap-2 border border-black/8 bg-white p-2.5"><button type="button" onClick={onComplete} aria-label={complete ? `Reopen ${title}` : `Complete ${title}`} className={`grid size-8 shrink-0 place-items-center ${complete ? "bg-emerald-50 text-emerald-700" : "bg-black/[0.035] text-black/45"}`}><Icon size={14} /></button><button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left"><strong className={`block truncate text-xs ${complete ? "text-black/38 line-through" : "text-black/75"}`}>{title}</strong><span className="mt-1 block truncate text-[10px] capitalize text-black/40">{type.replace("-", " ")} · {detail}</span></button><ChevronRight size={13} className="shrink-0 text-black/25" /></div>; }

function CalendarMetric({ label, value }: { label: string; value: number }) { return <div className="min-w-20 border border-black/10 px-2 py-2"><strong className="block text-sm text-black/72">{value}</strong><span className="text-[8px] uppercase text-black/35">{label}</span></div>; }

function entryDetail(entry: CommandCalendarEntry) { const timing = entry.allDay ? "All day" : entry.endsAt ? `${calendarTime(entry.startsAt)}–${calendarTime(entry.endsAt)}` : calendarTime(entry.startsAt); if ((entry.type === "goal" || entry.type === "target") && entry.targetValue !== undefined) return `${timing} · ${entry.currentValue ?? 0}/${entry.targetValue}${entry.targetUnit ? ` ${entry.targetUnit}` : ""}`; return timing; }
function dateKey(value: number | Date) { const date = value instanceof Date ? value : new Date(value); const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 10); }
function calendarTime(value?: number, includeDate = false) { if (!value) return "Time not set"; return formatUkDate(value, includeDate ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit" }); }
function relativeTime(value: number) { const seconds = Math.max(0, Math.round((Date.now() - value) / 1_000)); if (seconds < 60) return "just now"; if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`; return `${Math.floor(seconds / 86_400)}d ago`; }

function TaskModal({ team, clients, sops, customFields, onClose, onCreated }: { team: TeamMember[]; clients: ActionClient[]; sops: SopDocument[]; customFields: PortalFormFieldDefinition[]; onClose: () => void; onCreated: (task: AgencyTask) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sopIds, setSopIds] = useState<string[]>([]);
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [clientId, setClientId] = useState("");
  const [customFieldValues, setCustomFieldValues] = useState<PortalCustomFieldValues>({});
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/portal/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: data.get("title"), notes: data.get("notes"), priority: data.get("priority"), assigneeUserId: assigneeUserId || undefined, clientId: clientId || undefined, startAt: toTimestamp(String(data.get("startAt") ?? "")), dueAt: toTimestamp(String(data.get("dueAt") ?? ""), true), reminderAt: toDateTimeTimestamp(String(data.get("reminderAt") ?? "")), recurrence: data.get("recurrence"), origin: "manual", sopIds, customFields: customFieldValues }) });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; field?: string; task?: AgencyTask } | null;
      if (!response.ok || !result?.ok || !result.task) throw new Error(result?.error || "The task could not be added.");
      onCreated(result.task);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The task could not be added.");
    } finally {
      setBusy(false);
    }
  }
  return <div className="fixed inset-0 z-[90] grid items-end bg-black/35 sm:items-center sm:p-6"><button className="absolute inset-0" aria-label="Close task form" onClick={onClose} /><form role="dialog" aria-modal="true" aria-labelledby="new-task-title" className="relative mx-auto grid max-h-[100dvh] w-full max-w-2xl gap-4 overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl sm:max-h-[92dvh] sm:rounded-lg" onSubmit={submit}>
    <div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase text-black/40">New task</p><h2 id="new-task-title" className="mt-1 text-xl font-semibold">What needs to happen?</h2></div><button type="button" aria-label="Close task form" onClick={onClose} className="grid size-9 place-items-center rounded-md border border-black/10"><X size={16} /></button></div>
    <label className="grid gap-1 text-xs font-medium text-black/55">Task<input autoFocus required name="title" className="min-h-11 rounded-md border border-black/15 px-3 text-sm" placeholder="Prepare homepage concepts" /></label>
    <label className="grid gap-1 text-xs font-medium text-black/55">Notes<textarea name="notes" rows={4} className="rounded-md border border-black/15 px-3 py-2 text-sm" placeholder="Outcome, links, context, or checklist" /></label>
    <AssignmentPicker team={team} clients={clients} assigneeUserId={assigneeUserId} clientId={clientId} onAssigneeChange={setAssigneeUserId} onClientChange={setClientId} />
    <div className="grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-xs font-medium text-black/55">Priority<select name="priority" defaultValue="normal" className="min-h-11 rounded-md border border-black/15 bg-white px-3 text-sm"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label className="grid gap-1 text-xs font-medium text-black/55">Start date<input name="startAt" type="date" className="min-h-11 rounded-md border border-black/15 px-3 text-sm" /></label><label className="grid gap-1 text-xs font-medium text-black/55">Due date<input name="dueAt" type="date" className="min-h-11 rounded-md border border-black/15 px-3 text-sm" /></label></div>
    <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-medium text-black/55">Reminder<input name="reminderAt" type="datetime-local" className="min-h-11 rounded-md border border-black/15 px-3 text-sm" /></label><label className="grid gap-1 text-xs font-medium text-black/55">Repeats<select name="recurrence" defaultValue="none" className="min-h-11 rounded-md border border-black/15 bg-white px-3 text-sm"><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label></div>
    <PortalCustomFields fields={customFields} values={customFieldValues} onChange={setCustomFieldValues} legend="Action custom fields" />
    <SopPicker sops={sops} selected={sopIds} onChange={setSopIds} />
    {error ? <p role="alert" className="border-l-2 border-red-500 pl-3 text-xs leading-5 text-red-700">{error}</p> : null}
    <div className="flex justify-end"><button disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50"><Plus size={15} />{busy ? "Adding..." : "Add task"}</button></div>
  </form></div>;
}

function AssignmentPicker({ team, clients, assigneeUserId, clientId, onAssigneeChange, onClientChange }: { team: TeamMember[]; clients: ActionClient[]; assigneeUserId: string; clientId: string; onAssigneeChange: (id: string) => void; onClientChange: (id: string) => void }) {
  const staffOptions = team.map(member => ({ id: member.id, label: member.name, detail: member.email, group: "Team" }));
  const clientOptions = clients.map(client => ({ id: client.id, label: client.name, detail: client.stage.replaceAll("-", " "), group: client.status === "active" ? "Active clients" : "Other client records" }));
  return <fieldset className="grid gap-2">
    <legend className="text-[10px] font-semibold uppercase tracking-wide text-black/40">Assignment</legend>
    <div className="grid gap-2 sm:grid-cols-2">
      <NestedAssignmentMenu icon={<UserRound size={15} />} label="Staff owner" emptyLabel="Unassigned" value={assigneeUserId} options={staffOptions} onChange={onAssigneeChange} />
      <NestedAssignmentMenu icon={<Building2 size={15} />} label="Client" emptyLabel="No client" value={clientId} options={clientOptions} onChange={onClientChange} />
    </div>
  </fieldset>;
}

function NestedAssignmentMenu({ icon, label, emptyLabel, value, options, onChange }: { icon: React.ReactNode; label: string; emptyLabel: string; value: string; options: Array<{ id: string; label: string; detail?: string; group: string }>; onChange: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const selected = options.find(option => option.id === value);
  const visible = options.filter(option => `${option.label} ${option.detail ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const groups = [...new Set(visible.map(option => option.group))];
  const choose = (event: React.MouseEvent<HTMLButtonElement>, id: string) => {
    onChange(id);
    setQuery("");
    event.currentTarget.closest("details")?.removeAttribute("open");
  };
  return <details className="group relative min-w-0">
    <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-md border border-black/12 bg-white px-3 text-left hover:border-black/22 [&::-webkit-details-marker]:hidden">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-black/[0.045] text-black/48">{icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-[9px] font-semibold uppercase tracking-wide text-black/35">{label}</span><strong className={`block truncate text-xs ${selected ? "text-black/72" : "text-black/42"}`}>{selected?.label ?? emptyLabel}</strong></span>
      <ChevronDown size={14} className="shrink-0 text-black/35 transition group-open:rotate-180" />
    </summary>
    <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-black/12 bg-white shadow-xl">
      <label className="flex min-h-10 items-center gap-2 border-b border-black/8 px-3 text-black/40"><Search size={13} /><span className="sr-only">Search {label.toLowerCase()}</span><input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => event.stopPropagation()} placeholder={`Search ${label.toLowerCase()}`} className="min-w-0 flex-1 border-0 bg-transparent py-2 text-xs text-black/70 outline-none" /></label>
      <div className="max-h-56 overflow-y-auto p-1.5">
        <button type="button" onClick={event => choose(event, "")} className={`flex min-h-9 w-full items-center gap-2 rounded px-2 text-left text-xs ${!value ? "bg-black/[0.055] font-semibold text-black/72" : "text-black/48 hover:bg-black/[0.035]"}`}><X size={12} />{emptyLabel}</button>
        {groups.map(group => <section key={group} className="mt-1"><p className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-black/30">{group}</p>{visible.filter(option => option.group === group).map(option => <button key={option.id} type="button" onClick={event => choose(event, option.id)} className={`flex min-h-10 w-full items-center gap-2 rounded px-2 text-left ${value === option.id ? "bg-brand/[0.08] text-brand" : "text-black/62 hover:bg-black/[0.035]"}`}><span className="min-w-0 flex-1"><strong className="block truncate text-xs font-medium">{option.label}</strong>{option.detail ? <span className="block truncate text-[9px] capitalize opacity-60">{option.detail}</span> : null}</span>{value === option.id ? <Check size={13} /> : null}</button>)}</section>)}
        {!visible.length ? <p className="px-3 py-5 text-center text-xs text-black/38">No match found.</p> : null}
      </div>
    </div>
  </details>;
}

function SopPicker({ sops, selected, onChange }: { sops: SopDocument[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return <fieldset className="grid gap-2 rounded-md border border-black/10 bg-white p-3">
    <legend className="sr-only">Attached SOPs</legend>
    <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-black/60">Attached SOPs</span><Link href="/portal/agency/sop-library" target="_blank" className="inline-flex items-center gap-1 text-[11px] font-medium text-black/45 hover:text-black">Open library <ExternalLink size={11} /></Link></div>
    {sops.length ? <div className="grid max-h-40 gap-1 overflow-y-auto">{sops.map(sop => <label key={sop.id} className="flex min-h-9 items-center gap-2 rounded px-2 text-xs text-black/70 hover:bg-black/[0.03]"><input type="checkbox" checked={selected.includes(sop.id)} onChange={event => onChange(event.target.checked ? [...selected, sop.id] : selected.filter(id => id !== sop.id))} /><BookOpen size={13} className="text-black/35" /><span className="min-w-0 flex-1 truncate">{sop.title}</span>{sop.category ? <span className="text-[10px] text-black/35">{sop.category}</span> : null}</label>)}</div> : <p className="text-xs leading-5 text-black/40">No SOPs in your library yet.</p>}
  </fieldset>;
}

function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) { return <button type="button" onClick={onClick} title={label} className={`inline-flex min-h-8 items-center gap-1.5 rounded px-2 text-xs font-medium ${active ? "bg-black text-white" : "text-black/50"}`}>{icon}<span>{label}</span></button>; }
function SourceBadge({ origin }: { origin: AgencyTaskOrigin }) {
  const style = origin === "radar" ? "bg-teal-50 text-teal-700" : origin === "advisor" ? "bg-violet-50 text-violet-700" : origin === "crm" ? "bg-sky-50 text-sky-700" : origin === "inbox" ? "bg-amber-50 text-amber-800" : "bg-black/[0.045] text-black/48";
  const detail = origin === "radar"
    ? "Business Radar found this from live checks and retained evidence."
    : origin === "advisor"
      ? "Aqua Advisor or an approved external assistant proposed this from connected business context."
      : origin === "crm"
        ? "AquaCRM created this from a client, enquiry, finance, delivery or workflow signal."
        : "Created manually by a workspace user.";
  const Icon = origin === "radar" ? Radar : origin === "advisor" ? Bot : origin === "crm" ? Workflow : UserRound;
  return <span title={detail} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${style}`}><Icon size={10} />{sourceLabel(origin)}<Info size={9} className="opacity-55" /></span>;
}
function ReconciliationBadge({ status }: { status: NonNullable<AgencyTask["reconciliation"]>["status"] }) { const style = status === "resolved" ? "bg-emerald-50 text-emerald-700" : status === "still-firing" || status === "reopened" ? "bg-red-50 text-red-700" : status === "unverifiable" ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700"; const label = status === "resolved" ? "Radar resolved" : status === "still-firing" ? "Still firing" : status === "reopened" ? "Radar reopened" : status === "unverifiable" ? "Needs evidence" : "Awaiting sweep"; return <span title={`Radar reconciliation: ${label}`} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${style}`}><Radar size={10} />{label}</span>; }
function Priority({ value }: { value: AgencyTaskPriority }) { if (value === "normal") return null; const style = value === "urgent" ? "bg-red-50 text-red-700" : value === "high" ? "bg-amber-50 text-amber-700" : "bg-black/[0.04] text-black/45"; return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${style}`}>{value}</span>; }
function Pill({ children }: { children: React.ReactNode }) { return <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-medium text-black/50">{children}</span>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string,string][] }) { return <label className="grid gap-1 text-[10px] font-medium text-black/45">{label}<select value={value} onChange={event => onChange(event.target.value)} className="min-h-10 rounded-md border border-black/15 bg-white px-2 text-xs">{options.map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></label>; }
function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="grid gap-1 text-[10px] font-medium text-black/45">{label}<input type="date" value={value} onChange={event => onChange(event.target.value)} className="min-h-10 min-w-0 rounded-md border border-black/15 bg-white px-1 text-xs" /></label>; }
function startOfDay(value: number) { const date = new Date(value); date.setHours(0,0,0,0); return date.getTime(); }
function toTimestamp(value: string, end = false): number | undefined { if (!value) return undefined; const date = new Date(`${value}T${end ? "23:59:59" : "00:00:00"}`); return Number.isFinite(date.getTime()) ? date.getTime() : undefined; }
function dateInput(value?: number) { return dateInputValue(value); }
function dateTimeInput(value?: number) { if (!value) return ""; const date = new Date(value); const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return local.toISOString().slice(0,16); }
function toDateTimeTimestamp(value: string): number | undefined { if (!value) return undefined; const time = new Date(value).getTime(); return Number.isFinite(time) ? time : undefined; }
function formatDateTime(value: number) { return formatUkDate(value, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
function dateRange(start?: number, due?: number) { if (start && due && !sameDay(start,due)) return `${formatUkDate(start, { day: "numeric", month: "short" })} – ${formatUkDate(due, { day: "numeric", month: "short" })}`; const value = due ?? start; return value ? formatUkDate(value, { day: "numeric", month: "short", year: "numeric" }) : "No date"; }
function startOfMonth(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function addMonths(date: Date, amount: number) { return new Date(date.getFullYear(), date.getMonth() + amount, 1); }
function sameDay(a: number, b: number) { const x = new Date(a), y = new Date(b); return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate(); }
function overlapsDay(start: number | undefined, end: number | undefined, day: Date) { if (!start && !end) return false; const dayStart = startOfDay(day.getTime()), dayEnd = dayStart + 86_400_000 - 1; return (start ?? end ?? 0) <= dayEnd && (end ?? start ?? 0) >= dayStart; }
function calendarDays(month: Date) { const first = startOfMonth(month); const offset = (first.getDay() + 6) % 7; const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset); return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)); }
function taskOrigin(task: AgencyTask): AgencyTaskOrigin { return task.origin ?? "manual"; }
function sourceLabel(source: Exclude<ActionSource, "all">): string { return source === "crm" ? "CRM" : source === "inbox" ? "Needs attention" : source.charAt(0).toUpperCase() + source.slice(1); }
function normaliseTitle(value: string): string { return value.trim().toLowerCase().replace(/\s+/g, " "); }
function clientIdFromHref(href: string): string | undefined { return href.match(/^\/portal\/clients\/([^/?#]+)/)?.[1]; }

function sourceCountMap(tasks: AgencyTask[], radar: AdvisorActionSuggestion[], advisor: AdvisorActionSuggestion[], crm: GeneratedAction[], proposals: ExternalAssistantActionProposal[]): Record<ActionSource, number> {
  const pendingProposals = proposals.filter(proposal => proposal.status === "pending").length;
  // Today is derivable, so show the real figure rather than a zero that
  // contradicts the list underneath it.
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const dueToday = tasks.filter(task =>
    task.status !== "done" && (task.dueAt ?? task.startAt ?? 0) > 0
    && (task.dueAt ?? task.startAt ?? 0) <= endOfToday.getTime()).length;
  const counts: Record<ActionSource, number> = { all: 0, radar: radar.length, advisor: advisor.length + pendingProposals, manual: 0, crm: crm.length, inbox: 0, today: dueToday, completed: 0 };
  for (const task of tasks) counts[taskOrigin(task)] += 1;
  // `completed` is deliberately excluded from `all`: the All queue is
  // outstanding work, and folding finished items into it would make the
  // headline number grow as you clear things.
  counts.all = counts.radar + counts.advisor + counts.manual + counts.crm;
  return counts;
}

function buildUnifiedActionQueue({ tasks, radar, advisor, proposals, crm, recommendationsGeneratedAt, advisorReviewedAt, sort }: { tasks: AgencyTask[]; radar: AdvisorActionSuggestion[]; advisor: AdvisorActionSuggestion[]; proposals: ExternalAssistantActionProposal[]; crm: GeneratedAction[]; recommendationsGeneratedAt: number; advisorReviewedAt: number | null; sort: ActionSort }): UnifiedActionItem[] {
  const rows: UnifiedActionItem[] = [
    ...tasks.map(task => ({ type: "task" as const, id: task.id, source: taskOrigin(task), priority: task.priority, dueAt: task.dueAt, createdAt: task.createdAt, updatedAt: task.updatedAt, task })),
    ...radar.map(suggestion => ({ type: "suggestion" as const, id: suggestion.id, source: "radar" as const, priority: suggestion.priority, dueAt: suggestion.dueAt, createdAt: recommendationsGeneratedAt, updatedAt: recommendationsGeneratedAt, suggestion })),
    ...advisor.map(suggestion => ({ type: "suggestion" as const, id: suggestion.id, source: "advisor" as const, priority: suggestion.priority, dueAt: suggestion.dueAt, createdAt: advisorReviewedAt ?? recommendationsGeneratedAt, updatedAt: advisorReviewedAt ?? recommendationsGeneratedAt, suggestion })),
    ...proposals.filter(proposal => proposal.status === "pending").map(proposal => ({ type: "proposal" as const, id: proposal.id, source: "advisor" as const, priority: proposal.priority, dueAt: proposal.suggestedDueAt, createdAt: proposal.submittedAt, updatedAt: proposal.updatedAt, proposal })),
    ...crm.map(action => ({ type: "crm" as const, id: action.id, source: "crm" as const, priority: action.priority, dueAt: action.dueAt, createdAt: recommendationsGeneratedAt, updatedAt: recommendationsGeneratedAt, action })),
  ];
  return rows.sort((left, right) => {
    const completion = Number(left.type === "task" && left.task.status === "done") - Number(right.type === "task" && right.task.status === "done");
    if (completion) return completion;
    if (sort === "due-soon") return (left.dueAt ?? Number.MAX_SAFE_INTEGER) - (right.dueAt ?? Number.MAX_SAFE_INTEGER) || priorityRank(left.priority) - priorityRank(right.priority);
    if (sort === "newest") return right.createdAt - left.createdAt;
    if (sort === "oldest") return left.createdAt - right.createdAt;
    if (sort === "recently-updated") return right.updatedAt - left.updatedAt;
    return priorityRank(left.priority) - priorityRank(right.priority) || (left.dueAt ?? Number.MAX_SAFE_INTEGER) - (right.dueAt ?? Number.MAX_SAFE_INTEGER) || right.updatedAt - left.updatedAt;
  });
}

function promoteLinkedTask(window: ProtectedAttentionWindow<UnifiedActionItem>, taskId: string | null): ProtectedAttentionWindow<UnifiedActionItem> {
  if (!taskId || window.focus.some(item => item.type === "task" && item.id === taskId)) return window;
  const linked = window.reserve.find(item => item.type === "task" && item.id === taskId);
  if (!linked) return window;
  const displaced = window.focus.at(-1);
  const focus = [linked, ...window.focus.filter(item => item.id !== linked.id)].slice(0, window.focusLimit);
  const reserve = [
    ...window.reserve.filter(item => item.id !== linked.id),
    ...(displaced && !focus.some(item => item.id === displaced.id) ? [displaced] : []),
  ];
  const reserveGroups = [...reserve.reduce((groups, item) => {
    groups.set(item.source, (groups.get(item.source) ?? 0) + 1);
    return groups;
  }, new Map<string, number>())]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
  return { ...window, focus, reserve, reserveCount: reserve.length, reserveGroups };
}

function sortTasks(tasks: AgencyTask[], sort: ActionSort): AgencyTask[] {
  const rows = [...tasks];
  if (sort === "due-soon") return rows.sort((a, b) => (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER) || priorityRank(a.priority) - priorityRank(b.priority));
  if (sort === "newest") return rows.sort((a, b) => b.createdAt - a.createdAt);
  if (sort === "oldest") return rows.sort((a, b) => a.createdAt - b.createdAt);
  if (sort === "recently-updated") return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  return rows.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER) || b.updatedAt - a.updatedAt);
}

/** The alert id behind a generated action, whatever wrapper it arrived in. */
function alertIdOf(action: GeneratedAction): string {
  return action.id.startsWith("attention:") ? action.id.slice("attention:".length) : action.id;
}

/**
 * Only inbox-derived rows carry a deferral count — a task or an Advisor
 * suggestion has never been "put off", it has simply not been done yet.
 */
function deferralsOf(item: UnifiedActionItem): number | undefined {
  return item.type === "crm" ? item.action.deferrals : undefined;
}

function priorityRank(priority: AgencyTaskPriority): number { return priority === "urgent" ? 0 : priority === "high" ? 1 : priority === "normal" ? 2 : 3; }
