import "server-only";

import crypto from "node:crypto";

import { getState, mutate } from "./storage";
import type { NotepadFolder, NotepadNote, NotepadNoteStatus } from "./types";

const FOLDER_COLORS = new Set(["#087f8c", "#9a6a16", "#a74478", "#4f46e5", "#187554", "#b95d12", "#5c6675"]);

export interface CreateNotepadNoteInput {
  title?: string;
  body?: string;
  folderId?: string;
  tags?: string[];
}

export interface UpdateNotepadNoteInput {
  title?: string;
  body?: string;
  folderId?: string | null;
  tags?: string[];
  pinned?: boolean;
  status?: NotepadNoteStatus;
}

export function listNotepadFolders(agencyId: string, userId: string): NotepadFolder[] {
  return Object.values(getState().notepadFolders)
    .filter(folder => folder.agencyId === agencyId && folder.ownerUserId === userId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function listNotepadNotes(agencyId: string, userId: string): NotepadNote[] {
  return Object.values(getState().notepadNotes)
    .filter(note => note.agencyId === agencyId && note.ownerUserId === userId)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

export function createNotepadFolder(agencyId: string, userId: string, input: { name?: string; color?: string }): NotepadFolder {
  const name = cleanTitle(input.name, 80);
  if (!name) throw new Error("Folder name required.");
  const duplicate = listNotepadFolders(agencyId, userId).some(folder => folder.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  if (duplicate) throw new Error("A folder with that name already exists.");
  const now = Date.now();
  const folder: NotepadFolder = {
    id: `note_folder_${crypto.randomBytes(8).toString("hex")}`,
    agencyId,
    ownerUserId: userId,
    name,
    color: validColor(input.color),
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.notepadFolders[folder.id] = folder; });
  return folder;
}

export function updateNotepadFolder(agencyId: string, userId: string, folderId: string, input: { name?: string; color?: string }): NotepadFolder | null {
  const existing = ownFolder(agencyId, userId, folderId);
  if (!existing) return null;
  const name = input.name === undefined ? existing.name : cleanTitle(input.name, 80);
  if (!name) throw new Error("Folder name required.");
  const duplicate = listNotepadFolders(agencyId, userId).some(folder => folder.id !== folderId && folder.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  if (duplicate) throw new Error("A folder with that name already exists.");
  const folder = { ...existing, name, color: input.color === undefined ? existing.color : validColor(input.color), updatedAt: Date.now() };
  mutate(state => { state.notepadFolders[folder.id] = folder; });
  return folder;
}

export function deleteNotepadFolder(agencyId: string, userId: string, folderId: string): boolean {
  if (!ownFolder(agencyId, userId, folderId)) return false;
  const now = Date.now();
  mutate(state => {
    delete state.notepadFolders[folderId];
    for (const note of Object.values(state.notepadNotes)) {
      if (note.agencyId === agencyId && note.ownerUserId === userId && note.folderId === folderId) {
        state.notepadNotes[note.id] = { ...note, folderId: undefined, updatedAt: now };
      }
    }
  });
  return true;
}

export function createNotepadNote(agencyId: string, userId: string, input: CreateNotepadNoteInput = {}): NotepadNote {
  const now = Date.now();
  const note: NotepadNote = {
    id: `note_${crypto.randomBytes(8).toString("hex")}`,
    agencyId,
    ownerUserId: userId,
    folderId: validFolderId(agencyId, userId, input.folderId),
    title: cleanTitle(input.title, 180) || "Untitled note",
    body: cleanBody(input.body),
    tags: cleanTags(input.tags),
    pinned: false,
    status: "active",
    visibility: "private",
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.notepadNotes[note.id] = note; });
  return note;
}

export function updateNotepadNote(agencyId: string, userId: string, noteId: string, patch: UpdateNotepadNoteInput): NotepadNote | null {
  const existing = ownNote(agencyId, userId, noteId);
  if (!existing) return null;
  const status = validStatus(patch.status) ?? existing.status;
  const now = Date.now();
  const note: NotepadNote = {
    ...existing,
    title: patch.title === undefined ? existing.title : cleanTitle(patch.title, 180) || "Untitled note",
    body: patch.body === undefined ? existing.body : cleanBody(patch.body),
    folderId: patch.folderId === undefined ? existing.folderId : validFolderId(agencyId, userId, patch.folderId ?? undefined),
    tags: patch.tags === undefined ? existing.tags : cleanTags(patch.tags),
    pinned: patch.pinned ?? existing.pinned,
    status,
    updatedAt: now,
    archivedAt: status === "archived" ? existing.archivedAt ?? now : undefined,
    trashedAt: status === "trashed" ? existing.trashedAt ?? now : undefined,
  };
  mutate(state => { state.notepadNotes[note.id] = note; });
  return note;
}

export function permanentlyDeleteNotepadNote(agencyId: string, userId: string, noteId: string): boolean {
  const existing = ownNote(agencyId, userId, noteId);
  if (!existing || existing.status !== "trashed") return false;
  mutate(state => { delete state.notepadNotes[noteId]; });
  return true;
}

function ownFolder(agencyId: string, userId: string, folderId: string): NotepadFolder | null {
  const folder = getState().notepadFolders[folderId];
  return folder?.agencyId === agencyId && folder.ownerUserId === userId ? folder : null;
}

function ownNote(agencyId: string, userId: string, noteId: string): NotepadNote | null {
  const note = getState().notepadNotes[noteId];
  return note?.agencyId === agencyId && note.ownerUserId === userId ? note : null;
}

function validFolderId(agencyId: string, userId: string, folderId?: string): string | undefined {
  return folderId && ownFolder(agencyId, userId, folderId) ? folderId : undefined;
}

function cleanTitle(value: string | undefined, limit: number): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function cleanBody(value?: string): string {
  return (value ?? "").replace(/\r\n/g, "\n").slice(0, 100_000);
}

function cleanTags(values?: string[]): string[] {
  const tags = (values ?? []).map(tag => cleanTitle(tag.replace(/^#/, ""), 32)).filter(Boolean);
  return [...new Set(tags.map(tag => tag.toLocaleLowerCase()))]
    .map(lower => tags.find(tag => tag.toLocaleLowerCase() === lower)!)
    .slice(0, 12);
}

function validStatus(value?: NotepadNoteStatus): NotepadNoteStatus | undefined {
  return value === "active" || value === "archived" || value === "trashed" ? value : undefined;
}

function validColor(value?: string): string {
  return value && FOLDER_COLORS.has(value) ? value : "#087f8c";
}
