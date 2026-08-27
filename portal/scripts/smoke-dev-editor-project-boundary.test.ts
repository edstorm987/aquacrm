import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { editorDiscardPrompt, unsavedEditorWork } from "../src/engines/editor/unsavedEditorWork";

const DEV_EDITOR = readFileSync(new URL("../src/engines/editor/DevEditor.tsx", import.meta.url), "utf8");
const CODE_CANVAS = readFileSync(new URL("../src/components/editing/EditorCodeCanvas.tsx", import.meta.url), "utf8");
const EDITOR_AI = readFileSync(new URL("../src/components/editing/AquaEditorAI.tsx", import.meta.url), "utf8");
const PAGE_SEO = readFileSync(new URL("../src/components/editing/PageSeoPanel.tsx", import.meta.url), "utf8");
const ELEMENT_INSERT = readFileSync(new URL("../src/components/editing/ElementInsertPanel.tsx", import.meta.url), "utf8");
const FILES_ROUTE = readFileSync(new URL("../src/app/api/portal/site-editor/files/route.ts", import.meta.url), "utf8");
const GOVERNED_PROJECT_PAGE = readFileSync(new URL("../src/app/portal/dev-workspace/[projectId]/page.tsx", import.meta.url), "utf8");
const PROJECT_SETTINGS = readFileSync(new URL("../src/app/portal/dev-team/editor/setup/_DevEditorSetup.tsx", import.meta.url), "utf8");

test("the discard gate names every independent editor buffer", () => {
  assert.deepEqual(unsavedEditorWork({
    portalDraft: true,
    seoFields: true,
    repositoryFiles: 2,
    pagePreview: true,
  }), [
    "the unsaved changes in this portal draft",
    "the SEO fields filled in for this page",
    "2 unsaved repository files",
    "the unsaved preview changes on this page",
  ]);
  assert.equal(editorDiscardPrompt({}), "");
  assert.equal(
    editorDiscardPrompt({ repositoryFiles: 1 }),
    "Discard 1 unsaved repository file?",
  );
  assert.equal(
    editorDiscardPrompt({ seoFields: true, pagePreview: true }),
    "Discard the SEO fields filled in for this page and the unsaved preview changes on this page?",
  );
});

test("project-bound panels remount and report private dirty state", () => {
  assert.match(DEV_EDITOR, /<EditorCodeCanvas[\s\S]*?key=\{projectId \|\|/);
  assert.match(DEV_EDITOR, /onDirtyChange=\{setSourceDirtyPaths\}/);
  assert.match(EDITOR_AI, /<AquaEditorAIThread[\s\S]*?key=\{projectId\}/);
  assert.match(CODE_CANVAS, /onDirtyChange\?\.\(JSON\.parse\(dirtyPathSignature\)/);
  assert.match(CODE_CANVAS, /Discard the unsaved changes in \$\{path\}/);
});

test("file reads are aborted at the project boundary", () => {
  assert.match(CODE_CANVAS, /const controller = new AbortController\(\)/);
  assert.match(CODE_CANVAS, /signal: controller\.signal/);
  assert.match(CODE_CANVAS, /controller\.abort\(\)/);
  assert.match(CODE_CANVAS, /if \(cancelled\) return;/);
});

test("typing a preview address does not navigate until submit", () => {
  assert.match(DEV_EDITOR, /value=\{browserUrlInput\}/);
  assert.match(DEV_EDITOR, /onChange=\{event => setBrowserUrlInput\(event\.target\.value\)\}/);
  assert.match(DEV_EDITOR, /loadBrowserUrl\(browserUrlInput\.trim\(\)\)/);
});

test("slow page and element reads cannot repaint a newer target", () => {
  assert.match(PAGE_SEO, /loadAbortRef\.current\?\.abort\(\)/);
  assert.match(PAGE_SEO, /signal: controller\.signal/);
  assert.match(PAGE_SEO, /activeTargetKeyRef\.current !== requestedTargetKey/);
  assert.match(ELEMENT_INSERT, /targetKeyRef\.current !== requestedTargetKey/);
  assert.match(ELEMENT_INSERT, /insertContextKeyRef\.current !== requestedContextKey/);
});

test("direct mode, surface, lifecycle, browser and refresh transitions share discard guards", () => {
  assert.match(DEV_EDITOR, /function changeMode[\s\S]*confirmDiscard\(\{[\s\S]*seoFields:[\s\S]*repositoryFiles:/);
  assert.match(DEV_EDITOR, /function changeSurface[\s\S]*confirmDiscard\(\{ seoFields: seoDirty \}\)/);
  assert.match(DEV_EDITOR, /function changeLifecycleMode[\s\S]*pagePreview: tagPreviewDirty/);
  assert.match(DEV_EDITOR, /function toggleBrowser[\s\S]*pagePreview: tagPreviewDirty/);
  assert.match(DEV_EDITOR, /function refreshPreview[\s\S]*seoFields: seoDirty, pagePreview: tagPreviewDirty/);
});

test("view, edit and pull-request grants project faithfully into the editor", () => {
  assert.match(DEV_EDITOR, /id === "librarian"[\s\S]*element\.development\.explorer\.view/);
  assert.match(DEV_EDITOR, /id === "code" \|\| id === "repository"[\s\S]*element\.development\.code\.view/);
  assert.match(DEV_EDITOR, /canEdit=\{canEditCode\}/);
  assert.match(DEV_EDITOR, /canPublish=\{canPublishCode\}/);
  assert.match(CODE_CANVAS, /if \(!canEdit \|\| !open/);
  assert.match(CODE_CANVAS, /if \(!canPublish \|\| !projectId\) return/);
  assert.match(CODE_CANVAS, /editable=\{Boolean\(file\?\.editable && canEdit\)\}/);
  assert.match(CODE_CANVAS, /\{canPublish \? \(/);
  assert.match(FILES_ROUTE, /mayEdit = access\.resolution\.capabilities\.includes\("project\.edit"\)/);
  assert.match(FILES_ROUTE, /editable: mayEdit && repoFile\.editable !== false/);
});

test("delegated project connection management exposes branch maintenance, not rebinding controls", () => {
  assert.match(
    GOVERNED_PROJECT_PAGE,
    /canRebindProjectConnections = canManageProjectConnections[\s\S]*actor\.user\.role === "agency-owner"[\s\S]*actor\.user\.role === "agency-manager"/,
  );
  assert.match(DEV_EDITOR, /canRebindProjectConnections=\{canRebindProjectConnections\}/);
  assert.match(PROJECT_SETTINGS, /disabled=\{!canRebindConnections\} value=\{draft\.repository\}/);
  assert.match(PROJECT_SETTINGS, /disabled=\{!canManageConnections\} value=\{draft\.ref\}/);
  assert.match(PROJECT_SETTINGS, /\{canRebindConnections \? <div className="grid gap-2 sm:grid-cols-2">/);
  assert.match(PROJECT_SETTINGS, /\{canRebindConnections \? <GitHubConnectPanel/);
});
