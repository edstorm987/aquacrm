import "server-only";

import crypto from "node:crypto";
import { getState, mutate } from "./storage";
import { logActivity } from "./activity";
import type { SopDocument } from "./types";

export function listSops(agencyId: string): SopDocument[] {
  return Object.values(getState().sops)
    .filter(sop => sop.agencyId === agencyId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSop(agencyId: string, id: string): SopDocument | null {
  const sop = getState().sops[id];
  return sop?.agencyId === agencyId ? sop : null;
}

export function createWrittenSop(input: { agencyId: string; title: string; content: string; category?: string; tags?: string[]; actorUserId: string }): SopDocument {
  const title = input.title.trim().slice(0, 240);
  if (!title) throw new Error("SOP title required.");
  const now = Date.now();
  const sop: SopDocument = {
    id: `sop_${crypto.randomBytes(8).toString("hex")}`,
    agencyId: input.agencyId,
    title,
    content: input.content.trim().slice(0, 100_000),
    category: input.category?.trim().slice(0, 80) || undefined,
    tags: cleanTags(input.tags),
    kind: "written",
    createdBy: input.actorUserId,
    updatedBy: input.actorUserId,
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.sops[sop.id] = sop; });
  logActivity({ agencyId: input.agencyId, actorUserId: input.actorUserId, category: "system", action: "sop.created", message: `Added SOP “${sop.title}”.`, metadata: { sopId: sop.id } });
  return sop;
}

export function createFileSop(input: Omit<SopDocument, "createdAt" | "updatedAt" | "updatedBy" | "kind" | "tags"> & { tags?: string[] }): SopDocument {
  const now = Date.now();
  const sop: SopDocument = { ...input, kind: "file", tags: cleanTags(input.tags), updatedBy: input.createdBy, createdAt: now, updatedAt: now };
  mutate(state => { state.sops[sop.id] = sop; });
  logActivity({ agencyId: input.agencyId, actorUserId: input.createdBy, category: "files", action: "sop.uploaded", message: `Uploaded SOP “${sop.title}”.`, metadata: { sopId: sop.id, size: sop.size } });
  return sop;
}

export function updateSop(agencyId: string, id: string, patch: { title?: string; content?: string; category?: string; tags?: string[] }, actorUserId: string): SopDocument | null {
  const existing = getSop(agencyId, id);
  if (!existing) return null;
  const updated: SopDocument = {
    ...existing,
    title: patch.title?.trim().slice(0, 240) || existing.title,
    content: existing.kind === "written" && patch.content !== undefined ? patch.content.trim().slice(0, 100_000) : existing.content,
    category: patch.category !== undefined ? patch.category.trim().slice(0, 80) || undefined : existing.category,
    tags: patch.tags ? cleanTags(patch.tags) : existing.tags,
    updatedBy: actorUserId,
    updatedAt: Date.now(),
  };
  mutate(state => { state.sops[id] = updated; });
  return updated;
}

export function deleteSopRecord(agencyId: string, id: string): SopDocument | null {
  const existing = getSop(agencyId, id);
  if (!existing) return null;
  mutate(state => { delete state.sops[id]; });
  return existing;
}

function cleanTags(tags?: string[]): string[] {
  return [...new Set((tags ?? []).map(tag => tag.trim().slice(0, 40)).filter(Boolean))].slice(0, 20);
}
