import "server-only";

import crypto from "node:crypto";
import { getState, mutate } from "@/server/storage";
import { logActivity } from "@/server/activity";
import type { SopDocument } from "@/server/types";
import { pendingPrivateObjectDeletionSnapshots } from "@/lib/server/privateObjectLifecycle";
import { assertSopHasNoDependants } from "@/engines/sop/server/sopDependencies";
// Keep the server SOP store on the element engine's leaf modules. Importing the
// public barrel also exposes `websiteElements`, whose on-demand vocabulary
// reaches the website editor's 78 client block renderers. Next registers those
// client references even when this server module is reached through a dynamic
// station import, which made the default agency page ship the editor.
import type { Block, BlockTreeJSON } from "@/engines/editor/elements/block";
import { getElementDefinition } from "@/engines/editor/elements/registry";
import { elementSchema, validateElementProps } from "@/engines/editor/elements/schema";

export function listSops(agencyId: string): SopDocument[] {
  return Object.values(getState().sops)
    .filter(sop => sop.agencyId === agencyId)
    .map(normalizeSop)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** The SOP library's retry surface only; assignment/search consumers stay live-only. */
export function listSopsWithPendingDeletion(agencyId: string): SopDocument[] {
  const stored = listSops(agencyId);
  const existingIds = new Set(stored.map(sop => sop.id));
  const pending = pendingPrivateObjectDeletionSnapshots<SopDocument>(agencyId, "sop")
    .filter(item => !existingIds.has(item.snapshot.id))
    .map(item => normalizeSop({
      ...item.snapshot,
      tags: [],
      content: undefined,
      blocks: undefined,
      fileName: undefined,
      contentType: undefined,
      size: undefined,
      storageKey: undefined,
      deleteState: item.record.state === "delete-failed" ? "delete-failed" : "deleting",
      deleteError: item.record.error,
      deleteStartedAt: item.record.createdAt,
    }));
  return [...stored, ...pending]
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

export interface SopBlockProblem {
  /** The offending block's id, or a positional path when it has none. */
  blockId: string;
  type: string;
  key: string;
  message: string;
}

/**
 * Validate an interactive SOP's block tree by COMPOSING the element engine's
 * own validators — never re-implementing them. Structural integrity (a string
 * id, a string type, unique ids) is checked here; per-block prop legality is
 * delegated to `validateElementProps(elementSchema(def), props)`, the exact
 * check the website/portal editors use. A block whose `type` has no registered
 * definition is left to fail soft (skipped), matching how `BlockRenderer` and
 * the portal vocabulary treat unregistered types — so this never rejects a
 * legal tree merely because a runtime hasn't imported a given element library.
 */
export function validateSopBlockTree(blocks: BlockTreeJSON): SopBlockProblem[] {
  const problems: SopBlockProblem[] = [];
  const seen = new Set<string>();
  const walk = (nodes: readonly Block[], path: string): void => {
    nodes.forEach((block, index) => {
      const where = block && typeof block === "object" && typeof block.id === "string" && block.id
        ? block.id
        : `${path}[${index}]`;
      if (!block || typeof block !== "object") {
        problems.push({ blockId: where, type: "?", key: "_", message: "block must be an object" });
        return;
      }
      const type = typeof block.type === "string" ? block.type : "?";
      if (typeof block.id !== "string" || !block.id) {
        problems.push({ blockId: where, type, key: "id", message: "block requires a non-empty string id" });
      } else if (seen.has(block.id)) {
        problems.push({ blockId: where, type, key: "id", message: "duplicate block id" });
      } else {
        seen.add(block.id);
      }
      if (typeof block.type !== "string" || !block.type) {
        problems.push({ blockId: where, type, key: "type", message: "block requires a non-empty string type" });
      }
      if (block.props !== undefined && (typeof block.props !== "object" || block.props === null || Array.isArray(block.props))) {
        problems.push({ blockId: where, type, key: "props", message: "block props must be an object" });
      }
      const def = typeof block.type === "string" && block.type ? getElementDefinition(block.type) : undefined;
      if (def) {
        const props = (block.props && typeof block.props === "object" && !Array.isArray(block.props))
          ? block.props as Record<string, unknown>
          : {};
        for (const problem of validateElementProps(elementSchema(def), props)) {
          problems.push({ blockId: where, type: block.type as string, key: problem.key, message: problem.message });
        }
      }
      if (Array.isArray(block.children) && block.children.length) {
        walk(block.children, `${where}.children`);
      }
    });
  };
  walk(blocks, "root");
  return problems;
}

function assertValidSopBlockTree(blocks: unknown): BlockTreeJSON {
  if (!Array.isArray(blocks)) throw new Error("Interactive SOP requires a block tree (array of blocks).");
  const problems = validateSopBlockTree(blocks as BlockTreeJSON);
  if (problems.length) {
    const summary = problems.slice(0, 5).map(problem => `${problem.blockId} (${problem.key}) ${problem.message}`).join("; ");
    throw new Error(`Interactive SOP has invalid blocks: ${summary}${problems.length > 5 ? ` (+${problems.length - 5} more)` : ""}`);
  }
  return blocks as BlockTreeJSON;
}

export function createInteractiveSop(input: { agencyId: string; title: string; blocks: BlockTreeJSON; category?: string; categories?: string[]; tags?: string[]; resourceType?: SopDocument["resourceType"]; actorUserId: string }): SopDocument {
  const title = input.title.trim().slice(0, 240);
  if (!title) throw new Error("SOP title required.");
  const blocks = assertValidSopBlockTree(input.blocks);
  const now = Date.now();
  const assignment = cleanCategoryAssignment(input.category, input.categories);
  const sop: SopDocument = {
    id: `sop_${crypto.randomBytes(8).toString("hex")}`,
    agencyId: input.agencyId,
    title,
    blocks,
    category: assignment.primary,
    categories: assignment.all,
    tags: cleanTags(input.tags),
    kind: "interactive",
    resourceType: input.resourceType ?? "procedure",
    createdBy: input.actorUserId,
    updatedBy: input.actorUserId,
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.sops[sop.id] = sop; });
  logActivity({ agencyId: input.agencyId, actorUserId: input.actorUserId, category: "system", action: "sop.created", message: `Added interactive SOP “${sop.title}”.`, metadata: { sopId: sop.id, kind: "interactive" } });
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

/** Roll back only the SOP/audit created by a failed upload transaction. */
export function rollbackFileSopUpload(agencyId: string, id: string): boolean {
  let removed = false;
  mutate(state => {
    const sop = state.sops[id];
    if (!sop || sop.agencyId !== agencyId) return;
    delete state.sops[id];
    state.activity = state.activity.filter(entry => !(
      entry.agencyId === agencyId
      && entry.action === "sop.uploaded"
      && entry.metadata?.sopId === id
    ));
    removed = true;
  });
  return removed;
}

export function updateSop(agencyId: string, id: string, patch: { title?: string; content?: string; blocks?: BlockTreeJSON; category?: string; categories?: string[]; tags?: string[] }, actorUserId: string): SopDocument | null {
  if (!getState().sops[id]) return null;
  const existing = getSop(agencyId, id);
  if (!existing) return null;
  const assignment = patch.category !== undefined || patch.categories !== undefined
    ? cleanCategoryAssignment(patch.category ?? existing.category, patch.categories ?? existing.categories)
    : { primary: existing.category, all: existing.categories ?? [] };
  const blocks = existing.kind === "interactive" && patch.blocks !== undefined
    ? assertValidSopBlockTree(patch.blocks)
    : existing.blocks;
  const updated: SopDocument = {
    ...existing,
    title: patch.title?.trim().slice(0, 240) || existing.title,
    content: existing.kind === "written" && patch.content !== undefined ? patch.content.trim().slice(0, 100_000) : existing.content,
    blocks,
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
  let existing: SopDocument | null = null;
  mutate(state => {
    const current = state.sops[id];
    if (!current || current.agencyId !== agencyId) return;
    assertSopHasNoDependants(state, agencyId, id);
    existing = current;
    delete state.sops[id];
  });
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
    resourceType: sop.resourceType ?? (sop.kind === "file" ? "document" : "procedure"),
  };
}
