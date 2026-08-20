import "server-only";
// Carry a person's history into the client workspace when they convert.
//
// The months of work that won a client — the enquiry they first sent, the
// meetings, the calls, the notes — live on the Person while they are a lead.
// Without this they simply stop at the moment of conversion, and the client
// workspace opens empty on the relationship that mattered most.
//
// Copied into the client record ledger rather than moved: the Person stays the
// canonical identity and keeps its own history, so reclassifying or linking a
// second workspace later does not strip the first one bare.

import { upsertClientRecordLedgerEvent } from "@/lib/server/clientRecordLedger";
import { attachPersonFacet, getPerson } from "@/server/persons";
import type { ClientRecordLedgerEventInput } from "@/lib/server/clientRecordLedger";

export interface SeedClientFromPersonResult {
  seeded: number;
  skipped: number;
}

/**
 * Seed the client's record with everything already known about the person.
 *
 * Idempotent: the ledger upserts on (sourceType, sourceId), so a second
 * conversion — or a re-run after a failure — updates rather than duplicates.
 */
export async function seedClientFromPerson(
  agencyId: string,
  personId: string,
  clientId: string,
): Promise<SeedClientFromPersonResult> {
  const person = getPerson(agencyId, personId);
  if (!person) return { seeded: 0, skipped: 0 };

  let seeded = 0;
  let skipped = 0;

  for (const entry of person.record ?? []) {
    const event: ClientRecordLedgerEventInput = {
      sourceType: entry.kind === "call" ? "call" : "record-entry",
      sourceId: entry.id,
      group: entry.kind === "call" ? "calls" : entry.kind === "meeting" ? "activity" : "notes",
      title: entry.summary,
      body: [entry.body, entry.outcome ? `Outcome: ${entry.outcome}` : null]
        .filter(Boolean).join("\n\n") || undefined,
      occurredAt: entry.at,
      eyebrow: entry.kind === "meeting"
        ? "Meeting before conversion"
        : entry.kind === "call"
          ? "Call before conversion"
          : "Note before conversion",
      // Internal by default. This is the agency's own working history and was
      // never written with the client reading it; publishing it on conversion
      // would leak candid notes into their portal.
      visibility: "internal",
    };
    try {
      upsertClientRecordLedgerEvent(agencyId, clientId, event);
      seeded += 1;
    } catch {
      // One malformed entry must not abort the rest of the seed — a partial
      // history beats none, and the failure is visible by what is missing.
      skipped += 1;
    }
  }

  // Record the client on the person so both directions resolve afterwards.
  attachPersonFacet(agencyId, personId, { clientIds: [clientId] });

  if (person.notes) {
    try {
      upsertClientRecordLedgerEvent(agencyId, clientId, {
        sourceType: "record-entry",
        sourceId: `person-notes:${person.id}`,
        group: "notes",
        title: "Notes from before conversion",
        body: person.notes,
        occurredAt: person.createdAt,
        eyebrow: "Carried from the contact card",
        visibility: "internal",
      });
      seeded += 1;
    } catch {
      skipped += 1;
    }
  }

  return { seeded, skipped };
}
