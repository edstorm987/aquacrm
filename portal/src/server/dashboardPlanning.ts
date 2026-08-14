import "server-only";

import crypto from "node:crypto";
import { getState, mutate } from "./storage";
import type {
  DashboardClockOutReview,
  DashboardDayPlan,
  DashboardWeeklyEvidenceSnapshot,
  DashboardWeekPlan,
  DashboardWorkActivityBlock,
  DashboardWorkActivityMode,
  DashboardWorkSession,
} from "./types";

const DAY = 24 * 60 * 60 * 1000;
export const DASHBOARD_IDLE_PROMPT_MS = 10 * 60 * 1000;
export const DASHBOARD_DEFAULT_CHECK_IN_MINUTES = 30;
const DASHBOARD_LONG_SESSION_GUARDRAIL_MS = 4 * 60 * 60 * 1000;

export type DashboardClockOutReviewInput = Omit<DashboardClockOutReview, "submittedAt">;

export class DashboardClockOutReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardClockOutReviewError";
  }
}

export class DashboardWeeklyReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardWeeklyReviewError";
  }
}

export interface DashboardPlanningSnapshot {
  today: string;
  weekStart: string;
  weekPlan: DashboardWeekPlan | null;
  dayPlan: DashboardDayPlan | null;
  weekPlans: DashboardDayPlan[];
  sessions: DashboardWorkSession[];
  activeSession: DashboardWorkSession | null;
}

export interface DashboardWorkAccountabilitySnapshot {
  generatedAt: number;
  activeSessions: number;
  sessionsNeedingCheckIn: number;
  productiveMs: number;
  aquaActiveMs: number;
  externalWorkMs: number;
  breakMs: number;
  unconfirmedIdleMs: number;
  evidenceConfidencePercent: number;
  unconfirmedWindows: number;
  contextSwitches: number;
  longestProductiveBlockMs: number;
  attentionState: "confirmed" | "watch" | "check-in-due";
  focusState: "focused" | "watch" | "unconfirmed";
  focusSignals: string[];
  routeSwitches: number;
  aquaWorkspaceTime: Array<{ path: string; activeMs: number }>;
  sessions: Array<{
    id: string;
    userId: string;
    date: string;
    startedAt: number;
    endedAt?: number;
    mode: DashboardWorkActivityMode;
    focus?: string;
    needsActivityConfirmation: boolean;
    lastHeartbeatAt?: number;
    lastInteractionAt?: number;
    nextCheckInAt?: number;
    aquaActiveMs: number;
    externalWorkMs: number;
    breakMs: number;
    unconfirmedIdleMs: number;
    currentPath?: string;
    routeActiveMs: Record<string, number>;
    routeSwitches: number;
  }>;
}

export function dashboardPlanningSnapshot(agencyId: string, userId: string, date = isoDate(), now = Date.now()): DashboardPlanningSnapshot {
  const weekStart = isoDate(startOfWeek(new Date(`${date}T12:00:00`)));
  const weekEnd = isoDate(new Date(new Date(`${weekStart}T12:00:00`).getTime() + 6 * DAY));
  const plans = Object.values(getState().dashboardDayPlans)
    .filter(plan => plan.agencyId === agencyId && plan.userId === userId && plan.date >= weekStart && plan.date <= weekEnd)
    .sort((a, b) => a.date.localeCompare(b.date));
  const sessions = Object.values(getState().dashboardWorkSessions)
    .filter(session => session.agencyId === agencyId && session.userId === userId && session.date >= weekStart && session.date <= weekEnd)
    .sort((a, b) => b.startedAt - a.startedAt);
  const projectedSessions = sessions.map(session => projectDashboardWorkSession(session, now));
  const weekPlan = Object.values(getState().dashboardWeekPlans)
    .find(plan => plan.agencyId === agencyId && plan.userId === userId && plan.weekStart === weekStart) ?? null;
  return {
    today: date,
    weekStart,
    weekPlan,
    dayPlan: plans.find(plan => plan.date === date) ?? null,
    weekPlans: plans,
    sessions: projectedSessions,
    activeSession: projectedSessions.find(session => !session.endedAt) ?? null,
  };
}

export function dashboardWorkAccountabilitySnapshot(agencyId: string, now = Date.now()): DashboardWorkAccountabilitySnapshot {
  const today = isoDate(new Date(now));
  const sessions = Object.values(getState().dashboardWorkSessions)
    .filter(session => session.agencyId === agencyId && session.date === today)
    .map(session => projectDashboardWorkSession(session, now));
  const totals = sessions.reduce((sum, session) => ({
    aquaActiveMs: sum.aquaActiveMs + (session.aquaActiveMs ?? 0),
    externalWorkMs: sum.externalWorkMs + (session.externalWorkMs ?? 0),
    breakMs: sum.breakMs + (session.breakMs ?? 0),
    unconfirmedIdleMs: sum.unconfirmedIdleMs + (session.unconfirmedIdleMs ?? 0),
  }), { aquaActiveMs: 0, externalWorkMs: 0, breakMs: 0, unconfirmedIdleMs: 0 });
  const productiveMs = totals.aquaActiveMs + totals.externalWorkMs;
  const observedMs = productiveMs + totals.unconfirmedIdleMs;
  const blocks = sessions.flatMap(session => session.activityBlocks ?? []);
  const unconfirmedWindows = blocks.filter(block => block.mode === "unconfirmed").length;
  const productiveBlocks = blocks.filter(block => block.mode === "aqua" || block.mode === "external");
  const longestProductiveBlockMs = productiveBlocks.reduce((longest, block) => Math.max(longest, Math.max(0, (block.endedAt ?? now) - block.startedAt)), 0);
  const sessionsNeedingCheckIn = sessions.filter(session => !session.endedAt && session.needsActivityConfirmation).length;
  const routeSwitches = sessions.reduce((total, session) => total + (session.routeSwitches ?? 0), 0);
  const routeTotals = new Map<string, number>();
  for (const session of sessions) {
    for (const [path, activeMs] of Object.entries(session.routeActiveMs ?? {})) routeTotals.set(path, (routeTotals.get(path) ?? 0) + activeMs);
  }
  const aquaWorkspaceTime = [...routeTotals.entries()]
    .map(([path, activeMs]) => ({ path, activeMs }))
    .sort((left, right) => right.activeMs - left.activeMs)
    .slice(0, 12);
  const focusSignals: string[] = [];
  if (sessionsNeedingCheckIn) focusSignals.push(`${sessionsNeedingCheckIn} active work session${sessionsNeedingCheckIn === 1 ? " needs" : "s need"} a human check-in.`);
  if (totals.unconfirmedIdleMs >= 15 * 60_000) focusSignals.push(`${Math.round(totals.unconfirmedIdleMs / 60_000)} minutes are unconfirmed rather than counted as productive.`);
  const productiveHours = Math.max(0.25, productiveMs / 3_600_000);
  if (productiveMs >= 30 * 60_000 && routeSwitches / productiveHours >= 18) focusSignals.push(`${routeSwitches} Aqua workspace switches suggest possible focus fragmentation; confirm before calling it procrastination.`);
  if (sessions.some(session => !session.endedAt && !session.focus)) focusSignals.push("The active work session has no named outcome.");
  const focusState = sessionsNeedingCheckIn ? "unconfirmed" : focusSignals.length ? "watch" : "focused";

  return {
    generatedAt: now,
    activeSessions: sessions.filter(session => !session.endedAt).length,
    sessionsNeedingCheckIn,
    productiveMs,
    ...totals,
    evidenceConfidencePercent: observedMs ? Math.round(productiveMs / observedMs * 100) : 100,
    unconfirmedWindows,
    contextSwitches: Math.max(0, blocks.length - sessions.length),
    longestProductiveBlockMs,
    attentionState: sessionsNeedingCheckIn ? "check-in-due" : totals.unconfirmedIdleMs ? "watch" : "confirmed",
    focusState,
    focusSignals,
    routeSwitches,
    aquaWorkspaceTime,
    sessions: sessions.map(session => ({
      id: session.id,
      userId: session.userId,
      date: session.date,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      mode: session.currentMode ?? "unconfirmed",
      focus: session.focus,
      needsActivityConfirmation: Boolean(session.needsActivityConfirmation),
      lastHeartbeatAt: session.lastHeartbeatAt,
      lastInteractionAt: session.lastInteractionAt,
      nextCheckInAt: session.nextCheckInAt,
      aquaActiveMs: session.aquaActiveMs ?? 0,
      externalWorkMs: session.externalWorkMs ?? 0,
      breakMs: session.breakMs ?? 0,
      unconfirmedIdleMs: session.unconfirmedIdleMs ?? 0,
      currentPath: session.currentPath,
      routeActiveMs: session.routeActiveMs ?? {},
      routeSwitches: session.routeSwitches ?? 0,
    })),
  };
}

export function upsertDashboardWeekPlan(input: {
  agencyId: string;
  userId: string;
  weekStart?: string;
  outcome?: string;
  reviewNotes?: string;
  wins?: string;
  misses?: string;
  lessons?: string;
  decisions?: string;
  risks?: string;
  startDoing?: string;
  stopDoing?: string;
  continueDoing?: string;
  nextWeekPriorities?: string;
  executionScore?: number;
  energyScore?: number;
  confidenceScore?: number;
  reviewStatus?: "draft" | "complete";
  evidenceSnapshot?: Partial<DashboardWeeklyEvidenceSnapshot>;
}): DashboardWeekPlan {
  const now = Date.now();
  const weekStart = isoDate(startOfWeek(new Date(`${cleanDate(input.weekStart)}T12:00:00`)));
  const existing = Object.values(getState().dashboardWeekPlans)
    .find(plan => plan.agencyId === input.agencyId && plan.userId === input.userId && plan.weekStart === weekStart);
  const reviewStatus = input.reviewStatus === undefined ? existing?.reviewStatus ?? "draft" : input.reviewStatus === "complete" ? "complete" : "draft";
  const wins = cleanReviewTextUpdate(input, "wins", existing?.wins, 6_000);
  const misses = cleanReviewTextUpdate(input, "misses", existing?.misses, 6_000);
  const lessons = cleanReviewTextUpdate(input, "lessons", existing?.lessons, 6_000);
  const decisions = cleanReviewTextUpdate(input, "decisions", existing?.decisions, 6_000);
  const nextWeekPriorities = cleanReviewTextUpdate(input, "nextWeekPriorities", existing?.nextWeekPriorities, 6_000);
  const executionScore = Object.hasOwn(input, "executionScore") ? cleanReviewScore(input.executionScore) : existing?.executionScore;
  const energyScore = Object.hasOwn(input, "energyScore") ? cleanReviewScore(input.energyScore) : existing?.energyScore;
  const confidenceScore = Object.hasOwn(input, "confidenceScore") ? cleanReviewScore(input.confidenceScore) : existing?.confidenceScore;
  if (reviewStatus === "complete") {
    const missing = [
      !wins && "wins",
      !misses && "misses",
      !lessons && "lessons",
      !decisions && "decisions",
      !nextWeekPriorities && "next week priorities",
      !executionScore && "execution score",
      !energyScore && "energy score",
      !confidenceScore && "confidence score",
    ].filter(Boolean);
    if (missing.length) throw new DashboardWeeklyReviewError(`Complete the weekly review before closing it: ${missing.join(", ")}.`);
  }
  const evidenceSnapshot = cleanWeeklyEvidenceSnapshot(input.evidenceSnapshot, now) ?? existing?.evidenceSnapshot;
  const plan: DashboardWeekPlan = {
    id: existing?.id ?? `week_${crypto.randomBytes(8).toString("hex")}`,
    agencyId: input.agencyId,
    userId: input.userId,
    weekStart,
    outcome: cleanText(input.outcome, 280),
    reviewNotes: cleanText(input.reviewNotes, 3_000),
    wins,
    misses,
    lessons,
    decisions,
    risks: cleanReviewTextUpdate(input, "risks", existing?.risks, 6_000),
    startDoing: cleanReviewTextUpdate(input, "startDoing", existing?.startDoing, 4_000),
    stopDoing: cleanReviewTextUpdate(input, "stopDoing", existing?.stopDoing, 4_000),
    continueDoing: cleanReviewTextUpdate(input, "continueDoing", existing?.continueDoing, 4_000),
    nextWeekPriorities,
    executionScore,
    energyScore,
    confidenceScore,
    reviewStatus,
    reviewedAt: reviewStatus === "complete" ? existing?.reviewedAt ?? now : existing?.reviewedAt,
    evidenceSnapshot,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  mutate(state => { state.dashboardWeekPlans[plan.id] = plan; });
  return plan;
}

function cleanReviewScore(value: unknown): 1 | 2 | 3 | 4 | 5 | undefined {
  const score = Number(value);
  return Number.isInteger(score) && score >= 1 && score <= 5 ? score as 1 | 2 | 3 | 4 | 5 : undefined;
}

function cleanReviewTextUpdate<T extends object>(input: T, key: keyof T, existing: string | undefined, max: number): string | undefined {
  return Object.hasOwn(input, key) ? cleanText(input[key] as string | undefined, max) : existing;
}

function cleanWeeklyEvidenceSnapshot(value: Partial<DashboardWeeklyEvidenceSnapshot> | undefined, capturedAt: number): DashboardWeeklyEvidenceSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  return {
    plannedHours: cleanNumber(value.plannedHours, 0, 168) ?? 0,
    confirmedHours: cleanNumber(value.confirmedHours, 0, 168) ?? 0,
    unconfirmedHours: cleanNumber(value.unconfirmedHours, 0, 168) ?? 0,
    completedTasks: cleanWholeNumber(value.completedTasks, 0, 100_000) ?? 0,
    openTasks: cleanWholeNumber(value.openTasks, 0, 100_000) ?? 0,
    revenueTargetPounds: cleanNumber(value.revenueTargetPounds, 0, 1_000_000_000) ?? 0,
    dayReviewsCompleted: cleanWholeNumber(value.dayReviewsCompleted, 0, 7) ?? 0,
    capturedAt: cleanTimestamp(value.capturedAt, 0, Number.MAX_SAFE_INTEGER) ?? capturedAt,
  };
}

export function upsertDashboardDayPlan(input: {
  agencyId: string;
  userId: string;
  date?: string;
  focus?: string;
  planNotes?: string;
  doneNotes?: string;
  plannedHours?: number;
  targetRevenuePounds?: number;
}): DashboardDayPlan {
  const now = Date.now();
  const date = cleanDate(input.date);
  const existing = Object.values(getState().dashboardDayPlans)
    .find(plan => plan.agencyId === input.agencyId && plan.userId === input.userId && plan.date === date);
  const plan: DashboardDayPlan = {
    id: existing?.id ?? `day_${crypto.randomBytes(8).toString("hex")}`,
    agencyId: input.agencyId,
    userId: input.userId,
    date,
    focus: cleanText(input.focus, 180),
    planNotes: cleanText(input.planNotes, 3_000),
    doneNotes: cleanText(input.doneNotes, 3_000),
    plannedHours: cleanNumber(input.plannedHours, 0, 24),
    targetRevenuePounds: cleanNumber(input.targetRevenuePounds, 0, 1_000_000),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  mutate(state => { state.dashboardDayPlans[plan.id] = plan; });
  return plan;
}

export function clockInDashboard(input: { agencyId: string; userId: string; focus?: string; date?: string; currentPath?: string; now?: number }): DashboardWorkSession {
  const now = input.now ?? Date.now();
  const snapshot = dashboardPlanningSnapshot(input.agencyId, input.userId, cleanDate(input.date), now);
  if (snapshot.activeSession) return snapshot.activeSession;
  const focus = cleanText(input.focus, 180);
  const session: DashboardWorkSession = {
    id: `work_${crypto.randomBytes(8).toString("hex")}`,
    agencyId: input.agencyId,
    userId: input.userId,
    date: cleanDate(input.date),
    startedAt: now,
    focus,
    currentMode: "aqua",
    currentModeSince: now,
    lastAccountedAt: now,
    lastHeartbeatAt: now,
    lastInteractionAt: now,
    lastVisibleAt: now,
    lastPageVisibility: "visible",
    lastCheckInAt: now,
    needsActivityConfirmation: false,
    aquaActiveMs: 0,
    externalWorkMs: 0,
    breakMs: 0,
    unconfirmedIdleMs: 0,
    currentPath: cleanRoute(input.currentPath),
    routeActiveMs: {},
    routeSwitches: 0,
    activityBlocks: [activityBlock("aqua", now, "clock", focus)],
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.dashboardWorkSessions[session.id] = session; });
  return session;
}

export function clockOutDashboard(input: {
  agencyId: string;
  userId: string;
  review?: Partial<DashboardClockOutReviewInput>;
  now?: number;
}): DashboardWorkSession | null {
  const now = input.now ?? Date.now();
  const active = Object.values(getState().dashboardWorkSessions)
    .filter(session => session.agencyId === input.agencyId && session.userId === input.userId && !session.endedAt)
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  if (!active) return null;
  const settled = settleDashboardWorkSession(normalizeDashboardWorkSession(active, now), now);
  const review = cleanClockOutReview(input.review, (settled.unconfirmedIdleMs ?? 0) > 0, now);
  const updated: DashboardWorkSession = {
    ...settled,
    endedAt: now,
    notes: review.outcome,
    clockOutReview: review,
    needsActivityConfirmation: false,
    nextCheckInAt: undefined,
    activityBlocks: closeOpenActivityBlock(settled.activityBlocks ?? [], now),
    updatedAt: now,
  };
  mutate(state => { state.dashboardWorkSessions[updated.id] = updated; });
  return updated;
}

export function heartbeatDashboardWorkSession(input: {
  agencyId: string;
  userId: string;
  visible: boolean;
  lastInteractionAt?: number;
  currentPath?: string;
  now?: number;
}): DashboardWorkSession | null {
  const now = input.now ?? Date.now();
  const active = activeDashboardWorkSession(input.agencyId, input.userId);
  if (!active) return null;
  let updated = normalizeDashboardWorkSession(active, now);
  const interactionAt = cleanTimestamp(input.lastInteractionAt, updated.startedAt, now);
  if (interactionAt && !updated.needsActivityConfirmation && updated.currentMode === "aqua") {
    updated.lastInteractionAt = Math.max(updated.lastInteractionAt ?? updated.startedAt, interactionAt);
  }
  updated = settleDashboardWorkSession(updated, now);
  const currentPath = cleanRoute(input.currentPath);
  if (currentPath && currentPath !== updated.currentPath) {
    updated.routeSwitches = (updated.routeSwitches ?? 0) + (updated.currentPath ? 1 : 0);
    updated.currentPath = currentPath;
  }
  updated.lastHeartbeatAt = now;
  updated.lastPageVisibility = input.visible ? "visible" : "hidden";
  if (input.visible || active.lastPageVisibility !== "hidden") updated.lastVisibleAt = now;
  updated.updatedAt = now;
  mutate(state => { state.dashboardWorkSessions[updated.id] = updated; });
  return projectDashboardWorkSession(updated, now);
}

export function resolveDashboardWorkActivity(input: {
  agencyId: string;
  userId: string;
  mode: Exclude<DashboardWorkActivityMode, "unconfirmed">;
  focus?: string;
  note?: string;
  nextCheckInMinutes?: number;
  now?: number;
}): DashboardWorkSession | null {
  const now = input.now ?? Date.now();
  const active = activeDashboardWorkSession(input.agencyId, input.userId);
  if (!active) return null;
  const focus = cleanText(input.focus, 180);
  if (input.mode === "external" && !focus) return null;
  const note = cleanText(input.note, 500);
  const minutes = cleanWholeNumber(input.nextCheckInMinutes, 5, 180) ?? DASHBOARD_DEFAULT_CHECK_IN_MINUTES;
  let updated = settleDashboardWorkSession(normalizeDashboardWorkSession(active, now), now);
  updated = transitionDashboardWorkMode(updated, input.mode, now, "declaration", focus ?? updated.focus, note);
  updated.focus = focus ?? updated.focus;
  updated.lastCheckInAt = now;
  updated.lastInteractionAt = input.mode === "aqua" ? now : updated.lastInteractionAt;
  updated.lastVisibleAt = input.mode === "aqua" ? now : updated.lastVisibleAt;
  updated.lastPageVisibility = input.mode === "aqua" ? "visible" : updated.lastPageVisibility;
  updated.nextCheckInAt = input.mode === "aqua" ? undefined : now + minutes * 60_000;
  updated.needsActivityConfirmation = false;
  updated.updatedAt = now;
  mutate(state => { state.dashboardWorkSessions[updated.id] = updated; });
  return projectDashboardWorkSession(updated, now);
}

export function updateDashboardWorkSession(agencyId: string, userId: string, id: string, notes?: string, focus?: string): DashboardWorkSession | null {
  const existing = getState().dashboardWorkSessions[id];
  if (!existing || existing.agencyId !== agencyId || existing.userId !== userId) return null;
  const updated: DashboardWorkSession = {
    ...existing,
    notes: cleanText(notes, 2_000),
    focus: cleanText(focus, 180) ?? existing.focus,
    updatedAt: Date.now(),
  };
  mutate(state => { state.dashboardWorkSessions[id] = updated; });
  return updated;
}

export function logDashboardWorkSession(input: {
  agencyId: string;
  userId: string;
  date?: string;
  hours?: number;
  focus?: string;
  notes?: string;
}): DashboardWorkSession | null {
  const date = cleanDate(input.date);
  if (date > isoDate()) return null;
  const hours = cleanNumber(input.hours, 0.25, 24);
  if (!hours) return null;
  const now = Date.now();
  const endedAt = date === isoDate() ? now : new Date(`${date}T17:00:00`).getTime();
  const session: DashboardWorkSession = {
    id: `work_${crypto.randomBytes(8).toString("hex")}`,
    agencyId: input.agencyId,
    userId: input.userId,
    date,
    startedAt: endedAt - hours * 3_600_000,
    endedAt,
    focus: cleanText(input.focus, 180),
    notes: cleanText(input.notes, 2_000),
    currentMode: "external",
    currentModeSince: endedAt,
    lastAccountedAt: endedAt,
    lastCheckInAt: endedAt,
    needsActivityConfirmation: false,
    aquaActiveMs: 0,
    externalWorkMs: hours * 3_600_000,
    breakMs: 0,
    unconfirmedIdleMs: 0,
    routeActiveMs: {},
    routeSwitches: 0,
    activityBlocks: [{
      ...activityBlock("external", endedAt - hours * 3_600_000, "declaration", cleanText(input.focus, 180), cleanText(input.notes, 500)),
      endedAt,
    }],
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.dashboardWorkSessions[session.id] = session; });
  return session;
}

function activeDashboardWorkSession(agencyId: string, userId: string): DashboardWorkSession | null {
  return Object.values(getState().dashboardWorkSessions)
    .filter(session => session.agencyId === agencyId && session.userId === userId && !session.endedAt)
    .sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
}

function projectDashboardWorkSession(session: DashboardWorkSession, now: number): DashboardWorkSession {
  if (session.endedAt) return normalizeDashboardWorkSession(session, session.endedAt);
  return settleDashboardWorkSession(normalizeDashboardWorkSession(session, now), now);
}

function normalizeDashboardWorkSession(session: DashboardWorkSession, now: number): DashboardWorkSession {
  if (session.currentMode && session.lastAccountedAt !== undefined) return {
    ...session,
    aquaActiveMs: session.aquaActiveMs ?? 0,
    externalWorkMs: session.externalWorkMs ?? 0,
    breakMs: session.breakMs ?? 0,
    unconfirmedIdleMs: session.unconfirmedIdleMs ?? 0,
    routeActiveMs: session.routeActiveMs ?? {},
    routeSwitches: session.routeSwitches ?? 0,
    activityBlocks: session.activityBlocks ?? [],
  };

  const boundary = session.endedAt ?? now;
  const unclassifiedMs = Math.max(0, boundary - session.startedAt);
  const needsConfirmation = !session.endedAt && unclassifiedMs >= DASHBOARD_LONG_SESSION_GUARDRAIL_MS;
  const mode: DashboardWorkActivityMode = session.endedAt ? "external" : needsConfirmation ? "unconfirmed" : "aqua";
  return {
    ...session,
    currentMode: mode,
    currentModeSince: boundary,
    lastAccountedAt: boundary,
    lastHeartbeatAt: session.endedAt ? session.endedAt : undefined,
    lastInteractionAt: needsConfirmation ? session.startedAt : boundary,
    lastVisibleAt: needsConfirmation ? session.startedAt : boundary,
    lastPageVisibility: needsConfirmation ? "hidden" : "visible",
    lastCheckInAt: session.startedAt,
    needsActivityConfirmation: needsConfirmation,
    aquaActiveMs: mode === "aqua" ? unclassifiedMs : 0,
    externalWorkMs: mode === "external" ? unclassifiedMs : 0,
    breakMs: 0,
    unconfirmedIdleMs: mode === "unconfirmed" ? unclassifiedMs : 0,
    routeActiveMs: {},
    routeSwitches: 0,
    activityBlocks: [{
      ...activityBlock(mode, session.startedAt, "legacy", session.focus, "Imported from the original timer without activity evidence."),
      endedAt: session.endedAt ?? (needsConfirmation ? boundary : undefined),
    }],
  };
}

function settleDashboardWorkSession(session: DashboardWorkSession, now: number): DashboardWorkSession {
  const from = Math.min(now, session.lastAccountedAt ?? now);
  if (from >= now || session.endedAt) return session;
  let updated: DashboardWorkSession = { ...session, activityBlocks: [...(session.activityBlocks ?? [])] };

  if (updated.currentMode === "aqua") {
    const interactionBoundary = (updated.lastInteractionAt ?? updated.startedAt) + DASHBOARD_IDLE_PROMPT_MS;
    const visibilityBoundary = updated.lastPageVisibility === "hidden"
      ? (updated.lastVisibleAt ?? updated.startedAt) + DASHBOARD_IDLE_PROMPT_MS
      : Number.POSITIVE_INFINITY;
    const activeUntil = Math.max(from, Math.min(now, interactionBoundary, visibilityBoundary));
    const activeDelta = Math.max(0, activeUntil - from);
    updated.aquaActiveMs = (updated.aquaActiveMs ?? 0) + activeDelta;
    if (updated.currentPath && activeDelta) {
      updated.routeActiveMs = { ...(updated.routeActiveMs ?? {}), [updated.currentPath]: (updated.routeActiveMs?.[updated.currentPath] ?? 0) + activeDelta };
    }
    if (activeUntil < now) {
      updated.unconfirmedIdleMs = (updated.unconfirmedIdleMs ?? 0) + (now - activeUntil);
      updated = transitionDashboardWorkMode(updated, "unconfirmed", activeUntil, "idle", updated.focus, "No recent Aqua interaction or declared off-app work.");
      updated.needsActivityConfirmation = true;
    }
  } else if (updated.currentMode === "external" || updated.currentMode === "break") {
    const declaredUntil = Math.max(from, Math.min(now, updated.nextCheckInAt ?? now));
    const field = updated.currentMode === "external" ? "externalWorkMs" : "breakMs";
    updated[field] = (updated[field] ?? 0) + Math.max(0, declaredUntil - from);
    if (declaredUntil < now) {
      updated.unconfirmedIdleMs = (updated.unconfirmedIdleMs ?? 0) + (now - declaredUntil);
      updated = transitionDashboardWorkMode(updated, "unconfirmed", declaredUntil, "idle", updated.focus, "The declared check-in window expired without confirmation.");
      updated.needsActivityConfirmation = true;
    }
  } else {
    updated.unconfirmedIdleMs = (updated.unconfirmedIdleMs ?? 0) + (now - from);
    updated.needsActivityConfirmation = true;
  }

  updated.lastAccountedAt = now;
  return updated;
}

function transitionDashboardWorkMode(
  session: DashboardWorkSession,
  mode: DashboardWorkActivityMode,
  at: number,
  source: DashboardWorkActivityBlock["source"],
  focus?: string,
  note?: string,
): DashboardWorkSession {
  if (session.currentMode === mode && source !== "declaration") return session;
  return {
    ...session,
    currentMode: mode,
    currentModeSince: at,
    activityBlocks: [
      ...closeOpenActivityBlock(session.activityBlocks ?? [], at),
      activityBlock(mode, at, source, focus, note),
    ],
  };
}

function closeOpenActivityBlock(blocks: DashboardWorkActivityBlock[], at: number): DashboardWorkActivityBlock[] {
  return blocks.map((block, index) => index === blocks.length - 1 && !block.endedAt ? { ...block, endedAt: Math.max(block.startedAt, at) } : block);
}

function activityBlock(mode: DashboardWorkActivityMode, startedAt: number, source: DashboardWorkActivityBlock["source"], focus?: string, note?: string): DashboardWorkActivityBlock {
  return {
    id: `activity_${crypto.randomBytes(6).toString("hex")}`,
    mode,
    startedAt,
    focus,
    note,
    source,
  };
}

export function deleteDashboardWorkSession(agencyId: string, userId: string, id: string): boolean {
  const existing = getState().dashboardWorkSessions[id];
  if (!existing || existing.agencyId !== agencyId || existing.userId !== userId || !existing.endedAt) return false;
  mutate(state => { delete state.dashboardWorkSessions[id]; });
  return true;
}

function cleanDate(value?: string): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return isoDate();
}

function isoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  const day = copy.getDay();
  copy.setDate(copy.getDate() - (day === 0 ? 6 : day - 1));
  return copy;
}

function cleanText(value: string | undefined, max: number): string | undefined {
  const text = value?.trim().slice(0, max);
  return text || undefined;
}

function cleanClockOutReview(
  input: Partial<DashboardClockOutReviewInput> | undefined,
  hasUnconfirmedTime: boolean,
  submittedAt: number,
): DashboardClockOutReview {
  const outcome = cleanText(input?.outcome, 2_000);
  const nothingOpen = input?.nothingOpen === true;
  const openWork = nothingOpen ? undefined : cleanText(input?.openWork, 2_000);
  const nextPriority = cleanText(input?.nextPriority, 500);
  const dayScore = cleanWholeNumber(input?.dayScore, 1, 5);
  const unconfirmedTimeAcknowledged = input?.unconfirmedTimeAcknowledged === true;

  if (!outcome) throw new DashboardClockOutReviewError("Record what moved before clocking out.");
  if (!nothingOpen && !openWork) throw new DashboardClockOutReviewError("Record the open handover, or confirm that nothing remains open.");
  if (!nextPriority) throw new DashboardClockOutReviewError("Set the first priority for the next work session.");
  if (!dayScore) throw new DashboardClockOutReviewError("Score the day before clocking out.");
  if (hasUnconfirmedTime && !unconfirmedTimeAcknowledged) {
    throw new DashboardClockOutReviewError("Review and acknowledge the unconfirmed time before clocking out.");
  }

  return {
    outcome,
    openWork,
    nothingOpen,
    nextPriority,
    dayScore: dayScore as DashboardClockOutReview["dayScore"],
    unconfirmedTimeAcknowledged,
    submittedAt,
  };
}

function cleanNumber(value: number | undefined, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, Math.round(value * 4) / 4));
}

function cleanWholeNumber(value: number | undefined, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function cleanTimestamp(value: number | undefined, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function cleanRoute(value: string | undefined): string | undefined {
  const path = value?.trim().split(/[?#]/, 1)[0];
  if (!path?.startsWith("/portal/")) return undefined;
  return path.slice(0, 240);
}
