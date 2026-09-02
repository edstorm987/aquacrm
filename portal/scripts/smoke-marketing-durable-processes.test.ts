process.env.PORTAL_BACKEND ??= "memory";

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";

const require_ = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tsxLoader = require_.resolve("tsx");
const sandbox = mkdtempSync(join(tmpdir(), "aqua-marketing-durable-"));

const childSource = String.raw`
const { createRequire } = await import("node:module");
const { access, writeFile } = await import("node:fs/promises");
const { join } = await import("node:path");
const require_ = createRequire(join(process.cwd(), "aqua-marketing-durable-child.cjs"));
const input = JSON.parse(process.env.AQUA_TEST_INPUT || "{}");
const storageModule = require_("./src/server/storage");
const { makePluginStorage } = require_("./src/lib/server/pluginStorage");
const activity = {
  logActivity: async value => ({ id: "activity", ts: Date.now(), ...value }),
  listActivity: async () => [],
};
const events = { emit: () => undefined };

try {
  await storageModule.ensureHydrated();
  if (input.readyPath) {
    await writeFile(input.readyPath, "ready", "utf8");
    while (true) {
      try { await access(input.goPath); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 10)); }
    }
  }

  const storage = makePluginStorage(input.installId);
  let result;
  if (input.action === "storage-get") {
    result = await storage.get(input.key);
  } else if (input.action.startsWith("marketing-lead")) {
    const { LeadService } = require_("./src/built-ins/modules/agency-marketing/src/server/leads");
    const service = new LeadService(input.agencyId, storage, activity, events);
    if (input.action === "marketing-lead-create") {
      result = await service.create(input.payload, input.actor || "worker");
    } else if (input.action === "marketing-lead-update") {
      result = await service.update(input.id, input.payload, input.actor || "worker");
    } else if (input.action === "marketing-lead-contact") {
      result = await service.recordContact(input.id, input.note, input.actor || "worker");
    } else if (input.action === "marketing-lead-erase") {
      result = await service.eraseForAddresses(input.addresses);
    } else if (input.action === "marketing-lead-get-email") {
      result = await service.getByEmail(input.email);
    } else if (input.action === "marketing-lead-list-campaign") {
      result = await service.listForCampaign(input.campaignId);
    } else if (input.action === "marketing-lead-list-staff") {
      result = await service.listForStaff(input.staffId);
    } else {
      result = await service.list();
    }
  } else if (input.action.startsWith("campaign")) {
    const { CampaignService } = require_("./src/built-ins/modules/agency-marketing/src/server/campaigns");
    const service = new CampaignService(input.agencyId, storage, activity, events);
    if (input.action === "campaign-create") {
      result = await service.create(input.payload, input.actor || "worker", "gbp");
    } else if (input.action === "campaign-update") {
      result = await service.update(input.id, input.payload, input.actor || "worker");
    } else if (input.action === "campaign-delete") {
      result = await service.delete(input.id, input.actor || "worker");
    } else if (input.action === "campaign-list-channel") {
      result = await service.listForChannel(input.channel);
    } else {
      result = await service.list();
    }
  } else if (input.action.startsWith("pipeline")) {
    const { LeadService } = require_("./src/built-ins/modules/leads-pipeline/src/server/leads");
    const service = new LeadService(input.agencyId, storage, activity, events);
    if (input.action === "pipeline-upsert") {
      result = await service.upsert(input.payload, input.actor || "worker");
    } else if (input.action === "pipeline-contact") {
      result = await service.recordContact(input.id, input.payload, input.actor || "worker");
    } else if (input.action === "pipeline-enquiry") {
      result = await service.recordEnquiryCapture(input.id, input.payload, input.actor || "worker");
    } else if (input.action === "pipeline-stage") {
      result = await service.recordStageChange(input.id, input.payload, input.actor || "worker");
    } else if (input.action === "pipeline-meeting") {
      result = await service.recordMeeting(input.id, input.meetingAt, input.actor || "worker");
    } else if (input.action === "pipeline-conversion") {
      result = await service.recordConversion(input.id, input.clientId, input.actor || "worker", input.at);
    } else {
      result = await service.list({ archived: "include" });
    }
  } else {
    throw new Error("unknown child action");
  }
  process.stdout.write(JSON.stringify({ ok: true, result }));
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.stack || error.message : String(error) }));
}
`;

interface ChildResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

function runChild(dataFile: string, input: Record<string, unknown>): Promise<ChildResult> {
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, [
      "--conditions=react-server",
      "--import",
      tsxLoader,
      "--input-type=module",
      "--eval",
      childSource,
    ], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORTAL_BACKEND: "file",
        PORTAL_DATA_FILE: dataFile,
        TSX_TSCONFIG_PATH: join(root, "tsconfig.json"),
        AQUA_TEST_INPUT: JSON.stringify(input),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.on("error", rejectChild);
    child.on("close", code => {
      if (code !== 0) return rejectChild(new Error(`child exited ${code}: ${stderr || stdout}`));
      try { resolveChild(JSON.parse(stdout) as ChildResult); }
      catch { rejectChild(new Error(`child returned non-JSON output: ${stdout}\n${stderr}`)); }
    });
  });
}

async function waitFor(path: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try { await access(path); return; }
    catch { await new Promise(resolveWait => setTimeout(resolveWait, 10)); }
  }
  throw new Error(`child did not reach barrier: ${path}`);
}

async function collide(
  dataFile: string,
  common: Record<string, unknown>,
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): Promise<[ChildResult, ChildResult]> {
  const barrier = join(sandbox, `barrier-${Math.random().toString(36).slice(2)}`);
  await mkdir(barrier, { recursive: true });
  const goPath = join(barrier, "go");
  const leftReady = join(barrier, "left");
  const rightReady = join(barrier, "right");
  const leftResult = runChild(dataFile, { ...common, ...left, readyPath: leftReady, goPath });
  const rightResult = runChild(dataFile, { ...common, ...right, readyPath: rightReady, goPath });
  await Promise.all([waitFor(leftReady), waitFor(rightReady)]);
  await writeFile(goPath, "go", "utf8");
  return Promise.all([leftResult, rightResult]);
}

async function collideMany(
  dataFile: string,
  common: Record<string, unknown>,
  workers: Array<Record<string, unknown>>,
): Promise<ChildResult[]> {
  const barrier = join(sandbox, `barrier-${Math.random().toString(36).slice(2)}`);
  await mkdir(barrier, { recursive: true });
  const goPath = join(barrier, "go");
  const readyPaths = workers.map((_, index) => join(barrier, `worker-${index}`));
  const results = workers.map((worker, index) => runChild(dataFile, {
    ...common,
    ...worker,
    readyPath: readyPaths[index],
    goPath,
  }));
  await Promise.all(readyPaths.map(waitFor));
  await writeFile(goPath, "go", "utf8");
  return Promise.all(results);
}

after(async () => { await rm(sandbox, { recursive: true, force: true }); });

describe("real-process marketing durability", () => {
  it("elects one canonical Leads Pipeline identity across two Node processes", async () => {
    const dataFile = join(sandbox, "pipeline.json");
    const common = {
      agencyId: "agency_pipeline_process",
      installId: "install_pipeline_process",
      action: "pipeline-upsert",
    };
    const results = await collide(dataFile, common,
      { payload: { email: " Process.Owner@example.com ", source: "process-left" }, actor: "left" },
      { payload: { email: "process.owner@EXAMPLE.com", source: "process-right" }, actor: "right" });
    assert.ok(results.every(result => result.ok), JSON.stringify(results));
    const created = results.map(result => (result.result as { created: boolean }).created);
    assert.deepEqual(created.sort(), [false, true]);

    const inspected = await runChild(dataFile, { ...common, action: "pipeline-list" });
    assert.equal(inspected.ok, true, inspected.error);
    assert.equal((inspected.result as unknown[]).length, 1);
  });

  it("preserves concurrent Leads Pipeline contact, enquiry, stage, meeting, and conversion writers", async () => {
    const dataFile = join(sandbox, "pipeline-journey-writers.json");
    const common = {
      agencyId: "agency_pipeline_journey_process",
      installId: "install_pipeline_journey_process",
    };
    const seeded = await runChild(dataFile, {
      ...common,
      action: "pipeline-upsert",
      payload: {
        email: "journey.process@example.com",
        source: "manual",
      },
      actor: "seed",
    });
    assert.equal(seeded.ok, true, seeded.error);
    const seededLead = (seeded.result as { lead: { id: string; capturedAt: number } }).lead;
    const at = seededLead.capturedAt + 1_000;
    const meetingAt = at + 3_600_000;

    const results = await collideMany(dataFile, common, [
      {
        action: "pipeline-contact",
        id: seededLead.id,
        payload: { at: at + 10, channel: "phone", outcome: "answered", note: "Process contact", incrementSentCount: true },
        actor: "contact-worker",
      },
      {
        action: "pipeline-enquiry",
        id: seededLead.id,
        payload: { at: at + 20, source: "process-form", enquiryId: "process-enquiry-1" },
        actor: "enquiry-worker",
      },
      {
        action: "pipeline-stage",
        id: seededLead.id,
        payload: { toStage: "qualified", at: at + 30 },
        actor: "stage-worker",
      },
      {
        action: "pipeline-meeting",
        id: seededLead.id,
        meetingAt,
        actor: "meeting-worker",
      },
      {
        action: "pipeline-conversion",
        id: seededLead.id,
        clientId: "client_process_conversion",
        at: at + 40,
        actor: "conversion-worker",
      },
    ]);
    assert.ok(results.every(result => result.ok), JSON.stringify(results));

    const inspected = await runChild(dataFile, { ...common, action: "pipeline-list" });
    assert.equal(inspected.ok, true, inspected.error);
    const [lead] = inspected.result as Array<{
      enquiryCount: number;
      enquiryIds: string[];
      sentCount: number;
      convertedAt?: number;
      convertedClientId?: string;
      journeyEvents: Array<{
        type: string;
        enquiryId?: string;
        note?: string;
        toStage?: string;
        scheduledFor?: number;
        clientId?: string;
      }>;
    }>;
    assert.equal(lead?.enquiryCount, 1);
    assert.deepEqual(lead?.enquiryIds, ["process-enquiry-1"]);
    assert.equal(lead?.sentCount, 1);
    assert.equal(lead?.convertedAt, at + 40);
    assert.equal(lead?.convertedClientId, "client_process_conversion");
    assert.ok(lead?.journeyEvents.some(event => event.type === "contact-recorded" && event.note === "Process contact"));
    assert.ok(lead?.journeyEvents.some(event => event.type === "enquiry-received" && event.enquiryId === "process-enquiry-1"));
    assert.ok(lead?.journeyEvents.some(event => event.type === "stage-changed" && event.toStage === "qualified"));
    assert.ok(lead?.journeyEvents.some(event => event.type === "meeting-scheduled" && event.scheduledFor === meetingAt));
    assert.ok(lead?.journeyEvents.some(event => event.type === "converted" && event.clientId === "client_process_conversion"));
  });

  it("rejects one of two same-canonical-email Agency Marketing creates across processes", async () => {
    const dataFile = join(sandbox, "marketing-lead-canonical-create.json");
    const common = {
      agencyId: "agency_marketing_canonical_process",
      installId: "install_marketing_canonical_process",
      action: "marketing-lead-create",
    };
    const results = await collide(dataFile, common,
      { payload: { email: " Canonical.Owner@example.com ", name: "Left" }, actor: "left" },
      { payload: { email: "canonical.owner@EXAMPLE.com", name: "Right" }, actor: "right" });
    assert.equal(results.filter(result => result.ok).length, 1, JSON.stringify(results));
    assert.equal(results.filter(result => !result.ok).length, 1, JSON.stringify(results));
    assert.match(results.find(result => !result.ok)?.error ?? "", /MarketingLeadIdentityConflictError|already exists/i);

    const [listed, byEmail] = await Promise.all([
      runChild(dataFile, { ...common, action: "marketing-lead-list" }),
      runChild(dataFile, { ...common, action: "marketing-lead-get-email", email: "CANONICAL.OWNER@example.com" }),
    ]);
    assert.equal(listed.ok, true, listed.error);
    assert.equal(byEmail.ok, true, byEmail.error);
    assert.equal((listed.result as unknown[]).length, 1);
    assert.equal((byEmail.result as { email: string }).email, "canonical.owner@example.com");
  });

  it("preserves cross-process Agency Marketing edits and contact history", async () => {
    const dataFile = join(sandbox, "marketing-leads.json");
    const common = {
      agencyId: "agency_marketing_process",
      installId: "install_marketing_process",
    };
    const seeded = await runChild(dataFile, {
      ...common,
      action: "marketing-lead-create",
      payload: { email: "marketing.process@example.com", name: "Before" },
    });
    assert.equal(seeded.ok, true, seeded.error);
    const id = (seeded.result as { id: string }).id;

    const results = await collide(dataFile, common,
      { action: "marketing-lead-update", id, payload: { name: "After", notes: "Keep this edit" }, actor: "editor" },
      { action: "marketing-lead-contact", id, note: "Cross-process call", actor: "caller" });
    assert.ok(results.every(result => result.ok), JSON.stringify(results));

    const inspected = await runChild(dataFile, { ...common, action: "marketing-lead-list" });
    assert.equal(inspected.ok, true, inspected.error);
    const [lead] = inspected.result as Array<{ name: string; notes?: string; contactHistory: Array<{ note: string }> }>;
    assert.equal(lead?.name, "After");
    assert.equal(lead?.notes, "Keep this edit");
    assert.deepEqual(lead?.contactHistory.map(entry => entry.note), ["Cross-process call"]);
  });

  it("persists Agency Marketing email, campaign, and staff re-keys and erases them after reload", async () => {
    const dataFile = join(sandbox, "marketing-lead-rekey-erasure.json");
    const common = {
      agencyId: "agency_marketing_rekey_process",
      installId: "install_marketing_rekey_process",
    };
    const seeded = await runChild(dataFile, {
      ...common,
      action: "marketing-lead-create",
      payload: {
        email: "before.rekey@example.com",
        name: "Re-key me",
        campaignId: "campaign_old",
        assignedStaffId: "staff_old",
      },
      actor: "seed",
    });
    assert.equal(seeded.ok, true, seeded.error);
    const id = (seeded.result as { id: string }).id;

    const updated = await runChild(dataFile, {
      ...common,
      action: "marketing-lead-update",
      id,
      payload: {
        email: " After.Rekey@example.com ",
        campaignId: "campaign_new",
        assignedStaffId: "staff_new",
      },
      actor: "rekey-worker",
    });
    assert.equal(updated.ok, true, updated.error);

    const [oldEmail, newEmail, oldCampaign, newCampaign, oldStaff, newStaff] = await Promise.all([
      runChild(dataFile, { ...common, action: "marketing-lead-get-email", email: "before.rekey@example.com" }),
      runChild(dataFile, { ...common, action: "marketing-lead-get-email", email: "after.rekey@example.com" }),
      runChild(dataFile, { ...common, action: "marketing-lead-list-campaign", campaignId: "campaign_old" }),
      runChild(dataFile, { ...common, action: "marketing-lead-list-campaign", campaignId: "campaign_new" }),
      runChild(dataFile, { ...common, action: "marketing-lead-list-staff", staffId: "staff_old" }),
      runChild(dataFile, { ...common, action: "marketing-lead-list-staff", staffId: "staff_new" }),
    ]);
    assert.ok([oldEmail, newEmail, oldCampaign, newCampaign, oldStaff, newStaff].every(result => result.ok));
    assert.equal(oldEmail.result, null);
    assert.equal((newEmail.result as { id: string; email: string }).id, id);
    assert.equal((newEmail.result as { email: string }).email, "after.rekey@example.com");
    assert.deepEqual(oldCampaign.result, []);
    assert.deepEqual((newCampaign.result as Array<{ id: string }>).map(row => row.id), [id]);
    assert.deepEqual(oldStaff.result, []);
    assert.deepEqual((newStaff.result as Array<{ id: string }>).map(row => row.id), [id]);

    const erased = await runChild(dataFile, {
      ...common,
      action: "marketing-lead-erase",
      addresses: [" AFTER.REKEY@example.com "],
    });
    assert.equal(erased.ok, true, erased.error);
    assert.equal(erased.result, 1);

    const [listedAfterErase, emailAfterErase, campaignAfterErase, staffAfterErase, emailPointerAfterErase] = await Promise.all([
      runChild(dataFile, { ...common, action: "marketing-lead-list" }),
      runChild(dataFile, { ...common, action: "marketing-lead-get-email", email: "after.rekey@example.com" }),
      runChild(dataFile, { ...common, action: "marketing-lead-list-campaign", campaignId: "campaign_new" }),
      runChild(dataFile, { ...common, action: "marketing-lead-list-staff", staffId: "staff_new" }),
      runChild(dataFile, { ...common, action: "storage-get", key: "leads/by-email/after.rekey@example.com" }),
    ]);
    assert.ok([listedAfterErase, emailAfterErase, campaignAfterErase, staffAfterErase, emailPointerAfterErase]
      .every(result => result.ok));
    assert.deepEqual(listedAfterErase.result, []);
    assert.equal(emailAfterErase.result, null);
    assert.deepEqual(campaignAfterErase.result, []);
    assert.deepEqual(staffAfterErase.result, []);
    assert.equal(emailPointerAfterErase.result, undefined);
  });

  it("preserves simultaneous campaign rows and indexes across Node processes", async () => {
    const dataFile = join(sandbox, "campaigns.json");
    const common = {
      agencyId: "agency_campaign_process",
      installId: "install_campaign_process",
      action: "campaign-create",
    };
    const results = await collide(dataFile, common,
      { payload: { name: "Email process", channel: "email" }, actor: "email" },
      { payload: { name: "Paid process", channel: "paid" }, actor: "paid" });
    assert.ok(results.every(result => result.ok), JSON.stringify(results));

    const inspected = await runChild(dataFile, { ...common, action: "campaign-list" });
    assert.equal(inspected.ok, true, inspected.error);
    const rows = inspected.result as Array<{ name: string }>;
    assert.deepEqual(rows.map(row => row.name).sort(), ["Email process", "Paid process"]);
  });

  it("preserves a campaign channel move while another process deletes a draft and repairs every channel index", async () => {
    const dataFile = join(sandbox, "campaign-update-delete.json");
    const common = {
      agencyId: "agency_campaign_update_delete_process",
      installId: "install_campaign_update_delete_process",
    };
    const movable = await runChild(dataFile, {
      ...common,
      action: "campaign-create",
      payload: { name: "Move across channels", channel: "email" },
      actor: "seed-move",
    });
    const deletable = await runChild(dataFile, {
      ...common,
      action: "campaign-create",
      payload: { name: "Delete draft", channel: "paid" },
      actor: "seed-delete",
    });
    assert.equal(movable.ok, true, movable.error);
    assert.equal(deletable.ok, true, deletable.error);
    const movableId = (movable.result as { id: string }).id;
    const deletableId = (deletable.result as { id: string }).id;

    const results = await collide(dataFile, common,
      {
        action: "campaign-update",
        id: movableId,
        payload: { name: "Moved campaign", channel: "social", notes: "Moved durably" },
        actor: "move-worker",
      },
      { action: "campaign-delete", id: deletableId, actor: "delete-worker" });
    assert.ok(results.every(result => result.ok), JSON.stringify(results));
    assert.equal(results[1]?.result, true);

    const [listed, emailRows, socialRows, paidRows, allIndex, emailIndex, socialIndex, paidIndex, deletedRow] = await Promise.all([
      runChild(dataFile, { ...common, action: "campaign-list" }),
      runChild(dataFile, { ...common, action: "campaign-list-channel", channel: "email" }),
      runChild(dataFile, { ...common, action: "campaign-list-channel", channel: "social" }),
      runChild(dataFile, { ...common, action: "campaign-list-channel", channel: "paid" }),
      runChild(dataFile, { ...common, action: "storage-get", key: "campaigns/index" }),
      runChild(dataFile, { ...common, action: "storage-get", key: "campaigns/by-channel/email" }),
      runChild(dataFile, { ...common, action: "storage-get", key: "campaigns/by-channel/social" }),
      runChild(dataFile, { ...common, action: "storage-get", key: "campaigns/by-channel/paid" }),
      runChild(dataFile, { ...common, action: "storage-get", key: `campaigns/by-id/${deletableId}` }),
    ]);
    assert.ok([listed, emailRows, socialRows, paidRows, allIndex, emailIndex, socialIndex, paidIndex, deletedRow]
      .every(result => result.ok));
    assert.deepEqual((listed.result as Array<{ id: string; name: string; channel: string; notes?: string }>).map(row => ({
      id: row.id,
      name: row.name,
      channel: row.channel,
      notes: row.notes,
    })), [{ id: movableId, name: "Moved campaign", channel: "social", notes: "Moved durably" }]);
    assert.deepEqual(emailRows.result, []);
    assert.deepEqual((socialRows.result as Array<{ id: string }>).map(row => row.id), [movableId]);
    assert.deepEqual(paidRows.result, []);
    assert.deepEqual(allIndex.result, [movableId]);
    assert.deepEqual(emailIndex.result, []);
    assert.deepEqual(socialIndex.result, [movableId]);
    assert.deepEqual(paidIndex.result, []);
    assert.equal(deletedRow.result, undefined);
  });
});
