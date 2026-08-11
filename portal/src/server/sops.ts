import "server-only";

import crypto from "node:crypto";
import { getState, mutate } from "./storage";
import { logActivity } from "./activity";
import type { SopDocument } from "./types";

export function listSops(agencyId: string): SopDocument[] {
  return Object.values(getState().sops)
    .filter(sop => sop.agencyId === agencyId)
    .map(normalizeSop)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function listSopCategories(agencyId: string): string[] {
  const stored = getState().agencySettings[agencyId]?.sopCategories ?? [];
  const fromSops = Object.values(getState().sops)
    .filter(sop => sop.agencyId === agencyId)
    .flatMap(sop => [...(sop.categories ?? []), ...(sop.category ? [sop.category] : [])]);
  return cleanCategories([...stored, ...fromSops]);
}

export function createSopCategory(agencyId: string, category: string, actorUserId: string): string {
  const cleanCategory = category.trim().slice(0, 80);
  if (!cleanCategory) throw new Error("Category name required.");
  const categories = cleanCategories([...listSopCategories(agencyId), cleanCategory]);
  mutate(state => {
    const existing = state.agencySettings[agencyId];
    state.agencySettings[agencyId] = {
      ...(existing ?? {
        agencyId,
        timezone: "Europe/London",
        defaultCurrency: "GBP",
        defaultTaxRatePercent: 0,
        defaultPaymentTermsDays: 7,
        invoicePrefix: "MM",
        defaultClientStage: "aqua-epic-intro",
        createPortalByDefault: false,
        portalAccessDays: 7,
        notifications: {
          overdueTasks: true,
          outages: true,
          supportRequests: true,
          meetingReminders: true,
          financeAlerts: true,
          marketingAlerts: true,
          clientAlerts: true,
          contractAlerts: true,
          complianceAlerts: true,
          developmentAlerts: true,
          digest: "daily",
        },
        updatedAt: 0,
      }),
      sopCategories: categories,
      updatedAt: Date.now(),
    };
  });
  logActivity({ agencyId, actorUserId, category: "system", action: "sop.category.created", message: `Created SOP category “${cleanCategory}”.`, metadata: { category: cleanCategory } });
  return cleanCategory;
}

export function getSop(agencyId: string, id: string): SopDocument | null {
  const sop = getState().sops[id];
  return sop?.agencyId === agencyId ? normalizeSop(sop) : null;
}

export function createWrittenSop(input: { agencyId: string; title: string; content: string; category?: string; categories?: string[]; tags?: string[]; actorUserId: string }): SopDocument {
  const title = input.title.trim().slice(0, 240);
  if (!title) throw new Error("SOP title required.");
  const now = Date.now();
  const assignment = cleanCategoryAssignment(input.category, input.categories);
  const sop: SopDocument = {
    id: `sop_${crypto.randomBytes(8).toString("hex")}`,
    agencyId: input.agencyId,
    title,
    content: input.content.trim().slice(0, 100_000),
    category: assignment.primary,
    categories: assignment.all,
    tags: cleanTags(input.tags),
    kind: "written",
    resourceType: "procedure",
    createdBy: input.actorUserId,
    updatedBy: input.actorUserId,
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.sops[sop.id] = sop; });
  logActivity({ agencyId: input.agencyId, actorUserId: input.actorUserId, category: "system", action: "sop.created", message: `Added SOP “${sop.title}”.`, metadata: { sopId: sop.id } });
  return sop;
}

export function createFileSop(input: Omit<SopDocument, "createdAt" | "updatedAt" | "updatedBy" | "kind" | "tags" | "categories"> & { tags?: string[]; categories?: string[] }): SopDocument {
  const now = Date.now();
  const assignment = cleanCategoryAssignment(input.category, input.categories);
  const sop: SopDocument = {
    ...input,
    category: assignment.primary,
    categories: assignment.all,
    kind: "file",
    tags: cleanTags(input.tags),
    updatedBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.sops[sop.id] = sop; });
  logActivity({ agencyId: input.agencyId, actorUserId: input.createdBy, category: "files", action: "sop.uploaded", message: `Uploaded SOP “${sop.title}”.`, metadata: { sopId: sop.id, size: sop.size } });
  return sop;
}

export function updateSop(agencyId: string, id: string, patch: { title?: string; content?: string; category?: string; categories?: string[]; tags?: string[] }, actorUserId: string): SopDocument | null {
  const existing = getSop(agencyId, id);
  if (!existing) return null;
  const assignment = patch.category !== undefined || patch.categories !== undefined
    ? cleanCategoryAssignment(patch.category ?? existing.category, patch.categories ?? existing.categories)
    : { primary: existing.category, all: existing.categories ?? [] };
  const updated: SopDocument = {
    ...existing,
    title: patch.title?.trim().slice(0, 240) || existing.title,
    content: existing.kind === "written" && patch.content !== undefined ? patch.content.trim().slice(0, 100_000) : existing.content,
    category: assignment.primary,
    categories: assignment.all,
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

export interface DeleteSopCategoryResult {
  category: string;
  replacementCategory?: string;
  affectedSopCount: number;
  updatedSops: SopDocument[];
}

export function deleteSopCategory(
  agencyId: string,
  category: string,
  replacementCategory: string | undefined,
  actorUserId: string,
): DeleteSopCategoryResult | null {
  const existingCategories = listSopCategories(agencyId);
  const source = existingCategories.find(item => item.toLowerCase() === category.trim().toLowerCase());
  if (!source) return null;
  const replacement = replacementCategory?.trim()
    ? existingCategories.find(item => item.toLowerCase() === replacementCategory.trim().toLowerCase())
    : undefined;
  if (replacementCategory?.trim() && !replacement) throw new Error("Replacement category not found.");
  if (replacement?.toLowerCase() === source.toLowerCase()) throw new Error("Choose a different replacement category.");

  const changedIds: string[] = [];
  const sourceKey = source.toLowerCase();
  const now = Date.now();
  mutate(state => {
    const settings = state.agencySettings[agencyId];
    if (settings) {
      settings.sopCategories = cleanCategories((settings.sopCategories ?? []).filter(item => item.toLowerCase() !== sourceKey));
      settings.updatedAt = now;
    }

    for (const [id, rawSop] of Object.entries(state.sops)) {
      if (rawSop.agencyId !== agencyId) continue;
      const sop = normalizeSop(rawSop);
      if (!(sop.categories ?? []).some(item => item.toLowerCase() === sourceKey)) continue;
      const remaining = (sop.categories ?? []).filter(item => item.toLowerCase() !== sourceKey);
      const categories = cleanCategories(replacement ? [...remaining, replacement] : remaining);
      const primary = sop.category?.toLowerCase() === sourceKey
        ? replacement ?? categories[0]
        : sop.category;
      state.sops[id] = {
        ...sop,
        category: primary,
        categories,
        updatedBy: actorUserId,
        updatedAt: now,
      };
      changedIds.push(id);
    }

    for (const [id, product] of Object.entries(state.agencyProducts)) {
      if (product.agencyId !== agencyId || !(product.sopCategories ?? []).some(item => item.toLowerCase() === sourceKey)) continue;
      const remaining = (product.sopCategories ?? []).filter(item => item.toLowerCase() !== sourceKey);
      state.agencyProducts[id] = {
        ...product,
        sopCategories: cleanCategories(replacement ? [...remaining, replacement] : remaining),
        updatedAt: now,
      };
    }
  });

  const updatedSops = changedIds.map(id => getSop(agencyId, id)).filter((sop): sop is SopDocument => Boolean(sop));
  logActivity({
    agencyId,
    actorUserId,
    category: "system",
    action: "sop.category.deleted",
    message: replacement
      ? `Deleted SOP category “${source}” and relocated ${changedIds.length} SOP${changedIds.length === 1 ? "" : "s"} to “${replacement}”.`
      : `Deleted SOP category “${source}” and removed it from ${changedIds.length} SOP${changedIds.length === 1 ? "" : "s"}.`,
    metadata: { category: source, replacementCategory: replacement, affectedSopCount: changedIds.length },
  });
  return { category: source, replacementCategory: replacement, affectedSopCount: changedIds.length, updatedSops };
}

function cleanTags(tags?: string[]): string[] {
  return [...new Set((tags ?? []).map(tag => tag.trim().slice(0, 40)).filter(Boolean))].slice(0, 20);
}

function cleanCategories(categories: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const category of categories) {
    const clean = category.trim().slice(0, 80);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result.sort((a, b) => a.localeCompare(b));
}

function cleanCategoryAssignment(primary?: string, categories?: string[]): { primary?: string; all: string[] } {
  const cleanPrimary = primary?.trim().slice(0, 80) || undefined;
  const all = cleanCategories([...(categories ?? []), ...(cleanPrimary ? [cleanPrimary] : [])]);
  const canonicalPrimary = cleanPrimary
    ? all.find(category => category.toLowerCase() === cleanPrimary.toLowerCase())
    : all[0];
  return { primary: canonicalPrimary, all };
}

function normalizeSop(sop: SopDocument): SopDocument {
  const assignment = cleanCategoryAssignment(sop.category, sop.categories);
  return {
    ...sop,
    category: assignment.primary,
    categories: assignment.all,
    tags: cleanTags(sop.tags),
    resourceType: sop.resourceType ?? (sop.kind === "written" ? "procedure" : "document"),
  };
}
