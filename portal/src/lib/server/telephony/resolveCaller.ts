import "server-only";

// The server half of caller identification: gather every record that could own
// a phone number, then hand them to the pure classifier.
//
// Split this way because the CLASSIFICATION is where the expensive mistakes
// live (greeting a paying client as a cold lead, dialling someone who opted
// out) and classification is exactly the part that a test can drive. This file
// is the boring half — read contacts, read leads, attach the client each one
// points at — and it is deliberately kept boring.
//
// ── Reading through the plugin, not around it ─────────────────────────────
//
// Contacts and leads belong to `leads-pipeline`. This uses the same
// `_containerFromCtx` + `makePluginStorage` route the host already uses in
// `ensureLeadsPipelineInstall`, rather than reaching into raw storage keys,
// so a change to how the module stores its rows does not silently break the
// phone screen.

import { _containerFromCtx } from "@/built-ins/modules/leads-pipeline/src/server/foundationAdapter";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";
import { getState } from "@/server/storage";
import { LEADS_PIPELINE_PLUGIN_ID } from "@/lib/server/plugins/ensureLeadsPipelineInstall";
import {
  isDoNotCall, resolveCallerIdentity, type CallerIdentity, type CallerRecord,
} from "@/lib/telephony/callerIdentity";

/**
 * Every contact and lead in the agency, flattened for the classifier.
 *
 * Reads the whole set rather than querying by number, because the two stores
 * are in-memory documents with no phone index — a filter here is the same work
 * as a lookup would be, and pretending otherwise would just add a cache to go
 * stale. If contacts ever move to rows (Move B in the storage plan), this is
 * the one function that needs a WHERE clause.
 */
async function gatherRecords(agencyId: string, actor: string): Promise<CallerRecord[]> {
  const install = getInstall({ agencyId }, LEADS_PIPELINE_PLUGIN_ID);
  if (!install?.enabled) return [];

  const container = _containerFromCtx({
    agencyId,
    actor,
    storage: makePluginStorage(install.id),
  });
  // The foundation is registered lazily; an agency whose module has never been
  // opened has no container yet. No records is the honest answer, not a crash
  // on an incoming call.
  if (!container) return [];

  const [contacts, leads, prospects] = await Promise.all([
    container.contacts.list(),
    container.leads.list(),
    // Prospects joined 2026-08-30 (Ed's finding): they are the records that
    // actually CARRY doNotContact in the scouting flow, and the resolver not
    // seeing them meant the telephony routes' 409 could never fire for an
    // opted-out prospect — the button gating was the only fence.
    container.prospects.list(),
  ]);

  // One pass over clients so a contact carrying a `clientId` can report the
  // stage without a lookup per row.
  // `state.clients` is a Record, not an array.
  const clients = new Map(
    Object.values(getState().clients)
      .filter(client => client.agencyId === agencyId)
      .map(client => [client.id, client] as const),
  );

  const records: CallerRecord[] = [];

  for (const contact of contacts) {
    const client = contact.clientId ? clients.get(contact.clientId) : undefined;
    records.push({
      source: "contact",
      id: contact.id,
      ...(contact.phone ? { phone: contact.phone } : {}),
      ...(contact.email ? { email: contact.email } : {}),
      ...(contact.name ? { name: contact.name } : {}),
      ...(contact.company ? { company: contact.company } : {}),
      tags: contact.tags ?? [],
      // Only claim "client" when the link actually resolves. A dangling
      // clientId would otherwise promote a cold row to a paying customer.
      ...(client ? { clientId: client.id, clientStage: client.stage, clientName: client.name } : {}),
      ...(contact.lastContactedAt ? { lastContactedAt: contact.lastContactedAt } : {}),
    });
  }

  for (const lead of leads) {
    // A converted lead points at the client it became. That link is what makes
    // the difference between "Lead · contacted" and "Client · live" when an old
    // lead row still carries the number.
    const client = lead.convertedClientId ? clients.get(lead.convertedClientId) : undefined;
    records.push({
      source: "lead",
      id: lead.id,
      ...(lead.phone ? { phone: lead.phone } : {}),
      ...(lead.email ? { email: lead.email } : {}),
      ...(lead.name ? { name: lead.name } : {}),
      ...(lead.company ? { company: lead.company } : {}),
      tags: lead.tags ?? [],
      // The board column IS the lead's status in this module — there is no
      // separate status field.
      ...(lead.currentStageId ? { leadStatus: lead.currentStageId } : {}),
      ...(client ? { clientId: client.id, clientStage: client.stage, clientName: client.name } : {}),
      ...(lead.lastContactedAt ? { lastContactedAt: lead.lastContactedAt } : {}),
    });
  }

  for (const prospect of prospects) {
    records.push({
      source: "contact",
      id: prospect.id,
      ...(prospect.phone ? { phone: prospect.phone } : {}),
      ...(prospect.email ? { email: prospect.email } : {}),
      ...(prospect.name ? { name: prospect.name } : {}),
      ...(prospect.company ? { company: prospect.company } : {}),
      tags: prospect.tags ?? [],
      // The scouting flag maps straight onto the resolver's own field, so
      // isDoNotCall treats an opted-out prospect exactly like an opted-out
      // contact.
      ...(prospect.doNotContact ? { doNotCall: true } : {}),
      ...(prospect.lastContactedAt ? { lastContactedAt: prospect.lastContactedAt } : {}),
    });
  }

  return records;
}

/**
 * Who is this number?
 *
 * Used by BOTH directions: the dialler calls it before placing a call (so it
 * can refuse a do-not-call number), and the inbound webhook calls it while the
 * phone is still ringing.
 */
export async function resolveCaller(
  agencyId: string,
  phone: string,
  actor = "system",
): Promise<CallerIdentity> {
  const records = await gatherRecords(agencyId, actor);
  return resolveCallerIdentity(phone, records);
}

/**
 * Who is this EMAIL address? The outbound counterpart of `resolveCaller`.
 *
 * Ed's finding (2026-08-30): the email route's opt-out check ran only when the
 * BROWSER volunteered a phone number — omit the field and the suppression
 * never ran. The server now looks the recipient up by the address it is
 * actually sending to; the browser cannot opt anyone back in by leaving a
 * field blank.
 */
export async function resolveEmailRecipient(
  agencyId: string,
  email: string,
  actor = "system",
): Promise<{ known: boolean; doNotContact: boolean; displayName: string }> {
  const needle = email.trim().toLowerCase();
  if (!needle) return { known: false, doNotContact: false, displayName: "" };
  const records = await gatherRecords(agencyId, actor);
  const matches = records.filter(record => (record.email ?? "").trim().toLowerCase() === needle);
  if (!matches.length) return { known: false, doNotContact: false, displayName: "" };
  return {
    known: true,
    doNotContact: matches.some(isDoNotCall),
    displayName: matches.find(match => match.name)?.name ?? needle,
  };
}

export type { CallerIdentity, CallerRecord };
