// R028 — Reusable block-group components.
//
// Per-install registry of named block trees. Operators select N
// blocks, "Save as component" snapshots the tree under a name; the
// editor surfaces a `componentRef` block whose `componentId` points
// back here, and the renderer expands the ref inline against the
// current source tree.
//
// Storage:
//   t/<a>/<c>/website-editor/components/index           → string[] (newest-first)
//   t/<a>/<c>/website-editor/components/by-id/<id>      → ComponentRecord
//
// Pure server module — host pages compose with the existing block-
// tree mutation flow.

import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type { Block } from "../types/block";

export type ComponentCategory = "header" | "footer" | "section" | "card" | "form" | "misc";
export const COMPONENT_CATEGORIES: readonly ComponentCategory[] = [
  "header", "footer", "section", "card", "form", "misc",
];

export interface ComponentRecord {
  id: string;
  name: string;
  category: ComponentCategory;
  tree: Block[];
  createdAt: number;
  updatedAt: number;
  createdBy: UserId | string;
  description?: string;
}

const PREFIX = (a: AgencyId, c: ClientId) =>
  `t/${a}/${c}/website-editor/components/`;
const INDEX_KEY = (a: AgencyId, c: ClientId) => `${PREFIX(a, c)}index`;
const BY_ID_KEY = (a: AgencyId, c: ClientId, id: string) =>
  `${PREFIX(a, c)}by-id/${id}`;

function makeId(): string {
  return `cmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function readIndex(
  storage: PluginStorage, agencyId: AgencyId, clientId: ClientId,
): Promise<string[]> {
  return (await storage.get<string[]>(INDEX_KEY(agencyId, clientId))) ?? [];
}

async function writeIndex(
  storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, ids: string[],
): Promise<void> {
  await storage.set(INDEX_KEY(agencyId, clientId), ids);
}

export interface CreateComponentInput {
  agencyId: AgencyId;
  clientId: ClientId;
  name: string;
  tree: Block[];
  category?: ComponentCategory;
  description?: string;
  createdBy: UserId | string;
}

export async function createComponent(
  storage: PluginStorage, input: CreateComponentInput,
): Promise<ComponentRecord> {
  const id = makeId();
  const now = Date.now();
  const rec: ComponentRecord = {
    id,
    name: input.name.trim() || "Untitled component",
    category: input.category ?? "misc",
    tree: input.tree,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
  };
  await storage.set(BY_ID_KEY(input.agencyId, input.clientId, id), rec);
  const ids = await readIndex(storage, input.agencyId, input.clientId);
  ids.unshift(id);
  await writeIndex(storage, input.agencyId, input.clientId, ids);
  return rec;
}

export async function getComponent(
  storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, id: string,
): Promise<ComponentRecord | null> {
  return (await storage.get<ComponentRecord>(BY_ID_KEY(agencyId, clientId, id))) ?? null;
}

export async function listComponents(
  storage: PluginStorage, agencyId: AgencyId, clientId: ClientId,
): Promise<ComponentRecord[]> {
  const ids = await readIndex(storage, agencyId, clientId);
  const out: ComponentRecord[] = [];
  for (const id of ids) {
    const rec = await getComponent(storage, agencyId, clientId, id);
    if (rec) out.push(rec);
  }
  return out;
}

export interface UpdateComponentPatch {
  name?: string;
  category?: ComponentCategory;
  tree?: Block[];
  description?: string;
}

export async function updateComponent(
  storage: PluginStorage, agencyId: AgencyId, clientId: ClientId,
  id: string, patch: UpdateComponentPatch,
): Promise<ComponentRecord | null> {
  const cur = await getComponent(storage, agencyId, clientId, id);
  if (!cur) return null;
  const next: ComponentRecord = {
    ...cur,
    ...(patch.name != null ? { name: patch.name.trim() || cur.name } : {}),
    ...(patch.category ? { category: patch.category } : {}),
    ...(patch.tree ? { tree: patch.tree } : {}),
    updatedAt: Date.now(),
  };
  if (patch.description != null) {
    const trimmed = patch.description.trim();
    if (trimmed) next.description = trimmed;
    else delete next.description;
  }
  await storage.set(BY_ID_KEY(agencyId, clientId, id), next);
  return next;
}

export async function deleteComponent(
  storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, id: string,
): Promise<boolean> {
  const cur = await getComponent(storage, agencyId, clientId, id);
  if (!cur) return false;
  await storage.del(BY_ID_KEY(agencyId, clientId, id));
  const ids = await readIndex(storage, agencyId, clientId);
  await writeIndex(storage, agencyId, clientId, ids.filter(x => x !== id));
  return true;
}

// ─── Expansion helper ────────────────────────────────────────────────────
//
// `componentRef` blocks point at a saved component by id. The
// storefront renderer (and editor preview) calls
// `expandComponentRefs(blocks, components)` before render to
// substitute each ref with the latest source tree. Updates to the
// source therefore propagate to every reference on next render —
// no per-instance copy.

export function expandComponentRefs(
  blocks: Block[],
  components: Record<string, ComponentRecord>,
  depth = 0,
): Block[] {
  if (depth > 5) return blocks;   // cycle guard
  const out: Block[] = [];
  for (const b of blocks) {
    if (b.type === "componentRef") {
      const id = b.props?.componentId as string | undefined;
      if (!id) {
        // Mis-configured ref — surface a placeholder block the
        // renderer can flag visually.
        out.push({ ...b, props: { ...b.props, _missing: true } });
        continue;
      }
      const rec = components[id];
      if (!rec) {
        out.push({ ...b, props: { ...b.props, _missing: true, _missingId: id } });
        continue;
      }
      // Recurse so component-trees referencing other components
      // also expand. New ids are minted inline (`<original>::<refId>`)
      // so duplicate component refs on the same page don't collide.
      const expanded = expandComponentRefs(rec.tree, components, depth + 1);
      for (const child of expanded) {
        out.push({
          ...child,
          id: `${child.id}::${b.id}`,
        });
      }
    } else {
      out.push({
        ...b,
        ...(b.children
          ? { children: expandComponentRefs(b.children, components, depth) }
          : {}),
      });
    }
  }
  return out;
}

// Counts componentRef occurrences across a tree (no expansion).
// Used by the editor's "Components" tab to surface usage counts.
export function countComponentRefs(blocks: Block[]): Record<string, number> {
  const counts: Record<string, number> = {};
  function walk(arr: Block[]): void {
    for (const b of arr) {
      if (b.type === "componentRef") {
        const id = b.props?.componentId as string | undefined;
        if (id) counts[id] = (counts[id] ?? 0) + 1;
      }
      if (b.children) walk(b.children);
    }
  }
  walk(blocks);
  return counts;
}
