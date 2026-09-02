import "server-only";

import crypto from "node:crypto";
import { getState, mutate } from "@/server/storage";
import { logActivity } from "@/server/activity";
import type { SopGuide, SopGuideAudience } from "@/server/types";
import { assertSopReferencesExist } from "./sopReferences";

// ─── SOP Engine — guides ──────────────────────────────────────────────────
//
// A guide is an ordered sequence of existing SOPs (by `sopId`) plus a
// title/description and optional per-guide flags. It is composed in the SOP
// library; it is NOT a new content type. Every referenced SOP must exist and
// be owned by the same agency — validated on every write so a guide can never
// point at a SOP that isn't there (or belongs to another tenant).

const VALID_AUDIENCE = new Set<SopGuideAudience>(["staff", "founder", "freelancer", "client"]);

export function listSopGuides(agencyId: string): SopGuide[] {
  return Object.values(getState().sopGuides)
    .filter(guide => guide.agencyId === agencyId)
    .map(normalizeGuide)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSopGuide(agencyId: string, id: string): SopGuide | null {
  const guide = getState().sopGuides[id];
  return guide?.agencyId === agencyId ? normalizeGuide(guide) : null;
}

export interface CreateSopGuideInput {
  agencyId: string;
  title: string;
  description?: string;
  sopIds: string[];
  quizEnabled?: boolean;
  audience?: SopGuideAudience[];
  actorUserId: string;
}

export function createSopGuide(input: CreateSopGuideInput): SopGuide {
  const title = input.title.trim().slice(0, 240);
  if (!title) throw new Error("Guide title required.");
  if (!Array.isArray(input.sopIds)) throw new Error("Guide requires a list of SOP ids.");
  const now = Date.now();
  let guide!: SopGuide;
  mutate(state => {
    guide = {
      id: `sopguide_${crypto.randomBytes(8).toString("hex")}`,
      agencyId: input.agencyId,
      title,
      description: cleanDescription(input.description),
      sopIds: assertSopReferencesExist(state, input.agencyId, input.sopIds, "sopGuide.sopIds"),
      quizEnabled: input.quizEnabled === true ? true : undefined,
      audience: cleanAudience(input.audience),
      createdBy: input.actorUserId,
      updatedBy: input.actorUserId,
      createdAt: now,
      updatedAt: now,
    };
    state.sopGuides[guide.id] = guide;
  });
  logActivity({
    agencyId: input.agencyId,
    actorUserId: input.actorUserId,
    category: "system",
    action: "sop.guide.created",
    message: `Created SOP guide “${guide.title}”.`,
    metadata: { guideId: guide.id, sopCount: guide.sopIds.length },
  });
  return guide;
}

export interface UpdateSopGuidePatch {
  title?: string;
  description?: string;
  /** Full ordered replacement — reorder / add / remove all go through here. */
  sopIds?: string[];
  quizEnabled?: boolean;
  audience?: SopGuideAudience[];
}

export function updateSopGuide(
  agencyId: string,
  id: string,
  patch: UpdateSopGuidePatch,
  actorUserId: string,
): SopGuide | null {
  if (patch.sopIds !== undefined && !Array.isArray(patch.sopIds)) {
    throw new Error("Guide requires a list of SOP ids.");
  }
  let updated: SopGuide | null = null;
  mutate(state => {
    const existing = state.sopGuides[id];
    if (!existing || existing.agencyId !== agencyId) return;
    const sopIds = assertSopReferencesExist(
      state,
      agencyId,
      patch.sopIds !== undefined ? patch.sopIds : existing.sopIds,
      "sopGuide.sopIds",
    );
    updated = {
      ...existing,
      title: patch.title !== undefined ? (patch.title.trim().slice(0, 240) || existing.title) : existing.title,
      description: patch.description !== undefined ? cleanDescription(patch.description) : existing.description,
      sopIds,
      quizEnabled: patch.quizEnabled !== undefined ? (patch.quizEnabled === true ? true : undefined) : existing.quizEnabled,
      audience: patch.audience !== undefined ? cleanAudience(patch.audience) : existing.audience,
      updatedBy: actorUserId,
      updatedAt: Date.now(),
    };
    state.sopGuides[id] = updated;
  });
  return updated;
}

export function deleteSopGuide(agencyId: string, id: string): SopGuide | null {
  const existing = getSopGuide(agencyId, id);
  if (!existing) return null;
  mutate(state => { delete state.sopGuides[id]; });
  logActivity({
    agencyId,
    actorUserId: existing.updatedBy,
    category: "system",
    action: "sop.guide.deleted",
    message: `Deleted SOP guide “${existing.title}”.`,
    metadata: { guideId: id },
  });
  return existing;
}

function cleanDescription(description?: string): string | undefined {
  const clean = description?.trim().slice(0, 2_000);
  return clean || undefined;
}

function cleanAudience(audience?: SopGuideAudience[]): SopGuideAudience[] | undefined {
  if (audience === undefined) return undefined;
  const result = [...new Set(audience.filter(item => VALID_AUDIENCE.has(item)))];
  return result.length ? result : undefined;
}

/** Defensive read-side normalisation so a hand-edited blob can't surface a
 *  malformed guide (non-array sopIds, stray audience values). */
function normalizeGuide(guide: SopGuide): SopGuide {
  return {
    ...guide,
    sopIds: Array.isArray(guide.sopIds) ? guide.sopIds.filter(id => typeof id === "string" && id) : [],
    audience: cleanAudience(guide.audience),
    quizEnabled: guide.quizEnabled === true ? true : undefined,
  };
}
