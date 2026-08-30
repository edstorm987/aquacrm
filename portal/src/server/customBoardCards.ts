// The shape of a free-text card on one of Ed's own kanbans.
//
// Ed, 2026-08-30: *"i want to be able to create my own in the app please
// permission gated of course."* The card storage already carries
// `{ kind: "custom", payload: Record<string, unknown> }` — this module is the
// convention that payload follows, validated at the API boundary rather than
// widening the PipelineCard union. The commented-out `link` field is the
// deferred linked-cards phase; the storage already fits it, so nothing is
// painted into a corner.

export interface CustomCardPayload {
  /** What the card says. Required — a card with no title is not a card. */
  title: string;
  /** The person's own context, free text. */
  note?: string;
  // Reserved for the deferred linked phase:
  // link?: { kind: "lead" | "client" | "task"; id: string };
}

const MAX_TITLE = 200;
const MAX_NOTE = 2_000;

/**
 * The clean payload, or null for anything that is not one. Dropped rather than
 * repaired — the form's inline validation is where repair belongs; the server
 * boundary only decides yes or no.
 */
export function parseCustomCardPayload(raw: unknown): CustomCardPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (!title || title.length > MAX_TITLE) return null;
  const note = typeof record.note === "string" ? record.note.trim() : "";
  if (note.length > MAX_NOTE) return null;
  return { title, ...(note ? { note } : {}) };
}
