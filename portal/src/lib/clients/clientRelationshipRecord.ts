// The CLIENT-SAFE relationship record: notes, calls, meetings and decisions
// that may be shown to a client, each carrying its own `visibility`.
//
// `lib/server/clients/clientRecordLedger.ts` is the other one — the internal
// ledger. Confirm which you want before writing history: an entry written to
// the wrong one is either invisible to the client who needed it, or visible to
// the client who should never have seen it.
//
// `ClientRecordVisibility` below is that decision. It is load-bearing: the
// customer portal filters on `visibility === "client"`, and on 2026-08-28 a
// second path that skipped that filter was found putting internal call notes
// on a client's screen. See `_portalData.ts` and `smoke-client-erasure`.

export const CLIENT_RECORD_ENTRY_KINDS = ["note", "call", "meeting", "decision", "update"] as const;

export type ClientRecordEntryKind = (typeof CLIENT_RECORD_ENTRY_KINDS)[number];
export type ClientRecordVisibility = "internal" | "client";

export interface ClientRecordEntry {
  id: string;
  kind: ClientRecordEntryKind;
  title: string;
  body?: string;
  occurredAt: number;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  visibility: ClientRecordVisibility;
  channel?: string;
  url?: string;
}

export function cleanClientRecordEntries(value: unknown): ClientRecordEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<ClientRecordEntry>;
    const id = cleanText(candidate.id, 160);
    const title = cleanText(candidate.title, 240);
    const kind = CLIENT_RECORD_ENTRY_KINDS.includes(candidate.kind as ClientRecordEntryKind)
      ? candidate.kind as ClientRecordEntryKind
      : null;
    const occurredAt = cleanTimestamp(candidate.occurredAt);
    const createdAt = cleanTimestamp(candidate.createdAt);
    const updatedAt = cleanTimestamp(candidate.updatedAt);
    if (!id || !title || !kind || !occurredAt || !createdAt || !updatedAt) return [];
    return [{
      id,
      kind,
      title,
      body: cleanText(candidate.body, 20_000) || undefined,
      occurredAt,
      createdAt,
      updatedAt,
      createdBy: cleanText(candidate.createdBy, 320) || "Agency team",
      visibility: candidate.visibility === "client" ? "client" as const : "internal" as const,
      channel: cleanText(candidate.channel, 120) || undefined,
      url: safeRecordUrl(candidate.url),
    }];
  }).sort((left, right) => right.occurredAt - left.occurredAt);
}

export function safeRecordUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function cleanRecordText(value: unknown, limit: number): string {
  return cleanText(value, limit);
}

export function cleanRecordTimestamp(value: unknown, fallback = Date.now()): number {
  return cleanTimestamp(value) ?? fallback;
}

function cleanText(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function cleanTimestamp(value: unknown): number | undefined {
  const candidate = typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(candidate) && candidate > 0 ? candidate : undefined;
}
