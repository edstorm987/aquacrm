import "server-only";
// Carry a person's history into their client workspace on conversion.
//
// Wired through the event bus rather than into the conversion handler because
// that handler lives inside the leads-pipeline plugin, which reaches the
// foundation only through declared ports. Importing the ledger there would
// breach the boundary the plugin architecture exists to keep.
//
// Subscribing also means any route that creates a client seeds correctly, not
// just the one conversion path that happens to exist today.

import { on } from "@/server/eventBus";
import { getClientForAgency } from "@/server/tenants";
import { findPersonByIdentity } from "@/server/persons";
import { seedClientFromPerson } from "@/lib/server/seeds/seedClientFromPerson";

let registered = false;

export function ensurePersonClientSeedingRegistered(): void {
  if (registered) return;
  registered = true;

  on("client.created", async event => {
    const payload = event.payload as { clientId?: string } | undefined;
    const clientId = payload?.clientId;
    if (!clientId) return;

    const client = getClientForAgency(event.agencyId, clientId);
    if (!client) return;

    // Resolve by the addresses the workspace actually carries. A conversion
    // copies the lead's contact details onto the client, so this finds the
    // same person the lead pointed at without the plugin having to tell us.
    const metadata = (client.metadata ?? {}) as Record<string, unknown>;
    const emails = [metadata.portalLoginEmail, metadata.clientEmail, client.ownerEmail]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    const phones = [metadata.phone, metadata.contactPhone]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (!emails.length && !phones.length) return;

    const person = findPersonByIdentity(event.agencyId, { emails, phones, name: client.name });
    if (!person) return;

    try {
      await seedClientFromPerson(event.agencyId, person.id, clientId);
    } catch (error) {
      // A failed seed must never fail the conversion — the client exists and
      // is usable; the history can be re-seeded because the ledger upserts.
      console.error("[person-seeding] could not seed client record", error);
    }
  });
}

ensurePersonClientSeedingRegistered();
