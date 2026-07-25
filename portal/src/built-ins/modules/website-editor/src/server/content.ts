// Content overrides — draft/publish workflow for legacy CMS keys.
// Adapted from `02/src/portal/server/content.ts` (244 lines), trimmed
// to the round-1 surface.

import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { AgencyId, ClientId } from "../lib/tenancy";
import { makeId } from "../lib/ids";
import { storageKeys } from "./storage-keys";
import type {
  ContentSnapshot,
  ContentValue,
  SiteContentState,
} from "../types/content";

async function load(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
): Promise<SiteContentState> {
  const existing = await storage.get<SiteContentState>(
    storageKeys.contentState(agencyId, clientId, siteId),
  );
  if (existing) return existing;
  return {
    siteId,
    agencyId,
    clientId,
    draft: {},
    published: {},
    history: [],
    discoveries: {},
  };
}

async function save(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
  state: SiteContentState,
): Promise<void> {
  await storage.set(storageKeys.contentState(agencyId, clientId, siteId), state);
}

export async function getContentState(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
): Promise<SiteContentState> {
  return load(storage, agencyId, clientId, siteId);
}

export async function getPublicOverrides(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
): Promise<Record<string, ContentValue>> {
  return (await load(storage, agencyId, clientId, siteId)).published;
}

export async function getPreviewOverrides(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
): Promise<Record<string, ContentValue>> {
  const state = await load(storage, agencyId, clientId, siteId);
  return { ...state.published, ...state.draft };
}

export async function setDraftOverrides(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
  inputs: Record<string, ContentValue>,
): Promise<SiteContentState> {
  const state = await load(storage, agencyId, clientId, siteId);
  const next: SiteContentState = {
    ...state,
    draft: { ...state.draft, ...inputs },
    draftUpdatedAt: Date.now(),
  };
  await save(storage, agencyId, clientId, siteId, next);
  return next;
}

export async function publishDraft(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
  opts: { actor?: string; reason?: string } = {},
): Promise<SiteContentState> {
  const state = await load(storage, agencyId, clientId, siteId);
  const snapshot: ContentSnapshot = {
    id: makeId("snap"),
    ts: Date.now(),
    values: { ...state.published },
    reason: opts.reason,
    actor: opts.actor,
  };
  const next: SiteContentState = {
    ...state,
    published: { ...state.published, ...state.draft },
    draft: {},
    history: [snapshot, ...state.history].slice(0, 50),
    publishedAt: Date.now(),
    draftUpdatedAt: undefined,
  };
  await save(storage, agencyId, clientId, siteId, next);
  return next;
}

export async function discardDraft(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
): Promise<SiteContentState> {
  const state = await load(storage, agencyId, clientId, siteId);
  const next: SiteContentState = {
    ...state,
    draft: {},
    draftUpdatedAt: undefined,
  };
  await save(storage, agencyId, clientId, siteId, next);
  return next;
}

export async function revertToSnapshot(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
  snapshotId: string,
  opts: { actor?: string } = {},
): Promise<SiteContentState | null> {
  const state = await load(storage, agencyId, clientId, siteId);
  const snap = state.history.find((s) => s.id === snapshotId);
  if (!snap) return null;
  const newSnapshot: ContentSnapshot = {
    id: makeId("snap"),
    ts: Date.now(),
    values: { ...state.published },
    reason: `revert to ${snapshotId}`,
    actor: opts.actor,
  };
  const next: SiteContentState = {
    ...state,
    published: { ...snap.values },
    history: [newSnapshot, ...state.history].slice(0, 50),
    publishedAt: Date.now(),
  };
  await save(storage, agencyId, clientId, siteId, next);
  return next;
}

export async function recordDiscovered(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
  path: string,
  keys: string[],
): Promise<void> {
  const state = await load(storage, agencyId, clientId, siteId);
  const existing = state.discoveries[path] ?? [];
  const merged = Array.from(new Set([...existing, ...keys]));
  const next: SiteContentState = {
    ...state,
    discoveries: { ...state.discoveries, [path]: merged },
  };
  await save(storage, agencyId, clientId, siteId, next);
}
