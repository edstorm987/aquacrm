// R006 — Template marketplace registry.
//
// Lists all "builtin" starter templates (login starters, Aqua
// Incubator, brand-page presets + composite pack, generic
// PAGE_TEMPLATES) plus per-agency operator-saved templates. Surfaces
// metadata used by the gallery: id, label, description, tags, an
// optional cover image URL, and a `kind` that distinguishes builtin
// templates from operator-saved ones (so the UI can show a delete
// affordance only on the latter).
//
// Operator-saved templates live under
// `t/<agencyId>/_agency/website-editor/templates/<id>` so the same
// gallery surfaces across all clients of an agency without leaking
// to other agencies.

import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { Block } from "../types/block";
import {
  PAGE_TEMPLATES,
  getTemplate,
  AQUA_INCUBATOR_TEMPLATE_IDS,
  BRAND_PAGE_TEMPLATE_IDS,
  BRAND_PAGE_PACK_ID,
} from "../components/pageTemplates";

// R016 — top-level category families. Tags are still per-template
// fine-grained labels; categories are the gallery's filter chips.
export type TemplateCategory =
  | "Incubator"
  | "Brand"
  | "Storefront"
  | "Member-area"
  | "Affiliate"
  | "Misc";

export const TEMPLATE_CATEGORIES: readonly TemplateCategory[] = [
  "Incubator", "Brand", "Storefront", "Member-area", "Affiliate", "Misc",
];

export interface TemplateEntry {
  id: string;
  label: string;
  description: string;
  tags: string[];
  category: TemplateCategory;     // R016 — category for gallery chip filter
  coverUrl?: string;
  kind: "builtin" | "saved";
  installCount?: number;          // R016 — running counter, bumped on apply
  // For saved templates only — the captured BlockTree.
  // Builtins resolve their tree via starterLoader on demand.
  blocks?: Block[];
  savedAt?: string;
  savedBy?: string;
}

interface SavedTemplateRecord {
  id: string;
  label: string;
  description: string;
  tags: string[];
  coverUrl?: string;
  blocks: Block[];
  savedAt: string;
  savedBy: string;
}

const SAVED_PREFIX = (agencyId: string) =>
  `t/${agencyId}/_agency/website-editor/templates/`;

// ─── Tag derivation for builtins ────────────────────────────────────────────
// Tags are inferred from the template id so the gallery's filter chips
// stay in sync with whatever PAGE_TEMPLATES expands to over time.

// R016 — derive category from tags. Order of checks defines priority
// when a template matches multiple categories.
export function categoryForTags(tags: string[]): TemplateCategory {
  if (tags.includes("Aqua Incubator")) return "Incubator";
  if (tags.includes("Brand Pack")) return "Brand";
  if (tags.includes("Storefront")) return "Storefront";
  if (tags.includes("Service Portal")) return "Member-area";
  if (tags.includes("Affiliate Site")) return "Affiliate";
  return "Misc";
}

function tagsForBuiltin(id: string): string[] {
  const tags: string[] = [];
  if (id.startsWith("login")) tags.push("Login");
  if (id.startsWith("aqua-incubator")) tags.push("Aqua Incubator");
  if (id.startsWith("brand-")) tags.push("Brand Pack");
  if (id === BRAND_PAGE_PACK_ID) tags.push("Brand Pack", "Composite");
  if (id === "affiliates-default") tags.push("Affiliate Site");
  if (id === "orders-default") tags.push("Service Portal");
  if (id === "account-default") tags.push("Service Portal");
  if (["homepage", "shop", "cart", "checkout", "order-confirmed"].includes(id)) tags.push("Storefront");
  if (["about", "contact", "faq", "services", "pricing", "blog"].includes(id)) tags.push("Generic page");
  if (id === "landing") tags.push("Marketing");
  if (tags.length === 0) tags.push("Generic page");
  return tags;
}

export function listBuiltinTemplates(): TemplateEntry[] {
  const out: TemplateEntry[] = [];
  for (const t of PAGE_TEMPLATES) {
    const tags = tagsForBuiltin(t.id);
    out.push({
      id: t.id,
      label: t.label,
      description: t.description,
      tags,
      category: categoryForTags(tags),
      kind: "builtin",
    });
  }
  const about = getTemplate("brand-about");
  if (about) {
    const tags = ["Brand Pack", "Composite"];
    out.push({
      id: BRAND_PAGE_PACK_ID,
      label: "Brand Pack — full bundle",
      description: "Seeds About + Story + Philosophy + Sustainability + FAQ + Contact + Lab tests as siblings.",
      tags,
      category: categoryForTags(tags),
      kind: "builtin",
    });
  }
  return out;
}

export function builtinTemplateIds(): string[] {
  return [
    ...PAGE_TEMPLATES.map(t => t.id),
    ...AQUA_INCUBATOR_TEMPLATE_IDS,
    ...BRAND_PAGE_TEMPLATE_IDS,
    BRAND_PAGE_PACK_ID,
  ];
}

// ─── Operator-saved templates (per-agency) ──────────────────────────────────

export async function listSavedTemplates(
  storage: PluginStorage,
  agencyId: string,
): Promise<TemplateEntry[]> {
  const keys = await storage.list(SAVED_PREFIX(agencyId));
  const out: TemplateEntry[] = [];
  for (const k of keys) {
    // Skip sidecar records (install-counts / featured list).
    if (k.startsWith(`${SAVED_PREFIX(agencyId)}_`)) continue;
    const rec = await storage.get<SavedTemplateRecord>(k);
    if (!rec) continue;
    out.push({
      id: rec.id,
      label: rec.label,
      description: rec.description,
      tags: rec.tags,
      category: categoryForTags(rec.tags),
      ...(rec.coverUrl ? { coverUrl: rec.coverUrl } : {}),
      kind: "saved",
      blocks: rec.blocks,
      savedAt: rec.savedAt,
      savedBy: rec.savedBy,
    });
  }
  return out.sort((a, b) => (b.savedAt ?? "").localeCompare(a.savedAt ?? ""));
}

export async function listAllTemplates(
  storage: PluginStorage,
  agencyId: string,
): Promise<TemplateEntry[]> {
  const [builtin, saved, counts] = await Promise.all([
    Promise.resolve(listBuiltinTemplates()),
    listSavedTemplates(storage, agencyId),
    listInstallCounts(storage, agencyId),
  ]);
  // Saved-first; merge install counts onto each entry.
  return [...saved, ...builtin].map(t => ({
    ...t,
    installCount: counts[t.id] ?? 0,
  }));
}

// ─── Install count tracking (R016) ─────────────────────────────────────────
// Per-agency map `templateId → count`. Single sidecar record so the gallery
// can hydrate the whole feed in one read.

const INSTALL_COUNTS_KEY = (agencyId: string) =>
  `${SAVED_PREFIX(agencyId)}_install-counts`;

export async function listInstallCounts(
  storage: PluginStorage, agencyId: string,
): Promise<Record<string, number>> {
  return (await storage.get<Record<string, number>>(INSTALL_COUNTS_KEY(agencyId))) ?? {};
}

export async function bumpInstallCount(
  storage: PluginStorage, agencyId: string, templateId: string,
): Promise<number> {
  const cur = await listInstallCounts(storage, agencyId);
  const next = (cur[templateId] ?? 0) + 1;
  cur[templateId] = next;
  await storage.set(INSTALL_COUNTS_KEY(agencyId), cur);
  return next;
}

// ─── Featured row (R016) ───────────────────────────────────────────────────
// Hand-picked template ids per agency. Stored as a single ordered list;
// gallery renders the first 3-4 above the main grid.

const FEATURED_KEY = (agencyId: string) =>
  `${SAVED_PREFIX(agencyId)}_featured`;

export async function listFeaturedIds(
  storage: PluginStorage, agencyId: string,
): Promise<string[]> {
  return (await storage.get<string[]>(FEATURED_KEY(agencyId))) ?? [];
}

export async function setFeaturedIds(
  storage: PluginStorage, agencyId: string, ids: string[],
): Promise<string[]> {
  const cleaned = Array.from(new Set(ids.map(s => s.trim()).filter(Boolean))).slice(0, 8);
  await storage.set(FEATURED_KEY(agencyId), cleaned);
  return cleaned;
}

// ─── Filter + search + sort utilities (R016) ───────────────────────────────

export interface TemplateFilter {
  query?: string;            // fuzzy substring match on label + description + tags
  category?: TemplateCategory;
  tag?: string;
  sort?: "newest" | "most-installed";
}

export function filterTemplates(
  templates: TemplateEntry[],
  filter: TemplateFilter = {},
): TemplateEntry[] {
  let out = [...templates];
  if (filter.category) out = out.filter(t => t.category === filter.category);
  if (filter.tag) out = out.filter(t => t.tags.includes(filter.tag!));
  if (filter.query) {
    const q = filter.query.trim().toLowerCase();
    out = out.filter(t =>
      `${t.label} ${t.description} ${t.tags.join(" ")}`.toLowerCase().includes(q),
    );
  }
  if (filter.sort === "most-installed") {
    out.sort((a, b) => (b.installCount ?? 0) - (a.installCount ?? 0));
  } else {
    // "newest" → saved templates by savedAt desc, builtins fall after.
    out.sort((a, b) => {
      const aT = a.savedAt ? new Date(a.savedAt).getTime() : 0;
      const bT = b.savedAt ? new Date(b.savedAt).getTime() : 0;
      return bT - aT;
    });
  }
  return out;
}

export interface SaveTemplateInput {
  label: string;
  description?: string;
  tags?: string[];
  coverUrl?: string;
  blocks: Block[];
  savedBy: string;
}

export async function saveTemplate(
  storage: PluginStorage,
  agencyId: string,
  input: SaveTemplateInput,
): Promise<TemplateEntry> {
  const id = `saved-${slugify(input.label)}-${Date.now().toString(36)}`;
  const rec: SavedTemplateRecord = {
    id,
    label: input.label.trim() || "Untitled template",
    description: input.description?.trim() ?? "",
    tags: input.tags && input.tags.length > 0 ? input.tags : ["Operator template"],
    ...(input.coverUrl ? { coverUrl: input.coverUrl } : {}),
    blocks: input.blocks,
    savedAt: new Date().toISOString(),
    savedBy: input.savedBy,
  };
  await storage.set(`${SAVED_PREFIX(agencyId)}${id}`, rec);
  return {
    id: rec.id,
    label: rec.label,
    description: rec.description,
    tags: rec.tags,
    category: categoryForTags(rec.tags),
    ...(rec.coverUrl ? { coverUrl: rec.coverUrl } : {}),
    kind: "saved",
    blocks: rec.blocks,
    savedAt: rec.savedAt,
    savedBy: rec.savedBy,
  };
}

export async function deleteSavedTemplate(
  storage: PluginStorage,
  agencyId: string,
  id: string,
): Promise<boolean> {
  const key = `${SAVED_PREFIX(agencyId)}${id}`;
  const cur = await storage.get(key);
  if (!cur) return false;
  await storage.del(key);
  return true;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "template";
}
