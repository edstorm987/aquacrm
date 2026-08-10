import "server-only";

import crypto from "node:crypto";
import { getState, mutate } from "./storage";
import type { DashboardDayPlan, DashboardWeekPlan, DashboardWorkSession } from "./types";

const DAY = 24 * 60 * 60 * 1000;

export interface DashboardPlanningSnapshot {
  today: string;
  weekStart: string;
  weekPlan: DashboardWeekPlan | null;
  dayPlan: DashboardDayPlan | null;
  weekPlans: DashboardDayPlan[];
  sessions: DashboardWorkSession[];
  activeSession: DashboardWorkSession | null;
}

export function dashboardPlanningSnapshot(agencyId: string, userId: string, date = isoDate()): DashboardPlanningSnapshot {
  const weekStart = isoDate(startOfWeek(new Date(`${date}T12:00:00`)));
  const weekEnd = isoDate(new Date(new Date(`${weekStart}T12:00:00`).getTime() + 6 * DAY));
  const plans = Object.values(getState().dashboardDayPlans)
    .filter(plan => plan.agencyId === agencyId && plan.userId === userId && plan.date >= weekStart && plan.date <= weekEnd)
    .sort((a, b) => a.date.localeCompare(b.date));
  const sessions = Object.values(getState().dashboardWorkSessions)
    .filter(session => session.agencyId === agencyId && session.userId === userId && session.date >= weekStart && session.date <= weekEnd)
    .sort((a, b) => b.startedAt - a.startedAt);
  const weekPlan = Object.values(getState().dashboardWeekPlans)
    .find(plan => plan.agencyId === agencyId && plan.userId === userId && plan.weekStart === weekStart) ?? null;
  return {
    today: date,
    weekStart,
    weekPlan,
    dayPlan: plans.find(plan => plan.date === date) ?? null,
    weekPlans: plans,
    sessions,
    activeSession: sessions.find(session => !session.endedAt) ?? null,
  };
}

export function upsertDashboardWeekPlan(input: {
  agencyId: string;
  userId: string;
  weekStart?: string;
  outcome?: string;
  reviewNotes?: string;
}): DashboardWeekPlan {
  const now = Date.now();
  const weekStart = isoDate(startOfWeek(new Date(`${cleanDate(input.weekStart)}T12:00:00`)));
  const existing = Object.values(getState().dashboardWeekPlans)
    .find(plan => plan.agencyId === input.agencyId && plan.userId === input.userId && plan.weekStart === weekStart);
  const plan: DashboardWeekPlan = {
    id: existing?.id ?? `week_${crypto.randomBytes(8).toString("hex")}`,
    agencyId: input.agencyId,
    userId: input.userId,
    weekStart,
    outcome: cleanText(input.outcome, 280),
    reviewNotes: cleanText(input.reviewNotes, 3_000),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  mutate(state => { state.dashboardWeekPlans[plan.id] = plan; });
  return plan;
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

export function clockInDashboard(input: { agencyId: string; userId: string; focus?: string; date?: string }): DashboardWorkSession {
  const snapshot = dashboardPlanningSnapshot(input.agencyId, input.userId, cleanDate(input.date));
  if (snapshot.activeSession) return snapshot.activeSession;
  const now = Date.now();
  const session: DashboardWorkSession = {
    id: `work_${crypto.randomBytes(8).toString("hex")}`,
    agencyId: input.agencyId,
    userId: input.userId,
    date: cleanDate(input.date),
    startedAt: now,
    focus: cleanText(input.focus, 180),
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.dashboardWorkSessions[session.id] = session; });
  return session;
}

export function clockOutDashboard(agencyId: string, userId: string, notes?: string): DashboardWorkSession | null {
  const active = Object.values(getState().dashboardWorkSessions)
    .filter(session => session.agencyId === agencyId && session.userId === userId && !session.endedAt)
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  if (!active) return null;
  const updated: DashboardWorkSession = {
    ...active,
    endedAt: Date.now(),
    notes: cleanText(notes, 2_000) ?? active.notes,
    updatedAt: Date.now(),
  };
  mutate(state => { state.dashboardWorkSessions[updated.id] = updated; });
  return updated;
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
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.dashboardWorkSessions[session.id] = session; });
  return session;
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

function cleanNumber(value: number | undefined, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, Math.round(value * 4) / 4));
}
