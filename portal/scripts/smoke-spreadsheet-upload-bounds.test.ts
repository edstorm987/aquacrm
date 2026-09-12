import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import { parseXlsxToDelimitedText } from "../src/built-ins/modules/leads-pipeline/src/server/csv";

process.env.PORTAL_BACKEND = "memory";

let tenants: typeof import("../src/server/tenants");
let installs: typeof import("../src/server/pluginInstalls");
let pluginStorage: typeof import("../src/lib/server/pluginStorage");
let foundation: typeof import("../src/built-ins/modules/leads-pipeline/src/server/foundationAdapter");
let handlers: typeof import("../src/built-ins/modules/leads-pipeline/src/api/handlers");

before(async () => {
  const storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  tenants = await import("../src/server/tenants");
  installs = await import("../src/server/pluginInstalls");
  pluginStorage = await import("../src/lib/server/pluginStorage");
  foundation = await import("../src/built-ins/modules/leads-pipeline/src/server/foundationAdapter");
  handlers = await import("../src/built-ins/modules/leads-pipeline/src/api/handlers");
  const foundationPorts = await import("../src/built-ins/runtime/foundation-adapters/_foundationPorts");
  const leadsPorts = await import("../src/lib/server/leadsPipelinePorts");
  foundation.registerLeadsPipelineFoundation({
    tenant: foundationPorts.tenantPort,
    activity: foundationPorts.activityPort,
    events: foundationPorts.eventBusPort,
    pluginInstalls: foundationPorts.pluginInstallStorePort,
    emailEnqueue: leadsPorts.emailEnqueuePort,
    pipeline: leadsPorts.pipelinePort,
  } as never);
});

let sequence = 0;

function importWorld() {
  sequence += 1;
  const agency = tenants.createAgency({
    name: `Bounded import ${sequence}`,
    ownerEmail: `bounded-import-${sequence}@example.test`,
  });
  const install = installs.upsertInstall({
    pluginId: "leads-pipeline",
    scope: { agencyId: agency.id },
    enabled: true,
    config: {},
    features: {},
    installedBy: "bounded-import-smoke",
  });
  const storage = pluginStorage.makePluginStorage(install.id);
  return {
    agency,
    container: foundation.containerFor({ agencyId: agency.id as never, storage: storage as never }),
    ctx: {
      agencyId: agency.id,
      install,
      storage,
      services: {},
      actor: "bounded-import-smoke",
    } as never,
  };
}

function multipartRequest(value: BlobPart, filename = "contacts.csv"): Request {
  const form = new FormData();
  form.set("file", new File([value], filename, { type: "text/csv" }));
  return new Request("http://localhost/api/portal/leads-pipeline/import-csv", {
    method: "POST",
    body: form,
  });
}

function jsonRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/portal/leads-pipeline/import-csv", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function storedZip(entries: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let localOffset = 0;

  for (const [name, value] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name);
    const content = Buffer.from(value);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centrals.push(central, nameBytes);
    localOffset += local.length + nameBytes.length + content.length;
  }

  const centralDirectory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...locals, centralDirectory, eocd]);
}

function centralOffset(zip: Buffer): number {
  return zip.readUInt32LE(zip.length - 22 + 16);
}

describe("Lead and prospect spreadsheet intake is bounded before mutation", () => {
  it("rejects an XLSX entry whose declared expansion exceeds the per-entry ceiling", () => {
    const zip = storedZip({ "xl/workbook.xml": "x" });
    zip.writeUInt32LE(12 * 1024 * 1024 + 1, centralOffset(zip) + 24);
    assert.throws(() => parseXlsxToDelimitedText(zip), /xlsx_entry_too_large/);
  });

  it("rejects a forged uncompressed size instead of trusting or silently inflating it", () => {
    const zip = storedZip({ "xl/workbook.xml": "x" });
    zip.writeUInt32LE(2, centralOffset(zip) + 24);
    assert.throws(() => parseXlsxToDelimitedText(zip), /xlsx_uncompressed_size_mismatch/);
  });

  it("rejects archive traversal names even though the importer never extracts to disk", () => {
    const zip = storedZip({ "../xl/workbook.xml": "x" });
    assert.throws(() => parseXlsxToDelimitedText(zip), /xlsx_unsafe_entry_name/);
  });

  it("direct preview and import handlers share the 5 MB multipart cap", async () => {
    const world = importWorld();
    const tooLarge = new Uint8Array(5 * 1024 * 1024 + 1);
    const preview = await handlers.previewCsvHandler(multipartRequest(tooLarge), world.ctx);
    const imported = await handlers.importCsvHandler(multipartRequest(tooLarge), world.ctx);
    assert.equal(preview.status, 413, await preview.clone().text());
    assert.equal(imported.status, 413, await imported.clone().text());
    assert.equal((await world.container.leads.list()).length, 0);
  });

  it("direct preview and import handlers accept the same bounded multipart sheet", async () => {
    const world = importWorld();
    const csv = "email,name\none@example.test,One\ntwo@example.test,Two\n";
    const preview = await handlers.previewCsvHandler(multipartRequest(csv), world.ctx);
    assert.equal(preview.status, 200, await preview.clone().text());
    const previewBody = await preview.json() as { rowCount: number; headers: string[] };
    assert.equal(previewBody.rowCount, 2);
    assert.deepEqual(previewBody.headers, ["email", "name"]);

    const imported = await handlers.importCsvHandler(multipartRequest(csv), world.ctx);
    assert.equal(imported.status, 200, await imported.clone().text());
    assert.equal((await imported.json() as { imported: number }).imported, 2);
    assert.equal((await world.container.leads.list()).length, 2);
  });

  it("bounds JSON bodies and rejects 501 Lead rows before the first write", async () => {
    const oversizedWorld = importWorld();
    const oversized = await handlers.importCsvHandler(
      jsonRequest({ text: `email\n${"x".repeat(5 * 1024 * 1024)}` }),
      oversizedWorld.ctx,
    );
    assert.equal(oversized.status, 413, await oversized.clone().text());
    assert.equal((await oversizedWorld.container.leads.list()).length, 0);

    const rowWorld = importWorld();
    const text = ["email,name", ...Array.from({ length: 501 }, (_, index) => `person-${index}@example.test,Person ${index}`)].join("\n");
    const preview = await handlers.previewCsvHandler(jsonRequest({ text, filename: "too-many.csv" }), rowWorld.ctx);
    const imported = await handlers.importCsvHandler(jsonRequest({ text, filename: "too-many.csv" }), rowWorld.ctx);
    assert.equal(preview.status, 400, await preview.clone().text());
    assert.equal(imported.status, 400, await imported.clone().text());
    assert.match((await imported.json() as { error: string }).error, /500 leads/);
    assert.equal((await rowWorld.container.leads.list()).length, 0, "the row limit must be checked before upsert starts");
  });
});
