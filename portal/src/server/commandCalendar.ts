import "server-only";

import crypto from "node:crypto";

import { logActivity } from "./activity";
import { getState, mutate } from "./storage";
import type {
  CommandCalendarEntry,
  CommandCalendarEntryStatus,
  CommandCalendarEntryType,
} from "./types";

export interface CommandCalendarEntryInput {
  type?: CommandCalendarEntryType;
  title?: string;
  notes?: string;
  startsAt?: number | null;
  endsAt?: number | null;
  allDay?: boolean;
  reminderAt?: number | null;
  status?: CommandCalendarEntryStatus;
  targetValue?: number | null;
  currentValue?: number | null;
  targetUnit?: string;
}

export function listCommandCalendarEntries(agencyId: string, ownerUserId: string): CommandCalendarEntry[] {
  return Object.values(getState().commandCalendarEntries)
    .filter(entry => entry.agencyId === agencyId && entry.ownerUserId === ownerUserId)
    .sort((left, right) => left.startsAt - right.startsAt || left.title.localeCompare(right.title));
}

export function listAgencyCommandCalendarEntries(agencyId: string): CommandCalendarEntry[] {
  return Object.values(getState().commandCalendarEntries)
    .filter(entry => entry.agencyId === agencyId)
    .sort((left, right) => left.startsAt - right.startsAt || left.title.localeCompare(right.title));
}

export function createCommandCalendarEntry(
  agencyId: string,
  ownerUserId: string,
  input: CommandCalendarEntryInput,
): CommandCalendarEntry {
  const now = Date.now();
  const fields = cleanFields(input);
  const entry: CommandCalendarEntry = {
    id: `calendar_${crypto.randomBytes(8).toString("hex")}`,
    agencyId,
    ownerUserId,
    ...fields,
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.commandCalendarEntries[entry.id] = entry; });
  logActivity({ agencyId, actorUserId: ownerUserId, category: "system", action: "calendar.created", message: `Added ${entry.type.replace("-", " ")} “${entry.title}” to Command Calendar.`, metadata: { calendarEntryId: entry.id, type: entry.type } });
  return entry;
}

export function updateCommandCalendarEntry(
  agencyId: string,
  ownerUserId: string,
  id: string,
  input: CommandCalendarEntryInput,
): CommandCalendarEntry | null {
  const existing = getState().commandCalendarEntries[id];
  if (!existing || existing.agencyId !== agencyId || existing.ownerUserId !== ownerUserId) return null;
  const fields = cleanFields({ ...existing, ...input });
  const entry: CommandCalendarEntry = { ...existing, ...fields, updatedAt: Date.now() };
  mutate(state => { state.commandCalendarEntries[id] = entry; });
  logActivity({ agencyId, actorUserId: ownerUserId, category: "system", action: "calendar.updated", message: `Updated calendar item “${entry.title}”.`, metadata: { calendarEntryId: id, type: entry.type } });
  return entry;
}

export function deleteCommandCalendarEntry(agencyId: string, ownerUserId: string, id: string): boolean {
  const existing = getState().commandCalendarEntries[id];
  if (!existing || existing.agencyId !== agencyId || existing.ownerUserId !== ownerUserId) return false;
  mutate(state => { delete state.commandCalendarEntries[id]; });
  logActivity({ agencyId, actorUserId: ownerUserId, category: "system", action: "calendar.deleted", message: `Removed calendar item “${existing.title}”.`, metadata: { calendarEntryId: id, type: existing.type } });
  return true;
}

function cleanFields(input: CommandCalendarEntryInput) {
  const title = input.title?.trim().slice(0, 240) ?? "";
  if (!title) throw new Error("Calendar item title required.");
  const startsAt = cleanTime(input.startsAt);
  if (!startsAt) throw new Error("Calendar item date required.");
  const endsAt = cleanTime(input.endsAt);
  if (endsAt && endsAt < startsAt) throw new Error("Calendar item end must be after its start.");
  const type = validType(input.type);
  return {
    type,
    title,
    notes: input.notes?.trim().slice(0, 6_000) || undefined,
    startsAt,
    endsAt,
    allDay: input.allDay === true,
    reminderAt: cleanTime(input.reminderAt),
    status: validStatus(input.status),
    targetValue: type === "goal" || type === "target" ? cleanNumber(input.targetValue) : undefined,
    currentValue: type === "goal" || type === "target" ? cleanNumber(input.currentValue) : undefined,
    targetUnit: type === "goal" || type === "target" ? input.targetUnit?.trim().slice(0, 30) || undefined : undefined,
  };
}

function validType(value: unknown): CommandCalendarEntryType {
  return ["event", "work-block", "note", "reminder", "goal", "target"].includes(String(value))
    ? value as CommandCalendarEntryType
    : "event";
}

function validStatus(value: unknown): CommandCalendarEntryStatus {
  return ["planned", "completed", "cancelled"].includes(String(value))
    ? value as CommandCalendarEntryStatus
    : "planned";
}

function cleanTime(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : undefined;
}

function cleanNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : undefined;
}
