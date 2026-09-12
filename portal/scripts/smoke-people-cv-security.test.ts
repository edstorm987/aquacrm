// FILE-SEC-001 — private candidate CV quarantine/release boundary.
// Hermetic: memory PortalState + local .data bytes + injected scanner only.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { beforeEach, describe, it } from "node:test";

import { withSession } from "./dev-console-request-scope";
import { NextRequest } from "next/server";
import { GET as cvGET, POST as cvPOST } from "../src/app/api/portal/people/cv/route";
import { issueSession, SESSION_COOKIE_NAME } from "../src/lib/server/auth/auth";
import { CSRF_COOKIE_NAME, signCsrfToken } from "../src/lib/server/auth/csrf";
import { setContentScanner } from "../src/lib/server/security/contentTrust";
import { getPeopleApplication, reservePeopleCvScanBudget } from "../src/server/people";
import { withPortalStateTransaction } from "../src/server/productWorkspaceCoordinator";
import { createEmptyPortalState, LIVE_DATA_REALM_ID, replaceDataRealmState } from "../src/server/storage";
import type { PeopleApplication, PortalState, Role, ServerUser } from "../src/server/types";

process.env.PORTAL_BACKEND ??= "memory";

const AGENCY_A = "cv-security-agency-a";
const AGENCY_B = "cv-security-agency-b";
const APP_ID = "application-cv-security";
const LOCAL_KEY = "cv-security/candidate.pdf";
const LOCAL_PATH = join(process.cwd(), ".data", "people-cvs", LOCAL_KEY);
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF");

function digest(bytes: Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function version(provider: string, key: string, sha: string): string {
  return crypto.createHash("sha256").update(provider).update("\0").update(key).update("\0").update(sha).digest("hex");
}

function user(id: string, role: Role, agencyId: string): ServerUser {
  return {
    id,
    email: `${id}@example.test`,
    name: id,
    passwordHash: "test-only",
    role,
    agencyId,
    agencyIds: [agencyId],
    sessionRev: 0,
    accessRev: 0,
    createdAt: 1,
    updatedAt: 1,
  };
}

function application(agencyId = AGENCY_A): PeopleApplication {
  const sha = digest(PDF);
  return {
    id: APP_ID,
    agencyId,
    statusTokenHash: "test-only",
    name: "Candidate",
    email: "candidate@example.test",
    roleInterest: "Engineering",
    cv: {
      fileName: "candidate.pdf",
      contentType: "application/pdf",
      size: PDF.byteLength,
      storageProvider: "local",
      storageKey: LOCAL_KEY,
      contentTrust: {
        digest: sha,
        objectVersion: version("local", LOCAL_KEY, sha),
        signatureVerdict: "clean",
        scannerVerdict: "unavailable",
        quarantineStatus: "quarantined",
        assessedAt: 1,
      },
      securityAudit: [],
    },
    stage: "applied",
    stageHistory: [{ stage: "applied", at: 1 }],
    internalNotes: [],
    submittedAt: 1,
    updatedAt: 1,
  };
}

function stateFor(subject: ServerUser, app = application()): PortalState {
  const state = createEmptyPortalState();
  for (const id of [AGENCY_A, AGENCY_B]) {
    state.agencies[id] = {
      id,
      name: id,
      slug: id,
      brand: { primaryColor: "#000000" },
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    };
  }
  state.users[subject.email] = subject;
  state.peopleApplications[app.id] = app;
  return state;
}

function tokenFor(subject: ServerUser): string {
  return issueSession({
    userId: subject.id,
    email: subject.email,
    role: subject.role,
    agencyId: subject.agencyId,
    agencyIds: subject.agencyIds,
    activeAgencyId: subject.agencyId,
    sessionRev: 0,
  });
}

function rescanRequest(subject: ServerUser, options: { csrf?: boolean; ip?: string } = {}): { request: NextRequest; token: string } {
  const sessionToken = tokenFor(subject);
  const csrf = signCsrfToken().token;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: "http://localhost",
    "x-forwarded-for": options.ip ?? `203.0.113.${Math.floor(Math.random() * 200) + 1}`,
    cookie: `${SESSION_COOKIE_NAME}=${sessionToken}; ${CSRF_COOKIE_NAME}=${csrf}`,
  };
  if (options.csrf !== false) headers["x-csrf-token"] = csrf;
  return {
    token: sessionToken,
    request: new NextRequest("http://localhost/api/portal/people/cv", {
      method: "POST",
      headers,
      body: JSON.stringify({ applicationId: APP_ID }),
    }),
  };
}

function downloadRequest(subject: ServerUser): { request: NextRequest; token: string } {
  const token = tokenFor(subject);
  return {
    token,
    request: new NextRequest(`http://localhost/api/portal/people/cv?applicationId=${APP_ID}`, {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    }),
  };
}

async function callRescan(subject: ServerUser, options?: { csrf?: boolean; ip?: string }) {
  const { request, token } = rescanRequest(subject, options);
  return withSession(token, () => cvPOST(request));
}

async function callDownload(subject: ServerUser) {
  const { request, token } = downloadRequest(subject);
  return withSession(token, () => cvGET(request));
}

beforeEach(async () => {
  setContentScanner(null);
  mkdirSync(dirname(LOCAL_PATH), { recursive: true });
  writeFileSync(LOCAL_PATH, PDF);
});

describe("People CV security route", () => {
  it("requires signed double-submit CSRF before scanner/provider cost", async () => {
    const owner = user("cv-owner-csrf", "agency-owner", AGENCY_A);
    await replaceDataRealmState(LIVE_DATA_REALM_ID, stateFor(owner));
    let scans = 0;
    setContentScanner(async () => { scans += 1; return { malicious: false }; });
    const response = await callRescan(owner, { csrf: false });
    assert.equal(response.status, 403);
    assert.equal(scans, 0);
  });

  it("rejects the wrong role, an element-restricted manager and a foreign tenant before scanning", async () => {
    let scans = 0;
    setContentScanner(async () => { scans += 1; return { malicious: false }; });

    const staff = user("cv-staff", "agency-staff", AGENCY_A);
    await replaceDataRealmState(LIVE_DATA_REALM_ID, stateFor(staff));
    assert.equal((await callRescan(staff)).status, 401);

    const manager = user("cv-manager-restricted", "agency-manager", AGENCY_A);
    const restricted = stateFor(manager);
    restricted.accessGrants.restricted = {
      id: "restricted",
      agencyId: AGENCY_A,
      userId: manager.id,
      scope: { kind: "workspace", id: "staff" },
      environment: "live",
      capabilities: ["element.staff.overview.view"],
      createdBy: "owner",
      createdAt: 1,
      updatedAt: 1,
    };
    await replaceDataRealmState(LIVE_DATA_REALM_ID, restricted);
    assert.equal((await callRescan(manager)).status, 403);

    const ownerA = user("cv-owner-foreign", "agency-owner", AGENCY_A);
    await replaceDataRealmState(LIVE_DATA_REALM_ID, stateFor(ownerA, application(AGENCY_B)));
    assert.equal((await callRescan(ownerA)).status, 404);
    assert.equal(scans, 0);
  });

  it("applies role, element and tenant gates to downloads before reading candidate bytes", async () => {
    const released = application();
    released.cv.contentTrust!.scannerVerdict = "clean";
    released.cv.contentTrust!.quarantineStatus = "released";

    const staff = user("cv-download-staff", "agency-staff", AGENCY_A);
    await replaceDataRealmState(LIVE_DATA_REALM_ID, stateFor(staff, released));
    assert.equal((await callDownload(staff)).status, 401);

    const manager = user("cv-download-manager-restricted", "agency-manager", AGENCY_A);
    const restricted = stateFor(manager, released);
    restricted.accessGrants.restricted = {
      id: "restricted-download",
      agencyId: AGENCY_A,
      userId: manager.id,
      scope: { kind: "workspace", id: "staff" },
      environment: "live",
      capabilities: ["element.staff.overview.view"],
      createdBy: "owner",
      createdAt: 1,
      updatedAt: 1,
    };
    await replaceDataRealmState(LIVE_DATA_REALM_ID, restricted);
    assert.equal((await callDownload(manager)).status, 403);

    const owner = user("cv-download-owner-foreign", "agency-owner", AGENCY_A);
    await replaceDataRealmState(LIVE_DATA_REALM_ID, stateFor(owner, application(AGENCY_B)));
    assert.equal((await callDownload(owner)).status, 404);
  });

  it("keeps scanner-clean state invisible during scanning, then atomically releases with durable audit", async () => {
    const owner = user("cv-owner-release", "agency-owner", AGENCY_A);
    await replaceDataRealmState(LIVE_DATA_REALM_ID, stateFor(owner));
    let continueScan!: () => void;
    const scanning = new Promise<void>(resolve => { continueScan = resolve; });
    let began!: () => void;
    const beganScanning = new Promise<void>(resolve => { began = resolve; });
    setContentScanner(async () => {
      began();
      await scanning;
      return { malicious: false };
    });

    const pending = callRescan(owner);
    await beganScanning;
    assert.equal(getPeopleApplication(AGENCY_A, APP_ID)?.cv.contentTrust?.quarantineStatus, "quarantined");
    continueScan();
    const response = await pending;
    assert.equal(response.status, 200);
    const saved = getPeopleApplication(AGENCY_A, APP_ID)!;
    assert.equal(saved.cv.contentTrust?.scannerVerdict, "clean");
    assert.equal(saved.cv.contentTrust?.quarantineStatus, "released");
    assert.match(saved.cv.contentTrust?.objectVersion ?? "", /^[0-9a-f]{64}$/);
    const audit = saved.cv.securityAudit?.at(-1);
    assert.equal(audit?.event, "rescan");
    assert.match(audit?.actorRef ?? "", /^principal:[0-9a-f]{64}$/);
    assert.notEqual(audit?.actorRef, owner.id);
    assert.match(audit?.scanId ?? "", /^[0-9a-f-]{36}$/);
    assert.doesNotMatch(JSON.stringify(audit), /candidate\.pdf|candidate@example|x-csrf|Bearer/i);
  });

  it("serializes concurrent rescan cost so the successor cannot scan an already released object", async () => {
    const owner = user("cv-owner-concurrency", "agency-owner", AGENCY_A);
    await replaceDataRealmState(LIVE_DATA_REALM_ID, stateFor(owner));
    let scans = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let began!: () => void;
    const started = new Promise<void>(resolve => { began = resolve; });
    setContentScanner(async () => { scans += 1; began(); await gate; return { malicious: false }; });
    const first = callRescan(owner, { ip: "203.0.113.210" });
    await started;
    const second = callRescan(owner, { ip: "203.0.113.211" });
    release();
    const statuses = [(await first).status, (await second).status].sort();
    assert.deepEqual(statuses, [200, 409]);
    assert.equal(scans, 1);
  });

  it("caps repeated authenticated provider-cost attempts and keeps outage results quarantined", async () => {
    const owner = user("cv-owner-budget", "agency-owner", AGENCY_A);
    await replaceDataRealmState(LIVE_DATA_REALM_ID, stateFor(owner));
    let scans = 0;
    setContentScanner(async () => { scans += 1; throw new Error("local scanner outage"); });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await callRescan(owner, { ip: "203.0.113.220" });
      assert.equal(response.status, 503);
      assert.equal(getPeopleApplication(AGENCY_A, APP_ID)?.cv.contentTrust?.quarantineStatus, "quarantined");
    }
    const refused = await callRescan(owner, { ip: "203.0.113.220" });
    assert.equal(refused.status, 429);
    assert.equal(scans, 5, "the refused request must not reach scanner/provider cost");
    const audit = getPeopleApplication(AGENCY_A, APP_ID)?.cv.securityAudit ?? [];
    assert.equal(audit.filter(entry => entry.event === "rescan-admitted").length, 5);
    assert.equal(audit.filter(entry => entry.event === "rescan").length, 5);
    assert.ok(audit.every(entry => entry.quarantineStatus === "quarantined"));
    assert.doesNotMatch(JSON.stringify(audit), new RegExp(owner.id));
  });

  it("enforces the durable tenant scanner budget across distinct users and CV objects", async () => {
    const owner = user("cv-owner-tenant-budget", "agency-owner", AGENCY_A);
    const state = stateFor(owner);
    const applications: PeopleApplication[] = [];
    for (let index = 0; index < 31; index += 1) {
      const next = application();
      next.id = `${APP_ID}-${index}`;
      next.cv.storageKey = `cv-security/candidate-${index}.pdf`;
      next.cv.contentTrust!.objectVersion = version("local", next.cv.storageKey, next.cv.contentTrust!.digest);
      applications.push(next);
      state.peopleApplications[next.id] = next;
    }
    delete state.peopleApplications[APP_ID];
    await replaceDataRealmState(LIVE_DATA_REALM_ID, state);

    for (let index = 0; index < 30; index += 1) {
      const target = applications[index]!;
      const result = await withPortalStateTransaction(`people-cv-budget:${AGENCY_A}`, () => reservePeopleCvScanBudget({
        agencyId: AGENCY_A,
        userId: `distinct-operator-${index}`,
        applicationId: target.id,
        storageProvider: target.cv.storageProvider,
        storageKey: target.cv.storageKey,
        scanId: crypto.randomUUID(),
        objectVersion: target.cv.contentTrust!.objectVersion!,
        digest: target.cv.contentTrust!.digest,
      }));
      assert.equal(result.allowed, true);
    }
    const refusedTarget = applications[30]!;
    const refused = await withPortalStateTransaction(`people-cv-budget:${AGENCY_A}`, () => reservePeopleCvScanBudget({
      agencyId: AGENCY_A,
      userId: "distinct-operator-30",
      applicationId: refusedTarget.id,
      storageProvider: refusedTarget.cv.storageProvider,
      storageKey: refusedTarget.cv.storageKey,
      scanId: crypto.randomUUID(),
      objectVersion: refusedTarget.cv.contentTrust!.objectVersion!,
      digest: refusedTarget.cv.contentTrust!.digest,
    }));
    assert.equal(refused.allowed, false);
    if (refused.allowed) throw new Error("unreachable");
    assert.equal(refused.reason, "rate");
    const allAudit = applications.flatMap(target => getPeopleApplication(AGENCY_A, target.id)?.cv.securityAudit ?? []);
    assert.equal(allAudit.filter(entry => entry.event === "rescan-admitted").length, 30);
    assert.doesNotMatch(JSON.stringify(allAudit), /distinct-operator-/);
  });

  it("rehashes exact download bytes, serves a match, and quarantines a mismatch without serving it", async () => {
    const owner = user("cv-owner-download", "agency-owner", AGENCY_A);
    const released = application();
    released.cv.contentTrust!.scannerVerdict = "clean";
    released.cv.contentTrust!.quarantineStatus = "released";
    await replaceDataRealmState(LIVE_DATA_REALM_ID, stateFor(owner, released));

    const clean = await callDownload(owner);
    assert.equal(clean.status, 200);
    assert.deepEqual(Buffer.from(await clean.arrayBuffer()), PDF);

    writeFileSync(LOCAL_PATH, Buffer.from("%PDF-1.7\nTAMPERED\n%%EOF"));
    const mismatch = await callDownload(owner);
    assert.equal(mismatch.status, 423);
    const body = await mismatch.json() as { code?: string };
    assert.equal(body.code, "cv_integrity_mismatch");
    const saved = getPeopleApplication(AGENCY_A, APP_ID)!;
    assert.equal(saved.cv.contentTrust?.quarantineStatus, "quarantined");
    assert.equal(saved.cv.contentTrust?.scannerVerdict, "not-run");
    assert.equal(saved.cv.securityAudit?.at(-1)?.event, "download-digest-mismatch");
  });

  it("refuses a released verdict whose object version is not bound to provider, key and digest", async () => {
    const owner = user("cv-owner-forged-version", "agency-owner", AGENCY_A);
    const released = application();
    released.cv.contentTrust!.scannerVerdict = "clean";
    released.cv.contentTrust!.quarantineStatus = "released";
    released.cv.contentTrust!.objectVersion = "f".repeat(64);
    await replaceDataRealmState(LIVE_DATA_REALM_ID, stateFor(owner, released));

    const refused = await callDownload(owner);
    assert.equal(refused.status, 423);
    const body = await refused.json() as { code?: string };
    assert.equal(body.code, "cv_quarantined");
  });
});

process.on("exit", () => {
  setContentScanner(null);
  rmSync(join(process.cwd(), ".data", "people-cvs", "cv-security"), { recursive: true, force: true });
});
