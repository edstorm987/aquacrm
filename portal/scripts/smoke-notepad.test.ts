import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Notepad = typeof import("../src/server/notepad");

let storage: Storage;
let tenants: Tenants;
let notepad: Notepad;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  notepad = await import("../src/server/notepad");
});

async function fresh() {
  await storage.ensureHydrated();
  await storage.reset();
  return tenants.createAgency({ name: "Notepad Test", slug: "notepad-test" });
}

describe("personal notepad persistence", () => {
  it("organises, saves, archives, trashes and restores private notes", async () => {
    const agency = await fresh();
    const userId = "founder_note_test";
    const folder = notepad.createNotepadFolder(agency.id, userId, { name: "Ideas", color: "#9a6a16" });
    const note = notepad.createNotepadNote(agency.id, userId, {
      title: "Campaign thought",
      body: "Test the referral offer with existing clients.",
      folderId: folder.id,
      tags: ["Growth", "growth", "Clients"],
      pinned: true,
    });

    assert.equal(note.folderId, folder.id);
    assert.deepEqual(note.tags, ["Growth", "Clients"]);
    assert.equal(note.pinned, true);
    assert.equal(notepad.listNotepadNotes(agency.id, userId).length, 1);
    assert.equal(notepad.listNotepadNotes(agency.id, "another_user").length, 0);
    assert.equal(notepad.updateNotepadNote(agency.id, "another_user", note.id, { pinned: true }), null);

    const pinned = notepad.updateNotepadNote(agency.id, userId, note.id, { pinned: true, status: "archived" });
    assert.equal(pinned?.pinned, true);
    assert.equal(pinned?.status, "archived");
    assert.ok(pinned?.archivedAt);
    const trashed = notepad.updateNotepadNote(agency.id, userId, note.id, { status: "trashed" });
    assert.equal(trashed?.status, "trashed");
    assert.ok(trashed?.trashedAt);
    assert.equal(notepad.permanentlyDeleteNotepadNote(agency.id, userId, note.id), true);
    assert.equal(notepad.listNotepadNotes(agency.id, userId).length, 0);
  });

  it("unfiles notes when a folder is deleted and protects agency boundaries", async () => {
    const agency = await fresh();
    const otherAgency = tenants.createAgency({ name: "Other", slug: "notepad-other" });
    const userId = "folder_owner";
    const folder = notepad.createNotepadFolder(agency.id, userId, { name: "Planning" });
    const note = notepad.createNotepadNote(agency.id, userId, { title: "Week plan", folderId: folder.id });

    assert.equal(notepad.deleteNotepadFolder(otherAgency.id, userId, folder.id), false);
    assert.equal(notepad.deleteNotepadFolder(agency.id, userId, folder.id), true);
    assert.equal(notepad.listNotepadFolders(agency.id, userId).length, 0);
    assert.equal(notepad.listNotepadNotes(agency.id, userId)[0]?.id, note.id);
    assert.equal(notepad.listNotepadNotes(agency.id, userId)[0]?.folderId, undefined);
    assert.equal(notepad.permanentlyDeleteNotepadNote(agency.id, userId, note.id), false);
  });
});

describe("personal notepad surface", () => {
  it("ships a searchable autosaving workspace with recoverable deletion", async () => {
    const [workspace, page, route, sidebar, search, profile, quickNote, dashboard] = await Promise.all([
      readFile(new URL("../src/app/portal/agency/notepad/_NotepadWorkspace.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/notepad/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/portal/notepad/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/lib/chrome/sidebarLayout.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/portal/search/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/components/chrome/ProfileMenu.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/chrome/QuickNoteWindow.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/page.tsx", import.meta.url), "utf8"),
    ]);

    for (const expected of ["Quick capture", "Search notes", "Pinned", "Archive", "Trash", "Add tags", "Saving", "Delete forever"]) {
      assert.match(workspace, new RegExp(expected));
    }
    assert.match(workspace, /setTimeout\(\(\) =>/);
    assert.match(workspace, /action: "update-note"/);
    assert.match(workspace, /action: "delete-folder"/);
    assert.match(page, /listNotepadNotes/);
    assert.match(route, /flushPendingWrites/);
    assert.doesNotMatch(sidebar, /id: "notepad"/);
    assert.match(profile, /Quick note/);
    assert.match(quickNote, /data-testid="quick-note-window"/);
    assert.match(quickNote, /pinned: sticky/);
    assert.match(quickNote, /Page:/);
    assert.match(dashboard, /href="\/portal\/agency\/notepad"/);
    assert.match(dashboard, /href="\/portal\/agency\/calendar"/);
    assert.match(search, /category: "Note"/);
    assert.match(search, /\/portal\/agency\/notepad\?note=/);
  });
});
