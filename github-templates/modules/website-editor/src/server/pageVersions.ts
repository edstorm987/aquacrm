// R022 — Persisted page version history.
//
// Auto-save snapshots accumulate (capped at 30 most-recent
// unnamed). Named checkpoints survive auto-prune. Storage shape:
//   `t/<a>/<c>/website-editor/page-versions/<pageId>/index`
//      → ordered list of version ids (newest-first)
//   `t/<a>/<c>/website-editor/page-versions/<pageId>/<versionId>`
//      → PageVersion record
//
// Pure server module — pluggable via the standard `PluginStorage`
// port (no foundation imports).

import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { Block } from "../types/block";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";

export interface PageVersion {
  id: string;
  pageId: string;
  ts: number;            // ms epoch
  blocks: Block[];
  // Operator-supplied label (named version) when checkpointing.
  // Auto-saves leave this undefined.
  label?: string;
  savedBy: UserId | string;
}

export const AUTO_VERSION_CAP = 30;

const PREFIX = (a: AgencyId, c: ClientId, pageId: string) =>
  `t/${a}/${c}/website-editor/page-versions/${pageId}/`;
const INDEX_KEY = (a: AgencyId, c: ClientId, pageId: string) =>
  `${PREFIX(a, c, pageId)}index`;
const VERSION_KEY = (a: AgencyId, c: ClientId, pageId: string, vid: string) =>
  `${PREFIX(a, c, pageId)}${vid}`;

function makeVersionId(): string {
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function readIndex(
  storage: PluginStorage, a: AgencyId, c: ClientId, pageId: string,
): Promise<string[]> {
  return (await storage.get<string[]>(INDEX_KEY(a, c, pageId))) ?? [];
}

async function writeIndex(
  storage: PluginStorage, a: AgencyId, c: ClientId, pageId: string, ids: string[],
): Promise<void> {
  await storage.set(INDEX_KEY(a, c, pageId), ids);
}

export interface SaveVersionInput {
  agencyId: AgencyId;
  clientId: ClientId;
  pageId: string;
  blocks: Block[];
  savedBy: UserId | string;
  label?: string;       // when set, version is "named" + survives auto-prune
}

export async function saveVersion(
  storage: PluginStorage, input: SaveVersionInput,
): Promise<{ version: PageVersion; pruned: string[] }> {
  const id = makeVersionId();
  const v: PageVersion = {
    id,
    pageId: input.pageId,
    ts: Date.now(),
    blocks: input.blocks,
    ...(input.label && input.label.trim() ? { label: input.label.trim() } : {}),
    savedBy: input.savedBy,
  };
  await storage.set(VERSION_KEY(input.agencyId, input.clientId, input.pageId, id), v);

  const ids = await readIndex(storage, input.agencyId, input.clientId, input.pageId);
  ids.unshift(id);

  // Cap unnamed versions at AUTO_VERSION_CAP. Named ones never pruned.
  const pruned: string[] = [];
  // Re-fetch records to know which are named.
  const records: Record<string, PageVersion | undefined> = {};
  for (const i of ids) {
    if (i === id) { records[i] = v; continue; }
    records[i] = await storage.get<PageVersion>(VERSION_KEY(input.agencyId, input.clientId, input.pageId, i));
  }
  const unnamedCount = ids.filter(i => !records[i]?.label).length;
  if (unnamedCount > AUTO_VERSION_CAP) {
    // Walk oldest-first; drop unnamed until under cap.
    let toDrop = unnamedCount - AUTO_VERSION_CAP;
    for (let i = ids.length - 1; i >= 0 && toDrop > 0; i--) {
      const candidate = ids[i]!;
      if (records[candidate]?.label) continue;
      pruned.push(candidate);
      ids.splice(i, 1);
      await storage.del(VERSION_KEY(input.agencyId, input.clientId, input.pageId, candidate));
      toDrop -= 1;
    }
  }

  await writeIndex(storage, input.agencyId, input.clientId, input.pageId, ids);
  return { version: v, pruned };
}

export async function listVersions(
  storage: PluginStorage,
  agencyId: AgencyId, clientId: ClientId, pageId: string,
  limit?: number,
): Promise<PageVersion[]> {
  const ids = await readIndex(storage, agencyId, clientId, pageId);
  const sliced = limit && limit > 0 ? ids.slice(0, limit) : ids;
  const out: PageVersion[] = [];
  for (const id of sliced) {
    const v = await storage.get<PageVersion>(VERSION_KEY(agencyId, clientId, pageId, id));
    if (v) out.push(v);
  }
  return out;
}

export async function getVersion(
  storage: PluginStorage,
  agencyId: AgencyId, clientId: ClientId, pageId: string, versionId: string,
): Promise<PageVersion | null> {
  return (await storage.get<PageVersion>(VERSION_KEY(agencyId, clientId, pageId, versionId))) ?? null;
}

// Operator clicks "Restore" — caller (the page handler) reads the
// version's blocks and writes them back into the live page record.
// We don't mutate the page from here so the version surface stays
// orthogonal to the page CRUD; the caller composes both.

export async function deleteVersion(
  storage: PluginStorage,
  agencyId: AgencyId, clientId: ClientId, pageId: string, versionId: string,
): Promise<boolean> {
  const cur = await getVersion(storage, agencyId, clientId, pageId, versionId);
  if (!cur) return false;
  await storage.del(VERSION_KEY(agencyId, clientId, pageId, versionId));
  const ids = await readIndex(storage, agencyId, clientId, pageId);
  await writeIndex(storage, agencyId, clientId, pageId, ids.filter(i => i !== versionId));
  return true;
}

// Promotes an auto-save into a named version (operator decides
// after-the-fact "actually, this snapshot is the rollback point").
export async function renameVersion(
  storage: PluginStorage,
  agencyId: AgencyId, clientId: ClientId, pageId: string, versionId: string,
  label: string,
): Promise<PageVersion | null> {
  const cur = await getVersion(storage, agencyId, clientId, pageId, versionId);
  if (!cur) return null;
  const trimmed = label.trim();
  const next: PageVersion = trimmed
    ? { ...cur, label: trimmed }
    : (() => {
        const { label: _omit, ...rest } = cur;
        return rest;
      })();
  await storage.set(VERSION_KEY(agencyId, clientId, pageId, versionId), next);
  return next;
}
