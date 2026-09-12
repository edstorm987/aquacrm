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
import {
  contactMatchesRecipient,
  type ContactRecipientTarget,
} from "@/lib/telephony/contactRecipientPolicy";
import { normalisePhone } from "@/lib/telephony/phoneNumbers";
import type { OutboundCommunicationSubjectReferences } from "@/server/types";
import { resolveValidatedClientAcquisitionLineage } from "@/built-ins/modules/leads-pipeline/src/lib/clientAcquisitionLineage";

function leadsPipelineContainer(agencyId: string, actor: string) {
  const install = getInstall({ agencyId }, LEADS_PIPELINE_PLUGIN_ID);
  if (!install?.enabled) return null;

  return _containerFromCtx({
    agencyId,
    actor,
    storage: makePluginStorage(install.id),
  });
}

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
  const container = leadsPipelineContainer(agencyId, actor);
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
 * Validate an untrusted contact id against the tenant and the recipient the
 * provider will actually contact. A missing module, missing row, stale id or
 * mismatched recipient all fail closed and are intentionally indistinguishable
 * to the caller.
 */
export async function verifyContactRecipient(
  agencyId: string,
  actor: string,
  contactId: string,
  target: ContactRecipientTarget,
  clientId?: string,
): Promise<boolean> {
  const container = leadsPipelineContainer(agencyId, actor);
  if (!container) return false;
  const contact = await container.contacts.get(contactId);
  return Boolean(contact && contactMatchesRecipient(contact, { agencyId, clientId }, target));
}

export interface ResolvedOutboundRecipientSubject extends OutboundCommunicationSubjectReferences {
  clientId?: string;
}

export type OutboundRecipientSubjectResolution =
  | { status: "resolved"; subject: ResolvedOutboundRecipientSubject }
  | { status: "unresolved" | "ambiguous" };

interface OutboundRecipientSubjectHints {
  contactId?: string;
  prospectId?: string;
  clientId?: string;
}

function valueMatchesTarget(
  value: { email?: string; phone?: string },
  target: ContactRecipientTarget,
): boolean {
  if (target.channel === "email") {
    const recipient = target.email.trim().toLowerCase();
    return Boolean(recipient && value.email?.trim().toLowerCase() === recipient);
  }
  const recipient = normalisePhone(target.phone);
  return Boolean(recipient && normalisePhone(value.phone) === recipient);
}

function clientMatchesTarget(
  client: { ownerEmail?: string },
  linkedPersons: readonly { emails: Array<{ value: string; raw?: string }>; phones: Array<{ value: string; raw?: string }> }[],
  target: ContactRecipientTarget,
): boolean {
  if (target.channel === "email") {
    const recipient = target.email.trim().toLowerCase();
    const emails = [
      client.ownerEmail,
      ...linkedPersons.flatMap(person => person.emails.flatMap(item => [item.value, item.raw])),
    ];
    return emails.some(value => typeof value === "string" && value.trim().toLowerCase() === recipient);
  }
  const recipient = normalisePhone(target.phone);
  const phones = [
    ...linkedPersons.flatMap(person => person.phones.flatMap(item => [item.value, item.raw])),
  ];
  return Boolean(recipient && phones.some(value => typeof value === "string" && normalisePhone(value) === recipient));
}

/**
 * Resolve one provider recipient to one durable acquisition subject.
 *
 * Email addresses and phone numbers are contact routes, not primary keys: an
 * office switchboard or shared inbox may legitimately occur on several CRM
 * records. Browser-supplied ids may select a component, but every id is loaded
 * inside the agency and the component must still contain the exact provider
 * recipient. Without an explicit selection, more than one disconnected match
 * is ambiguous and provider execution must stop before any external write.
 */
export async function resolveOutboundRecipientSubject(
  agencyId: string,
  actor: string,
  target: ContactRecipientTarget,
  hints: OutboundRecipientSubjectHints = {},
): Promise<OutboundRecipientSubjectResolution> {
  const container = leadsPipelineContainer(agencyId, actor);
  const [contacts, leads, prospects] = container
    ? await Promise.all([
        container.contacts.list(),
        container.leads.list({ archived: "include" }),
        container.prospects.list(),
      ])
    : [[], [], []];
  const state = getState();
  const clients = Object.values(state.clients).filter(client => client.agencyId === agencyId);
  const persons = Object.values(state.persons).filter(person => person.agencyId === agencyId);

  const adjacency = new Map<string, Set<string>>();
  const add = (node: string) => {
    if (!adjacency.has(node)) adjacency.set(node, new Set());
  };
  const connect = (left: string, right: string) => {
    add(left);
    add(right);
    adjacency.get(left)!.add(right);
    adjacency.get(right)!.add(left);
  };
  const contactNode = (id: string) => `contact:${id}`;
  const leadNode = (id: string) => `lead:${id}`;
  const prospectNode = (id: string) => `prospect:${id}`;
  const clientNode = (id: string) => `client:${id}`;
  const personNode = (id: string) => `person:${id}`;

  contacts.forEach(contact => add(contactNode(contact.id)));
  leads.forEach(lead => add(leadNode(lead.id)));
  prospects.forEach(prospect => add(prospectNode(prospect.id)));
  clients.forEach(client => add(clientNode(client.id)));
  persons.forEach(person => add(personNode(person.id)));

  const personById = new Map(persons.map(person => [person.id, person]));
  const leadById = new Map(leads.map(lead => [lead.id, lead]));
  const prospectById = new Map(prospects.map(prospect => [prospect.id, prospect]));

  for (const contact of contacts) {
    const person = contact.personId ? personById.get(contact.personId) : undefined;
    if (person?.facets.contactId === contact.id) connect(contactNode(contact.id), personNode(person.id));
    if (contact.promotedFromLeadId && leadById.has(contact.promotedFromLeadId)) {
      connect(contactNode(contact.id), leadNode(contact.promotedFromLeadId));
    }
  }
  for (const lead of leads) {
    const person = lead.personId ? personById.get(lead.personId) : undefined;
    if (person?.facets.leadId === lead.id) connect(leadNode(lead.id), personNode(person.id));
    for (const acquisition of lead.prospectAcquisitions ?? []) {
      const prospect = prospectById.get(acquisition.prospectId);
      if (prospect?.qualifiedLeadId === lead.id) connect(leadNode(lead.id), prospectNode(prospect.id));
    }
  }
  const lineageByClientId = new Map<string, ReturnType<typeof resolveValidatedClientAcquisitionLineage>>();
  const conflictedClientIds = new Set<string>();
  for (const client of clients) {
    const lineage = resolveValidatedClientAcquisitionLineage(client, { persons, leads, contacts, prospects });
    lineageByClientId.set(client.id, lineage);
    if (lineage.conflicts.length > 0) {
      conflictedClientIds.add(client.id);
      continue;
    }
    lineage.personIds.forEach(id => connect(clientNode(client.id), personNode(id)));
    lineage.contactIds.forEach(id => connect(clientNode(client.id), contactNode(id)));
    lineage.leadIds.forEach(id => connect(clientNode(client.id), leadNode(id)));
    lineage.prospectIds.forEach(id => connect(clientNode(client.id), prospectNode(id)));
  }

  const matchingNodes = new Set<string>();
  for (const contact of contacts) if (valueMatchesTarget(contact, target)) matchingNodes.add(contactNode(contact.id));
  for (const lead of leads) if (valueMatchesTarget(lead, target)) matchingNodes.add(leadNode(lead.id));
  for (const prospect of prospects) if (valueMatchesTarget(prospect, target)) matchingNodes.add(prospectNode(prospect.id));
  for (const client of clients) {
    if (conflictedClientIds.has(client.id)) continue;
    const lineage = lineageByClientId.get(client.id);
    const linkedPersons = [...(lineage?.personIds ?? [])]
      .map(id => personById.get(id))
      .filter((person): person is NonNullable<typeof person> => Boolean(person));
    if (clientMatchesTarget(client, linkedPersons, target)) matchingNodes.add(clientNode(client.id));
  }
  for (const person of persons) {
    const matches = target.channel === "email"
      ? person.emails.some(item => valueMatchesTarget({ email: item.value }, target))
      : person.phones.some(item => valueMatchesTarget({ phone: item.value }, target));
    if (matches) matchingNodes.add(personNode(person.id));
  }

  const explicitNodes = [
    hints.contactId ? contactNode(hints.contactId) : undefined,
    hints.prospectId ? prospectNode(hints.prospectId) : undefined,
    hints.clientId ? clientNode(hints.clientId) : undefined,
  ].filter((node): node is string => Boolean(node));
  if (hints.clientId && conflictedClientIds.has(hints.clientId)) return { status: "unresolved" };
  if (explicitNodes.some(node => !adjacency.has(node))) return { status: "unresolved" };

  const component = (start: string): Set<string> => {
    const seen = new Set<string>();
    const queue = [start];
    while (queue.length) {
      const node = queue.shift()!;
      if (seen.has(node)) continue;
      seen.add(node);
      for (const neighbour of adjacency.get(node) ?? []) queue.push(neighbour);
    }
    return seen;
  };

  let selected: Set<string>;
  if (explicitNodes.length > 0) {
    selected = component(explicitNodes[0]);
    if (explicitNodes.some(node => !selected.has(node))) return { status: "ambiguous" };
    if (![...matchingNodes].some(node => selected.has(node))) return { status: "unresolved" };
  } else {
    const components: Set<string>[] = [];
    const assigned = new Set<string>();
    for (const node of matchingNodes) {
      if (assigned.has(node)) continue;
      const candidate = component(node);
      candidate.forEach(value => assigned.add(value));
      if ([...candidate].some(value => /^(?:contact|lead|prospect|client):/.test(value))) {
        components.push(candidate);
      }
    }
    if (components.length === 0) return { status: "unresolved" };
    if (components.length > 1) return { status: "ambiguous" };
    [selected] = components;
  }

  const selectedId = (kind: "contact" | "lead" | "prospect" | "client", preferred?: string) => {
    if (preferred && selected.has(`${kind}:${preferred}`)) return preferred;
    const matching = [...matchingNodes]
      .filter(node => node.startsWith(`${kind}:`) && selected.has(node))
      .map(node => node.slice(kind.length + 1));
    if (matching.length === 1) return matching[0];
    const all = [...selected]
      .filter(node => node.startsWith(`${kind}:`))
      .map(node => node.slice(kind.length + 1));
    return all.length === 1 ? all[0] : undefined;
  };
  const subject: ResolvedOutboundRecipientSubject = {
    ...(selectedId("prospect", hints.prospectId) ? { prospectId: selectedId("prospect", hints.prospectId) } : {}),
    ...(selectedId("lead") ? { leadId: selectedId("lead") } : {}),
    ...(selectedId("contact", hints.contactId) ? { contactId: selectedId("contact", hints.contactId) } : {}),
    ...(selectedId("client", hints.clientId) ? { clientId: selectedId("client", hints.clientId) } : {}),
  };
  return Object.keys(subject).length > 0 ? { status: "resolved", subject } : { status: "unresolved" };
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
