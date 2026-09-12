// FILE-SEC-001 — a scanner-clean CV is not released when the durable commit fails.
// Hermetic: isolated local state/private files and an injected scanner only.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { withSession } from "./dev-console-request-scope";

process.env.NODE_ENV = "test";
process.env.PORTAL_BACKEND = "file";
process.env.PORTAL_DATA_FILE = ".data/people-cv-persistence-failure/portal-state.json";

const AGENCY_ID = "cv-persistence-agency";
const APP_ID = "application-cv-persistence";
const USER_ID = "cv-persistence-owner";
const USER_EMAIL = "cv-persistence-owner@example.test";
const CV_KEY = "cv-persistence-failure/candidate.pdf";
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF");
const STATE_DIR = join(process.cwd(), ".data", "people-cv-persistence-failure");
const BACKUP_DIR = `${STATE_DIR}-durable`;
const STATE_FILE = join(STATE_DIR, "portal-state.json");
const BACKUP_STATE_FILE = join(BACKUP_DIR, "portal-state.json");
const CV_PATH = join(process.cwd(), ".data", "people-cvs", CV_KEY);

function digest(bytes: Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function objectVersion(provider: string, key: string, sha: string): string {
  return crypto.createHash("sha256").update(provider).update("\0").update(key).update("\0").update(sha).digest("hex");
}

after(() => {
  if (existsSync(STATE_DIR) && !existsSync(join(STATE_DIR, "portal-state.json"))) {
    try { unlinkSync(STATE_DIR); } catch { /* already restored/removed */ }
  }
  if (existsSync(BACKUP_DIR) && !existsSync(STATE_DIR)) renameSync(BACKUP_DIR, STATE_DIR);
  rmSync(STATE_DIR, { recursive: true, force: true });
  rmSync(BACKUP_DIR, { recursive: true, force: true });
  rmSync(join(process.cwd(), ".data", "people-cvs", "cv-persistence-failure"), { recursive: true, force: true });
});

test("scanner-clean release remains quarantined in memory and durable state when its commit is refused", async () => {
  rmSync(STATE_DIR, { recursive: true, force: true });
  rmSync(BACKUP_DIR, { recursive: true, force: true });
  mkdirSync(dirname(CV_PATH), { recursive: true });
  writeFileSync(CV_PATH, PDF);

  const [{ NextRequest }, auth, csrf, trust, storage, route] = await Promise.all([
    import("next/server"),
    import("../src/lib/server/auth/auth"),
    import("../src/lib/server/auth/csrf"),
    import("../src/lib/server/security/contentTrust"),
    import("../src/server/storage"),
    import("../src/app/api/portal/people/cv/route"),
  ]);

  const state = storage.createEmptyPortalState();
  state.agencies[AGENCY_ID] = {
    id: AGENCY_ID,
    name: "CV persistence agency",
    slug: AGENCY_ID,
    brand: { primaryColor: "#000000" },
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  };
  state.users[USER_EMAIL] = {
    id: USER_ID,
    email: USER_EMAIL,
    name: "CV owner",
    passwordHash: "test-only",
    role: "agency-owner",
    agencyId: AGENCY_ID,
    agencyIds: [AGENCY_ID],
    sessionRev: 0,
    accessRev: 0,
    createdAt: 1,
    updatedAt: 1,
  };
  const sha = digest(PDF);
  state.peopleApplications[APP_ID] = {
    id: APP_ID,
    agencyId: AGENCY_ID,
    statusTokenHash: "test-only",
    name: "Candidate",
    email: "candidate@example.test",
    roleInterest: "Engineering",
    cv: {
      fileName: "candidate.pdf",
      contentType: "application/pdf",
      size: PDF.byteLength,
      storageProvider: "local",
      storageKey: CV_KEY,
      contentTrust: {
        digest: sha,
        objectVersion: objectVersion("local", CV_KEY, sha),
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
  await storage.replaceDataRealmState(storage.LIVE_DATA_REALM_ID, state);

  let scans = 0;
  trust.setContentScanner(async () => {
    scans += 1;
    // The durable budget/admission commit has completed. Replace its directory
    // with a regular file so the following atomic state commit deterministically
    // fails without touching a real database or provider.
    renameSync(STATE_DIR, BACKUP_DIR);
    writeFileSync(STATE_DIR, "commit-blocker");
    return { malicious: false };
  });

  const token = auth.issueSession({
    userId: USER_ID,
    email: USER_EMAIL,
    role: "agency-owner",
    agencyId: AGENCY_ID,
    agencyIds: [AGENCY_ID],
    activeAgencyId: AGENCY_ID,
    sessionRev: 0,
  });
  const csrfToken = csrf.signCsrfToken().token;
  const request = new NextRequest("http://localhost/api/portal/people/cv", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      cookie: `${auth.SESSION_COOKIE_NAME}=${token}; ${csrf.CSRF_COOKIE_NAME}=${csrfToken}`,
      "x-csrf-token": csrfToken,
      "x-forwarded-for": "203.0.113.231",
    },
    body: JSON.stringify({ applicationId: APP_ID }),
  });
  await assert.rejects(
    withSession(token, () => route.POST(request)),
    /ENOTDIR|not a directory/,
    "a refused trust commit must never acknowledge release",
  );
  assert.equal(scans, 1);

  const inMemory = storage.getState().peopleApplications[APP_ID]!;
  assert.equal(inMemory.cv.contentTrust?.quarantineStatus, "quarantined");
  assert.equal(inMemory.cv.contentTrust?.scannerVerdict, "unavailable");
  assert.equal(inMemory.cv.securityAudit?.some(entry => entry.event === "rescan"), false);
  assert.equal(inMemory.cv.securityAudit?.filter(entry => entry.event === "rescan-admitted").length, 1);

  const durable = JSON.parse(readFileSync(BACKUP_STATE_FILE, "utf8")) as typeof state;
  assert.equal(durable.peopleApplications[APP_ID]?.cv.contentTrust?.quarantineStatus, "quarantined");
  assert.equal(durable.peopleApplications[APP_ID]?.cv.contentTrust?.scannerVerdict, "unavailable");
  assert.equal(durable.peopleApplications[APP_ID]?.cv.securityAudit?.some(entry => entry.event === "rescan"), false);

  trust.setContentScanner(null);
  unlinkSync(STATE_DIR);
  renameSync(BACKUP_DIR, STATE_DIR);
});
