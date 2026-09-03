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
  recurrence?: unknown;
  metric?: unknown;
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
  participantUserIds?: unknown;
  clientId?: unknown;
  linkedTaskIds?: unknown;
  documents?: unknown;
  customFields?: unknown;
}

export function listCommandCalendarEntries(agencyId: string, ownerUserId: string): CommandCalendarEntry[] {
  return Object.values(getState().commandCalendarEntries)
    .filter(entry => entry.agencyId === agencyId && entry.ownerUserId === ownerUserId)
    .sort((left, right) => left.startsAt - right.startsAt || left.title.localeCompare(right.title));
}

export function listVisibleCommandCalendarEntries(agencyId: string, userId: string): CommandCalendarEntry[] {
  return Object.values(getState().commandCalendarEntries)
    .filter(entry => entry.agencyId === agencyId && (entry.ownerUserId === userId || entry.participantUserIds?.includes(userId)))
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
  const fields = cleanFields(agencyId, input);
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
  const fields = cleanFields(agencyId, { ...existing, ...input });
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

function cleanFields(agencyId: string, input: CommandCalendarEntryInput) {
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
    participantUserIds: validParticipantUserIds(agencyId, input.participantUserIds),
    clientId: validClientId(agencyId, input.clientId),
    linkedTaskIds: validLinkedTaskIds(agencyId, input.linkedTaskIds),
    documents: cleanDocuments(input.documents),
    customFields: cleanCustomFields(input.customFields),
    // Quota fields ride the same goal/target-only rule as the three above: on
    // any other entry type they are dropped, not stored.
    recurrence: (type === "goal" || type === "target")
      && (input.recurrence === "daily" || input.recurrence === "weekly")
      ? input.recurrence as "daily" | "weekly" : undefined,
    metric: (type === "goal" || type === "target")
      && ["prospects-scouted", "calls-made", "emails-sent", "leads-qualified", "clients-converted"].includes(input.metric as string)
      ? input.metric as CommandCalendarEntry["metric"] : undefined,
  };
}

function validType(value: unknown): CommandCalendarEntryType {
  return ["event", "work-block", "note", "reminder", "goal", "target", "custom"].includes(String(value))
    ? value as CommandCalendarEntryType
    : "event";
}

function validParticipantUserIds(agencyId: string, value: unknown): string[] | undefined {
  const ids = cleanIds(value, 30);
  if (!ids.length) return undefined;
  const users = Object.values(getState().users);
  for (const id of ids) {
    if (!users.some(user => user.id === id && user.agencyId === agencyId)) throw new Error("A selected participant is not available in this workspace.");
  }
  return ids;
}

function validClientId(agencyId: string, value: unknown): string | undefined {
  const id = typeof value === "string" ? value.trim().slice(0, 160) : "";
  if (!id) return undefined;
  if (getState().clients[id]?.agencyId !== agencyId) throw new Error("The selected client is not available in this workspace.");
  return id;
}

function validLinkedTaskIds(agencyId: string, value: unknown): string[] | undefined {
  const ids = cleanIds(value, 50);
  if (!ids.length) return undefined;
  for (const id of ids) {
    if (getState().tasks[id]?.agencyId !== agencyId) throw new Error("A linked task is not available in this workspace.");
  }
  return ids;
}

function cleanIds(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string").map(item => item.trim().slice(0, 160)).filter(Boolean))].slice(0, max);
}

function cleanDocuments(value: unknown): CommandCalendarEntry["documents"] {
  if (!Array.isArray(value)) return undefined;
  const documents = value.slice(0, 20).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.trim().slice(0, 160) : "";
    const url = typeof row.url === "string" ? row.url.trim().slice(0, 2_000) : "";
    if (!label || !validDocumentUrl(url)) return [];
    const id = typeof row.id === "string" && row.id.trim() ? row.id.trim().slice(0, 160) : `document_${index + 1}`;
    return [{ id, label, url }];
  });
  return documents.length ? documents : undefined;
}

function validDocumentUrl(url: string): boolean {
  if (url.startsWith("/")) return !url.startsWith("//");
  try { return ["http:", "https:"].includes(new URL(url).protocol); } catch { return false; }
}

function cleanCustomFields(value: unknown): CommandCalendarEntry["customFields"] {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const fields = value.slice(0, 20).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.trim().slice(0, 80) : "";
    const fieldValue = typeof row.value === "string" ? row.value.trim().slice(0, 1_000) : "";
    const key = label.toLocaleLowerCase();
    if (!label || !fieldValue || seen.has(key)) return [];
    seen.add(key);
    const id = typeof row.id === "string" && row.id.trim() ? row.id.trim().slice(0, 160) : `field_${index + 1}`;
    return [{ id, label, value: fieldValue }];
  });
  return fields.length ? fields : undefined;
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
