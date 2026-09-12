import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { PluginStorage } from "../src/built-ins/modules/leads-pipeline/src/lib/aquaPluginTypes";
import type {
  LeadProspectAcquisition,
  LeadProspectAcquisitionInput,
  Prospect,
} from "../src/built-ins/modules/leads-pipeline/src/lib/domain";
import { LeadService } from "../src/built-ins/modules/leads-pipeline/src/server/leads";
import { ProspectService } from "../src/built-ins/modules/leads-pipeline/src/server/prospects";
import { ensureAcquisitionDossierForLead } from "../src/built-ins/modules/leads-pipeline/src/server/prospectAcquisition";
import type { ActivityLogPort, EventBusPort } from "../src/built-ins/modules/leads-pipeline/src/server/ports";
import { acquisitionJourneyEvents } from "../src/app/portal/agency/pipelines/[slug]/_leadJourneyProjection";

function buildWorld(agencyId = "agency_acquisition") {
  const data = new Map<string, unknown>();
  const activityKeys: string[] = [];
  const events: Array<{ name: string; payload: unknown }> = [];
  const storage: PluginStorage = {
    async get<T>(key: string) { return data.get(key) as T | undefined; },
    async set<T>(key: string, value: T) { data.set(key, value); },
    async del(key: string) { data.delete(key); },
    async list(prefix = "") { return [...data.keys()].filter(key => key.startsWith(prefix)); },
    async runExclusive<T>(_key: string, operation: () => Promise<T>) { return operation(); },
  };
  const activity: ActivityLogPort = {
    logActivity(input) {
      if (input.idempotencyKey) activityKeys.push(input.idempotencyKey);
      return { id: `activity_${activityKeys.length}`, ts: Date.now(), ...input };
    },
    listActivity() { return []; },
    eraseSubjectReferences() { return 0; },
  };
  const eventBus: EventBusPort = {
    emit(_scope, name, payload) { events.push({ name, payload }); },
  };
  return {
    data,
    storage,
    activity,
    eventBus,
    activityKeys,
    events,
    service: new LeadService(agencyId, storage, activity, eventBus),
    prospects: new ProspectService(agencyId, storage, activity, eventBus),
  };
}

function acquisition(prospectId = "prospect_network_001"): LeadProspectAcquisitionInput {
  const capturedAt = Date.UTC(2026, 8, 10, 9, 0);
  return {
    prospectId,
    source: "networking",
    capturedAt,
    prospectUpdatedAt: capturedAt + 40_000,
    profile: {
      name: "Alex Example",
      company: "North Street Electrics",
      email: "alex@example.test",
      phone: "+44 7700 900123",
      website: "https://north.example/",
      niche: "Electrician",
      tags: ["local", "high-fit"],
    },
    research: {
      foundAt: "York networking breakfast",
      opportunity: "No online booking route.",
      researchNotes: "Decision maker confirmed in person.",
      nextStep: "Call after the current project.",
      qualificationState: "not-now",
      fitScore: 84,
      preferredChannel: "call",
      nextContactAt: capturedAt + 86_400_000,
      nextContactReason: "Current project finishes",
      lastContactedAt: capturedAt + 20_000,
      inspectionChecks: ["business-verified"],
      inspectedAt: capturedAt + 10_000,
      researchUpdatedBy: "user_researcher",
      researchUpdatedAt: capturedAt + 10_000,
    },
    outreachAttempts: [{
      id: "logical_call_001",
      at: capturedAt + 20_000,
      actorUserId: "user_caller",
      finalisedAt: capturedAt + 25_000,
      finalisedByUserId: "user_outcome_recorder",
      channel: "call",
      outcome: "not-now",
      note: "Asked for a later call.",
      followUpAt: capturedAt + 86_400_000,
      followUpReason: "Current project finishes",
    }],
    followUps: [{
      id: "prospect_follow_up_001",
      createdAt: capturedAt + 20_000,
      createdBy: "user_caller",
      sourceOutreachAttemptId: "logical_call_001",
      dueAt: capturedAt + 86_400_000,
      reason: "Current project finishes",
      channel: "call",
      status: "scheduled",
    }, {
      id: "prospect_follow_up_resolved",
      createdAt: capturedAt + 5_000,
      createdBy: "user_caller",
      dueAt: capturedAt + 15_000,
      reason: "Make the first call",
      channel: "call",
      status: "completed",
      resolvedAt: capturedAt + 20_000,
      resolvedBy: "user_caller",
      resolutionNote: "Outreach recorded: not-now.",
    }],
    notes: [{
      id: "prospect_note_001",
      at: capturedAt + 10_000,
      actorUserId: "user_researcher",
      body: "Decision maker confirmed in person.",
    }],
  };
}

test("Journey projects named Prospect research, note, qualification, and callback evidence", () => {
  const input = acquisition();
  const projected = acquisitionJourneyEvents({
    ...input,
    qualifiedAt: input.capturedAt + 30_000,
    qualifiedByUserId: "user_qualifier",
  } as LeadProspectAcquisition, actorUserId => actorUserId ? `Actor ${actorUserId}` : undefined);

  assert.equal(projected.find(event => event.type === "prospect-qualified")?.actorLabel, "Actor user_qualifier");
  assert.equal(projected.find(event => event.type === "research-updated")?.actorLabel, "Actor user_researcher");
  assert.equal(projected.find(event => event.type === "prospect-note-added")?.note,
    "Decision maker confirmed in person.");
  assert.equal(projected.find(event => event.type === "follow-up-scheduled")?.actorLabel, "Actor user_caller");
  assert.equal(projected.find(event => event.type === "follow-up-resolved")?.actorLabel, "Actor user_caller");
});

test("Prospect qualification keeps a durable backlink and lossless actor history", async () => {
  const world = buildWorld();
  const input = acquisition();
  const created = await world.service.upsert({
    email: input.profile.email ?? "",
    phone: input.profile.phone,
    source: `scouting:${input.source}`,
    capturedAt: input.capturedAt,
  }, "user_qualifier");

  const linked = await world.service.attachProspectAcquisition(created.lead.id, input, "user_qualifier");
  assert.ok(linked);
  assert.equal(linked.customFields?.prospectId, input.prospectId);
  assert.deepEqual(linked.customFields?.prospectIds, [input.prospectId]);
  assert.equal(linked.prospectAcquisitions?.length, 1);
  assert.equal(linked.prospectAcquisitions?.[0]?.qualifiedByUserId, "user_qualifier");
  assert.equal(linked.prospectAcquisitions?.[0]?.outreachAttempts[0]?.actorUserId, "user_caller");
  assert.equal(linked.prospectAcquisitions?.[0]?.notes[0]?.actorUserId, "user_researcher");
  assert.equal(linked.prospectAcquisitions?.[0]?.followUps[0]?.createdBy, "user_caller");
  assert.equal(linked.prospectAcquisitions?.[0]?.followUps.find(item => item.status === "completed")?.resolvedBy, "user_caller");
  assert.equal(linked.prospectAcquisitions?.[0]?.research.researchNotes, "Decision maker confirmed in person.");
  assert.equal(linked.prospectAcquisitions?.[0]?.research.researchUpdatedBy, "user_researcher");

  const journeyAttempt = linked.journeyEvents?.find(event =>
    event.id === `journey:prospect:${input.prospectId}:outreach:logical_call_001`);
  assert.equal(journeyAttempt?.type, "contact-recorded");
  assert.equal(journeyAttempt?.actorUserId, "user_caller");
  assert.equal(journeyAttempt?.outcomeRecordedAt, input.outreachAttempts[0]?.finalisedAt);
  assert.equal(journeyAttempt?.outcomeActorUserId, "user_outcome_recorder");
  assert.equal(journeyAttempt?.outcome, "not-now");
  assert.equal(linked.firstContactedAt, input.outreachAttempts[0]?.at);
  assert.equal(linked.lastContactedAt, input.outreachAttempts[0]?.at);

  const firstQualifiedAt = linked.prospectAcquisitions?.[0]?.qualifiedAt;
  const replayed = await world.service.attachProspectAcquisition(created.lead.id, input, "user_other");
  assert.equal(replayed?.prospectAcquisitions?.length, 1, "qualification retry appended a duplicate dossier");
  assert.equal(replayed?.prospectAcquisitions?.[0]?.qualifiedAt, firstQualifiedAt);
  assert.equal(replayed?.prospectAcquisitions?.[0]?.qualifiedByUserId, "user_qualifier");
  assert.equal(replayed?.journeyEvents?.filter(event => event.id === journeyAttempt?.id).length, 1);
  assert.equal(world.events.filter(event => event.name === "leads.lead.prospect-acquisition-attached").length, 1);
  assert.equal(new Set(world.activityKeys.filter(key => key.startsWith("lead-prospect-acquisition:"))).size, 1,
    "audit repair must use one stable idempotency identity");

  const incompleteRepair = acquisition();
  incompleteRepair.outreachAttempts[0]!.actorUserId = undefined;
  incompleteRepair.outreachAttempts[0]!.finalisedAt = undefined;
  incompleteRepair.outreachAttempts[0]!.finalisedByUserId = undefined;
  incompleteRepair.notes[0]!.actorUserId = undefined;
  incompleteRepair.followUps[0]!.createdBy = undefined;
  incompleteRepair.followUps[1]!.resolvedBy = undefined;
  const repaired = await world.service.attachProspectAcquisition(created.lead.id, incompleteRepair, "user_repairer");
  const repairedAcquisition = repaired?.prospectAcquisitions?.[0];
  assert.equal(repairedAcquisition?.outreachAttempts[0]?.actorUserId, "user_caller",
    "an incomplete repair erased the original outreach actor");
  assert.equal(repairedAcquisition?.outreachAttempts[0]?.finalisedAt, input.outreachAttempts[0]?.finalisedAt,
    "an incomplete repair erased when the human outcome was recorded");
  assert.equal(repairedAcquisition?.outreachAttempts[0]?.finalisedByUserId, "user_outcome_recorder",
    "an incomplete repair erased who recorded the human outcome");
  const repairedJourneyAttempt = repaired?.journeyEvents?.find(event => event.id === journeyAttempt?.id);
  assert.equal(repairedJourneyAttempt?.at, input.outreachAttempts[0]?.at,
    "updating outcome attribution changed when the contact occurred");
  assert.equal(repairedJourneyAttempt?.outcomeRecordedAt, input.outreachAttempts[0]?.finalisedAt);
  assert.equal(repairedJourneyAttempt?.outcomeActorUserId, "user_outcome_recorder");
  assert.equal(repairedAcquisition?.notes[0]?.actorUserId, "user_researcher",
    "an incomplete repair erased the original note actor");
  assert.equal(repairedAcquisition?.followUps[0]?.createdBy, "user_caller",
    "an incomplete repair erased the original callback creator");
  assert.equal(repairedAcquisition?.followUps.find(item => item.status === "completed")?.resolvedBy, "user_caller",
    "an incomplete repair erased the original callback resolver");

  const edited = await world.service.update(created.lead.id, {
    customFields: { operatorField: "kept", prospectId: "forged", prospectIds: ["forged"] },
  }, "user_editor");
  assert.equal(edited?.customFields?.operatorField, "kept");
  assert.equal(edited?.customFields?.prospectId, input.prospectId,
    "generic Lead edits must not sever the server-owned backlink");
  assert.deepEqual(edited?.customFields?.prospectIds, [input.prospectId]);
});

test("Prospect backlinks stay agency scoped and erasure removes the duplicated dossier", async () => {
  const world = buildWorld("agency_owner");
  const input = acquisition();
  const created = await world.service.upsert({ email: input.profile.email ?? "", source: "manual" }, "user_owner");
  const foreignService = new LeadService("agency_other", world.storage, world.activity, world.eventBus);
  assert.equal(await foreignService.attachProspectAcquisition(created.lead.id, input, "user_foreign"), null);

  await world.service.attachProspectAcquisition(created.lead.id, input, "user_owner");
  const anonymised = await world.service.anonymiseForErasure(created.lead.id, "user_privacy");
  assert.equal(anonymised?.prospectAcquisitions, undefined);
  assert.equal(anonymised?.customFields, undefined);
  const retainedAttempt = anonymised?.journeyEvents?.find(event => event.id.includes(":prospect:"));
  assert.equal(retainedAttempt?.outcome, "not-now", "non-identifying funnel evidence should remain");
  assert.equal(retainedAttempt?.note, undefined, "free-text Prospect PII survived erasure");
});

test("qualification handler attaches the dossier on first commit and repair", () => {
  const handlers = readFileSync(join(
    process.cwd(),
    "src/built-ins/modules/leads-pipeline/src/api/handlers.ts",
  ), "utf8");
  const start = handlers.indexOf("export async function qualifyProspectHandler");
  const end = handlers.indexOf("export async function prospectOutreachHandler", start);
  const qualification = handlers.slice(start, end);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.equal((qualification.match(/attachProspectAcquisition/g) ?? []).length, 2,
    "both the initial conversion and qualified-record repair need the backlink");
  assert.match(qualification, /capturedAt:\s*prospect\.capturedAt/);
  assert.match(qualification, /linkQualifiedLead\(prospect\.id, result\.lead\.id, ctx\.actor\)/);
  assert.match(qualification, /leadProspectAcquisition\(updated\)/);
});

test("concurrent prospect intake and notes preserve every row, while Lead dossier ensure stays singular", async () => {
  const world = buildWorld("agency_concurrent_acquisition");
  const secondProspectService = new ProspectService(
    "agency_concurrent_acquisition",
    world.storage,
    world.activity,
    world.eventBus,
  );
  const imported = await Promise.all(Array.from({ length: 16 }, (_, index) =>
    (index % 2 ? world.prospects : secondProspectService).create({
      company: `Imported company ${index}`,
      email: `person-${index}@example.test`,
      source: "csv:concurrent.csv",
    }, "user_importer")));

  const prospectIndex = world.data.get("prospects/index") as string[];
  assert.equal(prospectIndex.length, imported.length);
  assert.equal(new Set(prospectIndex).size, imported.length, "concurrent intake lost or duplicated an index entry");

  await Promise.all(Array.from({ length: 12 }, (_, index) =>
    world.prospects.addNote(imported[0]!.id, `Concurrent note ${index}`, `user_${index}`)));
  const withNotes = await world.prospects.get(imported[0]!.id);
  assert.equal(withNotes?.notes.length, 12, "a concurrent read-modify-write dropped a note");
  assert.equal(new Set(withNotes?.notes.map(note => note.body)).size, 12);

  const lead = (await world.service.upsert({
    email: "website-enquiry@example.test",
    name: "Website Enquiry",
    source: "website:contact",
    tags: ["website-enquiry"],
  }, "system:website-enquiry")).lead;
  const ensured = await Promise.all(Array.from({ length: 10 }, () =>
    ensureAcquisitionDossierForLead({ leads: world.service, prospects: world.prospects }, lead, "user_sales")));
  assert.equal(new Set(ensured.map(prospect => prospect.id)).size, 1, "concurrent focused loads created duplicate dossiers");
  const linked = (await world.prospects.list()).filter(prospect => prospect.qualifiedLeadId === lead.id);
  assert.equal(linked.length, 1);
  const refreshedLead = await world.service.get(lead.id);
  assert.equal(refreshedLead?.prospectAcquisitions?.filter(item => item.prospectId === linked[0]?.id).length, 1);
});

test("focused Sales GET paths are read-only and legacy repair is an explicit POST", () => {
  const focusedServer = readFileSync(join(
    process.cwd(),
    "src/app/portal/agency/scouting/_ScoutingWorkspaceServer.tsx",
  ), "utf8");
  assert.doesNotMatch(focusedServer, /ensureAcquisitionDossierForLead/,
    "a Server Component render must not create a dossier during Link prefetch");
  assert.match(focusedServer, /lead\?\.prospectAcquisitions\?\.\[0\]\?\.prospectId/,
    "lead deep links should resolve the existing server-owned backlink");
  assert.match(focusedServer, /initialDossierLeadId=\{repairLeadId\}/,
    "an unlinked legacy Lead should be handed to an explicit repair control");

  const routes = readFileSync(join(
    process.cwd(),
    "src/built-ins/modules/leads-pipeline/src/api/routes.ts",
  ), "utf8");
  assert.match(routes, /path: "prospects\/start-dossier", methods: \["POST"\]/);
  assert.doesNotMatch(routes, /path: "prospects\/start-dossier", methods: \[[^\]]*"GET"/);

  const workspace = readFileSync(join(
    process.cwd(),
    "src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx",
  ), "utf8");
  assert.match(workspace, /fetch\("\/api\/portal\/leads-pipeline\/prospects\/start-dossier", \{\s*method: "POST"/);
});

test("qualification and a concurrent research write converge on the latest dossier", async () => {
  const world = buildWorld("agency_qualification_race");
  const prospect = await world.prospects.create({
    company: "Race-safe business",
    email: "race-safe@example.test",
    source: "networking",
  }, "user_scout");
  const lead = (await world.service.upsert({
    company: prospect.company,
    email: prospect.email ?? "",
    source: "scouting:networking",
  }, "user_qualifier")).lead;

  await Promise.all([
    world.prospects.linkQualifiedLead(prospect.id, lead.id, "user_qualifier"),
    world.prospects.addNote(prospect.id, "Research saved during qualification.", "user_researcher"),
  ]);
  const latest = await world.prospects.get(prospect.id);
  assert.equal(latest?.status, "qualified");
  assert.equal(latest?.qualifiedLeadId, lead.id);
  assert.equal(latest?.notes.some(note => note.body === "Research saved during qualification."), true);

  const ensured = await ensureAcquisitionDossierForLead(
    { leads: world.service, prospects: world.prospects },
    await world.service.get(lead.id) ?? lead,
    "user_qualifier",
  );
  assert.equal(ensured.id, prospect.id, "qualification must establish the durable Lead pointer");
  const projected = await world.service.get(lead.id);
  assert.equal(projected?.prospectAcquisitions?.[0]?.notes.some(note => note.body === "Research saved during qualification."), true);
});

test("Journey owns qualified contact identity while its dossier stays in sync", async () => {
  const world = buildWorld("agency_identity_authority");
  const lead = (await world.service.upsert({
    name: "Original name",
    company: "Original company",
    email: "original@example.test",
    phone: "+44 7700 900100",
    source: "website:contact",
  }, "user_sales")).lead;
  const dossier = await ensureAcquisitionDossierForLead(
    { leads: world.service, prospects: world.prospects },
    lead,
    "user_sales",
  );

  await assert.rejects(
    () => world.prospects.update(dossier.id, { email: "shadow@example.test" }, "user_researcher"),
    /Edit qualified contact identity on its Journey lead/,
  );
  const editedLead = await world.service.update(lead.id, {
    name: "Canonical name",
    email: "canonical@example.test",
  }, "user_sales");
  assert.ok(editedLead);
  const reconciled = await ensureAcquisitionDossierForLead(
    { leads: world.service, prospects: world.prospects },
    editedLead!,
    "user_sales",
  );
  assert.equal(reconciled.name, "Canonical name");
  assert.equal(reconciled.email, "canonical@example.test");
  const projected = await world.service.get(lead.id);
  assert.equal(projected?.prospectAcquisitions?.[0]?.profile.name, "Canonical name");
  assert.equal(projected?.prospectAcquisitions?.[0]?.profile.email, "canonical@example.test");
});

test("first dossier creation deterministically preserves Lead notes and contact history without inventing outreach", async () => {
  const world = buildWorld("agency_legacy_history");
  const capturedAt = Date.UTC(2026, 8, 11, 9, 0);
  const lead = (await world.service.upsert({
    email: "inbound-history@example.test",
    name: "Inbound History",
    source: "website:contact",
    capturedAt,
    notes: "Asked for a website audit in the original enquiry.",
  }, "system:website-enquiry")).lead;
  const contacted = await world.service.recordContact(lead.id, {
    at: capturedAt + 60_000,
    channel: "phone",
    outcome: "requested-callback",
    note: "Speak again after the Friday team meeting.",
  }, "user_first_responder");
  assert.ok(contacted);
  const originalContact = contacted!.journeyEvents?.find(event => event.type === "contact-recorded");
  assert.ok(originalContact);

  const first = await ensureAcquisitionDossierForLead(
    { leads: world.service, prospects: world.prospects },
    contacted!,
    "user_sales",
  );
  const replayed = await ensureAcquisitionDossierForLead(
    { leads: world.service, prospects: world.prospects },
    contacted!,
    "user_sales",
  );

  assert.equal(replayed.id, first.id);
  assert.deepEqual(replayed.notes, first.notes, "a dossier retry changed deterministic history rows");
  assert.equal(replayed.notes.length, 2);
  assert.equal(new Set(replayed.notes.map(note => note.id)).size, 2);
  assert.equal(replayed.notes.some(note => note.body === "Asked for a website audit in the original enquiry."), true);
  const migratedContact = replayed.notes.find(note => note.id.startsWith("migrated_lead_contact_"));
  assert.equal(migratedContact?.at, originalContact?.at);
  assert.equal(migratedContact?.actorUserId, "user_first_responder");
  assert.match(migratedContact?.body ?? "", /Channel: phone/);
  assert.match(migratedContact?.body ?? "", /Recorded outcome: requested-callback/);
  assert.match(migratedContact?.body ?? "", /Friday team meeting/);
  assert.deepEqual(replayed.outreachAttempts, [], "legacy Journey history must not claim provider outreach occurred");

  const refreshedLead = await world.service.get(lead.id);
  const projectedNotes = refreshedLead?.prospectAcquisitions?.[0]?.notes ?? [];
  assert.equal(projectedNotes.length, 2, "Journey lost or duplicated dossier history on retry");
  assert.equal(refreshedLead?.journeyEvents?.filter(event => event.id === originalContact?.id).length, 1);
  const projectedJourney = acquisitionJourneyEvents(
    refreshedLead!.prospectAcquisitions![0]!,
    actor => actor,
  );
  assert.equal(projectedJourney.filter(event => event.type === "prospect-note-added").length, 1,
    "the migrated contact note duplicated the original Journey interaction");
  assert.equal(projectedJourney.find(event => event.type === "prospect-note-added")?.note,
    "Asked for a website audit in the original enquiry.");
});

test("removing a required inspection check makes ready dossiers researchable again", async () => {
  const world = buildWorld("agency_inspection_regression");
  const prospect = await world.prospects.create({
    company: "Checklist Company",
    email: "checklist@example.test",
    source: "manual",
  }, "user_researcher");
  const required = ["business-verified", "contact-route-verified", "opportunity-confirmed"] as const;
  const ready = await world.prospects.saveInspection(prospect.id, [...required], "user_researcher");
  assert.equal(ready?.qualificationState, "ready");
  assert.ok(ready?.inspectedAt);

  const reopened = await world.prospects.saveInspection(
    prospect.id,
    ["business-verified", "contact-route-verified"],
    "user_reviewer",
  );
  assert.equal(reopened?.qualificationState, "researching");
  assert.equal(reopened?.inspectedAt, undefined);

  const readyAgain = await world.prospects.update(prospect.id, {
    inspectionChecks: [...required],
    qualificationState: "ready",
    inspectedAt: Date.UTC(2026, 8, 11, 12, 0),
  }, "user_researcher");
  assert.equal(readyAgain?.qualificationState, "ready");
  const reopenedByPatch = await world.prospects.update(prospect.id, {
    inspectionChecks: ["business-verified"],
  }, "user_reviewer");
  assert.equal(reopenedByPatch?.qualificationState, "researching");
  assert.equal(reopenedByPatch?.inspectedAt, undefined);
});

test("Prospect writes enforce bounded fields and exact social hosts while legacy rows normalize safely", async () => {
  const world = buildWorld("agency_prospect_bounds");
  const valid = await world.prospects.create({
    company: "Bounded Company",
    source: "manual",
    website: "https://any-safe-site.example/path",
    instagramUrl: "https://team.instagram.com/acme",
    facebookUrl: "https://m.fb.com/acme",
    linkedinUrl: "https://uk.linkedin.com/company/acme",
    tags: ["Local", "local", "high-fit"],
  }, "user_researcher");
  assert.equal(valid.website, "https://any-safe-site.example/path");
  assert.equal(valid.instagramUrl, "https://team.instagram.com/acme");
  assert.equal(valid.facebookUrl, "https://m.fb.com/acme");
  assert.equal(valid.linkedinUrl, "https://uk.linkedin.com/company/acme");
  assert.deepEqual(valid.tags, ["local", "high-fit"]);

  await assert.rejects(() => world.prospects.create({
    company: "Too Long",
    name: "n".repeat(161),
    source: "manual",
  }, "user_researcher"), /Name must be 160 characters or fewer/);
  await assert.rejects(() => world.prospects.create({
    company: "Too Many Tags",
    source: "manual",
    tags: Array.from({ length: 51 }, (_, index) => `tag-${index}`),
  }, "user_researcher"), /no more than 50 tags/i);
  await assert.rejects(() => world.prospects.update(valid.id, {
    tags: ["t".repeat(81)],
  }, "user_researcher"), /80 characters or fewer/);

  for (const invalidPatch of [
    { instagramUrl: "https://instagram.com.evil.test/acme" },
    { facebookUrl: "https://evilfacebook.com/acme" },
    { facebookUrl: "https://fb.com.evil.test/acme" },
    { linkedinUrl: "https://notlinkedin.com/company/acme" },
  ]) {
    await assert.rejects(
      () => world.prospects.update(valid.id, invalidPatch, "user_researcher"),
      /safe .*http\(s\) URL/i,
    );
  }
  assert.equal((await world.prospects.get(valid.id))?.instagramUrl, valid.instagramUrl,
    "an invalid social update partially changed the stored row");
  await assert.rejects(
    () => world.prospects.addNote(valid.id, "x".repeat(4_001), "user_researcher"),
    /Note must be 4000 characters or fewer/,
  );
  await assert.rejects(
    () => world.prospects.recordOutreach(valid.id, {
      channel: "call",
      outcome: "attempted",
      note: "x".repeat(4_001),
    }, "user_researcher"),
    /Outreach note must be 4000 characters or fewer/,
  );

  const raw = world.data.get(`prospect:${valid.id}`) as Prospect;
  world.data.set(`prospect:${valid.id}`, {
    ...raw,
    name: "n".repeat(500),
    tags: Array.from({ length: 75 }, (_, index) => `${index}-${"t".repeat(100)}`),
    instagramUrl: "https://instagram.com.evil.test/acme",
    facebookUrl: "javascript:alert(1)",
    linkedinUrl: "https://notlinkedin.com/acme",
    qualificationState: "ready",
    inspectionChecks: [],
    notes: [{ id: "legacy-note", at: raw.capturedAt, body: "z".repeat(5_000) }],
  } satisfies Prospect);
  const normalized = await world.prospects.get(valid.id);
  assert.equal(normalized?.name?.length, 160);
  assert.equal(normalized?.tags.length, 50);
  assert.equal(normalized?.tags.every(tag => tag.length <= 80), true);
  assert.equal(normalized?.instagramUrl, undefined);
  assert.equal(normalized?.facebookUrl, undefined);
  assert.equal(normalized?.linkedinUrl, undefined);
  assert.equal(normalized?.website, "https://any-safe-site.example/path");
  assert.equal(normalized?.qualificationState, "researching");
  assert.equal(normalized?.notes[0]?.body.length, 4_000);
});
