// Save-target + save-pipeline smoke tests. Round-6.
//
// Asserts:
//   - defaultSaveTargetForClient picks "client-repo" only when phase
//     is live AND the repo exists AND the export port is available.
//   - savePipeline.savePage routes to the existing storage API in
//     "shared-portal" mode.
//   - savePipeline.savePage routes to PortalExportPort in
//     "client-repo" mode.
//   - savePipeline.savePage falls back to materialize() when the
//     port returns `fallbackToFullReexport: true`.
//   - When PortalExportPort isn't injected, "client-repo" saves
//     gracefully fall through to a soft error (UI toggle hides
//     itself in this case anyway).
//   - previewChanges returns the file list when the port is wired,
//     and `available: false` when not.

import { defaultSaveTargetForClient } from "../lib/saveTarget";
import {
  savePage as pipelineSavePage,
  previewChanges,
  type PipelineSaveResult,
} from "../lib/savePipeline";
import {
  setPortalExportPort,
  type PortalExportPort,
  type SaveResult as PortSaveResult,
  type FilePreviewEntry,
} from "../server/extensionPorts";
import type { EditorPage } from "../types/editorPage";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) {
    passes++;
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// ─── Mocks ─────────────────────────────────────────────────────────────────

interface MockCallLog {
  savePage: number;
  saveCustomPage: number;
  saveTheme: number;
  setActivePortalVariant: number;
  previewChanges: number;
  materialize: number;
  lastSavePageInput: { clientId: string; pageId: string } | null;
}

function makeMockPort(opts: {
  fallbackToFullReexport?: boolean;
  changedFiles?: FilePreviewEntry[];
} = {}): { port: PortalExportPort; calls: MockCallLog } {
  const calls: MockCallLog = {
    savePage: 0,
    saveCustomPage: 0,
    saveTheme: 0,
    setActivePortalVariant: 0,
    previewChanges: 0,
    materialize: 0,
    lastSavePageInput: null,
  };
  const result: PortSaveResult = {
    ok: true,
    fallbackToFullReexport: opts.fallbackToFullReexport ?? false,
    changedFiles: opts.changedFiles ?? [],
  };
  const port: PortalExportPort = {
    slugForClient: async () => "luv-and-ker",
    clientRepoExists: async () => true,
    savePage: async input => {
      calls.savePage++;
      calls.lastSavePageInput = { clientId: input.clientId, pageId: input.page.id };
      return result;
    },
    saveCustomPage: async () => { calls.saveCustomPage++; return result; },
    saveTheme: async () => { calls.saveTheme++; return result; },
    setActivePortalVariant: async () => { calls.setActivePortalVariant++; return result; },
    previewChanges: async () => {
      calls.previewChanges++;
      return {
        files: opts.changedFiles ?? [
          { path: "src/app/page.tsx", kind: "modified", byteCount: 1234 },
          { path: "src/lib/content.ts", kind: "added", byteCount: 256 },
        ],
        summary: "2 files changed",
      };
    },
    materialize: async () => {
      calls.materialize++;
      return { ok: true, changedFiles: opts.changedFiles ?? [{ path: "src/app/layout.tsx", kind: "modified" }] };
    },
  };
  return { port, calls };
}

function fakePage(): EditorPage {
  return {
    id: "page_test_1",
    siteId: "site_1",
    agencyId: "agency_x",
    clientId: "luvandker",
    slug: "/",
    title: "Home",
    blocks: [],
    status: "draft",
    createdAt: 0,
    updatedAt: 0,
  };
}

// Stub out global fetch so the shared-portal path doesn't reach for
// a real network during this smoke run.
type FetchInput = string | URL | Request;
const originalFetch = (globalThis as { fetch?: typeof fetch }).fetch;
const fetchLog: { lastUrl: string | null } = { lastUrl: null };
(globalThis as { fetch: typeof fetch }).fetch = (async (input: FetchInput) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  fetchLog.lastUrl = url;
  return new Response(JSON.stringify({ ok: true, page: fakePage() }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

// ─── Tests ─────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  console.log("\nsave-target default resolution");

  expect(
    "phase=live + repo exists + export available → client-repo",
    defaultSaveTargetForClient({
      clientId: "luvandker", phase: "live", clientRepoExists: true, portalExportAvailable: true,
    }) === "client-repo",
  );
  expect(
    "phase=live + no repo → shared-portal",
    defaultSaveTargetForClient({
      clientId: "luvandker", phase: "live", clientRepoExists: false, portalExportAvailable: true,
    }) === "shared-portal",
  );
  expect(
    "phase=development → shared-portal",
    defaultSaveTargetForClient({
      clientId: "luvandker", phase: "development", clientRepoExists: true, portalExportAvailable: true,
    }) === "shared-portal",
  );
  expect(
    "export plugin missing → shared-portal even when phase=live",
    defaultSaveTargetForClient({
      clientId: "luvandker", phase: "live", clientRepoExists: true, portalExportAvailable: false,
    }) === "shared-portal",
  );

  console.log("\nsavePipeline routing");

  // Shared-portal: no port, fetch should be called with a /pages URL.
  setPortalExportPort(null);
  fetchLog.lastUrl = null;
  const sharedResult: PipelineSaveResult = await pipelineSavePage({
    target: "shared-portal",
    clientId: "luvandker",
    siteId: "site_1",
    page: fakePage(),
    patch: { blocks: [] },
  });
  expect("shared-portal save returns ok", sharedResult.ok === true);
  expect("shared-portal save target tagged correctly", sharedResult.target === "shared-portal");
  const sharedFetchUrl: string = fetchLog.lastUrl ?? "";
  expect(
    "shared-portal save hit /api/portal/website-editor/pages",
    sharedFetchUrl.includes("/api/portal/website-editor/pages"),
    `actual: ${sharedFetchUrl}`,
  );

  // Client-repo with port wired (incremental save success).
  const { port, calls } = makeMockPort();
  setPortalExportPort(port);
  const repoResult: PipelineSaveResult = await pipelineSavePage({
    target: "client-repo",
    clientId: "luvandker",
    siteId: "site_1",
    page: fakePage(),
  });
  expect("client-repo save returns ok", repoResult.ok === true);
  expect("client-repo save target tagged correctly", repoResult.target === "client-repo");
  expect("client-repo save called PortalExportPort.savePage exactly once", calls.savePage === 1);
  expect(
    "PortalExportPort.savePage received the right clientId",
    calls.lastSavePageInput?.clientId === "luvandker",
  );
  expect(
    "PortalExportPort.savePage received the right pageId",
    calls.lastSavePageInput?.pageId === "page_test_1",
  );
  expect("client-repo save did NOT fall back to materialize", calls.materialize === 0);

  // Client-repo with port asking for fallback to full re-export.
  const { port: fallbackPort, calls: fbCalls } = makeMockPort({ fallbackToFullReexport: true });
  setPortalExportPort(fallbackPort);
  const fallbackResult: PipelineSaveResult = await pipelineSavePage({
    target: "client-repo",
    clientId: "luvandker",
    siteId: "site_1",
    page: fakePage(),
  });
  expect("fallback path returns ok", fallbackResult.ok === true);
  expect("fallback path called materialize", fbCalls.materialize === 1);
  expect("fallback flag surfaced", fallbackResult.fellBackToFullReexport === true);

  // Client-repo with no port wired — graceful degradation.
  setPortalExportPort(null);
  const missingPortResult: PipelineSaveResult = await pipelineSavePage({
    target: "client-repo",
    clientId: "luvandker",
    siteId: "site_1",
    page: fakePage(),
  });
  expect("missing-port save returns ok=false", missingPortResult.ok === false);
  expect(
    "missing-port save target downgrades to shared-portal",
    missingPortResult.target === "shared-portal",
  );

  console.log("\npreviewChanges");

  // Preview when port is wired.
  const { port: previewPort, calls: previewCalls } = makeMockPort();
  setPortalExportPort(previewPort);
  const preview = await previewChanges({
    target: "client-repo",
    clientId: "luvandker",
    siteId: "site_1",
    page: fakePage(),
  });
  expect("previewChanges returns available=true when port wired", preview.available === true);
  expect("previewChanges returns 2 files (mock)", preview.files.length === 2);
  expect("previewChanges called the port", previewCalls.previewChanges === 1);
  expect("previewChanges echoes summary", preview.summary === "2 files changed");

  // Preview when port missing.
  setPortalExportPort(null);
  const previewMissing = await previewChanges({
    target: "client-repo",
    clientId: "luvandker",
    siteId: "site_1",
    page: fakePage(),
  });
  expect("previewChanges available=false when port missing", previewMissing.available === false);
  expect("previewChanges files=[] when port missing", previewMissing.files.length === 0);

  // Preview in shared-portal mode → always unavailable (no diff to show).
  const previewShared = await previewChanges({
    target: "shared-portal",
    clientId: "luvandker",
    siteId: "site_1",
    page: fakePage(),
  });
  expect("previewChanges in shared-portal mode is unavailable", previewShared.available === false);

  // Restore real fetch + clean up.
  if (originalFetch) (globalThis as { fetch: typeof fetch }).fetch = originalFetch;

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
}

void run();
