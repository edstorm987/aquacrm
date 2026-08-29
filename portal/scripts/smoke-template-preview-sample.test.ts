// A template can be drafted before any client exists.
//
// Ed, 2026-08-27: *"The editor needs a client record to supply preview data for
// this project … all the products ones should just use a demo … this way I can
// make draft things."*
//
// ── What was actually blocking ────────────────────────────────────────────
//
// Template preview is not a separate renderer: the studio previews a template by
// loading `/client-preview/<clientId>?scope=template&templateId=…`, rendering it
// THROUGH a client so the layout is seen with real shapes in it. Correct design,
// with one consequence — an agency with no clients gave `DevEditor` an empty
// `clients` list, it hit `!clients.length && portalTarget`, and refused to open.
// A PRODUCT portal template, which belongs to a product and to no client at all,
// could not be drafted until someone created a real client first.
//
// ── Why the stand-in is synthesised, not created ──────────────────────────
//
// Creating a client would work and would also be wrong: the row shows up in the
// client list, in counts, KPIs, Radar and finance — a fake client quietly
// becoming part of the business's own numbers, with every one of those surfaces
// then needing to learn to exclude it. Nothing is stored; the reserved id
// resolves to an object that lives for one render.
//
// The tests below pin both halves: the editor is never blocked, and no row is
// ever written.

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { createRequire } from "node:module";

process.env.PORTAL_BACKEND ??= "memory";

const require_ = createRequire(import.meta.url);
const serverOnly = require_.resolve("server-only");
require_.cache[serverOnly] = {
  id: serverOnly, filename: serverOnly, loaded: true, exports: {}, paths: [], children: [],
} as never;

import { ensureHydrated, getState } from "../src/server/storage";
import { createAgency, createClient, listClients } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import { loadPortalStudioProps } from "../src/engines/editor/server/portalStudio";
import {
  SAMPLE_CLIENT_NAME,
  isSampleClientId,
  sampleClientAgencyId,
  sampleClientFor,
  sampleClientId,
} from "../src/lib/server/clients/samplePreviewClient";

let emptyAgency = "";
let stockedAgency = "";
let ownerId = "";
let realClientId = "";

before(async () => {
  await ensureHydrated();
  const stamp = `${Date.now()}-${Math.round(performance.now())}`;
  emptyAgency = createAgency({ name: "No clients", slug: `empty-${stamp}` }).id;
  stockedAgency = createAgency({ name: "Has clients", slug: `stocked-${stamp}` }).id;
  ownerId = createUser({
    email: `owner-${stamp}@sample.test`, name: "Owner",
    role: "agency-owner", agencyId: emptyAgency, password: "sample-preview-pass-phrase",
  }).id;
  realClientId = createClient(stockedAgency, { name: "Real Client", slug: "real" }).id;
});

const studio = (agencyId: string) => loadPortalStudioProps({
  agencyId, userId: ownerId, role: "agency-owner", query: {},
});

describe("an agency with NO clients can still open the studio", () => {
  it("offers the sample, so the editor's empty-list block cannot fire", () => {
    const props = studio(emptyAgency);
    assert.equal(props.clients.length, 1, "an agency with no clients got no preview target");
    assert.equal(props.clients[0].name, SAMPLE_CLIENT_NAME);
    assert.ok(isSampleClientId(props.clients[0].id));
  });

  it("selects it as the initial client, so the preview has somewhere to point", () => {
    assert.equal(studio(emptyAgency).initialClientId, sampleClientId(emptyAgency));
  });

  it("writes NOTHING — no client row is created as a side effect", () => {
    const before = Object.keys(getState().clients).length;
    studio(emptyAgency);
    studio(emptyAgency);
    assert.equal(Object.keys(getState().clients).length, before,
      "opening the studio created a client row — the whole point of synthesising it is that it is not stored");
    assert.equal(listClients(emptyAgency).length, 0,
      "the sample appears in the agency's real client list, where it would be counted as a client");
  });
});

describe("a real client is still preferred when one exists", () => {
  it("the sample is offered but does not become the default", () => {
    const props = studio(stockedAgency);
    assert.equal(props.initialClientId, realClientId,
      "the sample displaced a real client as the default — it is a floor, not a preference");
    assert.ok(props.clients.some(client => client.id === realClientId), "the real client vanished");
    assert.ok(props.clients.some(client => isSampleClientId(client.id)),
      "the sample is not offered when clients exist — a template still ought to be drafted against it");
  });

  it("the sample is offered LAST, so it never sits above real work", () => {
    const props = studio(stockedAgency);
    assert.ok(isSampleClientId(props.clients[props.clients.length - 1].id));
  });
});

describe("the stand-in is scoped and obvious", () => {
  it("its id carries the agency, so it cannot cross tenants", () => {
    assert.equal(sampleClientAgencyId(sampleClientId(emptyAgency)), emptyAgency);
    assert.notEqual(sampleClientId(emptyAgency), sampleClientId(stockedAgency));
    assert.equal(sampleClientAgencyId("cli_abc123"), "", "a real client id was read as a sample");
    assert.equal(isSampleClientId("cli_abc123"), false);
  });

  it("it is named so nobody reads its numbers as real", () => {
    const sample = sampleClientFor(emptyAgency);
    assert.match(sample.name, /sample/i);
    assert.match(sample.name, /preview only/i);
    assert.equal(sample.metadata?.samplePreviewClient, true);
  });

  it("it carries portal metadata, or the preview renders an empty shell", () => {
    // An empty stand-in would render every section blank, which tells a template
    // author nothing about whether their layout works.
    const meta = sampleClientFor(emptyAgency).metadata ?? {};
    for (const key of ["portalMode", "portalContactName", "portalServicePlan", "portalPlanSummary"]) {
      assert.ok(meta[key], `the sample lost ${key} — the preview would render that section empty`);
    }
  });

  it("survives a URL round trip — the separator must need no encoding", async () => {
    // The first attempt used a colon and the preview 404'd: Next hands a dynamic
    // route segment through WITHOUT decoding, so `/client-preview/sample-preview:x`
    // arrived as `sample-preview%3Ax` and matched nothing. Both halves are pinned
    // — the id needs no encoding, AND the reader tolerates it anyway.
    const id = sampleClientId(emptyAgency);
    assert.equal(encodeURIComponent(id), id,
      "the sample id now needs percent-encoding, which is what broke the preview the first time");
    assert.ok(isSampleClientId(encodeURIComponent(id)), "the reader stopped tolerating an encoded id");
    assert.equal(sampleClientAgencyId(encodeURIComponent(id)), emptyAgency);
  });

  it("renders identically every time — no wall-clock in it", () => {
    // Relative dates drifting between reloads read as the layout changing.
    assert.deepEqual(sampleClientFor(emptyAgency), sampleClientFor(emptyAgency));
    assert.equal(sampleClientFor(emptyAgency).createdAt, 0);
  });
});

describe("the preview route resolves it, and only for its own agency", () => {
  it("the route reads the reserved id instead of the store", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("src/app/client-preview/[clientId]/page.tsx", "utf8");
    assert.match(source, /isSampleClientId\(clientId\) && sampleClientAgencyId\(clientId\) === agencyId/,
      "the preview route no longer resolves the sample, so template drafting is blocked again");
    assert.match(source, /sampleForThisAgency \? sampleClientFor\(agencyId\) : getClientForAgency\(agencyId, clientId\)/,
      "the sample is no longer preferred over a store lookup for its own id");
    // The scoping half: another agency's sample id must fall through to the
    // store lookup, find nothing, and 404.
    assert.match(source, /if \(!client\) notFound\(\);/,
      "an unresolvable client no longer 404s");
  });
});
