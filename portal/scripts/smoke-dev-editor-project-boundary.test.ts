import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { editorDiscardPrompt, unsavedEditorWork } from "../src/engines/editor/unsavedEditorWork";
import {
  FUNCTIONAL_VIEWPORTS,
  LAYOUT_VIEWPORTS,
  TRANSITIONS,
  expectedRows,
  isForbiddenWrite,
  isLaneRequest,
  promptFor,
  summarise,
} from "./browser-dev-editor-dirty-transitions.mjs";

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

// An accepted discard must DISCARD. Hiding the browser asked "Discard the
// unsaved preview changes on this page?", took the page away on OK — and kept
// `tagPreviewChanges`, the picked element and its words. Reproduced in a real
// browser on 2026-09-03 (issue #19): the very next Back asked the same question
// about work that no longer existed, a reload was blocked by `beforeunload`
// for the same phantom, and the Element panel kept showing an element on a
// page that was gone.
// "This workspace" in the project switcher turns a project into the portal
// target with no client, scope or template change — so the design load, keyed
// on those alone, never ran. Reproduced in a real browser on 2026-09-03: the
// studio arrived with an empty notice, no document, and the inspector telling
// the portal that "these tools apply to an Aqua-hosted portal".
test("arriving at the portal target from a project loads its design", () => {
  assert.match(DEV_EDITOR, /fetch\(`\/api\/portal\/client-portal-design\?[\s\S]*?\}, \[clientId, portalTarget, scope, selectedClient\?\.name, selectedTemplate\?\.name, templateId\]\);/);
});

test("hiding the browser after an accepted discard forgets the page's preview state", () => {
  const toggle = DEV_EDITOR.match(/function toggleBrowser\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
  assert.match(toggle, /const opening = !showBrowser;\s*(?:\/\/[^\n]*\n\s*)*if \(!opening\) discardTagPreview\(\);/, "an accepted hide must forget the page before the frame unmounts");
  const discard = DEV_EDITOR.match(/function discardTagPreview\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
  for (const line of [
    "setTagPreviewChanges({});",
    "tagElementRef.current = null;",
    "setTagElement(null);",
    'setWordsDraft("");',
    'setWordsOriginal("");',
    'setTagBridge("idle");',
  ]) {
    assert.ok(discard.includes(line), `discardTagPreview must ${line}`);
  }
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

// ─── The browser gate's matrix, held without a browser ───────────────────────
//
// `browser-dev-editor-dirty-transitions.mjs` drives the destructive-transition
// contract (issue #19) in a real Chromium. What can be pinned here is that its
// matrix is the whole contract rather than a convenient subset, that a row it
// skips must say why, that the sentence it expects in a dialog is the editor's
// own, and that its guards refuse the two things it must never do — write to
// the repository, or let a request leave the lane.

test("the browser gate drives every transition the contract names, on both targets", () => {
  const ids = new Set(TRANSITIONS.map(t => t.id));
  for (const required of ["back", "all-projects", "project-switch", "workspace-switch", "mode-visual", "mode-assist", "surface", "scope", "client", "template", "lifecycle", "page", "browser-hide", "split", "refresh", "reload"]) {
    assert.ok(ids.has(required), `the matrix must drive ${required}`);
  }
  const kinds = new Set(TRANSITIONS.map(t => t.dirty));
  for (const kind of ["portal-draft", "seo-fields", "repository-files:1", "repository-files:2", "preview-changes"]) {
    assert.ok(kinds.has(kind), `${kind} must be exercised independently`);
  }
  assert.deepEqual(FUNCTIONAL_VIEWPORTS.map(v => `${v.width}x${v.height}`), ["390x844", "1280x800"]);
  assert.deepEqual(LAYOUT_VIEWPORTS.map(v => v.id), ["375x812", "390x844", "812x375", "768x1024", "1024x768", "1280x800", "1920x1080"]);
});

test("a row the gate does not drive carries its reason, and a run that skipped one is red", () => {
  const rows = expectedRows();
  assert.equal(rows.length, TRANSITIONS.length * FUNCTIONAL_VIEWPORTS.length);
  for (const row of rows.filter(r => !r.applicable)) {
    assert.ok(row.naReason, `${row.key} is skipped without a reason`);
  }
  const driven = rows.filter(r => r.applicable);
  assert.ok(driven.length >= 30, `only ${driven.length} rows are driven`);
  const full = rows.map(row => ({ key: row.key, status: row.applicable ? "pass" : "na", scenario: "x", step: "y", detail: "" }));
  assert.equal(summarise(full, rows).ok, true);
  const short = summarise(full.slice(1), rows);
  assert.equal(short.ok, false, "one undriven row must make the run red");
  assert.deepEqual(short.missing, [rows[0].key]);
  const skippedApplicable = summarise(full.map((r, i) => (i === 0 ? { ...r, status: "na" } : r)), rows);
  assert.equal(skippedApplicable.ok, true, "an N/A verdict is still an accounted row");
  const failed = summarise(full.map((r, i) => (i === 0 ? { ...r, status: "fail" } : r)), rows);
  assert.equal(failed.ok, false);
});

test("the gate expects the editor's own discard sentences", () => {
  assert.equal(promptFor("portal-draft"), editorDiscardPrompt({ portalDraft: true }));
  assert.equal(promptFor("seo-fields"), editorDiscardPrompt({ seoFields: true }));
  assert.equal(promptFor("preview-changes"), editorDiscardPrompt({ pagePreview: true }));
  assert.equal(promptFor("repository-files:2"), "Discard 2 unsaved repository files?");
  assert.throws(() => promptFor("something-else"));
});

test("the gate's guards refuse repository writes and anything that leaves the lane", () => {
  const files = "http://localhost:3183/api/portal/site-editor/files";
  const write = "http://localhost:3183/api/portal/dev/repo-write";
  assert.equal(isForbiddenWrite({ method: "POST", url: files, body: "{}" }), true);
  assert.equal(isForbiddenWrite({ method: "GET", url: files }), false, "reading a file is how the buffer is made");
  assert.equal(isForbiddenWrite({ method: "POST", url: write, body: JSON.stringify({ action: "save" }) }), true);
  assert.equal(isForbiddenWrite({ method: "POST", url: write, body: JSON.stringify({ action: "publish" }) }), true);
  assert.equal(isForbiddenWrite({ method: "POST", url: write, body: JSON.stringify({ action: "insert-targets" }) }), false, "the navigator's route read writes nothing");
  assert.equal(isForbiddenWrite({ method: "POST", url: write, body: "not json" }), true, "an unreadable body is refused, never assumed harmless");
  assert.equal(isLaneRequest("http://127.0.0.1:3183/api/x", "http://localhost:3183"), true);
  assert.equal(isLaneRequest("http://localhost:3183/api/x", "http://127.0.0.1:3183"), true);
  assert.equal(isLaneRequest("http://localhost:3184/api/x", "http://localhost:3183"), false, "another port is another server");
  assert.equal(isLaneRequest("https://api.openai.com/v1/chat/completions", "http://localhost:3183"), false);
  assert.equal(isLaneRequest("https://api.anthropic.com/v1/messages", "http://localhost:3183"), false);
});
